"""Independent fixed-author oracle and immutable-source review for Raw."""
import argparse
from collections import Counter
from copy import deepcopy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess


def selection(start, end=None, direction='forward'):
    end = start if end is None else end
    return {'start': start, 'end': end, 'direction': 'none' if start == end else direction}


FIRST = '<p>Alpha &amp; Beta</p>'
SECOND = '\t<b>Bravo</b>'
TAIL = '<p>Tail</p>'
SOURCE = '\n'.join([FIRST, SECOND, TAIL])
MIXED = '\t<p>Alpha</p>\n  <p>Bravo</p>\n\t<p>Tail</p>'
CASES = {}


def indent(name, original, before, edited, after, shift=False, no_op=False):
    CASES['RAW_SOURCE/' + name] = {'kind': 'indent', 'source': original, 'selection': before,
        'after': edited, 'afterSelection': after, 'shift': shift, 'noOp': no_op}


indent('tab-caret', SOURCE, selection(5), '<p>Al  pha &amp; Beta</p>\n' + SECOND + '\n' + TAIL, selection(7))
indent('tab-single-line-range', SOURCE, selection(3, 8), '<p>   &amp; Beta</p>\n' + SECOND + '\n' + TAIL, selection(5))
for direction in ['forward', 'backward']:
    edited = '\n'.join(['  ' + FIRST, '  ' + SECOND, TAIL])
    boundary = len(FIRST + '\n' + SECOND + '\n')
    indent('tab-next-line-boundary-' + direction, SOURCE, selection(0, boundary, direction), edited, selection(0, boundary + 4, direction))
    partial_end = SOURCE.index('vo</b>') + 1
    indent('tab-partial-lines-' + direction, SOURCE, selection(3, partial_end, direction), edited, selection(0, partial_end + 4, direction))
indent('tab-empty-lines', '\n\n' + TAIL, selection(0, 2), '  \n  \n' + TAIL, selection(0, 6))
last_newline = '<p>Alpha</p>\n<p>Bravo</p>\n'
indent('tab-final-newline', last_newline, selection(0, len(last_newline), 'backward'), '  <p>Alpha</p>\n  <p>Bravo</p>\n', selection(0, len(last_newline) + 4, 'backward'))
for direction in ['forward', 'backward']:
    last_selected = len('\t<p>Alpha</p>\n  <p>Bravo</p>\n')
    indent('dedent-mixed-prefixes-' + direction, MIXED, selection(1, last_selected, direction), '<p>Alpha</p>\n<p>Bravo</p>\n\t<p>Tail</p>', selection(0, last_selected - 3, direction), shift=True)
indent('dedent-caret-inside-spaces', '  <p>Alpha</p>\n' + TAIL, selection(1), '<p>Alpha</p>\n' + TAIL, selection(0), shift=True)
indent('dedent-unindented-no-op', SOURCE, selection(3, 8, 'backward'), SOURCE, selection(3, 8, 'backward'), shift=True, no_op=True)

for name, before, options in [
    ('mouse-caret', selection(29), {'activation': 'mouse'}),
    ('mouse-forward-range', selection(3, 8), {'activation': 'mouse'}),
    ('mouse-backward-lines', selection(3, 38, 'backward'), {'activation': 'mouse'}),
    ('keyboard-forward-range', selection(28, 33), {'activation': 'keyboard'}),
    ('keyboard-backward-lines', selection(3, 38, 'backward'), {'activation': 'keyboard'}),
    ('read-only-forward-range', selection(3, 8), {'readOnlyRoundTrip': True}),
    ('read-only-backward-lines', selection(3, 38, 'backward'), {'readOnlyRoundTrip': True}),
    ('initial-read-only', selection(29), {'initialReadOnly': True}),
    ('history-from-preview', selection(len(SOURCE)), {'kind': 'preview-history'}),
]:
    CASES['RAW_PREVIEW/' + name] = {'kind': 'preview', 'source': SOURCE, 'selection': before, **options}


def records(text, legacy=None):
    result = [
        {'id': 'before', 'type': 'paragraph', 'data': {'text': 'Before <b>raw</b>'}},
        {'id': 'raw', 'type': 'raw', 'data': {'html': text}},
        {'id': 'after', 'type': 'paragraph', 'data': {'text': 'After <i>raw</i>'}},
    ]
    if legacy is False:
        for block in result:
            block['dataVersion'] = 1 if block['type'] == 'raw' else 2
    return result


