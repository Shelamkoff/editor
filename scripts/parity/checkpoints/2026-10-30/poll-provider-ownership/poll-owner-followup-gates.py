import json
import os
from pathlib import Path
import subprocess

root = Path('/workspace/scratch/61a2ad7355f4/worktrees/poll-current')
env = dict(os.environ, EDITOR_CHROME_PATH='/workspace/scratch/61a2ad7355f4/tools/chrome-156/chrome-linux64/chrome')
gates = [
    ('units', ['node', '--test', 'core/DocumentRuntime.test.js', 'core/BlockReconciler.test.js', 'core/InstanceScope.test.js', 'plugins/poll/reconciliation.test.js'], {}),
    ('types', ['npm', 'run', 'typecheck'], {}),
    ('ordinary-projection', ['node', 'tests/browser/run.mjs'], {'EDITOR_BROWSER_PAGE': 'projection-contracts.html'}),
    ('poll-state', ['node', 'tests/browser/run.mjs'], {'EDITOR_BROWSER_PAGE': 'poll-state-contracts.html'}),
    ('docs', ['npm', 'run', 'test:docs'], {}),
    ('native-poll-controls', ['node', 'tests/browser/physical-history.mjs'], {'EDITOR_NATIVE_PAGE': 'native-plugin-controls.html', 'EDITOR_NATIVE_FILTER': ''}),
]
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[gate[0] for gate in gates]], cwd=root, env=env, text=True).strip()
print(json.dumps({'directory': directory}), flush=True)
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
