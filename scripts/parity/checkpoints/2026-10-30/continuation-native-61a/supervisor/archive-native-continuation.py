"""Archive completed native/heap verification; never edit the tested source."""
import base64
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess


BASE = Path('/workspace/scratch/61a2ad7355f4')
source = BASE / 'tools/verify-native-continuation.py'
spec = importlib.util.spec_from_file_location('native_supervisor', source)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
root, external = supervisor.ROOT, supervisor.SUPERVISION
status = json.loads((external / 'status.json').read_text())
assert status['outcome'] == 'passed' and status['sourceUnchanged'] and status['completeResultsVerified']
directory = Path(status['directory'])
manifest = json.loads((directory / 'manifest.json').read_text())
assert manifest['outcome'] == 'passed' and manifest['sourceUnchanged'] and not manifest['source']['dirty']
assert set(manifest['gates']) == {'native', 'heap'}
assert all(gate['outcome'] == 'passed' and gate['exitCode'] == 0 and gate['sourceUnchanged']
           for gate in manifest['gates'].values())
assert supervisor.capture(['git', 'rev-parse', 'HEAD']).decode().strip() == status['source']
assert not supervisor.capture(['git', 'status', '--porcelain=v1'])
summary = supervisor.summarize(directory)
assert summary == json.loads((external / 'summary.json').read_text())
preflight = json.loads((external / 'preflight.json').read_text())
assert supervisor.file_index(root / 'node_modules/@shelamkoff/carousel') == preflight['carouselFiles']
assert supervisor.sha256((root / 'node_modules/.package-lock.json').read_bytes()) == preflight['installedLockSha256']

checkpoint = root / 'scripts/parity/checkpoints/2026-10-30/continuation-native-61a'
checkpoint.mkdir(exist_ok=False)
payloads = []


def save(relative, raw, origin, compress=False):
    stored = gzip.compress(raw, mtime=0) if compress else raw
    target = checkpoint / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(stored)
    assert (gzip.decompress(target.read_bytes()) if compress else target.read_bytes()) == raw
    payloads.append({'path': relative, 'origin': origin, 'encoding': 'gzip' if compress else 'identity',
                     'rawBytes': len(raw), 'rawSha256': supervisor.sha256(raw),
                     'storedBytes': len(stored), 'storedSha256': supervisor.sha256(stored)})


for path in sorted(directory.iterdir()):
    assert path.is_file(), f'Unexpected result directory: {path}'
    compressed = path.suffix == '.log' or path.name == 'native-result.json'
    save('c11/' + path.name + ('.gz' if compressed else ''), path.read_bytes(), str(path), compressed)
for path in sorted(external.iterdir()):
    assert path.is_file(), f'Unexpected supervision directory: {path}'
    save('supervisor/' + path.name, path.read_bytes(), str(path))
for name in ['verify-native-continuation.py', 'resume-native-continuation.py', 'archive-native-continuation.py']:
    path = BASE / 'tools' / name
    save('supervisor/' + name, path.read_bytes(), str(path))
raw_commit = supervisor.capture(['git', 'cat-file', 'commit', status['source']])
assert hashlib.sha1(b'commit ' + str(len(raw_commit)).encode() + b'\0' + raw_commit).hexdigest() == status['source']
runner_paths = ['scripts/verification-results.mjs', 'tests/browser/physical-history.mjs',
                'tests/browser/heap-gate.mjs', 'tests/browser/environment.mjs',
                'tests/browser/history.js', 'tests/browser/lifecycle.js']
verification = {
    'schemaVersion': 1, 'source': manifest['source'], 'frozenSha': status['source'],
    'rawCommitBase64': base64.b64encode(raw_commit).decode(),
    'run': directory.name, 'outcome': 'passed', 'sourceUnchanged': True,
    'commands': {name: gate['command'] for name, gate in manifest['gates'].items()},
    'summary': summary,
    'runnerFiles': [{'path': path, 'sha256': supervisor.sha256((root / path).read_bytes())} for path in runner_paths],
    'dependencyVerification': {'carouselFiles': len(preflight['carouselFiles']),
                               'carouselFilesUnchangedAfterGates': True,
                               'installedLockUnchangedAfterGates': True},
    'payloads': payloads,
}
supervisor.write_json(checkpoint / 'verification.json', verification)