def state_oracle(spec):
    states = {}
    def add(phase, text, undo, redo, actions, caret=None):
        states[phase] = {'text': text, 'history': {'canUndo': undo, 'canRedo': redo}, 'actions': actions, 'selection': caret}
    source = spec['source']
    add('load', source, False, False, 0)
    if not spec.get('initialReadOnly'):
        add('selected', source, False, False, 0, spec['selection'])
    if spec['kind'] == 'indent':
        count = 0 if spec['noOp'] else 1
        edit = spec['after']; caret = spec['afterSelection']
        typed = edit[:caret['start']] + 'X' + edit[caret['end']:]
        typed_caret = selection(caret['start'] + 1)
        add('indent', edit, not spec['noOp'], False, count, caret)
        add('input', typed, True, False, count + 1, typed_caret)
        add('undo-input', edit, not spec['noOp'], True, count + 2, caret)
        if not spec['noOp']:
            add('undo-indent', source, False, True, 4, spec['selection'])
            add('redo-indent', edit, True, True, 5, caret)
        add('redo-input', typed, True, False, 3 if spec['noOp'] else 6, typed_caret)
    else:
        caret = spec['selection']
        typed = source[:caret['start']] + 'X' + source[caret['end']:]
        typed_caret = selection(caret['start'] + 1)
        if spec['kind'] == 'preview-history':
            add('input', typed, True, False, 1, typed_caret)
            add('preview', typed, True, False, 1)
        else:
            add('preview', source, False, False, 0)
            if spec.get('readOnlyRoundTrip') or spec.get('initialReadOnly'):
                add('editable-again', source, False, False, 0)
            add('source-return', source, False, False, 0, caret)
            add('input', typed, True, False, 1, typed_caret)
        add('undo-input', source, False, True, 2, caret)
        add('redo-input', typed, True, False, 3, typed_caret)
    return states


def expected_value(property_name, phase, spec, states, legacy):
    fixed = {
        'sourceMarkupIsInert': [0, 0], 'sourceFocus': True,
        'trustedControlClick': {'trusted': True, 'intendedControl': True},
        'sourceHidden': True, 'previewVisible': '', 'previewFrameCount': 1,
        'previewSandbox': '', 'readOnlySource': True,
        'readOnlyControl': {'hidden': True, 'disabled': True},
        'editableSource': False, 'editableControl': {'hidden': False, 'disabled': False},
        'sourceVisible': False, 'previewHidden': 'none',
        'nativeInputObserved': True, 'allRecordedGesturesTrusted': True, 'editorRemoved': None,
    }
    if property_name in fixed:
        return fixed[property_name]
    if property_name == 'initialReadOnly':
        return bool(spec.get('initialReadOnly'))
    if property_name == 'callerInput':
        return {'version': '1.0.5' if legacy else '2.0.0', 'blocks': records(spec['source'], legacy)}
    if property_name == 'trustedIndentation':
        return [{'trusted': True, 'shift': spec['shift']}]
    state = states[phase]
    return {
        'canonicalRecords': records(state['text']), 'literalSource': state['text'],
        'history': state['history'], 'completedTransactions': state['actions'],
        'sourceSelection': state['selection'], 'previewMarkup': state['text'],
        'togglePressed': 'true' if phase == 'preview' else 'false',
    }[property_name]


