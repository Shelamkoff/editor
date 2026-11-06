"""Run the complete maintained comparative registry, sequentially and without filters.

The historical archive supplies only the registry. Every verdict is produced by
a fresh command and checked against immutable source bytes. Historical exit 1 is
retained separately from the candidate verdict and must be attributable.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import time
import traceback
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def parse_report(text):
    """Require one complete JSON report; allow only preceding runner diagnostics."""
    decoder = json.JSONDecoder()
    reports = []
    for match in re.finditer(r'^\{', text, re.M):
        try:
            report, end = decoder.raw_decode(text, match.start())
        except json.JSONDecodeError:
            continue
        if isinstance(report, dict) and 'candidatePass' in report:
            reports.append((report, end))
    if len(reports) != 1:
        raise ValueError('Expected one complete candidate report in stdout')
    report, end = reports[0]
    if text[end:].strip():
        raise ValueError('Unexpected output after the candidate report')
    return report


def interrupt(signum, _frame):
    # Route hosted-job termination through the existing owned-child cleanup and
    # interrupted-manifest path instead of leaving a running attempt behind.
    raise InterruptedError('Received ' + signal.Signals(signum).name)


def stop_owned_process(process):
    if process.poll() is not None:
        return process.returncode
    os.killpg(process.pid, signal.SIGTERM)
    try:
        return process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        return process.wait()


def run(args):
    repo = Path(args.repo).resolve()
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Use a new empty output directory; previous attempts are immutable')
    os.chdir(repo)

    def git(*arguments):
        return subprocess.check_output(['git', *arguments], cwd=repo).decode().strip()

    def identity():
        return {
            'head': git('rev-parse', 'HEAD'),
            'tree': git('rev-parse', 'HEAD^{tree}'),
            'trackedStatus': git('status', '--porcelain', '--untracked-files=no'),
            'diffSha256': digest(subprocess.check_output(['git', 'diff', '--binary', 'HEAD'], cwd=repo)),
        }

    before = identity()
    expected = args.head or before['head']
    archive = repo / 'scripts/parity/checkpoints/2026-11-05/audit-completion/execution.tar.gz'
    with tarfile.open(archive) as source:
        historical = json.load(source.extractfile('corpora/manifest.json'))
    files = historical['files']
    if len(files) != 100 or len(set(files)) != 100:
        raise ValueError('The maintained historical registry must contain exactly 100 distinct files')
    for name in files:
        if Path(name).name != name or not name.endswith('.mjs'):
            raise ValueError('Invalid registry member: ' + name)

    source_files = {name: (repo / 'scripts/parity' / name).read_bytes() for name in files}
    historic_objects = set()
    mentioned_environment = set()
    for data in source_files.values():
        source_text = data.decode()
        historic_objects.update(re.findall(r"['\"]([0-9a-f]{40})['\"]", source_text))
        mentioned_environment.update(re.findall(r'process\.env\.([A-Z_0-9]+)', source_text))
    missing = []
    for sha in sorted(historic_objects):
        check = subprocess.run(['git', 'cat-file', '-e', sha + '^{commit}'], cwd=repo,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if check.returncode:
            missing.append(sha)

    checker_path = repo / 'scripts/parity/checkpoints/2026-11-05/audit-completion/review.py'
    spec = importlib.util.spec_from_file_location('rector_corpus_review', checker_path)
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    checker.CANDIDATE = expected

    environment = os.environ.copy()
    retained = {'EDITOR_CHROME_PATH', 'EDITOR_PLAYWRIGHT_PATH', 'EDITOR_DEPENDENCIES_ROOT'}
    removed = sorted(key for key in mentioned_environment if key not in retained and key in environment)
    for key in removed:
        del environment[key]
    if args.chrome:
        environment['EDITOR_CHROME_PATH'] = str(Path(args.chrome).resolve())
    if args.playwright:
        environment['EDITOR_PLAYWRIGHT_PATH'] = str(Path(args.playwright).resolve())
    environment['EDITOR_DEPENDENCIES_ROOT'] = str(repo / 'node_modules')
    environment['EDITOR_CANDIDATE_ROOT'] = str(repo)
    environment['EDITOR_CANDIDATE_SHA'] = expected
    environment['GIT_NO_REPLACE_OBJECTS'] = '1'

    preflight_errors = []
    if before['head'] != expected or before['trackedStatus']:
        preflight_errors.append('The requested immutable HEAD must be checked out with a clean tracked tree')
    if missing:
        preflight_errors.append('Missing exact historical Git objects: ' + ', '.join(missing))
    for key in ('EDITOR_CHROME_PATH', 'EDITOR_PLAYWRIGHT_PATH'):
        if not environment.get(key) or not Path(environment[key]).is_file():
            preflight_errors.append('Missing file for ' + key)
    for name, data in source_files.items():
        committed = subprocess.check_output(['git', 'show', expected + ':scripts/parity/' + name], cwd=repo)
        if committed != data:
            preflight_errors.append('Runner differs from immutable source: ' + name)

    manifest = {
        'kind': 'Fresh full maintained comparative registry',
        'source': expected, 'root': str(repo), 'sourceBefore': before,
        'startedAt': now(), 'files': files, 'results': [], 'active': None,
        'historicalInventorySource': str(archive.relative_to(repo)) + '::corpora/manifest.json',
        'historicalInventoryArchiveSha256': digest(archive.read_bytes()),
        'runnerSha256': digest(Path(__file__).read_bytes()),
        'checkerSha256': digest(checker_path.read_bytes()),
        'scriptSha256': {name: digest(data) for name, data in source_files.items()},
        'node': subprocess.check_output([args.node, '--version'], text=True).strip(),
        'environmentOverrides': {key: environment[key] for key in retained | {'EDITOR_CANDIDATE_ROOT', 'EDITOR_CANDIDATE_SHA'} if key in environment},
        'removedInheritedSelectors': removed,
        'preflightErrors': preflight_errors,
        'historicCommitCount': len(historic_objects), 'missingHistoricCommits': missing,
        'perCorpusTimeoutSeconds': args.timeout,
        'status': 'preflight-failed' if preflight_errors else 'preflight-passed',
    }
    manifest_path = output / 'manifest.json'
    save(manifest_path, manifest)
    if preflight_errors:
        manifest.update(finishedAt=now(), sourceAfter=identity(), executed=False)
        save(manifest_path, manifest)
        print(json.dumps({'status': manifest['status'], 'errors': preflight_errors}), flush=True)
        return 2
    if args.preflight_only:
        manifest.update(finishedAt=now(), sourceAfter=identity(), executed=False)
        save(manifest_path, manifest)
        print(json.dumps({'status': 'preflight-passed', 'files': len(files), 'executed': False}), flush=True)
        return 0

    aggregate = dict(observations=0, verdicts=0, completedBodies=0, moduleRecords=0)
    manifest['status'] = 'running'
    try:
        for index, name in enumerate(files):
            if identity() != before:
                raise RuntimeError('Source identity changed before ' + name)
            command = [args.node, 'scripts/parity/' + name]
            if name == 'html-resource-effects.mjs':
                command.append(expected)
            stdout_path, stderr_path = output / (name + '.stdout.log'), output / (name + '.stderr.log')
            started = time.monotonic()
            manifest.update(active={'file': name, 'index': index + 1, 'startedAt': now(), 'command': command}, updatedAt=now())
            save(manifest_path, manifest)
            print(f'START {index + 1}/{len(files)} {name}', flush=True)
            timed_out = False
            with stdout_path.open('w') as stdout, stderr_path.open('w') as stderr:
                process = subprocess.Popen(command, cwd=repo, env=environment, stdout=stdout, stderr=stderr, start_new_session=True)
                try:
                    code = process.wait(timeout=args.timeout)
                except subprocess.TimeoutExpired:
                    timed_out = True
                    code = stop_owned_process(process)
                except BaseException:
                    stop_owned_process(process)
                    raise
            result = {
                'file': name, 'command': command, 'code': code,
                'timedOut': timed_out, 'durationSeconds': round(time.monotonic() - started, 3),
                'candidatePass': False, 'reviewPass': False, 'parseError': None,
                'reviewError': None, 'historicalDifferenceCount': 0,
                'stdoutSha256': digest(stdout_path.read_bytes()),
                'stderrSha256': digest(stderr_path.read_bytes()),
            }
            try:
                report = parse_report(stdout_path.read_text(errors='replace'))
                save(output / (name + '.json'), report)
                result['candidatePass'] = report.get('candidatePass') is True
                try:
                    counts = checker.corpus(name, report)
                    if timed_out or code not in (0, 1):
                        raise AssertionError('Unexpected process termination')
                    if code == 1:
                        if 'sources' not in report:
                            raise AssertionError('Exit 1 without historical sources')
                        old_rows = [row for row in report['results'] if row.get('source') not in (None, 'candidate')]
                        differences = checker.historical_differences(old_rows)
                        if not differences:
                            raise AssertionError('Exit 1 without attributable historical differences/unavailability')
                        result['historicalDifferenceCount'] = differences
                    result.update(reviewPass=True, counts=counts)
                    for key, value in counts.items():
                        aggregate[key] += value
                except Exception as error:
                    result['reviewError'] = str(error) or type(error).__name__
                    (output / (name + '.review-error.log')).write_text(traceback.format_exc())
            except Exception as error:
                result['parseError'] = str(error) or type(error).__name__
            result['sourceAfter'] = identity()
            result['sourceUnchanged'] = result['sourceAfter'] == before
            result['passed'] = result['reviewPass'] and result['sourceUnchanged']
            manifest['results'].append(result)
            manifest.update(active=None, updatedAt=now(), aggregate=aggregate)
            save(manifest_path, manifest)
            print(json.dumps({'file': name, 'code': code, 'candidatePass': result['candidatePass'],
                              'reviewPass': result['reviewPass'], 'historicalDifferences': result['historicalDifferenceCount'],
                              'durationSeconds': result['durationSeconds'], 'parseError': result['parseError'],
                              'reviewError': result['reviewError']}), flush=True)
            if not result['sourceUnchanged']:
                raise RuntimeError('Source changed during ' + name)
    except BaseException as error:
        manifest.update(status='interrupted', error=str(error) or type(error).__name__, finishedAt=now(), sourceAfter=identity())
        save(manifest_path, manifest)
        raise
    manifest.update(status='complete', active=None, finishedAt=now(), sourceAfter=identity())
    manifest['sourceUnchanged'] = manifest['sourceAfter'] == before
    manifest['passed'] = (len(manifest['results']) == len(files) and manifest['sourceUnchanged']
                          and all(result['passed'] for result in manifest['results']))
    save(manifest_path, manifest)
    print(json.dumps({'status': 'complete', 'passed': manifest['passed'], 'corpora': len(manifest['results']),
                      'reviewPassed': sum(result['passed'] for result in manifest['results']),
                      'historicalExitOne': sum(result['code'] == 1 and result['passed'] for result in manifest['results']),
                      'aggregate': aggregate}), flush=True)
    return 0 if manifest['passed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument('--out', required=True)
    parser.add_argument('--head')
    parser.add_argument('--node', default='node')
    parser.add_argument('--chrome')
    parser.add_argument('--playwright')
    parser.add_argument('--timeout', type=int, default=1200)
    parser.add_argument('--preflight-only', action='store_true')
    signal.signal(signal.SIGTERM, interrupt)
    sys.exit(run(parser.parse_args()))