groups = '\n'.join(f'| `{name}` | {count} |' for name, count in summary['nativeGroups'].items())
heap = summary['heap']
phases = '\n'.join(f'| `{phase["phase"]}` | `{json.dumps(phase["counts"], separators=(",", ":"))}` |'
                   for phase in heap['historyEviction']['phases'])
readme = f'''# Full native and heap verification — 2026-10-30 continuation

## Source and outcome

Frozen source: `{status['source']}`; tree: `{manifest['source']['tree']}`.
The isolated persistent worktree ran C11 `{directory.name}` with a clean source
snapshot. Both gates exited 0 and recorded `sourceUnchanged: true`; the manifest
finished with `outcome: passed`. This archive is added only after both gates and
the complete-result checks finished. It changes no production or test source.

Commands, in this exact sequential order:

1. `node tests/browser/physical-history.mjs`
2. `node tests/browser/heap-gate.mjs`

All inherited `EDITOR_*PAGE` and `EDITOR_*FILTER` variables were removed, together
with Vite/browser-root/results overrides. The full native runner emitted one
complete final result containing exactly its {summary['nativeGroupCount']} declared
native groups. Every native case reported `PASS`. Both physical scenario groups
and the complete history matrix are also present. Partial progress lines were
not used to infer completion.

## Native results

- **{summary['nativeCases']} passing cases across {summary['nativeGroupCount']} native groups.**
- **2 physical scenario groups**: Enter/formatting history and toolbox/structural
  history. Their captured before/after DOM states are preserved in the final JSON.
- **{summary['historyMatrixCases']} history-matrix scenarios** are reported separately;
  they are not added to the native case count.

| Native group | Passing cases |
|---|---:|
{groups}

The complete case names and outcomes are in `c11/native.log.gz` and the parsed
copy `c11/native-result.json.gz`. The history matrix scenarios are in
`verification.json` and that same final native result.

## Heap results

The lifecycle page completed successfully before heap collection. The final
report contains **{heap['sentinels']} sentinels and {heap['retained']} retained resources**.
The live history proof authored {heap['historyEviction']['authoredActions']} actions
with {heap['historyEviction']['payloadBytes']}-byte payloads. It checked eviction
under a one-byte history budget, proved its intentionally retained control was
visible before release, released that control, and verified the remaining
Undo/Redo replay. All three original phase reports are retained below and in
`c11/heap.log.gz` / `c11/heap-result.json`.

| History phase | Payload-object counts by case index |
|---|---|
{phases}

These are measured object counts from Chrome heap snapshots. Heap-size numbers
are diagnostics; the pass/fail oracle is the required presence or absence of
the marked payload objects and the lifecycle sentinels.

## Environment and dependency identity

- Node `{preflight['node']}`.
- `{preflight['chromeVersion']}`; executable SHA256
  `{preflight['chromeSha256']}`.
- A physically independent `node_modules` copy from the main installation.
  Vite caches were excluded. All {len(preflight['carouselFiles'])} installed Carousel
  file hashes matched the source installation, and each copied file had a
  different inode. The installed lock resolves Carousel to
  `{preflight['carouselResolution']}`.
- The Carousel hashes and installed lock were rechecked after both gates.
- The current Playwright entry path was supplied in the environment; these two
  existing browser runners drive Chrome directly through CDP.

The first two default-sandbox initialization attempts stopped before creating
any C11 manifest or starting a gate. The direct retry reported `spawnSync git
EPERM`. They are preserved in `supervisor/environment-not-run.json` as
**environment-only not-run**, not product RED. The existing clean checkout and
dependencies were rechecked and the supervisor resumed through the tool's
approved `require_escalated` execution. No harness or tested-source workaround
was introduced.

## Evidence integrity

`verification.json` records the complete source identity, original commit object,
runner hashes, outcomes, counts, and SHA256 hashes of every archived payload.
The original C11 manifest and every raw log are preserved. Gzip payloads use
`mtime=0` and decompress byte-for-byte to the captured originals. The supervisor,
resume launcher, archive script, complete status/preflight metadata and setup
logs are included. Gate results are scoped to the frozen source above; this
archive does not assert outcomes for later code changes.
'''
(checkpoint / 'README.md').write_text(readme)
print(json.dumps({'checkpoint': str(checkpoint), 'payloads': len(payloads),
                  'verificationSha256': supervisor.sha256((checkpoint / 'verification.json').read_bytes()),
                  'nativeGroups': summary['nativeGroupCount'], 'nativeCases': summary['nativeCases'],
                  'heapSentinels': heap['sentinels'], 'heapRetained': heap['retained']}))
