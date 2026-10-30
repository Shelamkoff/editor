import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/workspace/scratch/2e2d45a6049b/editor')
status_path = Path('/tmp/rector-verification-third-status.json')
environment = dict(os.environ)
environment.pop('EDITOR_VITE_PATH', None)
for key in ['EDITOR_BROWSER_PAGE', 'EDITOR_NATIVE_PAGE', 'EDITOR_NATIVE_FILTER', 'EDITOR_TEST_FILTER']:
    environment.pop(key, None)
environment.update({
    'EDITOR_CHROME_PATH': '/tmp/rector-browsers-156/chrome-linux64/chrome',
    'EDITOR_PLAYWRIGHT_PATH': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    'EDITOR_V1_ROOT': '/tmp/rector-v1-5e5c7f8',
    'EDITOR_SPEC_BASELINE_ROOT': '/tmp/rector-e981ff3',
    'EDITOR_CANDIDATE_ROOT': str(root),
    'EDITOR_CANDIDATE_SHA': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'EDITOR_DEPENDENCIES_ROOT': str(root / 'node_modules'),
})
gates = [
    ('typecheck', ['npm', 'run', 'typecheck'], {}),
    ('unit', ['npm', 'test'], {}),
    ('checklist-review', ['python', 'scripts/parity/checkpoints/2026-10-30/checklist-empty-exit/review.py'], {}),
    ('build', ['npm', 'run', 'build'], {}),
    ('types', ['npm', 'run', 'test:types'], {}),
    ('package', ['npm', 'run', 'test:package'], {}),
    ('differential', ['node', 'scripts/parity/block-roundtrip.mjs'], {}),
    ('gallery-differential', ['node', 'scripts/parity/gallery-caption-order.mjs'], {}),
    ('browser', ['npm', 'run', 'test:browser'], {'EDITOR_VITE_PATH': '/tmp/rector-root-vite.mjs'}),
]
directory = subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[g[0] for g in gates]],
    cwd=root, env=environment, text=True).strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
history_path = Path('/tmp/rector-verification-third-runs.json')
history = json.loads(history_path.read_text()) if history_path.exists() else []
history.append({'directory': directory, 'source': environment['EDITOR_CANDIDATE_SHA']})
history_path.write_text(json.dumps(history, indent=2))
status = {'source': environment['EDITOR_CANDIDATE_SHA'], 'directory': directory, 'outcome': 'running', 'gates': {}}
status_path.write_text(json.dumps(status, indent=2))
print(json.dumps(status), flush=True)
for name, command, additions in gates:
    status['current'] = name
    status_path.write_text(json.dumps(status, indent=2))
    with open('/tmp/rector-verification-third-supervisor.log', 'a') as log:
        process = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
            cwd=root, env={**environment, **additions}, stdout=log, stderr=subprocess.STDOUT)
    status['gates'][name] = process.returncode
    status_path.write_text(json.dumps(status, indent=2))
    print(json.dumps({'gate': name, 'exitCode': process.returncode}), flush=True)
    if process.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=environment)
status['outcome'] = json.loads(Path(directory, 'manifest.json').read_text())['outcome']
status_path.write_text(json.dumps(status, indent=2))
print(json.dumps(status), flush=True)
sys.exit(finished.returncode)
