from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

label, case_filter = sys.argv[1:]
root = Path('/tmp/rector-image-rich-roundtrip-20261029')
environment = dict(os.environ,
                   EDITOR_V1_ROOT='/tmp/rector-v1-5e5c7f8',
                   EDITOR_SPEC_BASELINE_ROOT='/tmp/rector-e981ff3',
                   EDITOR_CANDIDATE_ROOT=str(root),
                   EDITOR_CANDIDATE_SHA='fe44cc57f5cbac1daffd031f5c8e791d707fb828',
                   EDITOR_DEPENDENCIES_ROOT=str(root / 'node_modules'),
                   EDITOR_PLAYWRIGHT_PATH='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
                   EDITOR_CHROME_PATH='/tmp/rector-browsers-156/chrome-linux64/chrome',
                   EDITOR_ROUNDTRIP_FILTER=case_filter)
initial = subprocess.run(['node', 'scripts/verification-results.mjs', 'init', label], cwd=root,
                         env=environment, text=True, capture_output=True, check=True)
directory = initial.stdout.strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
trace = Path('/tmp/rector-image-rich-' + label + '.json')
errors = Path('/tmp/rector-image-rich-' + label + '.stderr.log')
with trace.open('w') as output, errors.open('w') as stderr:
    result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', label, '--',
                             'node', 'scripts/parity/block-roundtrip.mjs'], cwd=root,
                            env=environment, stdout=output, stderr=stderr)
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root,
                          env=environment, text=True, capture_output=True)
manifest_path = Path(directory) / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
gate = manifest['gates'][label]
record = {'scope': 'Image rich-caption public ROUNDTRIP investigation. Existing45 case specifications unchanged; two new widget-caption cases. No new historical classifiers in initial raw probe.',
          'cwd': str(root), 'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
          'candidateProductionSha': environment['EDITOR_CANDIDATE_SHA'],
          'wrapper': __file__, 'wrapperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'dependencySymlink': str((root / 'node_modules').resolve()),
          'chrome': environment['EDITOR_CHROME_PATH'],
          'chromeVersion': subprocess.check_output([environment['EDITOR_CHROME_PATH'], '--version'], text=True).strip(),
          'caseFilter': case_filter or None, 'manifest': str(manifest_path),
          'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
          'outcome': gate['outcome'], 'startedAt': gate['startedAt'], 'finishedAt': gate['finishedAt'], 'elapsedMs': gate['elapsedMs'],
          'exitCode': result.returncode, 'finishExitCode': finished.returncode, 'sourceUnchanged': gate.get('sourceUnchanged'),
          'trace': str(trace), 'traceSha256': hashlib.sha256(trace.read_bytes()).hexdigest(),
          'stderr': str(errors), 'stderrSha256': hashlib.sha256(errors.read_bytes()).hexdigest()}
Path('/tmp/rector-image-rich-' + label + '-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
