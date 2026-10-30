#!/usr/bin/env python3
"""Recheck precisely the four upstream-modified comparison entrypoints."""
import argparse
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import sys

ORIGINAL = Path(__file__).with_name('verify-differential.py')
spec = importlib.util.spec_from_file_location('maintained_differential', ORIGINAL)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
PREVIOUS_SHA = '1c933545c6f05701741031997945c64b1ab5ba9d'
PREVIOUS_RUN = shared.WORKSPACE / 'worktrees/final-differential-verification/test-results/run-AYPL00'
SELECTED = [next(gate for gate in shared.GATES if gate[0] == name)
            for name in ['text-block-settings', 'columns-layout', 'raw-source', 'tool-actions']]


def proof(root, sha):
    result = shared.preflight(root, sha)
    result['followupSupervisorSha256'] = shared.digest(Path(__file__).read_bytes())
    result['previousSha'] = PREVIOUS_SHA
    result['previousRun'] = str(PREVIOUS_RUN)
    production = ['core', 'plugins', 'inline-plugins', 'inline-tools', 'shared', 'renderer', 'tests', 'package.json', 'package-lock.json']
    changed = shared.git(root, 'diff', '--name-only', PREVIOUS_SHA, sha, '--', *production).decode().strip()
    assert not changed, f'Production, tests or dependencies changed beyond the approved runner followup: {changed}'
    changed_parity_files = shared.git(root, 'diff', '--name-only', PREVIOUS_SHA, sha, '--', 'scripts/parity').decode().splitlines()
    changed_runners = [path for path in changed_parity_files if len(Path(path).parts) == 3 and path.endswith('.mjs')]
    assert sorted(changed_runners) == sorted('scripts/parity/' + gate[1] for gate in SELECTED)
    result['changedRunners'] = changed_runners
    result['productionTestDependencyDiff'] = changed
    return result


def prepare(root, sha):
    checked = proof(root, sha)
    env, _ = shared.environment(root, sha)
    directory = Path(subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[gate[0] for gate in SELECTED]], cwd=root, env=env, text=True).strip())
    shared.save(directory / 'preflight.json', checked)
    shared.save(directory / 'supervisor-config.json', {'root': str(root), 'sha': sha, 'preparedAt': shared.now(), 'gates': SELECTED,
                'scope': 'Only the four maintained runners changed by the incoming published commits; the preceding full corpus retains its original source identity.'})
    (directory / ORIGINAL.name).write_bytes(ORIGINAL.read_bytes())
    (directory / Path(__file__).name).write_bytes(Path(__file__).read_bytes())
    print(directory, flush=True)


def execute(root, sha, directory):
    previous = json.loads((PREVIOUS_RUN / 'manifest.json').read_text())
    assert previous['finishedAt'] and previous['sourceUnchanged']
    assert previous['source']['head'] == PREVIOUS_SHA
    assert all(gate['finishedAt'] for gate in previous['gates'].values()), 'Full corpus must finish before the same browser lane is reused'
    before = json.loads((directory / 'preflight.json').read_text())
    current = proof(root, sha)
    for key in before:
        if key != 'checkedAt':
            assert before[key] == current[key], f'Preflight drift: {key}'
    env, _ = shared.environment(root, sha)
    env['EDITOR_RESULTS_DIR'] = str(directory)
    summary = {'startedAt': shared.now(), 'candidateSha': sha, 'previousSha': PREVIOUS_SHA, 'gates': []}
    shared.save(directory / 'supervisor-summary.json', summary)
    for name, script, count, witness in SELECTED:
        command = ['node', 'scripts/parity/' + script]
        print(json.dumps({'event': 'gate-start', 'name': name, 'time': shared.now()}), flush=True)
        with (directory / f'{name}.wrapper.log').open('wb') as stream:
            process = subprocess.Popen(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command], cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
            try:
                code = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                process.send_signal(signal.SIGTERM)
                code = process.wait(timeout=30)
        gate = json.loads((directory / 'manifest.json').read_text())['gates'][name]
        result = {'name': name, 'command': command, 'wrapperExitCode': code, 'rawExitCode': gate['exitCode'],
                  'c11Outcome': gate['outcome'], 'elapsedMs': gate.get('elapsedMs'), 'sourceUnchanged': gate.get('sourceUnchanged')}
        try:
            report, raw_hash = shared.load_report(directory / f'{name}.log')
            result['logSha256'] = raw_hash
            result['comparison'] = shared.inspect_report(root, sha, name, script, count, witness, report)
        except Exception as error:
            result['analysisError'] = f'{type(error).__name__}: {error}'
        shared.save(directory / f'{name}.analysis.json', result)
        summary['gates'].append(result)
        shared.save(directory / 'supervisor-summary.json', summary)
        comparison = result.get('comparison', {})
        print(json.dumps({'event': 'gate-finish', 'name': name, 'time': shared.now(), 'exit': code,
                          'candidateZeroFailuresAndComplete': comparison.get('candidateZeroFailuresAndComplete'),
                          'referenceStatus': comparison.get('referenceFailureSignatures', {}).get('status'),
                          'analysisError': result.get('analysisError')}), flush=True)
        if not gate.get('sourceUnchanged'):
            summary['stoppedReason'] = 'Source changed or gate did not complete'
            break
    with (directory / 'finish.log').open('wb') as stream:
        finish = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
    manifest = json.loads((directory / 'manifest.json').read_text())
    summary.update({'finishedAt': shared.now(), 'finishExitCode': finish.returncode, 'c11Outcome': manifest['outcome'], 'sourceUnchanged': manifest['sourceUnchanged']})
    shared.save(directory / 'supervisor-summary.json', summary)
    print(json.dumps({'event': 'finished', 'directory': str(directory), 'c11Outcome': manifest['outcome'], 'sourceUnchanged': manifest['sourceUnchanged']}), flush=True)
    return finish.returncode


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'run'])
    parser.add_argument('root', type=Path)
    parser.add_argument('sha')
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--lane-a-authorized', action='store_true')
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(args.root.resolve(), args.sha)
    else:
        assert args.directory and args.lane_a_authorized
        sys.exit(execute(args.root.resolve(), args.sha, args.directory.resolve()))
