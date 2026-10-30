"""Archive complete native/heap evidence with prior incomplete and diagnostic runs."""
import base64
from collections import Counter
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

BASE = Path('/workspace/scratch/61a2ad7355f4')
original = BASE / 'tools/verify-native-continuation-final3.py'
spec = importlib.util.spec_from_file_location('native_supervisor', original)
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

prior_index_path = BASE / 'tools/native-continuation-final3-prior-evidence.json'
prior_index = json.loads(prior_index_path.read_text())
for item in prior_index['records']:
    raw = Path(item['path']).read_bytes()
    assert len(raw) == item['bytes'] and supervisor.sha256(raw) == item['sha256']
previous_sources = {
    'incomplete': BASE / 'tools/native-continuation-final2',
    'timeout': BASE / 'tools/native-continuation-final2-retry',
    'diagnostic': BASE / 'tools/native-parity-budget-diagnostic',
}
previous_statuses = {name: json.loads((folder / 'status.json').read_text()) for name, folder in previous_sources.items()}
assert previous_statuses['timeout']['outcome'] == 'failed'
assert previous_statuses['timeout']['gates'] == {'native': 1, 'heap': 0}
assert previous_statuses['timeout']['sourceUnchanged']
assert previous_statuses['diagnostic']['outcome'] == 'passed' and previous_statuses['diagnostic']['diagnosticOnly']
diagnostic = json.loads((previous_sources['diagnostic'] / 'case-inventory.json').read_text())
assert diagnostic['diagnosticOnly'] and diagnostic['caseCount'] == 376
assert diagnostic['final'] == [{'elapsedMs': 130307, 'status': 'pass', 'completed': 376}]
assert all(case['status'] == 'PASS' for case in diagnostic['originalResults'])
original_source = 'c6e537e5d7433f0d902749719c8af265c6ae8591'
documentation_source = '1c933545c6f05701741031997945c64b1ab5ba9d'
production_paths = ['core', 'plugins', 'inline-plugins', 'inline-tools', 'shared', 'renderer',
                    'plugin-kit', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts',
                    'I18n.d.ts', 'package.json', 'package-lock.json', 'jsconfig.json', 'jsconfig.runtime.json']
assert not supervisor.capture(['git', 'diff', documentation_source + '..' + status['source'], '--', *production_paths])
assert not supervisor.capture(['git', 'diff', original_source + '..' + documentation_source, '--', '.', ':!plugins/embed/README.ru.md'])
regression_paths = ['tests/browser/regressions/code-copy-ownership-native.js',
                    'tests/browser/regressions/text-block-settings-native.js',
                    'tests/browser/regressions/columns-layout-native.js',
                    'tests/browser/regressions/harness.js', 'tests/browser/environment.mjs',
                    'tests/browser/native-input-driver.js', 'tests/browser/native-input-helpers.js']
for path in regression_paths:
    assert supervisor.capture(['git', 'show', original_source + ':' + path]) == (root / path).read_bytes()
before_parity = supervisor.capture(['git', 'show', original_source + ':tests/browser/native-plugin-parity.js']).decode()
for name in ['code-copy-ownership-native', 'text-block-settings-native', 'columns-layout-native']:
    line = "import './regressions/" + name + ".js'\n"
    assert before_parity.count(line) == 1
    before_parity = before_parity.replace(line, '')
assert before_parity == (root / 'tests/browser/native-plugin-parity.js').read_text()
original_runner = supervisor.capture(['git', 'show', original_source + ':tests/browser/physical-history.mjs']).decode()
current_runner = (root / 'tests/browser/physical-history.mjs').read_text()
def history_wait(text):
    start = text.index('async function waitForHistoryMatrix(client) {')
    return text[start:text.index('\nasync function click(', start)]
