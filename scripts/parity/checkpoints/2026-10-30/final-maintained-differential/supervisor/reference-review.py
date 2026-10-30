#!/usr/bin/env python3
"""Describe exact raw differences; never rewrite a result or grant acceptance."""
from collections import Counter, defaultdict
import importlib.util
import json
from pathlib import Path

plan = Path(__file__).parent
spec = importlib.util.spec_from_file_location('reporting', plan / 'verify-differential.py')
reporting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporting)
workspace = reporting.WORKSPACE
full_root = workspace / 'worktrees/final-differential-verification'
full = full_root / 'test-results/run-AYPL00'
later_root = workspace / 'worktrees/final-differential-guards'
later = later_root / 'test-results/run-a15oUo'


def changed_fields(current, archived, path=''):
    if type(current) is not type(archived):
        return [{'path': path, 'current': current, 'archived': archived}]
    if isinstance(current, dict) and current.keys() == archived.keys():
        return [row for key in sorted(current) for row in changed_fields(current[key], archived[key], path + '/' + key)]
    if isinstance(current, list) and len(current) == len(archived):
        return [row for index, (a, b) in enumerate(zip(current, archived)) for row in changed_fields(a, b, path + '/' + str(index))]
    return [] if current == archived else [{'path': path, 'current': current, 'archived': archived}]


def compare(current, archived):
    a = Counter(map(reporting.canonical, reporting.failure_signatures(current, True)))
    b = Counter(map(reporting.canonical, reporting.failure_signatures(archived, True)))
    new = [json.loads(value) for value in (a - b).elements()]
    old = [json.loads(value) for value in (b - a).elements()]
    key = lambda row: reporting.canonical({k: v for k, v in row.items() if k not in ['actual', 'expected']})
    old_by_key = defaultdict(list)
    for row in old:
        old_by_key[key(row)].append(row)
    details = []
    for row in new:
        matches = old_by_key[key(row)]
        if len(matches) == 1:
            previous = matches.pop()
            details.append({'key': json.loads(key(row)), 'changedFields': changed_fields(row, previous)})
        else:
            details.append({'unpairedCurrent': row, 'possibleArchivedMatches': matches})
    return {'observedFailureCount': sum(a.values()), 'archivedFailureCount': sum(b.values()),
            'exactMatchedFailureCount': sum((a & b).values()), 'exactSignatureEquality': a == b,
            'newOrChanged': new, 'missingOrChanged': old, 'fieldDifferences': details,
            'policy': 'Descriptions retain exact source SHAs and raw payloads. They are not classifiers and do not change exit codes, statuses or the acceptance ledger.'}


def read(path):
    report, raw_hash = reporting.load_report(path)
    return report, {'path': str(path), 'rawSha256': raw_hash}


def run():
    output = plan / 'reviews'
    output.mkdir(exist_ok=True)
    current, current_meta = read(full / 'common-parity.log')
    archived, old_meta = read(full_root / reporting.CHECKPOINTS / 'continuation-61a-integration/runs/run-fDStBT/common-parity.log.gz')
    common = {'current': current_meta, 'archived': old_meta, **compare(current, archived)}
    assert len(common['fieldDifferences']) == 10
    assert all([field['path'] for field in row['changedFields']] == ['/actual/0/id', '/expected/0/id'] for row in common['fieldDifferences'])
    assert all(row['actual'][0]['id'] == row['expected'][0]['id'] for row in common['newOrChanged'] + common['missingOrChanged'])
    common['boundedFinding'] = 'Exactly ten unmatched observations differ only in the generated top-level block id, consistently present in actual and expected. Existing maintained classifiers returned exit 0; exact archive signature equality remains false.'
    reporting.save(output / 'common-generated-identities.json', common)

    text_path = later_root / reporting.CHECKPOINTS / 'text-block-settings/final/differential.json.gz'
    archived, old_meta = read(text_path)
    refs = {source['label']: source['sha'] for source in archived['sources'] if source['label'] != 'candidate'}
    assert refs == {label: reporting.REFERENCE_SHAS[label] for label in ['v1', 'spec-baseline']}
    assert reporting.digest(text_path.read_bytes()) == reporting.source_digest(str(later_root), '19cea0f8b8715c171b839cf6c3027ba66ea3f556', str(text_path.relative_to(later_root)))
    text_reviews = []
    for directory in [full, later]:
        observed, metadata = read(directory / 'text-block-settings.log')
        text_reviews.append({'current': metadata, 'headBefore': observed['headBefore'],
                             'fixtureBytesMatchArchived': observed['fixtureSha256'] == archived['fixtureSha256'],
                             **compare(observed, archived)})
    reporting.save(output / 'incoming-text-witness.json', {'archived': old_meta,
                   'scope': 'This witness arrived only in the later merge. Original run analysis saying no archived witness is retained unchanged.', 'comparisons': text_reviews})

    presentation, metadata = read(full / 'presentation-values.log')
    failed = reporting.failure_signatures(presentation, True)
    assert len(failed) == 22 and all(row['source'] == 'v1' and row['property'] == 'neighborDomIdentity'
        and row['phase'] in ['undo', 'redo'] and row['actual'] is False and row['expected'] is True for row in failed)
    reporting.save(output / 'presentation-observations.json', {'current': metadata,
                   'boundedFinding': 'All 22 raw v1 failures are neighborDomIdentity=false, expected=true, in Undo/Redo. The maintained in-run classifier recognizes this exact tuple. No archived witness was available; the original no-witness classification remains unchanged.',
                   'rawFailures': failed})
    print(output)


if __name__ == '__main__':
    run()
