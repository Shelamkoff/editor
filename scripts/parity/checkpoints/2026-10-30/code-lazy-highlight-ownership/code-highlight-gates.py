import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/workspace/scratch/61a2ad7355f4/worktrees/code-highlight-ownership')
env = dict(os.environ, EDITOR_CHROME_PATH='/workspace/scratch/61a2ad7355f4/tools/chrome-156/chrome-linux64/chrome')
mode = sys.argv[1]
if mode not in ['red', 'green']:
    raise ValueError(mode)
gates = [
    ('sync-projection-control' if mode == 'red' else 'code-highlight-units', ['node', '--test', 'plugins/code/lifecycle.test.js', 'shared/highlightRuntime.test.js'], {}),
    ('lazy-owner-red' if mode == 'red' else 'code-highlight-browser', ['node', 'tests/browser/run.mjs'], {'EDITOR_BROWSER_PAGE': 'runtime-contracts.html'}),
]
if mode == 'green':
    gates.append(('types', ['npm', 'run', 'typecheck'], {}))
for _, command, _ in gates:
    if command[:2] == ['node', '--test']:
        for path in command[2:]:
            if not (root / path).is_file():
                raise FileNotFoundError(path)
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[gate[0] for gate in gates]], cwd=root, env=env, text=True).strip()
print(json.dumps({'directory': directory, 'mode': mode}), flush=True)
env['EDITOR_RESULTS_DIR'] = directory
for name, command, additions in gates:
    with (Path(directory) / (name + '.wrapper.log')).open('w') as output:
        completed = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command], cwd=root, env=dict(env, **additions), stdout=output, stderr=subprocess.STDOUT)
    print(json.dumps({'gate': name, 'exit': completed.returncode}), flush=True)
    if completed.returncode:
        break
finish = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=env)
print(json.dumps({'directory': directory, 'finished': finish.returncode}), flush=True)
raise SystemExit(finish.returncode)
