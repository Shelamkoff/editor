"""Run final documentation gates sequentially on one clean committed source."""
import json
import os
from pathlib import Path
import subprocess
import sys

workspace = Path('/workspace/scratch/61a2ad7355f4')
root = workspace / 'editor'
status_file = workspace / 'tools/continuation-publication-docs-status.json'
assert not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=root)
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
environment = dict(os.environ)
for key in list(environment):
    if key.startswith('EDITOR_') and key.endswith(('_PAGE', '_FILTER')):
        environment.pop(key, None)
for key in ['EDITOR_RESULTS_DIR', 'EDITOR_VITE_PATH', 'EDITOR_BROWSER_ROOT']:
    environment.pop(key, None)
environment['EDITOR_CHROME_PATH'] = str(workspace / 'tools/chrome-156/chrome-linux64/chrome')
environment['EDITOR_PLAYWRIGHT_PATH'] = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
gates = [('docs-contract', ['npm', 'run', 'test:docs']),
         ('docs-browser', ['npm', 'run', 'docs:check'])]
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init',
                                     *[name for name, _ in gates]],
                                    cwd=root, env=environment, text=True).strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
status = {'source': source, 'directory': directory, 'outcome': 'running', 'gates': {}}
status_file.write_text(json.dumps(status, indent=2) + '\n')
print(json.dumps(status), flush=True)
for name, command in gates:
    status['current'] = name
    status_file.write_text(json.dumps(status, indent=2) + '\n')
    with Path(directory, name + '.wrapper.log').open('w') as output:
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
                                cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT)
    status['gates'][name] = result.returncode
    status_file.write_text(json.dumps(status, indent=2) + '\n')
    print(json.dumps({'gate': name, 'exitCode': result.returncode}), flush=True)
    if result.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'],
                          cwd=root, env=environment, capture_output=True, text=True)
manifest = json.loads(Path(directory, 'manifest.json').read_text())
status['outcome'] = manifest['outcome']
status['sourceUnchanged'] = manifest.get('sourceUnchanged')
status_file.write_text(json.dumps(status, indent=2) + '\n')
print(json.dumps(status), flush=True)
if finished.returncode:
    print(finished.stdout, finished.stderr, flush=True)
sys.exit(finished.returncode)
