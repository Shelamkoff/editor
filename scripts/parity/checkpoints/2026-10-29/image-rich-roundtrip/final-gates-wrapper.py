from pathlib import Path
import hashlib
import json
import os
import subprocess

root = Path('/tmp/rector-image-rich-roundtrip-20261029')
paths = ['scripts/parity/block-roundtrip.mjs', 'scripts/parity/block-roundtrip.md', 'tests/browser/block-roundtrip-fixture.js']
sources = {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in paths}
assert sources == {
    'scripts/parity/block-roundtrip.mjs': '142385fcdf2b4567f3bf83a0df648e621c70345a16cc60209e8179aa77c58e70',
    'scripts/parity/block-roundtrip.md': 'df6a04ca0560989ae86f7afeed4324b6faa1350b25b3a84ca131e1747d2ed6d0',
    'tests/browser/block-roundtrip-fixture.js': '8bbd4e5a57908b5a496ddd47879108cb5c412e200c344e35ef1c05082b2ee60a',
}
environment = dict(os.environ,
                   EDITOR_V1_ROOT='/tmp/rector-v1-5e5c7f8',
                   EDITOR_SPEC_BASELINE_ROOT='/tmp/rector-e981ff3',
                   EDITOR_CANDIDATE_ROOT=str(root),
                   EDITOR_CANDIDATE_SHA='fe44cc57f5cbac1daffd031f5c8e791d707fb828',
                   EDITOR_DEPENDENCIES_ROOT=str(root / 'node_modules'),
                   EDITOR_PLAYWRIGHT_PATH='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
                   EDITOR_CHROME_PATH='/tmp/rector-browsers-156/chrome-linux64/chrome',
                   EDITOR_ROUNDTRIP_FILTER='',
                   EDITOR_NATIVE_PAGE='native-roundtrip-preservation.html')
environment.pop('EDITOR_NATIVE_FILTER', None)
initial = subprocess.run(['node', 'scripts/verification-results.mjs', 'init', 'differential47', 'native47'], cwd=root,
                         env=environment, text=True, capture_output=True, check=True)
directory = initial.stdout.strip().splitlines()[-1]
environment['EDITOR_RESULTS_DIR'] = directory
results = []
for label, command, suffix in [('differential47', ['node', 'scripts/parity/block-roundtrip.mjs'], '.json'),
                               ('native47', ['node', 'tests/browser/physical-history.mjs'], '.log')]:
    output_path = Path('/tmp/rector-image-rich-final-' + label + suffix)
    error_path = Path('/tmp/rector-image-rich-final-' + label + '.stderr.log')
    with output_path.open('w') as output, error_path.open('w') as errors:
        result = subprocess.run(['node', 'scripts/verification-results.mjs', 'run', label, '--', *command],
                                cwd=root, env=environment, stdout=output, stderr=errors)
    item = {'label': label, 'exitCode': result.returncode, 'output': str(output_path),
            'outputSha256': hashlib.sha256(output_path.read_bytes()).hexdigest(),
            'stderr': str(error_path), 'stderrSha256': hashlib.sha256(error_path.read_bytes()).hexdigest()}
    results.append(item)
    print(json.dumps(item), flush=True)
    if result.returncode:
        break
finished = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root,
                          env=environment, text=True, capture_output=True)
manifest_path = Path(directory) / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
record = {'scope': 'Final Image rich-caption addition to the public ROUNDTRIP template: all47 selected three-source cases, then all47 standard native cases. Detailed Image actions and full editor parity are separate.',
          'cwd': str(root), 'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
          'candidateProductionSha': environment['EDITOR_CANDIDATE_SHA'], 'frozenTestSources': sources,
          'wrapper': __file__, 'wrapperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'dependencySymlink': str((root / 'node_modules').resolve()),
          'chrome': environment['EDITOR_CHROME_PATH'],
          'chromeVersion': subprocess.check_output([environment['EDITOR_CHROME_PATH'], '--version'], text=True).strip(),
          'manifest': str(manifest_path), 'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
          'finishExitCode': finished.returncode, 'results': results,
          'gates': {label: {key: gate.get(key) for key in ['outcome', 'startedAt', 'finishedAt', 'elapsedMs', 'exitCode', 'sourceUnchanged']}
                    for label, gate in manifest['gates'].items()},
          'sourceBytesUnchanged': all(hashlib.sha256((root / path).read_bytes()).hexdigest() == value for path, value in sources.items())}
Path('/tmp/rector-image-rich-final-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2), flush=True)
