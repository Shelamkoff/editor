import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/workspace/scratch/2e2d45a6049b/editor')
environment = dict(os.environ)
environment.pop('EDITOR_VITE_PATH', None)
environment['EDITOR_CHROME_PATH'] = '/tmp/rector-browsers-156/chrome-linux64/chrome'
environment['EDITOR_PLAYWRIGHT_PATH'] = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
gates = [('package-docs-build', ['npm', 'run', 'build']),
         ('docs', ['npm', 'run', 'test:docs']), ('docs-build', ['npm', 'run', 'docs:check'])]
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[g[0] for g in gates]],
    cwd=root, env=environment, text=True).strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
history_path = Path('/tmp/rector-verification-third-docs-runs.json')
history = json.loads(history_path.read_text()) if history_path.exists() else []
history.append(directory)
history_path.write_text(json.dumps(history, indent=2))
Path('/tmp/rector-verification-third-docs-directory.txt').write_text(directory)
print(json.dumps({'directory': directory}), flush=True)
for name, command in gates:
    with open('/tmp/rector-verification-third-docs-supervisor.log', 'a') as log:
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
            cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT)
    print(json.dumps({'gate': name, 'exitCode': result.returncode}), flush=True)
    if result.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=environment)
manifest = json.loads(Path(directory, 'manifest.json').read_text())
print(json.dumps({'directory': directory, 'outcome': manifest['outcome'], 'sourceUnchanged': manifest['sourceUnchanged']}), flush=True)
sys.exit(finished.returncode)
