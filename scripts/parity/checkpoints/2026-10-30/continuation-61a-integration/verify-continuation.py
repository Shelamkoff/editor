import json
import os
from pathlib import Path
import subprocess
import sys

root = Path('/workspace/scratch/61a2ad7355f4/editor')
status_path = Path('/workspace/scratch/61a2ad7355f4/tools/continuation-verification-status.json')
environment = dict(os.environ)
for key in list(environment):
    if key.startswith('EDITOR_') and key.endswith(('_PAGE', '_FILTER')):
        environment.pop(key, None)
for key in ['EDITOR_BROWSER_PAGE', 'EDITOR_NATIVE_PAGE', 'EDITOR_NATIVE_FILTER',
            'EDITOR_TEST_FILTER', 'EDITOR_ROUNDTRIP_FILTER', 'EDITOR_VITE_PATH',
            'EDITOR_BROWSER_ROOT', 'EDITOR_RESULTS_DIR']:
    environment.pop(key, None)
environment.update({
    'EDITOR_CHROME_PATH': '/workspace/scratch/61a2ad7355f4/tools/chrome-156/chrome-linux64/chrome',
    'EDITOR_PLAYWRIGHT_PATH': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    'EDITOR_V1_ROOT': '/workspace/scratch/61a2ad7355f4/references/v1',
    'EDITOR_SPEC_BASELINE_ROOT': '/workspace/scratch/61a2ad7355f4/references/spec-baseline',
    'EDITOR_CANDIDATE_ROOT': str(root),
    'EDITOR_CANDIDATE_SHA': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'EDITOR_DEPENDENCIES_ROOT': str(root / 'node_modules'),
})
config_count = int(environment.get('GIT_CONFIG_COUNT', '0'))
environment[f'GIT_CONFIG_KEY_{config_count}'] = 'url.https://github.com/.insteadOf'
environment[f'GIT_CONFIG_VALUE_{config_count}'] = 'ssh://git@github.com/'
environment['GIT_CONFIG_COUNT'] = str(config_count + 1)
assert not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=root)
gates = [
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('unit', ['npm', 'test']),
    ('build', ['npm', 'run', 'build']),
    ('types', ['npm', 'run', 'test:types']),
    ('package', ['npm', 'run', 'test:package']),
    ('size-report', ['node', 'benchmarks/bundle-budget.mjs', '--enforce']),
    ('docs-contract', ['npm', 'run', 'test:docs']),
    ('docs-browser', ['npm', 'run', 'docs:check']),
    ('ordinary-browser', ['node', 'tests/browser/run.mjs']),
    ('common-parity', ['node', 'scripts/parity/block-roundtrip.mjs']),
    ('gallery-parity', ['node', 'scripts/parity/gallery-caption-order.mjs']),
]
directory = subprocess.check_output(
    ['node', 'scripts/verification-results.mjs', 'init', *[name for name, _ in gates]],
    cwd=root, env=environment, text=True,
).strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
status = {'source': environment['EDITOR_CANDIDATE_SHA'], 'directory': directory,
          'outcome': 'running', 'gates': {}}
status_path.write_text(json.dumps(status, indent=2) + '\n')
print(json.dumps(status), flush=True)
for name, command in gates:
    status['current'] = name
    status_path.write_text(json.dumps(status, indent=2) + '\n')
    with open(Path(directory) / (name + '.wrapper.log'), 'w') as output:
        process = subprocess.run(
            ['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
            cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT,
        )
    status['gates'][name] = process.returncode
    status_path.write_text(json.dumps(status, indent=2) + '\n')
    print(json.dumps({'gate': name, 'exitCode': process.returncode}), flush=True)
    if process.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'],
                          cwd=root, env=environment, capture_output=True, text=True)
manifest = json.loads(Path(directory, 'manifest.json').read_text())
status['outcome'] = manifest['outcome']
status['sourceUnchanged'] = manifest.get('sourceUnchanged')
status_path.write_text(json.dumps(status, indent=2) + '\n')
print(json.dumps(status), flush=True)
if finished.returncode:
    print(finished.stdout, finished.stderr, flush=True)
sys.exit(finished.returncode)
