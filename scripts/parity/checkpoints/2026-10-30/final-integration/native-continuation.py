import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/tmp/rector-integration-20261030')
state_path = Path('/tmp/rector-native-continuation-status.json')
pages = [
    'native-plugin-parity', 'native-roundtrip-preservation',
    'native-presentation-recovery', 'native-plugin-controls',
    'native-plugin-ranges', 'native-plugin-local-ranges',
    'native-plugin-clipboard', 'native-plugin-field-clipboard',
    'native-plugin-media', 'native-plugin-design',
]
env = os.environ.copy()
env['EDITOR_CHROME_PATH'] = '/tmp/rector-browsers-156/chrome-linux64/chrome'
directory = subprocess.check_output(
    ['node', 'scripts/verification-results.mjs', 'init', *pages, 'heap'],
    cwd=root, env=env, text=True).strip()
env['EDITOR_RESULTS_DIR'] = directory
state = {'directory': directory, 'pid': os.getpid(), 'state': 'running', 'completed': []}
state_path.write_text(json.dumps(state, indent=2) + '\n')
for page in pages:
    env['EDITOR_NATIVE_PAGE'] = page + '.html'
    print('START ' + page, flush=True)
    result = subprocess.run(
        ['node', 'scripts/verification-results.mjs', 'run', page, '--',
         'node', 'tests/browser/physical-history.mjs'], cwd=root, env=env)
    state['completed'].append({'gate': page, 'exitCode': result.returncode})
    state_path.write_text(json.dumps(state, indent=2) + '\n')
    print('END ' + page + ' exit=' + str(result.returncode), flush=True)
env.pop('EDITOR_NATIVE_PAGE', None)
result = subprocess.run(
    ['node', 'scripts/verification-results.mjs', 'run', 'heap', '--',
     'node', 'tests/browser/heap-gate.mjs'], cwd=root, env=env)
state['completed'].append({'gate': 'heap', 'exitCode': result.returncode})
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=env)
state['state'] = 'finished'
state['exitCode'] = finished.returncode
state_path.write_text(json.dumps(state, indent=2) + '\n')
sys.exit(finished.returncode)
