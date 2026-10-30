"""Run the existing full native and heap gates on an explicit frozen worktree.

This supervisor does not change the tested source or implement editor tests.
Its logs and status live outside the checkout until the completed proof is archived.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone


BASE = Path('/workspace/scratch/61a2ad7355f4')
MAIN = BASE / 'editor'
ROOT = BASE / 'worktrees/continuation-native-final2'
BRANCH = 'agent/61a-continuation-native-final2'
SUPERVISION = BASE / 'tools/native-continuation-final2'
CHROME = BASE / 'tools/chrome-156/chrome-linux64/chrome'
PLAYWRIGHT = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
CAROUSEL_PIN = 'f7f6485886a1d77f9213d9079eb70000efeff499'
GATES = [
    ('native', ['node', 'tests/browser/physical-history.mjs']),
    ('heap', ['node', 'tests/browser/heap-gate.mjs']),
]


def emit(value):
    line = json.dumps(value)
    print(line, flush=True)
    with (SUPERVISION / 'supervisor.log').open('a') as stream:
        stream.write(line + '\n')


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def capture(command, cwd=ROOT, env=None):
    return subprocess.check_output(command, cwd=cwd, env=env, stderr=subprocess.PIPE)


def write_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def file_index(directory):
    return [
        {'path': str(path.relative_to(directory)), 'bytes': path.stat().st_size,
         'sha256': sha256(path.read_bytes())}
        for path in sorted(directory.rglob('*')) if path.is_file()
    ]


def final_json(log, required):
    matches = []
    for line in log.read_text().splitlines():
        if not line.startswith('{'):
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and required <= value.keys():
            matches.append(value)
    if len(matches) != 1:
        raise RuntimeError(f'Expected exactly one complete final result in {log.name}; found {len(matches)}')
    return matches[0]


def summarize(directory):
    native = final_json(directory / 'native.log', {'enterScenario', 'toolboxScenario', 'historyMatrix', 'nativePluginDesign'})
    runner = (ROOT / 'tests/browser/physical-history.mjs').read_text()
    final_print = runner[runner.rindex('  console.log(JSON.stringify({'):]
    expected_groups = re.findall(r'^    (native\w+),$', final_print, re.M)
    actual_groups = [key for key in native if key.startswith('native')]
    if not expected_groups or set(actual_groups) != set(expected_groups):
        raise RuntimeError('Final native JSON does not contain exactly the runner-declared native groups')
    groups = {}
    for name in expected_groups:
        cases = native[name]
        if not isinstance(cases, list) or not cases or any(case.get('status') != 'PASS' for case in cases):
            raise RuntimeError(f'Incomplete or failing native result group: {name}')
        groups[name] = len(cases)
    history = native['historyMatrix']['historyCases']
    if not history or not native['enterScenario'] or not native['toolboxScenario']:
        raise RuntimeError('Final native JSON lacks physical scenarios or history matrix results')
    heap = final_json(directory / 'heap.log', {'sentinels', 'retained', 'historyEviction'})
    if heap['sentinels'] <= 0 or heap['retained'] != 0:
        raise RuntimeError('Final heap result lacks successful resource retention evidence')
    phases = heap['historyEviction']['phases']
    if [phase['phase'] for phase in phases] != [
        'before-eviction', 'after-eviction-with-retained-control', 'after-releasing-control',
    ]:
        raise RuntimeError('Final heap result lacks its complete three-phase history proof')
    write_json(directory / 'native-result.json', native)
    write_json(directory / 'heap-result.json', heap)
    return {
        'nativeGroups': groups, 'nativeGroupCount': len(groups),
        'nativeCases': sum(groups.values()), 'physicalScenarioGroups': 2,
        'historyMatrixCases': len(history), 'historyMatrix': history,
        'heap': heap,
    }


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'[0-9a-f]{40}', sys.argv[1]):
        raise SystemExit('Usage: python verify-native-continuation-final2.py <explicit frozen 40-character SHA>')
    frozen = sys.argv[1]
    if ROOT.exists() or SUPERVISION.exists():
        raise SystemExit('Refusing to overwrite an existing verification checkout or supervision directory')
    if capture(['git', 'rev-parse', frozen + '^{commit}'], MAIN).decode().strip() != frozen:
        raise SystemExit('Frozen source commit is unavailable')
    SUPERVISION.mkdir()
    status_path = SUPERVISION / 'status.json'
    status = {'source': frozen, 'startedAt': timestamp(), 'outcome': 'preparing', 'gates': {}}
    write_json(status_path, status)
    with (SUPERVISION / 'setup.log').open('xb') as output:
        subprocess.run(['git', 'worktree', 'add', '-b', BRANCH, str(ROOT), frozen],
                       cwd=MAIN, stdout=output, stderr=subprocess.STDOUT, check=True)
    assert not capture(['git', 'status', '--porcelain=v1'])
    frozen_lock = capture(['git', 'show', frozen + ':package-lock.json'], MAIN)
    if (MAIN / 'package-lock.json').read_bytes() != frozen_lock:
        raise RuntimeError('Main dependency lock differs from the frozen source lock')
    source_dependencies = MAIN / 'node_modules'
    source_carousel = source_dependencies / '@shelamkoff/carousel'
    before = file_index(source_carousel)
    installed_lock = json.loads((source_dependencies / '.package-lock.json').read_text())
    carousel_resolution = installed_lock['packages']['node_modules/@shelamkoff/carousel']['resolved']
    if not carousel_resolution.endswith('#' + CAROUSEL_PIN):
        raise RuntimeError('Installed Carousel does not resolve to the pinned git revision')
    shutil.copytree(source_dependencies, ROOT / 'node_modules', symlinks=True,
                    ignore=shutil.ignore_patterns('.vite', '.vite-temp'))
    after = file_index(ROOT / 'node_modules/@shelamkoff/carousel')
    if not before or before != after or before != file_index(source_carousel):
        raise RuntimeError('Physical Carousel copy hashes differ from the main installation')
    for item in before:
        relative = item['path']
        if (source_carousel / relative).stat().st_ino == (ROOT / 'node_modules/@shelamkoff/carousel' / relative).stat().st_ino:
            raise RuntimeError('Dependency copy unexpectedly shares a Carousel file inode')
    assert not (ROOT / 'node_modules').is_symlink()
    environment = dict(os.environ)
    removed = []
    for key in list(environment):
        if ((key.startswith('EDITOR_') and ('PAGE' in key or 'FILTER' in key))
                or key in ['EDITOR_VITE_PATH', 'EDITOR_BROWSER_ROOT', 'EDITOR_RESULTS_DIR',
                           'GITHUB_ENV', 'GITHUB_OUTPUT']):
            removed.append(key)
            environment.pop(key)
    environment.update({
        'EDITOR_CHROME_PATH': str(CHROME), 'EDITOR_PLAYWRIGHT_PATH': str(PLAYWRIGHT),
        'EDITOR_CANDIDATE_ROOT': str(ROOT), 'EDITOR_CANDIDATE_SHA': frozen,
        'EDITOR_DEPENDENCIES_ROOT': str(ROOT / 'node_modules'),
    })
    assert PLAYWRIGHT.is_file()
    preflight = {
        'source': frozen, 'tree': capture(['git', 'rev-parse', 'HEAD^{tree}']).decode().strip(),
        'cwd': str(ROOT), 'branch': BRANCH, 'node': capture(['node', '--version']).decode().strip(),
        'chrome': str(CHROME), 'chromeVersion': capture([str(CHROME), '--version']).decode().strip(),
        'chromeSha256': sha256(CHROME.read_bytes()), 'playwright': str(PLAYWRIGHT),
        'supervisorSha256': sha256(Path(__file__).read_bytes()),
        'lockSha256': sha256(frozen_lock), 'installedLockSha256': sha256((ROOT / 'node_modules/.package-lock.json').read_bytes()),
        'carouselResolution': carousel_resolution, 'carouselPhysicalCopy': True,
        'carouselFiles': after, 'removedSelectionEnvironmentNames': removed,
        'editorEnvironment': {key: value for key, value in environment.items() if key.startswith('EDITOR_')},
        'gates': GATES,
    }
    write_json(SUPERVISION / 'preflight.json', preflight)
    assert not capture(['git', 'status', '--porcelain=v1'])
    recorder = ['node', 'scripts/verification-results.mjs']
    initialized = subprocess.run([*recorder, 'init', *[name for name, _ in GATES]],
                                 cwd=ROOT, env=environment, capture_output=True)
    (SUPERVISION / 'init.stdout.log').write_bytes(initialized.stdout)
    (SUPERVISION / 'init.stderr.log').write_bytes(initialized.stderr)
    initialized.check_returncode()
    directory = Path(initialized.stdout.decode().strip().splitlines()[-1])
    environment['EDITOR_RESULTS_DIR'] = str(directory)
    status.update({'outcome': 'running', 'directory': str(directory)})
    write_json(status_path, status)
    emit(status)
    for name, command in GATES:
        status['current'] = name
        write_json(status_path, status)
        emit({'gate': name, 'startedAt': timestamp()})
        with (directory / (name + '.wrapper.log')).open('xb') as output:
            result = subprocess.run([*recorder, 'run', name, '--', *command], cwd=ROOT,
                                    env=environment, stdout=output, stderr=subprocess.STDOUT)
        status['gates'][name] = result.returncode
        write_json(status_path, status)
        emit({'gate': name, 'exitCode': result.returncode, 'finishedAt': timestamp()})
    with (directory / 'finish.wrapper.log').open('xb') as output:
        finished = subprocess.run([*recorder, 'finish'], cwd=ROOT, env=environment,
                                  stdout=output, stderr=subprocess.STDOUT)
    manifest = json.loads((directory / 'manifest.json').read_text())
    status.update({'outcome': manifest['outcome'], 'sourceUnchanged': manifest.get('sourceUnchanged'),
                   'finishedAt': timestamp()})
    if finished.returncode == 0:
        try:
            summary = summarize(directory)
            write_json(SUPERVISION / 'summary.json', summary)
            status['completeResultsVerified'] = True
            status['nativeGroupCount'] = summary['nativeGroupCount']
            status['nativeCases'] = summary['nativeCases']
            status['heapSentinels'] = summary['heap']['sentinels']
            status['heapRetained'] = summary['heap']['retained']
        except Exception as error:
            status['completeResultsVerified'] = False
            status['resultVerificationError'] = str(error)
    write_json(status_path, status)
    emit(status)
    return 0 if finished.returncode == 0 and status.get('completeResultsVerified') else 1


if __name__ == '__main__':
    sys.exit(main())
