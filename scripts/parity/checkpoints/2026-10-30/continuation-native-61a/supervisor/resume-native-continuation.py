"""Resume the verified checkout after a sandbox-only C11 initialization failure."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

path = Path('/workspace/scratch/61a2ad7355f4/tools/verify-native-continuation.py')
spec = importlib.util.spec_from_file_location('native_supervisor', path)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)

root, output = supervisor.ROOT, supervisor.SUPERVISION
preflight = json.loads((output / 'preflight.json').read_text())
status = json.loads((output / 'status.json').read_text())
assert status['outcome'] == 'preparing' and not status['gates']
assert supervisor.capture(['git', 'rev-parse', 'HEAD']).decode().strip() == preflight['source']
assert supervisor.capture(['git', 'rev-parse', 'HEAD^{tree}']).decode().strip() == preflight['tree']
assert not supervisor.capture(['git', 'status', '--porcelain=v1'])
assert supervisor.sha256((root / 'package-lock.json').read_bytes()) == preflight['lockSha256']
assert supervisor.sha256((root / 'node_modules/.package-lock.json').read_bytes()) == preflight['installedLockSha256']
assert supervisor.file_index(root / 'node_modules/@shelamkoff/carousel') == preflight['carouselFiles']
assert supervisor.sha256(path.read_bytes()) == preflight['supervisorSha256']

environment = dict(os.environ)
for key in list(environment):
    if ((key.startswith('EDITOR_') and ('PAGE' in key or 'FILTER' in key))
            or key in ['EDITOR_VITE_PATH', 'EDITOR_BROWSER_ROOT', 'EDITOR_RESULTS_DIR',
                       'GITHUB_ENV', 'GITHUB_OUTPUT']):
        environment.pop(key)
environment.update(preflight['editorEnvironment'])
supervisor.write_json(output / 'resume-preflight.json', {
    'source': preflight['source'], 'at': supervisor.timestamp(),
    'initialPreflightSha256': supervisor.sha256((output / 'preflight.json').read_bytes()),
    'resumeSupervisorSha256': supervisor.sha256(Path(__file__).read_bytes()),
    'sourceClean': True, 'installedDependenciesRechecked': True,
    'editorEnvironment': {key: value for key, value in environment.items() if key.startswith('EDITOR_')},
    'reason': 'Initial default-sandbox C11 initialization returned spawnSync git EPERM before any gate started; resume uses the approved tool escalation.',
})

recorder = ['node', 'scripts/verification-results.mjs']
initialized = subprocess.run([*recorder, 'init', *[name for name, _ in supervisor.GATES]],
                             cwd=root, env=environment, capture_output=True)
(output / 'init.stdout.log').write_bytes(initialized.stdout)
(output / 'init.stderr.log').write_bytes(initialized.stderr)
initialized.check_returncode()
directory = Path(initialized.stdout.decode().strip().splitlines()[-1])
environment['EDITOR_RESULTS_DIR'] = str(directory)
status.update({'outcome': 'running', 'directory': str(directory), 'resumedAt': supervisor.timestamp()})
supervisor.write_json(output / 'status.json', status)
print(json.dumps(status), flush=True)
for name, command in supervisor.GATES:
    status['current'] = name
    supervisor.write_json(output / 'status.json', status)
    print(json.dumps({'gate': name, 'startedAt': supervisor.timestamp()}), flush=True)
    with (directory / (name + '.wrapper.log')).open('xb') as stream:
        result = subprocess.run([*recorder, 'run', name, '--', *command], cwd=root,
                                env=environment, stdout=stream, stderr=subprocess.STDOUT)
    status['gates'][name] = result.returncode
    supervisor.write_json(output / 'status.json', status)
    print(json.dumps({'gate': name, 'exitCode': result.returncode, 'finishedAt': supervisor.timestamp()}), flush=True)
with (directory / 'finish.wrapper.log').open('xb') as stream:
    finished = subprocess.run([*recorder, 'finish'], cwd=root, env=environment,
                              stdout=stream, stderr=subprocess.STDOUT)
manifest = json.loads((directory / 'manifest.json').read_text())
status.update({'outcome': manifest['outcome'], 'sourceUnchanged': manifest.get('sourceUnchanged'),
               'finishedAt': supervisor.timestamp()})
if finished.returncode == 0:
    try:
        summary = supervisor.summarize(directory)
        supervisor.write_json(output / 'summary.json', summary)
        status.update({'completeResultsVerified': True,
                       'nativeGroupCount': summary['nativeGroupCount'], 'nativeCases': summary['nativeCases'],
                       'heapSentinels': summary['heap']['sentinels'], 'heapRetained': summary['heap']['retained']})
    except Exception as error:
        status.update({'completeResultsVerified': False, 'resultVerificationError': str(error)})
supervisor.write_json(output / 'status.json', status)
print(json.dumps(status), flush=True)
sys.exit(0 if finished.returncode == 0 and status.get('completeResultsVerified') else 1)
