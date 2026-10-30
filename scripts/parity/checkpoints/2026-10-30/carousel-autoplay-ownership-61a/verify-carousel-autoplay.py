import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/workspace/scratch/61a2ad7355f4/worktrees/carousel-autoplay-ownership')
phase = sys.argv[1]
assert phase in ['red', 'green']
environment = dict(os.environ)
for key in list(environment):
    if key.startswith('EDITOR_') and (key.endswith(('_PAGE', '_FILTER')) or key in [
        'EDITOR_RESULTS_DIR', 'EDITOR_BROWSER_ROOT', 'EDITOR_VITE_PATH',
    ]):
        environment.pop(key, None)
environment.update({
    'EDITOR_CHROME_PATH': '/workspace/scratch/61a2ad7355f4/tools/chrome-156/chrome-linux64/chrome',
    'EDITOR_PLAYWRIGHT_PATH': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    'EDITOR_BROWSER_PAGE': 'projection-contracts.html',
})
assert not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=root)
gates = [('projection-' + phase, ['node', 'tests/browser/run.mjs'])]
if phase == 'green':
    gates += [('carousel-units', ['node', '--test', 'plugins/carousel/settings-lifecycle.test.js']),
              ('typecheck', ['npm', 'run', 'typecheck'])]
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init',
                                     *[name for name, _ in gates]],
                                    cwd=root, env=environment, text=True).strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
print(json.dumps({'phase': phase, 'directory': directory,
                  'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()}), flush=True)
for name, command in gates:
    with open(Path(directory) / (name + '.wrapper.log'), 'w') as output:
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
                                cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT)
    print(json.dumps({'gate': name, 'exitCode': result.returncode}), flush=True)
    if result.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'],
                          cwd=root, env=environment, capture_output=True, text=True)
print(finished.stdout, finished.stderr, flush=True)
sys.exit(finished.returncode)
