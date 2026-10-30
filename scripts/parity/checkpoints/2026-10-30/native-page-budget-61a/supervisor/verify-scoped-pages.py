#!/usr/bin/env python3
"""Persistent scoped acceptance with the unchanged native page deadline."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys

ROOT = Path('/workspace/scratch/61a2ad7355f4/worktrees/native-code-copy-page')
SOURCE = '6c2a48d1ea4ebd0014bd2fb4573738db2c3593e6'
DIAGNOSTIC = Path('/workspace/scratch/61a2ad7355f4/tools/native-parity-budget-diagnostic')
PLAN = Path(__file__).parent
GATES = [('native-code-copy-ownership', 'native-code-copy-ownership.html', 10),
         ('native-plugin-settings', 'native-plugin-settings.html', 33),
         ('native-plugin-parity', 'native-plugin-parity.html', 333)]
MODULES = ['tests/browser/regressions/code-copy-ownership-native.js',
           'tests/browser/regressions/text-block-settings-native.js',
           'tests/browser/regressions/columns-layout-native.js']


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    assert git('rev-parse', 'HEAD').decode().strip() == SOURCE
    assert not git('status', '--porcelain').strip()
    assert not (ROOT / 'node_modules').is_symlink()
    diagnostic_bytes = (DIAGNOSTIC / 'case-inventory.json').read_bytes()
    assert digest(diagnostic_bytes) == '5e3d2496cb055c028c4e19a94b5fee7a177d924e398526c4595a0f3bed889790'
    original = json.loads(diagnostic_bytes)
    assert original['source'] == 'c6e537e5d7433f0d902749719c8af265c6ae8591' and original['diagnosticOnly'] is True
    assert original['caseCount'] == 376 and len(original['caseNames']) == 376
    assert all(row['status'] == 'PASS' for row in original['originalResults'])
    unchanged = {}
    for path in MODULES + ['tests/browser/regressions/harness.js',
                          'tests/browser/text-block-settings-parity-fixture.js', 'tests/browser/columns-layout-parity-fixture.js']:
        data = (ROOT / path).read_bytes()
        assert data == git('show', original['source'] + ':' + path)
        unchanged[path] = digest(data)
    original_page = git('show', original['source'] + ':tests/browser/native-plugin-parity.js').decode()
    expected = original_page
    for path in MODULES:
        expected = expected.replace("import './regressions/" + Path(path).name + "'\n", '')
    assert (ROOT / 'tests/browser/native-plugin-parity.js').read_text() == expected
    styles = re.findall(r'<link[^>]+>', (ROOT / 'tests/browser/native-plugin-parity.html').read_text())
    for _, page, _ in GATES:
        assert re.findall(r'<link[^>]+>', (ROOT / 'tests/browser' / page).read_text()) == styles
    driver = (ROOT / 'tests/browser/physical-history.mjs').read_text()
    expected_driver = git('show', original['source'] + ':tests/browser/physical-history.mjs').decode()
    expected_driver = expected_driver.replace("  const nativePluginParity = await runNativePage(client, pageUrl, 'native-plugin-parity.html')",
        "  const nativePluginParity = await runNativePage(client, pageUrl, 'native-plugin-parity.html')\n  const nativeCodeCopyOwnership = await runNativePage(client, pageUrl, 'native-code-copy-ownership.html')\n  const nativePluginSettings = await runNativePage(client, pageUrl, 'native-plugin-settings.html')")
    expected_driver = expected_driver.replace('    nativePluginParity,', '    nativePluginParity,\n    nativeCodeCopyOwnership,\n    nativePluginSettings,')
    assert driver == expected_driver, 'Only page registration and JSON summary keys may change'
    deadline_function = driver.split('async function waitForHistoryMatrix(client) {', 1)[1].split('\nasync function click(', 1)[0]
    original_deadline_function = git('show', original['source'] + ':tests/browser/physical-history.mjs').decode().split('async function waitForHistoryMatrix(client) {', 1)[1].split('\nasync function click(', 1)[0]
    assert deadline_function == original_deadline_function and 'const deadline = Date.now() + 120_000' in deadline_function
    keys = ['enterScenario', 'toolboxScenario', 'historyMatrix'] + re.findall(r'^    (\w+),$', driver.split('console.log(JSON.stringify({\n    enterScenario:')[1], re.M)
    assert len(keys) == 46 and sum(key.startswith('native') for key in keys) == 43
    env = {key: value for key, value in os.environ.items() if not key.startswith('EDITOR_')}
    env.update({'EDITOR_CHROME_PATH': '/workspace/scratch/61a2ad7355f4/tools/chrome-156/chrome-linux64/chrome',
                'EDITOR_VITE_PATH': str(ROOT / 'node_modules/vite/bin/vite.js'), 'EDITOR_NATIVE_FILTER': ''})
    directory = Path(subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[name for name, _, _ in GATES]], cwd=ROOT, env=env, text=True).strip())
    env['EDITOR_RESULTS_DIR'] = str(directory)
    save(directory / 'preflight.json', {'source': SOURCE, 'diagnosticSource': original['source'], 'diagnosticOnly': True,
         'diagnosticInventorySha256': digest(diagnostic_bytes), 'unchangedModuleHashes': unchanged,
         'originalPageCaseCount': 376, 'pageDeadlineMs': 120000, 'stylesheetLinksPerPage': len(styles),
         'unchangedPageDeadlineFunctionSha256': digest(deadline_function.encode()), 'physicalRunnerSha256': digest(driver.encode()),
         'topLevelSummaryKeys': keys, 'nativeArrayGroupCount': 43, 'environment': {k: v for k, v in env.items() if k.startswith('EDITOR_')},
         'supervisorSha256': digest(Path(__file__).read_bytes())})
    (directory / 'diagnostic-case-inventory.json').write_bytes(diagnostic_bytes)
    (directory / 'diagnostic-metadata.json').write_bytes((DIAGNOSTIC / 'metadata.json').read_bytes())
    (directory / 'verify-scoped-pages.py').write_bytes(Path(__file__).read_bytes())
    status = {'source': SOURCE, 'directory': str(directory), 'startedAt': now(), 'pid': os.getpid(), 'gates': []}
    save(PLAN / 'status.json', status)
    observed = []
    for name, page, expected_count in GATES:
        gate_env = {**env, 'EDITOR_NATIVE_PAGE': page}
        print(json.dumps({'event': 'gate-start', 'gate': name, 'time': now()}), flush=True)
        with (directory / (name + '.wrapper.log')).open('wb') as stream:
            child = subprocess.Popen(['node', 'scripts/verification-results.mjs', 'run', name, '--', 'node', 'tests/browser/physical-history.mjs'],
                                     cwd=ROOT, env=gate_env, stdout=stream, stderr=subprocess.STDOUT)
            try:
                code = child.wait(timeout=240)
            except subprocess.TimeoutExpired:
                child.send_signal(signal.SIGTERM)
                code = child.wait(timeout=30)
        gate = json.loads((directory / 'manifest.json').read_text())['gates'][name]
        result = {'gate': name, 'page': page, 'exitCode': code, 'outcome': gate['outcome'], 'elapsedMs': gate.get('elapsedMs'),
                  'sourceUnchanged': gate.get('sourceUnchanged'), 'expectedCases': expected_count}
        try:
            lines = (directory / (name + '.log')).read_text().splitlines()
            documents = [json.loads(line) for line in lines if line.startswith('{')]
            assert len(documents) == 1 and list(documents[0]) == [page]
            cases = documents[0][page]
            assert len(cases) == expected_count and all(case['status'] == 'PASS' for case in cases)
            expected_names = []
            if page == 'native-code-copy-ownership.html':
                expected_names = [value for value in original['caseNames'] if value.startswith('Code copy ownership:')]
            if page == 'native-plugin-settings.html':
                expected_names = [value for value in original['caseNames'] if value.startswith(('Text block settings parity ', 'Columns layout parity '))]
            if page == 'native-plugin-parity.html':
                expected_names = [value for value in original['caseNames'] if not value.startswith(('Code copy ownership:', 'Text block settings parity ', 'Columns layout parity '))]
            names = [case['name'] for case in cases]
            assert Counter(names) == Counter(expected_names), 'Page case names changed'
            result.update({'caseCount': len(cases), 'caseNames': names, 'diagnosticNameMultisetMatch': True})
            observed.extend(names)
        except Exception as error:
            result['analysisError'] = f'{type(error).__name__}: {error}'
        status['gates'].append(result)
        save(PLAN / 'status.json', status)
        save(directory / 'scoped-summary.json', status)
        print(json.dumps({'event': 'gate-finish', **result, 'caseNames': None}), flush=True)
        if not gate.get('sourceUnchanged'):
            break
    with (directory / 'finish.log').open('wb') as stream:
        finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=ROOT, env=env, stdout=stream, stderr=subprocess.STDOUT)
    manifest = json.loads((directory / 'manifest.json').read_text())
    status.update({'finishedAt': now(), 'c11Outcome': manifest['outcome'], 'sourceUnchanged': manifest['sourceUnchanged'],
                   'finishExitCode': finished.returncode, 'observedCaseCount': len(observed),
                   'caseNameMultisetPreserved': Counter(observed) == Counter(original['caseNames']),
                   'allScopedChecksPassed': finished.returncode == 0 and len(observed) == 376 and Counter(observed) == Counter(original['caseNames'])
                       and all(not gate.get('analysisError') for gate in status['gates'])})
    save(PLAN / 'status.json', status)
    save(directory / 'scoped-summary.json', status)
    print(json.dumps({key: value for key, value in status.items() if key != 'gates'}), flush=True)
    return 0 if status['allScopedChecksPassed'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        save(PLAN / 'supervisor-error.json', {'time': now(), 'error': f'{type(error).__name__}: {error}'})
        raise
