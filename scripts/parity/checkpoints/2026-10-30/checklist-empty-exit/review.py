"""Review the immutable Checklist differential; no candidate exemptions."""
import copy
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def review(result):
    assert result['sourceUnchanged'] and result['sourceIdentityVerified']
    assert result['serverErrors'] == []
    assert result['headBefore'] == 'd70b318420afd105d311912110dd1caa44444d2c'
    assert [s['sha'] for s in result['sources']] == [
        '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',
        'e981ff308000c1d92d7e820df95113c1e19bcee8',
        'd70b318420afd105d311912110dd1caa44444d2c',
    ]
    wanted_ids = {f'{position}/{kind}' for position in ['sole', 'last']
                  for kind in ['empty', 'BR-only', 'formatting-only']} | {'visible/formatting', 'visible/widgets'}
    caret_good = {'focused': True, 'owned': True, 'collapsed': True, 'offset': 0}
    caret_lost = {'focused': False, 'owned': False, 'collapsed': True, 'offset': None}
    counts = {}
    for source in result['results']:
        label = source['source']
        assert source['errors'] == source['pageErrors'] == []
        assert len(source['cases']) == 8 and {c['id'] for c in source['cases']} == wanted_ids
        failure_count = 0
        for case in source['cases']:
            assert case['incompletePhases'] == []
            for observation in case['observations']:
                # Recompute every verdict; an edited actual value must not be
                # accepted merely because the raw record still says PASS.
                actual = json.dumps(['actual' in observation, observation.get('actual')], sort_keys=True)
                wanted = json.dumps(['expected' in observation, observation.get('expected')], sort_keys=True)
                assert (actual == wanted) == (observation['status'] == 'PASS')
            assert [s['phase'] for s in case['snapshots']] == [
                'load', 'edit', 'exit', 'undo-exit', 'undo-edit', 'redo-edit', 'redo-exit', 'dispose']
            failures = {(f['phase'], f['property']): f for f in case['observations'] if f['status'] != 'PASS'}
            assert list(failures.values()) == case['failures']
            expected = {}
            def allow(phase, prop, actual, wanted):
                expected[(phase, prop)] = (actual, wanted)
            if label == 'v1':
                if case['position'] == 'last':
                    allow('undo-exit', 'nativeCaret', caret_lost, caret_good)
                if case.get('guard'):
                    allow('redo-exit', 'nativeCaret', caret_lost, caret_good)
            elif label == 'spec-baseline' and (case['position'] == 'last' or case.get('guard') == 'widgets'):
                initial_check = next(o for o in case['observations'] if o['property'] == 'initialRecords')
                assert initial_check['status'] == 'PASS'
                original = initial_check['expected']
                edited = copy.deepcopy(original); edited[0]['data']['text'] = 'BeforeX'
                if case['position'] == 'last':
                    allow('exit', 'blockTypes', ['paragraph', 'checklist', 'paragraph'],
                          ['paragraph', 'checklist', 'paragraph', 'paragraph'])
                    retained = copy.deepcopy(original[1]); retained['data']['items'] = retained['data']['items'][:1]
                    allow('exit', 'retainedChecklist', original[1], retained)
                    allow('exit', 'exitText', 'After @Ada #123456', '')
                    allow('exit', 'nativeCaret', caret_lost, caret_good)
                    allow('undo-exit', 'nativeCaret', caret_lost, caret_good)
                else:
                    allow('exit', 'splitItemCount', 1, 2)
                    allow('exit', 'newItemUnchecked', None, False)
                    allow('exit', 'exitText', '@Ada #123456', '')
                    allow('exit', 'nativeCaret', {**caret_good, 'offset': 12}, caret_good)
                allow('undo-exit', 'historyRecords', original, edited)
                allow('undo-exit', 'historyAvailability', [False, True], [True, True])
                allow('redo-edit', 'historyAvailability', [True, False], [True, True])
                allow('redo-exit', 'nativeCaret', caret_lost, caret_good)
            assert failures.keys() == expected.keys(), (label, case['id'], failures.keys(), expected.keys())
            for key, failure in failures.items():
                actual, wanted = expected[key]
                assert failure['status'] == 'FAIL'
                assert failure.get('actual') == actual and failure.get('expected') == wanted, (label, case['id'], key)
            failure_count += len(failures)
        counts[label] = {'cases': len(source['cases']), 'observations': sum(len(c['observations']) for c in source['cases']),
                         'reviewedHistoricalDifferences': failure_count, 'unexpectedDifferences': 0}
    assert counts == {
        'v1': {'cases': 8, 'observations': 217, 'reviewedHistoricalDifferences': 5, 'unexpectedDifferences': 0},
        'spec-baseline': {'cases': 8, 'observations': 222, 'reviewedHistoricalDifferences': 35, 'unexpectedDifferences': 0},
        'candidate': {'cases': 8, 'observations': 222, 'reviewedHistoricalDifferences': 0, 'unexpectedDifferences': 0},
    }
    return counts


if __name__ == '__main__':
    payload = gzip.decompress((ROOT / 'results.json.gz').read_bytes())
    result = json.loads(payload)
    counts = review(result)
    for filename, field in [('fixture.js', 'fixtureSha256'), ('probe.mjs', 'runnerSha256')]:
        assert hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == result[field]
    controls = []
    for label in ['candidate', 'candidate-unchanged-status', 'v1', 'spec-baseline']:
        altered = copy.deepcopy(result)
        candidate = label.startswith('candidate')
        case = next(s for s in altered['results'] if s['source'] == ('candidate' if candidate else label))['cases'][0 if candidate else 1]
        if label == 'candidate':
            observation = case['observations'][0]
            observation['status'] = 'FAIL'; observation['actual'] = None
            case['failures'].append(observation)
        elif candidate:
            case['observations'][0]['actual'] = None
        else:
            failure = case['failures'][0]
            observation = next(o for o in case['observations'] if (o['phase'], o['property']) == (failure['phase'], failure['property']))
            failure['actual'] = observation['actual'] = 'unrecognized change'
        try:
            review(altered)
        except AssertionError:
            controls.append(label)
        else:
            raise AssertionError('Review accepted an altered observation: ' + label)
    print(json.dumps({'artifactSha256': hashlib.sha256(payload).hexdigest(), 'sources': counts,
                      'negativeControlsRejected': controls, 'candidateExemptions': 0}, indent=2))