assert history_wait(original_runner) == history_wait(current_runner)
native_result = json.loads((directory / 'native-result.json').read_text())
partition_names = ['nativePluginParity', 'nativeCodeCopyOwnership', 'nativePluginSettings']
partition = {name: native_result[name] for name in partition_names}
actual_names = [case['name'] for cases in partition.values() for case in cases]
assert Counter(actual_names) == Counter(diagnostic['caseNames'])
assert len(actual_names) == 376
assert [len(partition[name]) for name in partition_names] == [333, 10, 33]
equivalence = {
    'actualFinalSource': status['source'], 'originalSource': original_source,
    'documentationSuccessor': documentation_source,
    'productionPathsComparedToDocumentationSuccessor': production_paths,
    'productionDiffBytes': 0,
    'c6ToDocumentationSuccessorOnlyChangedPath': 'plugins/embed/README.ru.md',
    'allChangedPathsFromOriginal': supervisor.capture(['git', 'diff', '--name-only', original_source + '..' + status['source']]).decode().splitlines(),
    'unchangedRegressionAndHarnessFiles': [{'path': path, 'sha256': supervisor.sha256((root / path).read_bytes())} for path in regression_paths],
    'remainingParityModuleOnlyRemovedThreeImports': True,
    'originalHistoryWaitFunctionUnchanged': True,
    'originalPageDeadlineMs': 120000,
    'partitionCaseCounts': {name: len(cases) for name, cases in partition.items()},
    'originalAndPartitionedCaseNameMultisetsEqual': True,
    'partitionedCaseNameMultiset': sorted(Counter(actual_names).items()),
    'diagnosticCaseInventorySha256': supervisor.sha256((previous_sources['diagnostic'] / 'case-inventory.json').read_bytes()),
}

checkpoint = root / 'scripts/parity/checkpoints/2026-10-30/continuation-native-61a-final3'
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

def save_directory(prefix, folder):
    for path in sorted(folder.iterdir()):
        assert path.is_file(), f'Unexpected directory: {path}'
        if path.name == 'process-recovery.txt':
            continue
        compressed = path.suffix == '.log' or path.name in ['native-result.json', 'case-inventory.json']
        save(prefix + '/' + path.name + ('.gz' if compressed else ''), path.read_bytes(), str(path), compressed)

save_directory('c11', directory)
save_directory('supervisor', external)
for name, folder in previous_sources.items():
    save_directory('prior/' + name + '/supervisor', folder)
    save_directory('prior/' + name + '/c11', Path(previous_statuses[name]['directory']))
for name in ['verify-native-continuation-final2.py', 'resume-native-continuation-final2.py',
             'native-final2-retry-launch.json', 'native-final2-retry-launch.log',
             'diagnose-native-parity-budget.py', 'native-parity-budget-launch.log',
             'verify-native-continuation-final3.py', 'archive-native-continuation-final3.py',
             'native-final3-launch.json', 'native-final3-launch.log',
             'native-continuation-final3-prior-evidence.json']:
    path = BASE / 'tools' / name
    compressed = path.suffix == '.log'
    save('supervisor/' + name + ('.gz' if compressed else ''), path.read_bytes(), str(path), compressed)
supervisor.write_json(checkpoint / 'source-and-partition-equivalence.json', equivalence)
raw_commit = supervisor.capture(['git', 'cat-file', 'commit', status['source']])
assert hashlib.sha1(b'commit ' + str(len(raw_commit)).encode() + b'\0' + raw_commit).hexdigest() == status['source']
runner_paths = ['scripts/verification-results.mjs', 'tests/browser/physical-history.mjs',
                'tests/browser/heap-gate.mjs', 'tests/browser/environment.mjs',
                'tests/browser/history.js', 'tests/browser/lifecycle.js',
                'tests/browser/native-plugin-parity.js',
                'tests/browser/native-code-copy-ownership.html', 'tests/browser/native-plugin-settings.html']
