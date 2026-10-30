#!/usr/bin/env python3
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

PLAN = Path(__file__).parent
ROOT = Path('/workspace/scratch/61a2ad7355f4/worktrees/native-code-copy-page')
SOURCE = '6c2a48d1ea4ebd0014bd2fb4573738db2c3593e6'
ORIGINAL = Path('/workspace/scratch/61a2ad7355f4/worktrees/continuation-native-final2/test-results/run-yiPE1x')
DESTINATION = ROOT / 'scripts/parity/checkpoints/2026-10-30/native-page-budget-61a'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def main():
    status = json.loads((PLAN / 'status.json').read_text())
    assert status['allScopedChecksPassed'] and status['sourceUnchanged'] and status['caseNameMultisetPreserved']
    assert status['source'] == SOURCE and status['observedCaseCount'] == 376
    directory = Path(status['directory'])
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert manifest['finishedAt'] and manifest['outcome'] == 'passed' and manifest['sourceUnchanged']
    assert len(manifest['gates']) == 3 and all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] for gate in manifest['gates'].values())
    preflight = json.loads((directory / 'preflight.json').read_text())
    diagnostic = json.loads((directory / 'diagnostic-case-inventory.json').read_text())
    observed = [name for gate in status['gates'] for name in gate['caseNames']]
    assert Counter(observed) == Counter(diagnostic['caseNames'])
    original_manifest = json.loads((ORIGINAL / 'manifest.json').read_text())
    original_log = (ORIGINAL / 'native.log').read_bytes()
    assert original_manifest['gates']['native']['outcome'] == 'failed' and original_manifest['sourceUnchanged']
    assert b'Timed out waiting for history matrix' in original_log
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == SOURCE
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip()
    assert not subprocess.check_output(['git', 'diff', 'f75df3ae', SOURCE, '--', 'core', 'plugins', 'inline-plugins', 'inline-tools', 'shared', 'renderer', 'package.json', 'package-lock.json'], cwd=ROOT).strip()
    assert not DESTINATION.exists()
    DESTINATION.mkdir(parents=True)
    origins = {}

    def copy(source, relative, compress=False):
        target = DESTINATION / (str(relative) + '.gz' if compress else str(relative))
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = source.read_bytes()
        target.write_bytes(gzip.compress(raw, mtime=0) if compress else raw)
        origins[target.relative_to(DESTINATION).as_posix()] = str(source)

    for source in sorted(directory.iterdir()):
        if source.is_file():
            copy(source, Path('runs') / directory.name / source.name,
                 source.suffix == '.log' or source.name == 'diagnostic-case-inventory.json')
    copy(ORIGINAL / 'manifest.json', 'original-failure/manifest.json')
    copy(ORIGINAL / 'native.log', 'original-failure/native.log', True)
    for name in ['verify-scoped-pages.py', 'archive-scoped-pages.py', 'launcher.json', 'supervisor.log', 'status.json']:
        copy(PLAN / name, Path('supervisor') / name, name.endswith('.log'))

    actual_names = sorted(observed)
    expected_names = sorted(diagnostic['caseNames'])
    names_digest = digest(json.dumps(expected_names, separators=(',', ':'), ensure_ascii=False).encode())
    verification = {
        'schemaVersion': 1, 'scope': 'Three scoped native pages through the ordinary physical-history runner; all comparisons use the original assertions and the unchanged page deadline.',
        'source': SOURCE, 'registrationBase': 'f75df3aecfce3cb49ed318c5bafb1b1e6c61967f',
        'run': directory.name, 'c11Outcome': manifest['outcome'], 'sourceUnchanged': True,
        'pageDeadlineMs': preflight['pageDeadlineMs'],
        'unchangedPageDeadlineFunctionSha256': preflight['unchangedPageDeadlineFunctionSha256'],
        'physicalRunnerSha256': preflight['physicalRunnerSha256'],
        'unchangedModuleHashes': preflight['unchangedModuleHashes'],
        'stylesheetLinksPerPage': preflight['stylesheetLinksPerPage'],
        'nativeArrayGroupCount': 43, 'topLevelSummaryKeyCount': 46,
        'topLevelSummaryKeys': preflight['topLevelSummaryKeys'],
        'originalFailure': {'run': 'run-yiPE1x', 'source': original_manifest['source']['head'],
                            'nativeOutcome': 'failed', 'nativeExitCode': original_manifest['gates']['native']['exitCode'],
                            'sourceUnchanged': True, 'reason': 'Original unsplit native-plugin-parity page exceeded the unchanged 120000ms deadline.'},
        'diagnostic': {'run': diagnostic['run'], 'source': diagnostic['source'], 'diagnosticOnly': True,
                       'notAcceptance': True, 'caseCount': diagnostic['caseCount'], 'final': diagnostic['final'],
                       'originalDeadlineObservation': diagnostic['originalDeadlineObservation'],
                       'groups': diagnostic['groups'], 'caseInventorySha256': preflight['diagnosticInventorySha256']},
        'gates': status['gates'], 'caseNameMultisetPreserved': True, 'originalCaseCount': 376,
        'observedCaseCount': 376, 'addedCaseNames': [], 'missingCaseNames': [],
        'originalSortedCaseNames': expected_names, 'observedSortedCaseNames': actual_names,
        'caseNameMultisetSha256': names_digest,
        'elapsedNote': 'Gate elapsedMs is C11 command wall time, including server/browser startup and cleanup. Diagnostic per-case/page timings are separately labelled and are not acceptance results.',
    }
    save(DESTINATION / 'verification.json', verification)
    rows = '\n'.join(f"| `{gate['page']}` | {gate['caseCount']} | {gate['elapsedMs'] / 1000:.3f} s | PASS |" for gate in status['gates'])
    readme = f'''# Native page budget recovery

## Problem and diagnosis

The original full native run `run-yiPE1x` on `c6e537e5d7433f0d902749719c8af265c6ae8591` failed at the existing **120-second** deadline for `native-plugin-parity.html`. Its failure, source identity and original native log are preserved under `original-failure/`.

An external **diagnostic-only** observation, `run-8G2oM5`, retained the original assertions and observed beyond that deadline. At 120.035 seconds, 313 cases had passed and the next case was progressing normally. All 376 cases eventually passed at **130.307 seconds**. This extended observation is not acceptance evidence under the original deadline.

Diagnostic case timings were Code Copy ownership **12.286 s** for 10 cases, text block settings **17.399 s** for 21 cases and Columns layout **13.543 s** for 12 cases. Moving only Copy would have left about 118 seconds of page work. Moving both independent groups leaves about 87 seconds on the original page.

## Registration change

Commit `{SOURCE}` adds `native-code-copy-ownership.html` and `native-plugin-settings.html`, removes their three existing module imports from the original page and registers both pages in the ordinary physical runner and its final JSON. All three regression modules, fixture assertions, real reset waits, harness code and the page deadline remain byte-identical. Each new HTML preserves all **24** original stylesheet links.

The default final JSON now has **43 native array groups and 46 top-level keys**, including the physical Enter/toolbox/history results. The exact group names are recorded in `verification.json`. Page selection uses the existing `EDITOR_NATIVE_PAGE` path, and case selection retains the existing `EDITOR_NATIVE_FILTER` behavior.

## Scoped acceptance on `{SOURCE[:8]}`

The ordinary `tests/browser/physical-history.mjs` runner passed all three pages with an empty case filter in C11 `{directory.name}`. No diagnostic runner or altered page deadline was used.

| Page | Passing cases | C11 command elapsed | Result |
|---|---:|---:|---|
{rows}

The union is **376 cases: 333 + 10 + 33**. The exact multiset of case names equals the complete original diagnostic inventory, including multiplicities. Added cases: **0**; missing cases: **0**. This proves preserved registration without treating overlapping execution as additional coverage.

All three gates and the C11 aggregate passed with `sourceUnchanged: true`. Command elapsed values include Vite/Chrome startup and cleanup; they are distinct from the diagnostic page/case timings. `verification.json` records the unchanged deadline-function digest, module hashes, exact original and observed case-name lists, full summary-group inventory and all gate outcomes.

The detached supervisor ran persistently so an agent interruption would not stop the checks. Its source, launch metadata, raw logs and C11 manifest are archived. `hash-index.json` records stored and uncompressed hashes for every artifact except the index itself. This checkpoint contains scoped acceptance and coverage-preservation evidence; the separate full native run is owned by the integration gate.
'''
    (DESTINATION / 'README.md').write_text(readme)
    artifacts = []
    for path in sorted(DESTINATION.rglob('*')):
        if path.is_file():
            stored = path.read_bytes()
            raw = gzip.decompress(stored) if path.suffix == '.gz' else stored
            relative = path.relative_to(DESTINATION).as_posix()
            artifacts.append({'path': relative, 'storedBytes': len(stored), 'storedSha256': digest(stored),
                              'uncompressedBytes': len(raw), 'uncompressedSha256': digest(raw),
                              'encoding': 'gzip' if path.suffix == '.gz' else 'identity', 'originalPath': origins.get(relative)})
    save(DESTINATION / 'hash-index.json', {'schemaVersion': 1, 'testedSource': SOURCE, 'artifacts': artifacts})
    print(json.dumps({'directory': str(DESTINATION), 'artifacts': len(artifacts),
                      'indexSha256': digest((DESTINATION / 'hash-index.json').read_bytes()),
                      'cases': 376, 'run': directory.name}, indent=2))


if __name__ == '__main__':
    main()
