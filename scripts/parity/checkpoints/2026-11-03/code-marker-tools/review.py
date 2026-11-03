#!/usr/bin/env python3
"""Read-only Code/Marker audit with a separate manual character/mark oracle.

This is the author's verification script, not an independent peer review."""
import argparse
import collections
import hashlib
import gzip
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

BASE = 'd67229c08f5fae7101cb2a252f2d56385224da08'
INTEGRATION = '13b79cc62ceb29fe7a73b5d5dca9d3cde1c37b9e'
INTEGRATION_MANIFEST_SHA256 = '89b6477f25f5479e7e59a962f4427fad2894a4fec21e0dd82e968610dc48da2b'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
SPEC = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
STYLE = 'style(color:rgb(128, 0, 0))'
LINK = 'a[["href","/kept"],["rel","noopener noreferrer"]]'
COLOR = {'value': '#aBcDef'}
MENTION = {'id': 'ada', 'name': 'Ada'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def exact(left, right):
    return json.dumps(left, ensure_ascii=False, separators=(',', ':'), sort_keys=True) == json.dumps(right, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def cases():
    result = []
    for tool in ['code', 'marker']:
        for variant in ['apply', 'mixed', 'nested']:
            for shape in ['single'] if variant == 'nested' else ['single', 'cross', 'fields']:
                for boundary in ['Text', 'Element']:
                    for backward in [False, True]:
                        result.append(dict(id='/'.join([tool, variant, shape, boundary, 'backward' if backward else 'forward']), tool=tool, variant=variant, shape=shape, boundary=boundary, backward=backward))
        for backward in [False, True]:
            result.append(dict(id='/'.join([tool, 'noop', 'atomic', 'backward' if backward else 'forward']), tool=tool, noop='atomic', shape='single', boundary='Element', backward=backward))
        for lifetime in ['read-only', 'destroy']:
            result.append(dict(id='/'.join([tool, 'lifetime', lifetime]), tool=tool, lifetime=lifetime))
    return result


def append(result, text, marks=(), kind='text'):
    if not text:
        return
    marks = sorted(set(marks))
    if kind == 'text' and result and result[-1]['kind'] == kind and result[-1]['marks'] == marks:
        result[-1]['text'] += text
    else:
        result.append(dict(kind=kind, text=text, marks=marks))


def authored(spec, changed=False, typed=False):
    """Manual per-character target marks; no fixture HTML or expected values."""
    target = dict(code='code', marker='mark')[spec['tool']]
    edge = 'i' if spec['tool'] == 'marker' else 'b'
    middle = 's'
    lead, end = [], []
    if 'lifetime' in spec:
        append(lead, 'Abc', [edge] + ([] if changed else [target]))
        append(lead, ' ')
        append(lead, '{{swatch}}', kind='widget')
        append(lead, ' ')
        append(lead, '{{mention}}', kind='widget')
        append(lead, ' Tail')
        return [lead]
    append(lead, ('X' if typed else '') + 'un')
    if 'noop' in spec:
        append(lead, '{{swatch}}', kind='widget')
        append(lead, ' ')
        append(lead, '{{mention}}', kind='widget')
        append(lead, ' rest')
        return [lead]
    whole = spec['boundary'] == 'Element'
    if spec['variant'] == 'nested':
        for index, char in enumerate('Alpha'):
            selected_character = whole or index == 2
            append(lead, char, [edge] + ([target] if not changed or not selected_character else []))
        append(lead, ' ')
        append(lead, '{{swatch}}', kind='widget')
        append(lead, ' ')
        append(lead, '{{mention}}', kind='widget')
        append(lead, ' rest')
        return [lead]
    apply = spec['variant'] == 'apply'
    for index, char in enumerate('Alpha'):
        selected_character = whole or index >= 2
        has_target = (changed and selected_character) if apply else not (changed and selected_character)
        append(lead, char, [edge] + ([target] if has_target else []))
    new_target = [target] if changed and apply else []
    old_target = [target] if not changed and not apply else []
    append(lead, ' Plain ', new_target)
    append(lead, 'MiXeD & tail', [middle, STYLE] + new_target + old_target)
    append(lead, '\n', kind='break')
    append(lead, 'Link', [edge, LINK] + new_target + old_target)
    append(lead, ' ', new_target)
    append(lead, '{{swatch}}', kind='widget')
    append(lead, ' ', new_target)
    append(lead, '{{mention}}', kind='widget')
    if spec['shape'] == 'single':
        append(lead, ' ', new_target)
    for index, char in enumerate('Bravo'):
        selected_character = whole or index < 3
        has_target = (changed and selected_character) if apply else not (changed and selected_character)
        append(end, char, [edge] + ([target] if has_target else []))
    append(end, ' rest')
    if spec['shape'] == 'single':
        for token in end:
            append(lead, token['text'], token['marks'], token['kind'])
        return [lead]
    return [lead, end]


def logical_length(tokens):
    return sum(1 if token['kind'] != 'text' else len(token['text'].encode('utf-16-le')) // 2 for token in tokens)


def selected(spec, changed=False):
    if 'lifetime' in spec:
        return dict(anchor=3, focus=0, collapsed=False)
    if spec.get('noop'):
        first = dict(field='a', offset=2)
        last = dict(field='a', offset=3)
    else:
        names = ['quote.text', 'quote.caption'] if spec['shape'] == 'fields' else ['a', 'b']
        whole = spec['boundary'] == 'Element'
        first = dict(field=names[0], offset=3 if whole else 5)
        last_offset = (8 if whole else 6) if spec['variant'] == 'nested' else logical_length(authored(spec, changed, typed=True)[-1]) - 5 - (0 if whole else 2)
        last = dict(field=names[0 if spec['shape'] == 'single' else 1], offset=last_offset)
    return dict(anchor=last if spec['backward'] else first, focus=first if spec['backward'] else last, collapsed=False)


class Meaning(HTMLParser):
    """Independent parser of recorded canonical strings, without browser code."""
    def __init__(self, value):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.result = []
        self.feed(value)

    def marks(self):
        return [mark for _, value in self.stack for mark in value]

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            append(self.result, '\n', self.marks(), 'break')
            return
        attrs = dict(attrs)
        if tag == 'span':
            values = []
            for item in attrs.get('style', '').split(';'):
                if ':' not in item:
                    continue
                prop, value = [part.strip() for part in item.split(':', 1)]
                value = {'#800000': 'rgb(128, 0, 0)', '#ffff00': 'rgb(255, 255, 0)'}.get(value, value)
                values.append((prop, value))
            marks = ['style(' + ';'.join(key + ':' + value for key, value in sorted(values)) + ')'] if values else []
        elif tag == 'a':
            marks = ['a' + json.dumps(sorted([list(value) for value in attrs.items()]), ensure_ascii=False, separators=(',', ':'))]
        else:
            marks = [{'strong': 'b', 'em': 'i', 'strike': 's', 'del': 's'}.get(tag, tag)]
        self.stack.append((tag, marks))

    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1][0] == tag, (tag, self.stack)
        self.stack.pop()

    def handle_data(self, data):
        for part in re.split(r'(\{\{(?:swatch|mention)\}\})', data):
            append(self.result, part, self.marks(), 'widget' if part in ['{{swatch}}', '{{mention}}'] else 'text')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--fixture', type=Path, default=Path('tests/browser/basic-mark-tools-parity-fixture.js'))
    parser.add_argument('--runner', type=Path, default=Path('scripts/parity/basic-mark-tools.mjs'))
    parser.add_argument('--native', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    opts = parser.parse_args()
    stored_bytes = opts.raw.read_bytes()
    raw_bytes = gzip.decompress(stored_bytes) if opts.raw.suffix == '.gz' else stored_bytes
    data = json.loads(raw_bytes)
    source = opts.candidate
    git = lambda *args: subprocess.check_output(['git', *args], cwd=Path.cwd())
    assert len(source) == 40 and git('rev-parse', source).decode().strip() == source
    assert data['headBefore'] == data['headAfter'] == source
    assert data['filter'] == ''
    assert data['group'] == 'code-marker'
    assert data['fixtureSha256'] == digest(opts.fixture.read_bytes())
    assert data['runnerSha256'] == digest(opts.runner.read_bytes())
    assert data['fixtureSha256'] == digest(git('show', source + ':' + opts.fixture.as_posix()))
    assert data['runnerSha256'] == digest(git('show', source + ':' + opts.runner.as_posix()))
    native_sources = ['tests/browser/native-code-marker.html', 'tests/browser/native-code-marker.js',
                      'tests/browser/physical-history.mjs', 'tests/browser/native-input-driver.js',
                      'tests/browser/regressions/harness.js']
    native_source_hashes = {}
    for path in native_sources:
        assert Path(path).read_text().replace('\r\n', '\n').encode() == git('show', source + ':' + path)
        native_source_hashes[path] = digest(git('show', source + ':' + path))
    assert data['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
    expected_sources = {'v1': V1, 'spec-baseline': SPEC, 'candidate': source}
    assert {entry['label']: entry['sha'] for entry in data['sources']} == expected_sources
    assert [row['source'] for row in data['results']] == ['v1', 'spec-baseline', 'candidate']
    source_hashes = 0
    for entry in data['sources']:
        assert entry['tree'] == git('rev-parse', entry['sha'] + '^{tree}').decode().strip()
        for path, expected in entry['loaded'].items():
            assert not path.startswith('/') and '..' not in Path(path).parts
            assert digest(git('show', entry['sha'] + ':' + path)) == expected, path
            source_hashes += 1
            if entry['label'] == 'candidate':
                assert digest(git('show', INTEGRATION + ':' + path)) == expected, ('Runtime differs from integration', path)
    runtime_paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'package.json', 'package-lock.json']
    assert git('diff', '--name-only', INTEGRATION, source, '--', *runtime_paths) == b''
    integration_bytes = gzip.decompress((Path(__file__).parent / 'integration-manifest.json.gz').read_bytes())
    assert digest(integration_bytes) == INTEGRATION_MANIFEST_SHA256
    integration = json.loads(integration_bytes)
    assert integration['source']['head'] == INTEGRATION
    assert integration['source']['dirty'] is False and integration['sourceUnchanged'] is True
    assert integration['outcome'] == 'passed' and len(integration['gates']) == 20
    assert all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True for gate in integration['gates'].values())
    dependencies = Path('node_modules')
    for path, expected in data['dependencyFiles'].items():
        assert '..' not in Path(path).parts and not Path(path).is_absolute()
        assert digest((dependencies / path).read_bytes()) == expected, path
    for name, expected in data['dependencyVersions'].items():
        assert json.loads((dependencies / name / 'package.json').read_text())['version'] == expected
    assert data['serverErrors'] == []
    expected_specs = cases()
    assert len(expected_specs) == 64
    native_bytes = opts.native.read_bytes()
    native_text = (gzip.decompress(native_bytes) if opts.native.suffix == '.gz' else native_bytes).decode()
    native_records = json.loads(native_text.splitlines()[-1])['native-code-marker.html']
    assert [record['name'] for record in native_records] == ['code/marker action ' + spec['id'] for spec in expected_specs]
    assert all(record['status'] == 'PASS' for record in native_records)
    all_summaries = []
    independent_checks = 0
    raw_verdicts = 0
    missing_visible = []
    for row in data['results']:
        assert row['pageErrors'] == row['inputErrors'] == []
        assert [entry['id'] for entry in row['cases']] == [entry['id'] for entry in expected_specs]
        failed = []
        incomplete = []
        for case, expected_spec in zip(row['cases'], expected_specs):
            assert case['spec'] == expected_spec
            assert case['observations']
            if row['source'] == 'v1':
                expected_count = 29 if expected_spec.get('lifetime') == 'destroy' else 28 if 'lifetime' in expected_spec else 14 if 'noop' in expected_spec else 44
            else:
                expected_count = 36 if expected_spec.get('lifetime') == 'destroy' else 34 if 'lifetime' in expected_spec else 42 if 'noop' in expected_spec else 48
            assert len(case['observations']) == expected_count, (row['source'], case['id'], len(case['observations']), expected_count)
            expected_plan = ['load', 'inactive-ui', 'live-action', 'undo', 'redo', 'dispose'] if 'lifetime' in expected_spec else ['load', 'input', 'prepare-redo', 'selection', 'apply', 'redo-input', 'undo-input', 'dispose'] if 'noop' in expected_spec else ['load', 'input', 'selection', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']
            assert case['planned'] == expected_plan
            assert case['diagnostics'] == []
            if case['completedPhases'] != expected_plan:
                incomplete.append(case['id'])
                assert row['source'] == 'v1' and case['spec'].get('noop') == 'atomic'
                assert case['completedPhases'] == expected_plan[:4]
                assert case['error'].splitlines()[0] == 'Error: Named public toolbar action is not visible'
                assert any(value['property'] == 'atomicOnlyToolbarActivation' for value in case['unsupported'])
            else:
                assert case['error'] is None
            seen = set()
            observations = {}
            for observation in case['observations']:
                key = observation['phase'], observation['property']
                assert key not in seen, (case['id'], key)
                seen.add(key); observations[key] = observation
                assert 'actual' in observation and 'expected' in observation
                verdict = 'PASS' if exact(observation['actual'], observation['expected']) else 'FAIL'
                assert observation['status'] == verdict, (row['source'], case['id'], key, observation['status'], verdict)
                raw_verdicts += 1
                if key[1] in ['fixedInputMeaning', 'independentPrecedingEdit', 'exactInitialEndpoints', 'fixedWidgetPayload']:
                    assert verdict == 'PASS', (row['source'], case['id'], 'invalid precondition', key)
                if verdict == 'FAIL':
                    failed.append(dict(case=case['id'], phase=key[0], property=key[1]))
            if row['source'] != 'candidate':
                continue
            assert case['unsupported'] == []
            spec = case['spec']
            expected_input = [] if 'lifetime' in spec else [dict(type='input', inputType='insertText', trusted=True)]
            key_count = 2 if 'lifetime' in spec else 3 if 'noop' in spec else 4
            assert case['trusted'] == expected_input + [dict(type='keydown', key='z', trusted=True)] * key_count
            button = 'trustedLiveButton' if 'lifetime' in spec else 'trustedNamedButton'
            button_phase = 'live-action' if 'lifetime' in spec else 'apply'
            assert observations[(button_phase, button)]['actual'] is True
            if 'lifetime' not in spec:
                for prop in ['liveWidgetIdentity', 'liveWidgetPayloadAndMarkup', 'liveWidgetAttributes']:
                    assert ('apply', prop) in observations
                assert observations[('apply', 'liveWidgetIdentity')]['actual'] is True
            independent_checks += 1
            for (phase, property_name), observation in observations.items():
                expected = None
                if property_name == 'fixedInputMeaning':
                    value = authored(spec)
                    expected = value[0] if 'lifetime' in spec else value
                elif property_name == 'independentPrecedingEdit':
                    expected = authored(spec, typed=True)
                elif property_name == 'intendedTextAndMarks':
                    expected = authored(spec, changed=not spec.get('noop'), typed=not spec.get('noop'))
                elif property_name == 'liveCapabilityStillWorks':
                    expected = authored(spec, changed=True)[0]
                elif property_name in ['selection', 'exactInitialEndpoints']:
                    expected = selected(spec, changed=phase in ['apply', 'redo-action', 'live-action', 'redo'])
                elif property_name == 'visibleTextAndMarks':
                    changed = phase in ['apply', 'redo-action', 'live-action', 'redo'] and not spec.get('noop')
                    typed = phase in ['input', 'undo-action', 'redo-input', 'redo-action', 'apply'] and 'lifetime' not in spec
                    if spec.get('noop'):
                        typed = phase in ['input', 'redo-input']
                    value = authored(spec, changed=changed, typed=typed)
                    expected = value[0] if 'lifetime' in spec else value
                elif property_name == 'visibleWidgets':
                    widgets = [dict(id='swatch', type='color', value='#aBcDef', label='#aBcDef', dot='rgb(171, 205, 239)', contenteditable='false'), dict(id='mention', type='mention', value='ada', label='@Ada', dot=None)]
                    expected = widgets if 'lifetime' in spec else [widgets] + ([[]] if spec.get('shape') in ['cross', 'fields'] else [])
                if expected is not None:
                    assert exact(observation['actual'], expected), (case['id'], phase, property_name, observation['actual'], expected)
                    assert exact(observation['expected'], expected), (case['id'], phase, property_name, 'fixture expectation')
                    independent_checks += 1
            tool_name = 'inline.' + spec['tool']
            native = dict(action='commit', origin='native-input', name='native-input')
            action = dict(action='commit', origin='user', name=tool_name)
            undo_tool = dict(action='undo', origin='history', name=tool_name)
            redo_tool = dict(action='redo', origin='history', name=tool_name)
            undo_native = dict(action='undo', origin='history', name='native-input')
            redo_native = dict(action='redo', origin='history', name='native-input')
            expected_transactions = [action, undo_tool, redo_tool] if 'lifetime' in spec else [native, undo_native, redo_native, undo_native] if 'noop' in spec else [native, action, undo_tool, undo_native, redo_native, redo_tool]
            assert case['transactions'] == expected_transactions
            independent_checks += 1
            live_checks = [key[0] for key in observations if key[1] == 'visibleTextAndMarks']
            wanted_live_phases = ['load', 'inactive-ui', 'live-action', 'undo', 'redo'] if 'lifetime' in spec else ['load', 'input', 'prepare-redo', 'apply', 'redo-input', 'undo-input'] if 'noop' in spec else ['load', 'input', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action']
            if live_checks != wanted_live_phases:
                missing_visible.append(case['id'])
            if live_checks:
                assert live_checks == wanted_live_phases
                assert [key[0] for key in observations if key[1] == 'visibleWidgets'] == wanted_live_phases
            for (phase, property_name), observation in observations.items():
                if property_name not in ['exactCanonicalDocument', 'canonicalNoop', 'originalRedoPreserved', 'onlyOriginalEditWasUndoable', 'retainedButtonCannotAuthor']:
                    continue
                states = observation['actual']
                typed = 'lifetime' not in spec and phase not in ['prepare-redo', 'undo-input', 'apply']
                changed = phase in ['redo-action', 'redo']
                if spec.get('noop'):
                    changed = False
                strings = [states[0]['data']['text'], states[0]['data']['caption']] if spec.get('shape') == 'fields' else [block['data']['text'] for block in states]
                assert [Meaning(value).result for value in strings] == authored(spec, changed=changed, typed=typed), (case['id'], phase, 'canonical independent meaning')
                assert [block['id'] for block in states] == (['same-id'] if 'lifetime' in spec else ['a', 'b'] if spec.get('shape') == 'cross' else ['a'])
                assert all(block['dataVersion'] == (1 if spec.get('shape') == 'fields' else 2) for block in states)
                assert states[0]['inline'] == {'swatch': dict(type='color', dataVersion=1, data=COLOR), 'mention': dict(type='mention', dataVersion=1, data=MENTION)}
                assert all(not block.get('inline') for block in states[1:])
                assert [block['type'] for block in states] == (['quote'] if spec.get('shape') == 'fields' else ['paragraph'] * len(states))
                independent_checks += 1
        if row['source'] == 'candidate':
            assert not failed and not incomplete
        all_summaries.append(dict(source=row['source'], cases=len(row['cases']), observations=sum(len(case['observations']) for case in row['cases']), failed=len(failed), incomplete=incomplete, failuresByProperty=dict(collections.Counter(item['property'] for item in failed))))
    assert [row['observations'] for row in all_summaries] == [2634, 2996, 2996]
    assert [row['failed'] for row in all_summaries] == [272, 336, 0]
    assert missing_visible == []
    assert data['candidatePass'] is True
    assert opts.raw.read_bytes() == stored_bytes
    report = dict(status='PASS', reviewedSource=source, rawSha256=digest(raw_bytes),
                  python=sys.version, integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_MANIFEST_SHA256,
                  byteIdenticalRuntime=True, nativeCases=len(native_records), nativeSha256=digest(native_bytes),
                  nativeSourceHashes=native_source_hashes,
                  scriptSha256=digest(Path(__file__).read_bytes()), sourceFilesChecked=source_hashes,
                  dependencyFilesChecked=len(data['dependencyFiles']), dependencyVersionsChecked=len(data['dependencyVersions']),
                  rawVerdictsRecomputed=raw_verdicts, independentlyRebuiltOracleChecks=independent_checks,
                  summaries=all_summaries, missingVisibleOracleCases=missing_visible,
                  reviewScope='Separate manual character/mark model extended from the frozen basic-mark verifier to Code/Marker; no production toggle, normalizer or browser fixture import. Author verification, not a separate-agent review.')
    opts.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
