"""Fresh native/heap run after an interrupted supervisor; preserve old evidence."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

BASE = Path('/workspace/scratch/61a2ad7355f4')
original = BASE / 'tools/verify-native-continuation-final2.py'
spec = importlib.util.spec_from_file_location('native_supervisor', original)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
prior_external = supervisor.SUPERVISION
external = BASE / 'tools/native-continuation-final2-retry'
supervisor.SUPERVISION = external
root = supervisor.ROOT
frozen = 'c6e537e5d7433f0d902749719c8af265c6ae8591'


def main():
    external.mkdir(exist_ok=False)
    assert supervisor.capture(['git', 'rev-parse', 'HEAD']).decode().strip() == frozen
    assert not supervisor.capture(['git', 'status', '--porcelain=v1'])
    previous_status = json.loads((prior_external / 'status.json').read_text())
    previous_directory = Path(previous_status['directory'])
    previous_manifest = json.loads((previous_directory / 'manifest.json').read_text())
    assert previous_manifest['source']['head'] == frozen
    assert previous_manifest['gates']['native']['finishedAt'] is None
    assert previous_manifest['gates']['native']['exitCode'] is None
    assert previous_manifest['gates']['heap']['outcome'] == 'not-run'
    process_snapshot = subprocess.check_output(['ps', '-eo', 'pid,ppid,etimes,args'])
    (external / 'process-recovery.txt').write_bytes(process_snapshot)
    owned = {
        214387: str(root / 'node_modules/vite/bin/vite.js') + ' --host 127.0.0.1 --port 36855 --strictPort',
        214407: '--remote-debugging-port=39733 --user-data-dir=/tmp/ophire-editor-physical-history-PCld0d http://127.0.0.1:36855/tests/browser/physical-history.html',
    }
    terminated = []
    for pid, marker in owned.items():
        found = [line for line in process_snapshot.decode().splitlines()
                 if line.split(maxsplit=1)[0] == str(pid)]
        assert len(found) == 1 and marker in found[0] and found[0].split()[1] == '1'
        os.kill(pid, signal.SIGTERM)
        terminated.append({'pid': pid, 'matchedCommand': found[0].strip(), 'signal': 'SIGTERM'})
    previous_payloads = []
    for directory in [previous_directory, prior_external]:
        for path in sorted(directory.iterdir()):
            assert path.is_file()
            previous_payloads.append({'path': str(path), 'bytes': path.stat().st_size,
                                      'sha256': supervisor.sha256(path.read_bytes())})
    interruption = {
        'observedAt': supervisor.timestamp(), 'previousRun': previous_directory.name,
        'classification': 'interrupted-incomplete',
        'reason': 'No supervisor, recorder or physical-history Node process remained; only positively identified orphan test resources remained. Original native gate has no exit code or final result; heap never started.',
        'nativeProgressLines': len((previous_directory / 'native.log').read_text().splitlines()),
        'completeNativeResultAvailable': False, 'productFailureInferred': False,
        'originalPayloads': previous_payloads, 'terminatedOwnedOrphans': terminated,
        'unrelatedChromePid25669Touched': False,
    }
    supervisor.write_json(external / 'interruption.json', interruption)
    preflight = json.loads((prior_external / 'preflight.json').read_text())
    assert preflight['source'] == frozen
    assert preflight['tree'] == supervisor.capture(['git', 'rev-parse', 'HEAD^{tree}']).decode().strip()
    assert supervisor.file_index(root / 'node_modules/@shelamkoff/carousel') == preflight['carouselFiles']
    assert supervisor.sha256((root / 'node_modules/.package-lock.json').read_bytes()) == preflight['installedLockSha256']
    environment = dict(os.environ)
    removed = []
    for key in list(environment):
        if ((key.startswith('EDITOR_') and ('PAGE' in key or 'FILTER' in key))
                or key in ['EDITOR_VITE_PATH', 'EDITOR_BROWSER_ROOT', 'EDITOR_RESULTS_DIR',
                           'GITHUB_ENV', 'GITHUB_OUTPUT']):
            removed.append(key)
            environment.pop(key)
    environment.update(preflight['editorEnvironment'])
    supervisor.write_json(external / 'preflight.json', {
        **preflight, 'resumedAt': supervisor.timestamp(),
        'resumeSupervisorSha256': supervisor.sha256(Path(__file__).read_bytes()),
        'removedSelectionEnvironmentNamesAtResume': removed,
        'dependencyHashesRechecked': True, 'sourceRecheckedClean': True,
    })
    recorder = ['node', 'scripts/verification-results.mjs']
    initialized = subprocess.run([*recorder, 'init', *[name for name, _ in supervisor.GATES]],
                                 cwd=root, env=environment, capture_output=True)
    (external / 'init.stdout.log').write_bytes(initialized.stdout)
    (external / 'init.stderr.log').write_bytes(initialized.stderr)
    initialized.check_returncode()
    directory = Path(initialized.stdout.decode().strip().splitlines()[-1])
    environment['EDITOR_RESULTS_DIR'] = str(directory)
    status = {'source': frozen, 'startedAt': supervisor.timestamp(), 'outcome': 'running',
              'gates': {}, 'directory': str(directory), 'supersedesIncompleteRun': previous_directory.name}
    supervisor.write_json(external / 'status.json', status)
    supervisor.emit(status)
    for name, command in supervisor.GATES:
        status['current'] = name
        supervisor.write_json(external / 'status.json', status)
        supervisor.emit({'gate': name, 'startedAt': supervisor.timestamp()})
        with (directory / (name + '.wrapper.log')).open('xb') as output:
            result = subprocess.run([*recorder, 'run', name, '--', *command], cwd=root,
                                    env=environment, stdout=output, stderr=subprocess.STDOUT)
        status['gates'][name] = result.returncode
        supervisor.write_json(external / 'status.json', status)
        supervisor.emit({'gate': name, 'exitCode': result.returncode, 'finishedAt': supervisor.timestamp()})
    with (directory / 'finish.wrapper.log').open('xb') as output:
        finished = subprocess.run([*recorder, 'finish'], cwd=root, env=environment,
                                  stdout=output, stderr=subprocess.STDOUT)
    manifest = json.loads((directory / 'manifest.json').read_text())
    status.update({'outcome': manifest['outcome'], 'sourceUnchanged': manifest.get('sourceUnchanged'),
                   'finishedAt': supervisor.timestamp()})
    if finished.returncode == 0:
        try:
            summary = supervisor.summarize(directory)
            supervisor.write_json(external / 'summary.json', summary)
            status.update({'completeResultsVerified': True, 'nativeGroupCount': summary['nativeGroupCount'],
                           'nativeCases': summary['nativeCases'], 'heapSentinels': summary['heap']['sentinels'],
                           'heapRetained': summary['heap']['retained']})
        except Exception as error:
            status.update({'completeResultsVerified': False, 'resultVerificationError': str(error)})
    supervisor.write_json(external / 'status.json', status)
    supervisor.emit(status)
    return 0 if finished.returncode == 0 and status.get('completeResultsVerified') else 1


if __name__ == '__main__':
    sys.exit(main())
