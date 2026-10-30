"""Independently verify the bounded public-focus raw evidence; no browser run.

The fixed expected records, offsets and exact historical defects below are
independent of the JavaScript fixture. This audit never changes raw verdicts.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', required=True, type=Path)
parser.add_argument('--raw', type=Path, default=Path(__file__).parent / 'initial/result.json.gz')
parser.add_argument('--candidate', default='b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13')
parser.add_argument('--runner-revision', default='132b59923de9bc6b1f3b3f73ba48c6d1f040826a')
parser.add_argument('--dependencies', type=Path)
args = parser.parse_args()
dependencies = args.dependencies or args.repo / 'node_modules'
digest = lambda value: hashlib.sha256(value).hexdigest()
payload = args.raw.read_bytes()
if args.raw.suffix == '.gz':
    payload = gzip.decompress(payload)
data = json.loads(payload)


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=args.repo)


def records(legacy, destination='a', offset=0, edited=False):
    result = []
    for identity, text in [('a', 'Alpha'), ('b', 'Bravo')]:
        if edited and identity == destination:
            text = text[:offset] + 'X' + text[offset:]
        result.append({'id': identity, 'type': 'paragraph',
                       **({} if legacy else {'dataVersion': 2}), 'data': {'text': text}})
    return result


def selection(offset, active=True):
    return {'active': active, 'anchor': offset, 'focus': offset, 'collapsed': True}


cases = {f'FOCUS_VALUES_OFFSET_{index}': ('a', offset)
         for index, offset in enumerate([2, 2, 0, 5, 0, 5], 1)}
cases['DEFECT_FIRST_FOCUS'] = ('b', 2)
source_shas = {'v1': '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',
               'spec-baseline': 'e981ff308000c1d92d7e820df95113c1e19bcee8',
               'candidate': args.candidate}
assert data['headBefore'] == args.candidate
assert not data['serverErrors']
assert {source['label']: source['sha'] for source in data['sources']} == source_shas
assert {source['source'] for source in data['results']} == set(source_shas)
verdicts = fixed_expectations = module_hashes = 0
summary = []
historical_failures = []

for source in data['results']:
    label = source['source']
    legacy = label == 'v1'
    expected_cases = {'V1_PUBLIC_FOCUS_NATIVE_NAVIGATION': ('b', 2)} if legacy else cases
    assert {case['id'] for case in source['cases']} == set(expected_cases)
    assert len(source['cases']) == len(expected_cases) and not source['pageErrors']
    if legacy:
        assert len(source['unsupported']) == 7
        assert {entry['id'] for entry in source['unsupported']} == set(cases)
        assert all(entry['status'] == 'UNSUPPORTED' and entry['reason']
                   for entry in source['unsupported'])
    else:
        assert source['unsupported'] == []
    failures = []
    for case in source['cases']:
        destination, offset = expected_cases[case['id']]
        original = records(legacy)
        supplied = {'version': '1.0.5' if legacy else '2.0.0', 'blocks': original}
        expected = {'initialRecords': original, 'initialHistory': [False, False],
                    'focusKeepsRecords': original, 'focusKeepsHistory': [False, False],
                    'focusKeepsCallerInput': supplied}
        if legacy:
            expected.update({'keyedFocusApiAbsent': 'undefined',
                             'nativeNavigationSelection': selection(2),
                             'nativeNavigationHistory': [False, False]})
        else:
            expected.update({'accepted': True, 'currentId': destination,
                             'selection': selection(offset),
                             'settledCurrentEvents': [{'id': 'b', 'selection': selection(2)}]
                             if destination == 'b' else []})
        for phase, edited in [('edit', True), ('undo', False), ('redo', True)]:
            expected.update({phase + '.records': records(legacy, destination, offset, edited),
                             phase + '.history': [True, False] if edited else [False, True],
                             phase + '.selection': selection(offset + (1 if edited else 0)),
                             phase + '.callerInput': supplied})
        assert case['complete'] and not case['errors']
        assert case['phases'] == ['focus', 'edit', 'undo', 'redo', 'destroy']
        observations = {observation['property']: observation for observation in case['observations']}
        assert len(observations) == len(case['observations']) == len(expected)
        assert set(observations) == set(expected)
        historical = {}
        if legacy:
            historical = {'undo.selection': selection(None, active=False)}
        elif label == 'spec-baseline' and case['id'] == 'DEFECT_FIRST_FOCUS':
            historical = {'accepted': False, 'selection': selection(0),
                          'settledCurrentEvents': [{'id': 'b', 'selection': selection(0)}],
                          'edit.records': records(False, 'b', 0, True),
                          'edit.selection': selection(1), 'undo.selection': selection(0),
                          'redo.records': records(False, 'b', 0, True),
                          'redo.selection': selection(1)}
        for property_name, intended in expected.items():
            observation = observations[property_name]
            assert observation['expected'] == intended, (label, case['id'], property_name, 'oracle')
            assert observation['actual'] == historical.get(property_name, intended), (
                label, case['id'], property_name, 'actual')
            expected_status = 'PASS' if observation['actual'] == intended else 'FAIL'
            assert observation['status'] == expected_status
            verdicts += 1
            fixed_expectations += 1
            if expected_status == 'FAIL':
                entry = {'id': case['id'], 'property': property_name}
                failures.append(entry)
                historical_failures.append({'source': label, **entry})
    summary.append({'source': label, 'cases': len(source['cases']),
                    'unsupported': len(source['unsupported']),
                    'observations': sum(len(case['observations']) for case in source['cases']),
                    'rawFailures': len(failures), 'incomplete': 0, 'pageErrors': 0})

for source in data['sources']:
    assert git('rev-parse', source['sha'] + '^{tree}').decode().strip() == source['tree']
    for path, fingerprint in source['loaded'].items():
        assert digest(git('show', source['sha'] + ':' + path)) == fingerprint
        module_hashes += 1
for path, fingerprint in data['dependencyFiles'].items():
    assert digest((dependencies / path).read_bytes()) == fingerprint
for name, version in data['dependencyVersions'].items():
    assert json.loads((dependencies / name / 'package.json').read_text())['version'] == version
runner = git('show', args.runner_revision + ':scripts/parity/public-focus.mjs')
assert digest(runner) == data['runnerSha256']
assert verdicts == fixed_expectations == 314 and module_hashes == 271
assert [(entry['source'], entry['rawFailures']) for entry in summary] == [
    ('v1', 1), ('spec-baseline', 8), ('candidate', 0)]
print(json.dumps({'reviewedCandidate': args.candidate, 'decodedRawSha256': digest(payload),
                  'runnerRevision': args.runner_revision, 'runnerSha256': digest(runner),
                  'reviewerSha256': digest(Path(__file__).read_bytes()), 'summary': summary,
                  'independentlyRecomputedVerdicts': verdicts,
                  'independentlyReconstructedExpectedValues': fixed_expectations,
                  'verifiedModuleHashRecords': module_hashes,
                  'verifiedDependencyFiles': len(data['dependencyFiles']),
                  'verifiedDependencyVersions': len(data['dependencyVersions']),
                  'historicalFailures': historical_failures,
                  'evidenceConsistent': True, 'candidatePass': True,
                  'rawHistoricalVerdictsPreserved': True,
                  'acceptanceScope': list(cases),
                  'limitations': [
                      'The seven v1 keyed/numeric API obligations are UNSUPPORTED, not PASS.',
                      'The v1 counterpart uses its real block.focus() and native keyboard navigation.',
                      'Acceptance is for the specified new/current API contracts, not exact v1 API equivalence.',
                      'Paragraph plain text in Chrome 156/Linux; full PUBLIC_SELECTION and platform coverage remain open.'
                  ]}, indent=2))
