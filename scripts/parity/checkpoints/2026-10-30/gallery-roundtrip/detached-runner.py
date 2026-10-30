from pathlib import Path
import datetime
import json
import os
import subprocess
import sys

root = Path('/tmp/rector-gallery-roundtrip-20261030')
label, kind = sys.argv[1:3]
filter_value = sys.argv[3] if len(sys.argv) > 3 else 'BLOCK_GALLERY_ROUNDTRIP'
prefix = Path('/tmp/rector-gallery-rt-' + label)
status = Path(str(prefix) + '.status.json')
environment = dict(os.environ,
    EDITOR_V1_ROOT='/tmp/rector-v1-5e5c7f8',
    EDITOR_SPEC_BASELINE_ROOT='/tmp/rector-e981ff3',
    EDITOR_CANDIDATE_ROOT=str(root),
    EDITOR_DEPENDENCIES_ROOT=str(root / 'node_modules'),
    EDITOR_PLAYWRIGHT_PATH='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
    EDITOR_CHROME_PATH=os.environ.get('EDITOR_CHROME_PATH', '/tmp/rector-browsers-156/chrome-linux64/chrome'),
    EDITOR_ROUNDTRIP_FILTER=filter_value,
    EDITOR_NATIVE_PAGE='native-roundtrip-preservation.html',
    EDITOR_NATIVE_FILTER=filter_value)
environment['EDITOR_CANDIDATE_SHA'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
commands = {
    'differential': ['node', 'scripts/parity/block-roundtrip.mjs'],
    'native': ['node', 'tests/browser/physical-history.mjs'],
    'typecheck': ['npm', 'run', 'typecheck'],
    'classifier': ['node', 'scripts/parity/checkpoints/2026-10-30/gallery-roundtrip/classifier-sensitivity.mjs'],
}
record = {'label': label, 'kind': kind, 'pid': os.getpid(), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'cwd': str(root), 'sourceHead': environment['EDITOR_CANDIDATE_SHA'], 'filter': filter_value,
          'chrome': environment['EDITOR_CHROME_PATH'], 'outcome': 'running'}
status.write_text(json.dumps(record, indent=2) + '\n')
try:
    initial = subprocess.run(['node', 'scripts/verification-results.mjs', 'init', kind], cwd=root,
                             env=environment, check=True, capture_output=True, text=True)
    directory = initial.stdout.strip().splitlines()[-1]
    record['manifest'] = str(Path(directory) / 'manifest.json')
    record['log'] = str(Path(directory) / (kind + '.log'))
    status.write_text(json.dumps(record, indent=2) + '\n')
    environment['EDITOR_RESULTS_DIR'] = directory
    with Path(str(prefix) + '.log').open('w') as output:
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', kind, '--', *commands[kind]],
                                cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT)
    finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root,
                              env=environment, capture_output=True, text=True)
    record.update(outcome='passed' if result.returncode == 0 and finished.returncode == 0 else 'failed',
                  exitCode=result.returncode, finishExitCode=finished.returncode)
except BaseException as error:
    record.update(outcome='setup-error', error=repr(error))
finally:
    record['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    status.write_text(json.dumps(record, indent=2) + '\n')
