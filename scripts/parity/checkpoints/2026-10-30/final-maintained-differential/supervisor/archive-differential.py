#!/usr/bin/env python3
"""Archive completed immutable runs and their exact source/case inventory."""
from collections import Counter
import gzip
import importlib.util
import json
from pathlib import Path
import subprocess

plan = Path(__file__).parent
spec = importlib.util.spec_from_file_location('reporting', plan / 'verify-differential.py')
reporting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporting)
full_root = reporting.WORKSPACE / 'worktrees/final-differential-verification'
later_root = reporting.WORKSPACE / 'worktrees/final-differential-guards'
full = full_root / 'test-results/run-AYPL00'
later = later_root / 'test-results/run-a15oUo'
prepared = full_root / 'test-results/run-gXXU3x'
destination = later_root / 'scripts/parity/checkpoints/2026-10-30/final-maintained-differential'


def collect(directory):
    summary = json.loads((directory / 'supervisor-summary.json').read_text())
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert manifest['finishedAt'] and manifest['sourceUnchanged']
    assert all(gate['finishedAt'] for gate in manifest['gates'].values())
    comparisons = []
    for gate in summary['gates']:
        if gate['name'] == 'gallery-classifier-controls':
            assert gate['c11Outcome'] == 'passed' and gate['validatorResult']['candidateExceptions'] == 0
            continue
        checked = gate['comparison']
        assert checked['candidateZeroFailuresAndComplete'] and checked['sourceIdentityVerified']
        assert gate['sourceUnchanged'] and not checked['serverErrors'] and not checked['verificationErrors']
        filename = 'preview-timeout-raw.json' if gate['name'] == 'embed-preview' else gate['name'] + '.log'
        report, raw_hash = reporting.load_report(directory / filename)
        failures = Counter((entry['source'], entry['case']) for entry in reporting.failure_signatures(report))
        grouped = reporting.cases_by_source(report)
        sources = []
        for source in report['sources']:
            cases = grouped[source['label']]
            sources.append({'label': source['label'], 'sha': source['sha'], 'caseCount': len(cases),
                            'caseIds': [reporting.case_id(case) for case in cases],
                            'rawFailureCount': sum(failures[(source['label'], reporting.case_id(case))] for case in cases),
                            'incompleteCases': checked['sources'][source['label']]['incompleteCases'],
                            'unsupportedCapabilities': checked['sources'][source['label']]['unsupportedCapabilities'],
                            'runtimeErrors': checked['sources'][source['label']]['runtimeErrors']})
        comparisons.append({'gate': gate['name'], 'rawExitCode': gate['rawExitCode'], 'c11Outcome': gate['c11Outcome'],
                            'elapsedMs': gate['elapsedMs'], 'candidateVerified': True, 'rawReportSha256': raw_hash,
                            'sourceIdentityVerified': True, 'sourceUnchanged': True, 'serverErrors': [],
                            'referenceSignatureStatus': checked['referenceFailureSignatures']['status'], 'sources': sources})
    return {'run': directory.name, 'candidateSha': summary['candidateSha'], 'rawC11Outcome': manifest['outcome'],
            'rawGateOutcomes': dict(Counter(gate['outcome'] for gate in manifest['gates'].values())),
            'sourceUnchanged': True, 'comparisonCount': len(comparisons),
            'candidateScenarioCount': sum(next(source['caseCount'] for source in row['sources'] if source['label'] == 'candidate') for row in comparisons),
            'comparisons': comparisons}, summary


