#!/usr/bin/env python3
"""Read-only audit of the published scoped acceptance; no browser execution."""
import gzip
import hashlib
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

REPO = Path('/workspace/scratch/61a2ad7355f4/editor')
UPSTREAM = '414c6af17e9ec8bab4bde6ac0026e653bb1ed9ab'
BASE = '0cceb84eceeb6299f2338ac4798ff40e9aa36ec8'
PREFIX = 'scripts/parity/checkpoints/2026-10-30/'

@lru_cache(None)
def blob(source, path):
    return subprocess.check_output(['git', 'show', source + ':' + path], cwd=REPO)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

rows = [
    ('heading-list', 'text-block-settings', 'final/differential.json.gz', 'text-block-settings-parity-fixture.js', 21, 2323,
     ['BLOCK_HEADING_LEVELS', 'BLOCK_LIST_STYLES']),
    ('columns', 'columns-layouts', 'layouts-final-differential.json.gz', 'columns-layout-parity-fixture.js', 12, 2880,
     ['BLOCK_COLUMNS_LAYOUTS', 'BLOCK_COLUMNS_NO_LOSS_REDUCE']),
    ('raw', 'raw-source-preview', 'raw/final.json.gz', 'raw-source-parity-fixture.js', 21, 1421,
     ['BLOCK_RAW_SOURCE', 'BLOCK_RAW_PREVIEW']),
    ('tools', 'tool-actions', 'final-differential.json.gz', 'tool-actions-parity-fixture.js', 48, 2072,
     ['TOOL_CASETRANSFORM_ACTION', 'TOOL_CLEARFORMATTING_ACTION']),
]
report = {'source': UPSTREAM, 'previousSource': BASE, 'scope': 'Read-only archive integrity and fixed-fixture acceptance audit, not a new browser execution', 'corpora': []}
for name, directory, final_path, fixture, expected_cases, expected_observations, ids in rows:
    root = PREFIX + directory + '/'
    index = json.loads(blob(UPSTREAM, root + 'artifact-hashes.json'))
    entries = index.get('files') if 'files' in index else [dict(path=path, **value) for path, value in index.items()]
    for entry in entries:
        raw = blob(UPSTREAM, root + entry['path'])
        assert len(raw) == entry.get('compressedBytes', entry.get('bytes')), entry['path']
        assert sha(raw) == entry.get('compressedSha256', entry.get('sha256')), entry['path']
        if entry['path'].endswith('.gz'):
            decoded = gzip.decompress(raw)
            assert len(decoded) == entry.get('decodedBytes', entry.get('payloadBytes')), entry['path']
            assert sha(decoded) == entry.get('decodedSha256', entry.get('payloadSha256')), entry['path']
    raw = gzip.decompress(blob(UPSTREAM, root + final_path))
    data = json.loads(raw)
    assert data['headBefore'] == data['headAfter']
    assert data.get('filter', '') == ''
    assert data['candidatePass'] is True
    assert data['serverErrors'] == []
    assert data['fixtureSha256'] == sha(blob(UPSTREAM, 'tests/browser/' + fixture))
    totals = []
    verdicts = 0
    loaded_records = 0
    for source in data['sources']:
        # The published upstream changed no production relative to the recorded
        # candidates; verify actual served candidate bytes through that tree.
        check_source = UPSTREAM if source['label'] == 'candidate' else source['sha']
        for path, expected in source.get('loaded', {}).items():
            assert sha(blob(check_source, path)) == expected, (name, source['label'], path)
            loaded_records += 1
    for result in data['results']:
        observations = [obs for case in result['cases'] for obs in case['observations']]
        for obs in observations:
            expected_status = 'PASS' if canonical(obs['actual']) == canonical(obs['expected']) else 'FAIL'
            assert obs['status'] == expected_status, (name, result['source'], obs['phase'], obs['property'])
        failed = sum(obs['status'] == 'FAIL' for obs in observations)
        verdicts += len(observations)
        unsupported = sum(bool(case.get('unsupported')) for case in result['cases'])
        errors = sum(bool(case.get('error')) for case in result['cases'])
        totals.append({'source': result['source'], 'cases': len(result['cases']), 'observations': len(observations),
            'failedObservations': failed, 'caseErrors': errors, 'casesWithUnsupported': unsupported,
            'pageErrors': len(result.get('errors', result.get('pageErrors', []))),
            'casePageErrors': len(result.get('casePageErrors', [])), 'inputErrors': len(result.get('inputErrors', []))})
        if result['source'] == 'candidate':
            assert len(result['cases']) == expected_cases
            assert len({case['id'] for case in result['cases']}) == expected_cases
            assert len(observations) == expected_observations
            assert failed == errors == unsupported == 0
            assert not result.get('errors') and not result.get('pageErrors') and not result.get('inputErrors') and not result.get('casePageErrors')
            for case in result['cases']:
                assert case['observations'] and case['completedPhases']
                if 'planned' in case:
                    assert case['planned'] == case['completedPhases']
                if 'plannedPhases' in case:
                    assert case['plannedPhases'] == case['completedPhases']
    report['corpora'].append({'name': name, 'rows': ids, 'path': root + final_path,
        'decodedSha256': sha(raw), 'verifiedArchivePayloads': len(entries),
        'recomputedVerdicts': verdicts, 'verifiedLoadedProductionRecords': loaded_records,
        'fixtureSha256': data['fixtureSha256'], 'results': totals})

before = blob(BASE, 'docs/architecture/rector-v2/PRESERVATION.md').decode()
after = blob(UPSTREAM, 'docs/architecture/rector-v2/PRESERVATION.md').decode()
def register(text):
    return {line.split('|')[1].strip(): line for line in text.splitlines() if re.match(r'^\| [A-Z][A-Z0-9_]+ \|', line) and line.split('|')[1].strip() != 'ID'}
old_rows, new_rows = register(before), register(after)
assert old_rows.keys() == new_rows.keys() and len(new_rows) == 209
accepted = lambda row: '**Accepted' in row
newly_accepted = [key for key in new_rows if accepted(new_rows[key]) and not accepted(old_rows[key])]
assert set(newly_accepted) == {row for item in rows for row in item[-1]}
assert sum(map(accepted, new_rows.values())) == 54
report['register'] = {'uniqueIds': 209, 'accepted': 54, 'open': 155, 'newlyAccepted': newly_accepted}
report['sourceAndArchiveChecksPassed'] = True
output = Path('/workspace/scratch/61a2ad7355f4/tools/upstream-eight-rows-audit.json')
output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'report': str(output), 'corpora': len(report['corpora']),
    'archivePayloads': sum(x['verifiedArchivePayloads'] for x in report['corpora']),
    'verdicts': sum(x['recomputedVerdicts'] for x in report['corpora']),
    'loadedProductionRecords': sum(x['verifiedLoadedProductionRecords'] for x in report['corpora']),
    'register': report['register'], 'passed': True}, indent=2))