verification = {
    'schemaVersion': 1, 'source': manifest['source'], 'frozenSha': status['source'],
    'rawCommitBase64': base64.b64encode(raw_commit).decode(),
    'run': directory.name, 'outcome': 'passed', 'sourceUnchanged': True,
    'commands': {name: gate['command'] for name, gate in manifest['gates'].items()},
    'summary': summary,
    'priorAttempts': [
        {'run': Path(previous_statuses['incomplete']['directory']).name, 'source': original_source,
         'classification': 'interrupted-incomplete', 'productFailureInferred': False},
        {'run': Path(previous_statuses['timeout']['directory']).name, 'source': original_source,
         'classification': 'failed-acceptance-gate', 'nativeExitCode': 1, 'heapExitCode': 0,
         'observedFailure': 'Original native plugin parity page exceeded its unchanged120000ms deadline'},
        {'run': Path(previous_statuses['diagnostic']['directory']).name, 'source': original_source,
         'classification': 'nonacceptance-diagnostic', 'caseCount': 376, 'elapsedMs': 130307,
         'assertionsUnchanged': True, 'diagnosticObservationDeadlineMs': 240000},
    ],
    'priorEvidencePayloadsVerifiedUnchanged': len(prior_index['records']),
    'sourceAndPartitionEquivalence': {'path': 'source-and-partition-equivalence.json',
                                     'sha256': supervisor.sha256((checkpoint / 'source-and-partition-equivalence.json').read_bytes())},
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
readme = f'''# Final integrated native and heap verification — 2026-10-30

## Actual source and outcome

Frozen source: `{status['source']}`; tree: `{manifest['source']['tree']}`.
The isolated persistent worktree ran C11 `{directory.name}` with a clean source
snapshot. Both gates exited 0 and recorded `sourceUnchanged: true`; the manifest
finished with `outcome: passed`. The complete final JSON was validated before
writing this archive. This evidence commit changes no production or test source.

Commands, in this exact sequential order:

1. `node tests/browser/physical-history.mjs`
2. `node tests/browser/heap-gate.mjs`

All inherited `EDITOR_*PAGE` and `EDITOR_*FILTER` variables were removed, together
with Vite/browser-root/results overrides. The run did not use diagnostic harness
interception or an extended page deadline. The existing 120-second page deadline
and all per-case timeouts and assertions remain unchanged.

## Why native test registration changed

The earlier source `{original_source}` accumulated 376 cases on one native plugin
parity page. The full acceptance attempt `run-yiPE1x` reached that page and failed
at its original 120-second deadline. Heap then passed independently: 23 sentinels,
zero retained resources and all three history phases. That failed native result
is preserved, not relabeled as a pass.

A separate, explicitly nonacceptance diagnostic `run-8G2oM5` served an externally
instrumented harness with progress reporting and observed the same assertions
beyond the original deadline. At 120,035 ms, 313 cases had passed and the next
case was still advancing. All 376 original cases finished successfully at
130,307 ms. Code Copy's ten cases consumed 12,286 ms, the 21 text settings cases
17,399.4 ms and the twelve Columns layout cases 13,542.9 ms. This measured a page
budget problem. The diagnostic's extended observation deadline is not acceptance
evidence and was not committed to the native runner.

Registration now separates those existing cases into three normal native pages:

| Final native group | Cases |
|---|---:|
| `nativePluginParity` | 333 |
| `nativeCodeCopyOwnership` | 10 |
| `nativePluginSettings` | 33 |

The full final run above passed all three under the original deadline. Their
combined case-name multiset equals all 376 original diagnostic cases exactly,
including multiplicities. The three regression modules, input driver/helpers,
shared harness and environment module are byte-identical to the earlier source.
The remaining parity module changed only by removing the three relocated imports.
The existing system-clipboard Copy integration case remains in the parity page.

## Native results

- **{summary['nativeCases']} passing cases across {summary['nativeGroupCount']} native groups.**
- **2 physical scenario groups**: Enter/formatting history and toolbox/structural
  history, with their before/after DOM states retained.
- **{summary['historyMatrixCases']} history-matrix scenarios**, reported separately
  rather than added to the native case count.

The final JSON contains exactly the native groups declared by the frozen runner.
Every native case reports `PASS`. Partial progress lines were not used to infer
completion.

| Native group | Passing cases |
|---|---:|
{groups}

Complete case names and outcomes are in `c11/native.log.gz` and the parsed
`c11/native-result.json.gz`. The history matrix is also in `verification.json`.

## Heap results

The lifecycle page completed before heap collection. The final report contains
**{heap['sentinels']} sentinels and {heap['retained']} retained resources**.
The history proof authored {heap['historyEviction']['authoredActions']} actions with
{heap['historyEviction']['payloadBytes']}-byte payloads. It checked eviction under
a one-byte history budget, proved the intentionally retained control remained
visible, released that control and verified remaining Undo/Redo replay.

| History phase | Payload-object counts by case index |
|---|---|
{phases}

These are object counts from Chrome heap snapshots. Heap sizes are diagnostics;
the oracle is the required presence or absence of marked payloads and sentinels.

## Prior attempts remain distinct

- `run-2n1RIx`: interrupted/incomplete. Its supervisor and runner no longer existed,
  and native had no exit code or complete final result. Heap had not started.
  No product failure or cancellation cause was inferred. Only its positively
  identified orphan Vite and Chrome resources were stopped before the next run.
- `run-yiPE1x`: a completed failed acceptance run; native exited 1 on the page
  deadline, heap exited 0. The source stayed clean and unchanged.
- `run-8G2oM5`: diagnostic-only, with an external extended observation window;
  it provides timing and case inventory, not an acceptance pass.
- `{directory.name}`: the complete final acceptance run on the actual new source,
  with the original runner deadline and unchanged case assertions.

The original manifests, raw logs, supervision files and diagnostic scripts are
retained under `prior/`. All {len(prior_index['records'])} previously indexed evidence
payloads were verified byte-for-byte unchanged before this archive was created.
The broad host-process listing remains outside the repository; matched test
process facts are retained in the interruption metadata.

## Source, dependencies and evidence integrity

`source-and-partition-equivalence.json` records the exact production paths compared
with `{documentation_source}`: their diff is empty. From the earlier c6 source to
that documentation successor, only two Russian Embed README prose occurrences
changed. The final source intentionally differs in native page registration and
also contains later documentation/evidence and standalone comparison-runner guard
changes. It is recorded by its actual SHA, never relabeled as c6 or 1c.

- Node `{preflight['node']}` and `{preflight['chromeVersion']}`.
- Chrome executable SHA256: `{preflight['chromeSha256']}`.
- Physically independent dependencies copied from the main installation, excluding
  Vite caches. All {len(preflight['carouselFiles'])} Carousel files matched the source
  installation and had distinct inodes. Carousel resolves to
  `{preflight['carouselResolution']}`.
- Carousel file hashes and the installed lock were rechecked after both gates.

`verification.json` contains the complete source identity, original commit object,
runner hashes, outcomes, counts and SHA256 hashes of every archived payload.
Gzip payloads use `mtime=0` and decompress byte-for-byte to the originals.
This proof covers Chrome/Linux and these registered scenarios. It does not claim
all-platform/IME parity or close unrelated preservation obligations.
'''
(checkpoint / 'README.md').write_text(readme)
print(json.dumps({'checkpoint': str(checkpoint), 'payloads': len(payloads),
                  'verificationSha256': supervisor.sha256((checkpoint / 'verification.json').read_bytes()),
                  'nativeGroups': summary['nativeGroupCount'], 'nativeCases': summary['nativeCases'],
                  'heapSentinels': heap['sentinels'], 'heapRetained': heap['retained'],
                  'partitionCaseCounts': equivalence['partitionCaseCounts']}))