def run():
    first, summary = collect(full)
    second, later_summary = collect(later)
    assert first['comparisonCount'] == 14 and first['candidateScenarioCount'] == 235
    assert second['comparisonCount'] == 4 and second['candidateScenarioCount'] == 102
    first_cases = {(row['gate'], case) for row in first['comparisons'] for source in row['sources'] if source['label'] == 'candidate' for case in source['caseIds']}
    second_cases = {(row['gate'], case) for row in second['comparisons'] for source in row['sources'] if source['label'] == 'candidate' for case in source['caseIds']}
    assert second_cases <= first_cases
    old = json.loads((prepared / 'manifest.json').read_text())
    assert old['outcome'] == 'not-run' and old['sourceUnchanged'] and all(not gate['startedAt'] for gate in old['gates'].values())
    assert not reporting.git(later_root, 'status', '--porcelain').strip(), 'Archive destination worktree must start clean'
    assert reporting.git(later_root, 'rev-parse', 'HEAD').decode().strip() == second['candidateSha']
    assert not destination.exists(), 'Do not overwrite an existing evidence archive'
    subprocess.run(['python', str(plan / 'reference-review.py')], check=True)
    destination.mkdir(parents=True)
    original_paths = {}
    for directory in [prepared, full, later]:
        for source in sorted(directory.iterdir()):
            if not source.is_file():
                continue
            raw = source.read_bytes()
            compress = source.suffix == '.log' or source.name.endswith('.analysis.json') or source.name in ['supervisor-summary.json', 'gallery-parity.json', 'preview-timeout-raw.json']
            relative = Path('runs') / directory.name / (source.name + '.gz' if compress else source.name)
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(gzip.compress(raw, mtime=0) if compress else raw)
            original_paths[relative.as_posix()] = str(source)
    for name in ['INVENTORY.md', 'PREPARATION.md', 'REFERENCE-WITNESSES.json', 'verify-differential.py',
                 'verify-differential-followup.py', 'reference-review.py', 'archive-differential.py']:
        target = destination / 'supervisor' / name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes((plan / name).read_bytes())
        original_paths[target.relative_to(destination).as_posix()] = str(plan / name)
    for source in sorted((plan / 'reviews').iterdir()):
        target = destination / 'reference-review' / source.name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(source.read_bytes())
        original_paths[target.relative_to(destination).as_posix()] = str(source)
    coverage = {'schemaVersion': 1, 'fullCorpus': first, 'updatedRunnerFollowup': second,
                'candidateScenariosInFullCorpus': 235, 'repeatedCandidateScenariosInFollowup': 102,
                'additionalUniqueScenariosFromFollowup': 0,
                'countingNote': 'Scenario identifiers are exact per source and runner. Capabilities overlap across runners. Historical incomplete or unsupported cases do not become passes.',
                'preparedWithoutExecution': {'run': prepared.name, 'source': old['source']['head'], 'outcome': 'not-run', 'gates': 15}}
    reporting.save(destination / 'coverage.json', coverage)
    table = []
    for row in first['comparisons']:
        current = next(source for source in row['sources'] if source['label'] == 'candidate')
        historical = sum(source['rawFailureCount'] for source in row['sources'] if source['label'] != 'candidate')
        table.append(f"| {row['gate']} | {current['caseCount']} | 0 | {row['rawExitCode']} / {row['c11Outcome']} | {historical} |")
    validator = next(gate['validatorResult'] for gate in summary['gates'] if 'validatorResult' in gate)
    text_review = json.loads((plan / 'reviews/incoming-text-witness.json').read_text())
    text_counts = ', '.join(f"{item['headBefore'][:8]}: {item['exactMatchedFailureCount']}/{item['observedFailureCount']} exact" for item in text_review['comparisons'])
    readme = f'''# Final maintained differential verification

## Result and scope

All **235 candidate scenarios across 14 maintained comparison entrypoints** completed with zero raw candidate failed observations on `{first['candidateSha']}`. Loaded source bytes, source revision, fixture and runner hashes were verified; all comparison servers reported zero errors and every C11 gate retained `sourceUnchanged: true`.

The full C11 result remains **failed: 5 passed gates and 10 failed raw differential gates**. Those ten commands return 1 for historical reference failures or incomplete reference behavior. No exit code, failed observation, unsupported API or incomplete phase was converted to a pass. Candidate verification is the conjunction of zero candidate failures, completion, no unsupported candidate capability, no candidate runtime errors, source verification and zero server errors.

The incoming merge changed four maintained runner completeness checks. A separate run on `{second['candidateSha']}` repeated **102 scenarios** for text block settings, Columns, Raw and tool actions. All 102 candidate scenarios completed with zero failures under the stricter checks. All four raw commands exited 1, so that separate C11 result is also **failed**. The 102 cases are repetitions within the original 235, not additional coverage. The followup preflight proves an empty diff for production code, fixtures, tests and dependencies between these two SHAs.

The exact source revisions and every source/case ID are listed in [coverage.json](coverage.json). Historical incomplete and unsupported cases are retained in that file and the original raw reports.

## Full corpus on `{first['candidateSha'][:8]}`

| Comparison | Candidate cases | Candidate failed observations | Raw exit / C11 outcome | Historical failed observations |
|---|---:|---:|---|---:|
{chr(10).join(table)}

The additional offline Gallery validator passed: **{validator['historicalObservationsAccepted']}** positive historical observations, **{validator['negativeObservationControls']}** negative observation controls, **{validator['pairedHistoricalPageErrorsAccepted']}** paired historical page errors and **{validator['negativePageErrorControls']}** negative page-error controls. Candidate exceptions: **0**.

The strict Embed entrypoint passed only after checking all six source/scenario pairs, the exact four historical failed observations and zero candidate failures. Its raw child exit **1**, raw JSON and stderr are saved separately; the wrapper's successful exit does not erase the child result.

## Reference identities and exact comparisons

The immutable references are v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` and specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`. Code also uses pre-fix `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`.

Exact failed-observation signatures include source SHA, case, phase, property/name, status, actual and expected payload, including duplicate counts. Existing archived signatures matched exactly for Gallery ordering, public focus, formatting ownership, link ownership, Gallery viewer, Table settings, Columns and Raw, and tool actions. These are observations of reproduction, not new acceptance exceptions.

Common roundtrip reproduced 1339 historical failed observations; 1329 signatures matched exactly. The other ten differed only at `/actual/0/id` and `/expected/0/id`: four v1 Person default observations and six specification-baseline Table default observations. The generated IDs agree between actual and expected within each report. Existing maintained classifiers passed, while the exact signature mismatch and every raw ID remain preserved. The read-only field comparison is in `reference-review/common-generated-identities.json`.

The Code archive records pre-fix SHA `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13`; its Git object is unavailable here. All 91 loaded-module hashes recorded for that source match pinned `b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c`. This establishes only the recorded loaded-module equivalence. No full-tree equality is claimed, and both SHAs remain distinct in raw signatures.

Presentation has no prior archived raw witness in the initial inventory. Its 22 raw v1 failures all concern `neighborDomIdentity=false`, expected `true`, after Undo or Redo; the existing maintained runner classifies that exact tuple. The original no-witness classification remains visible.

The Text settings witness arrived only with the incoming merge. A separate read-only addendum compares that pinned archive with both fresh runs: **{text_counts}**. The original no-witness classifications are unchanged. Exact mismatched payloads and field paths are retained in `reference-review/incoming-text-witness.json`; this adds no classifier or ledger acceptance.

Reference page errors, incomplete phases and unsupported APIs are recorded separately from failed-observation signature matches. A reference signature match does not assert that all historical scenarios completed.

## Reproduction and provenance

`runs/run-AYPL00/manifest.json` records the full 14-comparison corpus and offline validator on `{first['candidateSha']}`. `runs/run-a15oUo/manifest.json` records the four updated runners on `{second['candidateSha']}`. Commands, elapsed times, explicit non-secret environment selection, source digests, dependency file hashes and exact raw reports are archived. Runs used Chrome 156 and physical lockfile dependencies, including Carousel commit `f7f6485886a1d77f9213d9079eb70000efeff499`.

`runs/run-gXXU3x` is a closed **not-run** plan on `c6e537e5d7433f0d902749719c8af265c6ae8591`: all 15 gates stayed unstarted, source unchanged. It was superseded after a Russian documentation correction and supplies no comparison evidence. Preparation details and the executable supervisor snapshots are under `supervisor/`.

Raw reports and C11 logs are gzip-compressed with deterministic headers. `hash-index.json` records stored and uncompressed byte counts and SHA-256 hashes for every archived file other than the index itself. This evidence commit changes only the checkpoint directory; no production, fixture, classifier or ledger code is changed.
'''
    (destination / 'README.md').write_text(readme)
    artifacts = []
    for path in sorted(destination.rglob('*')):
        if not path.is_file():
            continue
        stored = path.read_bytes()
        raw = gzip.decompress(stored) if path.suffix == '.gz' else stored
        relative = path.relative_to(destination).as_posix()
        artifacts.append({'path': relative, 'storedBytes': len(stored), 'storedSha256': reporting.digest(stored),
                          'uncompressedBytes': len(raw), 'uncompressedSha256': reporting.digest(raw),
                          'encoding': 'gzip' if path.suffix == '.gz' else 'identity', 'originalPath': original_paths.get(relative)})
    index = {'schemaVersion': 1, 'base': second['candidateSha'], 'testedSources': [first['candidateSha'], second['candidateSha']],
             'preparedUnrunSource': old['source']['head'], 'artifacts': artifacts}
    reporting.save(destination / 'hash-index.json', index)
    print(json.dumps({'directory': str(destination), 'artifacts': len(artifacts), 'indexSha256': reporting.digest((destination / 'hash-index.json').read_bytes()),
                      'candidateScenarios': 235, 'followupRepeatedScenarios': 102}, indent=2))


if __name__ == '__main__':
    run()
