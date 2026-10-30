"""Review the immutable Checklist differential; no candidate exemptions."""
import copy
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'v1': '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',
    'spec-baseline': 'e981ff308000c1d92d7e820df95113c1e19bcee8',
    'candidate': 'd70b318420afd105d311912110dd1caa44444d2c',
}
CASE_SPECS = {
    f'{position}/{kind}': {'position': position, 'text': text}
    for position in ['sole', 'last']
    for kind, text in [('empty', ''), ('BR-only', '<br>'), ('formatting-only', '<b></b>')]
} | {
    'visible/formatting': {'position': 'sole', 'text': '<b>Visible</b>', 'guard': 'formatting'},
    'visible/widgets': {'position': 'sole', 'text': '<b>{{mention}}</b> {{color}}', 'guard': 'widgets'},
}


def original_records(label, case_id):
    """Fixed author oracle; never obtain expected content from the raw result."""
    spec = CASE_SPECS[case_id]
    legacy = label == 'v1'

    def record(block_id, block_type, data):
        return {'id': block_id, 'type': block_type, **({} if legacy else {'dataVersion': 2}), 'data': data}

    def sidecar(widget_type, data):
        return {'type': widget_type, **({} if legacy else {'dataVersion': 1}), 'data': data}

    inline = {
        'mention': sidecar('mention', {'id': 'ada', 'name': 'Ada'}),
        'color': sidecar('color', {'value': '#123456'}),
    }
    retained = {**({} if legacy else {'id': 'retained'}),
                'text': '<b>Keep</b> <i>{{mention}}</i> {{color}}', 'checked': True}
    empty = {**({} if legacy else {'id': 'empty'}), 'text': spec['text'], 'checked': False}
    items = ([retained] if spec['position'] == 'last' else []) + [empty]
    checklist = record('checklist', 'checklist', {'items': items})
    if spec['position'] == 'last' or spec.get('guard') == 'widgets':
        checklist['inline'] = copy.deepcopy(inline)
    following = record('after', 'paragraph', {'text': '<i>After</i> {{mention}} {{color}}'})
    following['inline'] = copy.deepcopy(inline)
    return [record('before', 'paragraph', {'text': 'Before'}), checklist, following]


def review(result):
    assert result['sourceUnchanged'] and result['sourceIdentityVerified']
    assert result['serverErrors'] == []
    assert result['headBefore'] == SOURCES['candidate']
    assert [(s['label'], s['sha']) for s in result['sources']] == list(SOURCES.items())
    assert [s['source'] for s in result['results']] == list(SOURCES)
    caret_good = {'focused': True, 'owned': True, 'collapsed': True, 'offset': 0}
    caret_lost = {'focused': False, 'owned': False, 'collapsed': True, 'offset': None}
    counts = {}
    for source in result['results']:
        label = source['source']
        assert source['errors'] == source['pageErrors'] == []
        assert len(source['cases']) == 8 and {c['id'] for c in source['cases']} == set(CASE_SPECS)
        failure_count = 0
        for case in source['cases']:
            assert case['incompletePhases'] == []
            assert {key: case[key] for key in ['position', 'text', 'guard'] if key in case} == CASE_SPECS[case['id']]
            assert case['legacy'] is (label == 'v1')
            original = original_records(label, case['id'])
            edited = copy.deepcopy(original); edited[0]['data']['text'] = 'BeforeX'
            for observation in case['observations']:
                # Recompute every verdict; an edited actual value must not be
                # accepted merely because the raw record still says PASS.
                actual = json.dumps(['actual' in observation, observation.get('actual')], sort_keys=True)
                wanted = json.dumps(['expected' in observation, observation.get('expected')], sort_keys=True)
                assert (actual == wanted) == (observation['status'] == 'PASS')
            for phase, prop, records in [('load', 'initialRecords', original), ('edit', 'editedRecords', edited)]:
                matches = [o for o in case['observations'] if (o['phase'], o['property']) == (phase, prop)]
                assert len(matches) == 1 and matches[0]['status'] == 'PASS'
                for key in ['actual', 'expected']:
                    assert json.dumps(matches[0].get(key), sort_keys=True) == json.dumps(records, sort_keys=True), (label, case['id'], prop, key)
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
    for label in ['candidate', 'candidate-unchanged-status',
                  'candidate-case-position', 'candidate-case-text', 'candidate-case-guard',
                  'v1', 'spec-baseline',
                  'spec-baseline-consistent-author-change']:
        altered = copy.deepcopy(result)
        candidate = label.startswith('candidate')
        source_label = 'candidate' if candidate else 'spec-baseline' if label.startswith('spec-baseline') else label
        case = next(s for s in altered['results'] if s['source'] == source_label)['cases'][0 if candidate else 1]
        if label == 'candidate':
            observation = case['observations'][0]
            observation['status'] = 'FAIL'; observation['actual'] = None
            case['failures'].append(observation)
        elif label.startswith('candidate-case-'):
            key = label.removeprefix('candidate-case-')
            case[key] = {'position': 'last', 'text': 'Changed author input', 'guard': 'widgets'}[key]
        elif candidate:
            case['observations'][0]['actual'] = None
        elif label == 'spec-baseline-consistent-author-change':
            # Change the fixed author record everywhere, keeping every verdict
            # and every actual/expected relationship internally consistent.
            encoded = json.dumps(case)
            changed = encoded.replace('<b>Keep</b>', '<b>CHANGED AUTHOR</b>')
            assert changed != encoded
            case.update(json.loads(changed))
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