def review_observations(data):
    assert data['serverErrors'] == []
    assert [source['source'] for source in data['results']] == ['v1', 'spec-baseline', 'candidate']
    verdicts = 0
    summary = {}
    for source in data['results']:
        legacy = source['source'] == 'v1'
        assert source['errors'] == [] and source['incompleteCases'] == []
        # Cases own separate editors; coverage is identity-based, not loop order.
        assert len(source['cases']) == len(CASES)
        assert {case['id'] for case in source['cases']} == set(CASES)
        reconstructed_failures = []
        for case in source['cases']:
            spec = CASES[case['id']]
            for key, expected in spec.items():
                actual = case['specification'].get(key, False if key in ['shift', 'noOp'] else None)
                assert actual == expected, (case['id'], 'fixed specification', key, actual, expected)
            states = state_oracle(spec)
            assert case['error'] is None
            assert case['plannedPhases'] == list(states) + ['dispose']
            assert case['completedPhases'] == case['plannedPhases']
            assert [phase['phase'] for phase in case['phases']] == list(states)
            for observation in case['observations']:
                phase = observation['phase']; name = observation['property']
                expected = expected_value(name, phase, spec, states, legacy)
                assert observation['expected'] == expected, (source['source'], case['id'], phase, name, 'oracle differs', observation['expected'], expected)
                verdict = 'PASS' if observation['actual'] == expected else 'FAIL'
                assert observation['status'] == verdict, (case['id'], phase, name, 'verdict differs')
                verdicts += 1
                if verdict != 'PASS':
                    reconstructed_failures.append({'id': case['id'], **observation})
            for phase in case['phases']:
                observations = {row['property']: row for row in case['observations'] if row['phase'] == phase['phase']}
                projected = [{key: block[key] for key in ['id', 'type', 'data']} for block in phase['blocks']]
                assert observations['canonicalRecords']['actual'] == projected
                assert observations['history']['actual'] == phase['history']
                for name in ['canonicalRecords', 'literalSource', 'sourceMarkupIsInert', 'history', 'callerInput']:
                    assert name in observations, (case['id'], phase['phase'], 'missing required observation', name)
                if not legacy:
                    assert 'completedTransactions' in observations
                if states[phase['phase']]['selection'] is not None:
                    assert 'sourceSelection' in observations and 'sourceFocus' in observations
            gestures = case['trusted']
            assert all(event['trusted'] for event in gestures), case['id']
            if spec['kind'] == 'indent':
                tabs = [event for event in gestures if event['phase'] == 'indent' and event.get('key') == 'Tab']
                assert len(tabs) == 1 and tabs[0]['shift'] == spec['shift']
            if spec.get('activation') == 'keyboard':
                spaces = [event for event in gestures if event.get('key') == ' ']
                assert len(spaces) == 2
        assert source['failures'] == reconstructed_failures
        summary[source['source']] = {'cases': len(source['cases']),
            'observations': sum(len(case['observations']) for case in source['cases']),
            'failures': len(reconstructed_failures), 'incompleteCases': 0, 'pageErrors': 0,
            'failureProperties': dict(Counter(failure['property'] for failure in reconstructed_failures))}
    assert summary['candidate']['failures'] == 0
    assert data['candidatePass'] is True and data['sourceUnchanged'] is True
    return {'independentlyRecomputedVerdicts': verdicts, 'fixedCases': len(CASES), 'sources': summary}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--raw', required=True, type=Path)
    args = parser.parse_args()
    raw_bytes = args.raw.read_bytes()
    if args.raw.suffix == '.gz':
        raw_bytes = gzip.decompress(raw_bytes)
    data = json.loads(raw_bytes)
    report = review_observations(data)
    digest = lambda value: hashlib.sha256(value).hexdigest()
    def git(*parts):
        return subprocess.check_output(['git', *parts], cwd=args.repo)
    assert data['headBefore'] == data['headAfter'] == data['fixtureSource']
    hashes = 0
    for source in data['sources']:
        assert git('rev-parse', source['sha'] + '^{tree}').decode().strip() == source['tree']
        for path, expected in source['loaded'].items():
            assert digest(git('show', source['sha'] + ':' + path)) == expected, (source['label'], path)
            hashes += 1
    for path, expected in data['dependencyFiles'].items():
        assert digest((args.repo / 'node_modules' / path).read_bytes()) == expected, path
    for package, version in data['dependencyVersions'].items():
        assert json.loads((args.repo / 'node_modules' / package / 'package.json').read_text())['version'] == version
    for path, key in [('scripts/parity/raw-source-preview.mjs', 'runnerSha256'), ('tests/browser/raw-source-parity-fixture.js', 'fixtureSha256')]:
        assert digest(git('show', data['fixtureSource'] + ':' + path)) == data[key]
    guards = []
    for name, property_name, replacement in [
        ('changed-author-data-with-green-verdict', 'literalSource', 'wrong author data'),
        ('view-creates-history-with-green-verdict', 'history', {'canUndo': True, 'canRedo': False}),
        ('lost-backward-selection-with-green-verdict', 'sourceSelection', selection(49)),
    ]:
        changed = deepcopy(data)
        case = next(case for case in changed['results'][-1]['cases'] if case['id'] == 'RAW_PREVIEW/read-only-backward-lines')
        observation = next(row for row in case['observations'] if row['phase'] == 'source-return' and row['property'] == property_name)
        observation.update(actual=replacement, expected=replacement, status='PASS')
        try:
            review_observations(changed)
        except AssertionError:
            guards.append({'mutation': name, 'rejected': True})
        else:
            raise AssertionError('Independent review accepted a corrupted oracle: ' + name)
    changed = deepcopy(data)
    case = changed['results'][-1]['cases'][0]
    case['plannedPhases'].remove('undo-indent'); case['completedPhases'].remove('undo-indent')
    try:
        review_observations(changed)
    except AssertionError:
        guards.append({'mutation': 'missing-keyboard-history-phase', 'rejected': True})
    else:
        raise AssertionError('Independent review accepted missing history coverage')
    report.update(rawSha256=digest(raw_bytes), fixtureSource=data['fixtureSource'],
        sourceModuleHashes=hashes, dependencyFileHashes=len(data['dependencyFiles']),
        dependencyVersions=len(data['dependencyVersions']), mutationGuards=guards,
        note='Historical verdicts are recomputed and retained. Negative controls exercise this independent oracle; they are not additional browser tests or accepted capabilities.')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
