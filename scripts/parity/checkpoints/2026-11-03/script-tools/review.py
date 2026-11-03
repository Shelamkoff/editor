#!/usr/bin/env python3
"""Script-tool manual character/mark model extended from the frozen common-tool oracle.

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

INTEGRATION = 'e2053f58258dcea153d16faae42e9d03c644e795'
INTEGRATION_MANIFEST_SHA256 = 'e030e75826986a8e3c6c8d0b75d657caa6815be632a8bbcb178f8fc79c11bc8e'
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
    target = spec['tag']
    edge = 'i'
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


def cases():
    result = []
    for mode in ['sup', 'sub', 'none']:
        for tag in ['sup', 'sub'] if mode == 'none' else [mode]:
            for variant in ['apply', 'mixed', 'nested']:
                if mode == 'none' and variant == 'apply': continue
                for shape in ['single'] if variant == 'nested' else ['single', 'cross', 'fields']:
                    for boundary in ['Text', 'Element']:
                        for backward in [False, True]:
                            result.append(dict(id='/'.join(['script', mode, tag, variant, shape, boundary, 'backward' if backward else 'forward']),
                                               tool='script', variant=variant, shape=shape, boundary=boundary, backward=backward, mode=mode, tag=tag))
            for backward in [False, True]:
                result.append(dict(id='/'.join(['script', mode, tag, 'noop', 'atomic', 'backward' if backward else 'forward']),
                                   tool='script', noop='atomic', shape='single', boundary='Element', backward=backward, mode=mode, tag=tag))
            for lifetime in ['read-only', 'destroy']:
                result.append(dict(id='/'.join(['script', mode, tag, 'lifetime', lifetime]), tool='script', lifetime=lifetime, mode=mode, tag=tag))
    assert len(result) == 104
    for tag in ['sup', 'sub']:
        for shape in ['single', 'cross', 'fields']:
            for boundary in ['Text', 'Element']:
                for backward in [False, True]:
                    result.append(dict(id='/'.join(['script', 'host', tag, 'apply', shape, boundary, 'backward' if backward else 'forward']),
                                       tool='script', variant='apply', shape=shape, boundary=boundary, backward=backward, mode=tag, tag=tag, hostTag=tag))
    assert len(result) == 128
    return result

def verify_candidate(case):
    spec = case['spec']
    semantic_checks = 0
    assert case['error'] is None and case['diagnostics'] == case['unsupported'] == []
    assert case['completedPhases'] == case['planned']
    count = 39 if spec.get('lifetime') == 'destroy' else 37 if 'lifetime' in spec else 45 if 'noop' in spec else 51
    if 'hostTag' in spec: count += 1
    assert len(case['observations']) == count, (case['id'], len(case['observations']), count)
    observations = {(item['phase'], item['property']): item for item in case['observations']}
    assert len(observations) == count
    button_phase = 'live-action' if 'lifetime' in spec else 'apply'
    for property in ['auxiliaryPanelFocus', 'trustedPanelAction', 'acceptedPanelClosed']:
        assert observations[(button_phase, property)]['actual'] is True and observations[(button_phase, property)]['expected'] is True
        semantic_checks += 1
    for (phase, property), item in observations.items():
        assert item['status'] == 'PASS' and exact(item['actual'], item['expected']), (case['id'], phase, property)
        expected = None
        if property == 'fixedInputMeaning':
            value = authored(spec); expected = value[0] if 'lifetime' in spec else value
        elif property == 'independentPrecedingEdit': expected = authored(spec, typed=True)
        elif property == 'intendedTextAndMarks': expected = authored(spec, changed=not spec.get('noop'), typed=not spec.get('noop'))
        elif property == 'liveCapabilityStillWorks': expected = authored(spec, changed=True)[0]
        elif property in ['selection', 'exactInitialEndpoints']:
            expected = selected(spec, changed=phase in ['apply', 'redo-action', 'live-action', 'redo'])
        elif property == 'visibleTextAndMarks':
            changed = phase in ['apply', 'redo-action', 'live-action', 'redo'] and not spec.get('noop')
            typed = phase in ['input', 'undo-action', 'redo-input', 'redo-action', 'apply'] and 'lifetime' not in spec
            if spec.get('noop'): typed = phase in ['input', 'redo-input']
            value = authored(spec, changed=changed, typed=typed); expected = value[0] if 'lifetime' in spec else value
        elif property == 'visibleWidgets':
            widgets = [dict(id='swatch', type='color', value='#aBcDef', label='#aBcDef', dot='rgb(171, 205, 239)', contenteditable='false'),
                       dict(id='mention', type='mention', value='ada', label='@Ada', dot=None)]
            expected = widgets if 'lifetime' in spec else [widgets] + ([[]] if spec.get('shape') in ['cross', 'fields'] else [])
        elif property in ['liveWidgetIdentity', 'trustedNamedButton', 'trustedLiveButton', 'trustedInsert']: expected = True
        elif property in ['producerCalls', 'currentProducerOnce']: expected = 1
        elif property in ['oldProducerSilent', 'currentProducerSilent', 'retiredProducerStillSilent']: expected = 0
        elif property == 'retainedButtonCannotChangeHistory': expected = [False, False]
        elif property == 'noCompletedAction': expected = []
        elif property == 'applicationHostBoundary': expected = dict(same=True, tag=spec['hostTag'], marker='outside')
        elif property == 'history':
            if 'lifetime' in spec: expected = dict(load=[False, False], undo=[False, True], redo=[True, False])[phase]
            elif 'noop' in spec:
                undo, redo = dict(load=(False, False), **{'prepare-redo': (False, True), 'apply': (False, True), 'redo-input': (True, False), 'undo-input': (False, True)})[phase]
                expected = dict(canUndo=undo, canRedo=redo)
            else:
                undo, redo = dict(load=(False, False), apply=(True, False), **{'undo-action': (True, True), 'undo-input': (False, True), 'redo-input': (True, True), 'redo-action': (True, False)})[phase]
                expected = dict(canUndo=undo, canRedo=redo)
        if expected is not None:
            assert exact(item['actual'], expected) and exact(item['expected'], expected), (case['id'], phase, property, item['actual'], expected)
            semantic_checks += 1
        if property in ['exactCanonicalDocument', 'canonicalNoop', 'originalRedoPreserved', 'onlyOriginalEditWasUndoable', 'retainedButtonCannotAuthor']:
            states = item['actual']
            typed = 'lifetime' not in spec and phase not in ['prepare-redo', 'undo-input', 'apply']
            changed = phase in ['redo-action', 'redo'] and not spec.get('noop')
            strings = [states[0]['data']['text'], states[0]['data']['caption']] if spec.get('shape') == 'fields' else [block['data']['text'] for block in states]
            assert [Meaning(value).result for value in strings] == authored(spec, changed=changed, typed=typed)
            assert [block['id'] for block in states] == (['same-id'] if 'lifetime' in spec else ['a', 'b'] if spec.get('shape') == 'cross' else ['a'])
            assert all(block['dataVersion'] == (1 if spec.get('shape') == 'fields' else 2) for block in states)
            assert states[0]['inline'] == dict(swatch=dict(type='color', dataVersion=1, data=COLOR), mention=dict(type='mention', dataVersion=1, data=MENTION))
            assert all(not block.get('inline') for block in states[1:])
            assert [block['type'] for block in states] == (['quote'] if spec.get('shape') == 'fields' else ['paragraph'] * len(states))
            semantic_checks += 1
    native = dict(action='commit', origin='native-input', name='native-input')
    action = dict(action='commit', origin='user', name='inline.script')
    undo_tool = dict(action='undo', origin='history', name='inline.script')
    redo_tool = dict(action='redo', origin='history', name='inline.script')
    undo_native = dict(action='undo', origin='history', name='native-input')
    redo_native = dict(action='redo', origin='history', name='native-input')
    expected = [action, undo_tool, redo_tool] if 'lifetime' in spec else [native, undo_native, redo_native, undo_native] if 'noop' in spec else [native, action, undo_tool, undo_native, redo_native, redo_tool]
    assert exact(case['transactions'], expected), (case['id'], case['transactions'], expected)
    trusted = [] if 'lifetime' in spec else [dict(type='input', inputType='insertText', trusted=True)]
    trusted += [dict(type='keydown', key='z', trusted=True)] * (2 if 'lifetime' in spec else 3 if 'noop' in spec else 4)
    assert exact(case['trusted'], trusted)
    return semantic_checks + 2

INTEGRATION_BROWSER_SHA256 = '8e4d4d7eaa4703c65ece7dcedfeec757ce4d8c2a6738728cdc963108c9826d80'
INTEGRATION_NATIVE_SHA256 = {"sup":"163d15e6ea4fa2d4a24dec3c4b2ba39affaa7c3de13a54ee6879942f587271e4","sub":"b676ea593978b062d10597ec91aebebc79a91b134d531285422fc8f0f4041c19","none":"a0fc17e4026d208826d4f519ac3c3b542495c347e32e1387751d4127a3f3f2a8","host":"2e555387406d554d5798e0a4d8f66bec4f49bab6375ee0fbde182ac041692d86"}
RED_SOURCE = 'bf2ad7a52118bbff059d70c8c5841cebf038e2d7'
RED_RAW_SHA256 = '51e6c247cb309a98b5e8987c3f36b494e73a1fee55dfa4032dc76b2d2b4e2601'
HOST_RED_SOURCE = '369a52be147390398da02ec7f0753ea21593b539'
HOST_RED_RAW_SHA256 = 'f7989b04791f9932d1947bc1a1afccdb2e26527343118939d585f299d12daa06'

def git_blobs(queries):
    queries = sorted(set(queries))
    value = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(queries) + '\n').encode())
    result = {}; offset = 0
    for query in queries:
        end = value.index(b'\n', offset)
        header = value[offset:end].split()
        assert len(header) == 3 and header[1] == b'blob', query
        size = int(header[2]); offset = end + 1
        result[query] = value[offset:offset + size]; offset += size
        assert value[offset:offset + 1] == b'\n'; offset += 1
    assert offset == len(value)
    return result

def main():
    parser = argparse.ArgumentParser()
    for name in ['raw', 'browser', 'native-sup', 'native-sub', 'native-none', 'native-host', 'output']: parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    opts = parser.parse_args()
    source = opts.candidate
    root = Path(__file__).parent
    stored = opts.raw.read_bytes(); raw_bytes = gzip.decompress(stored) if opts.raw.suffix == '.gz' else stored
    data = json.loads(raw_bytes)
    assert data['headBefore'] == data['headAfter'] == source and data['filter'] == '' and data['group'] == 'script'
    assert data['candidatePass'] is True and data['serverErrors'] == []
    assert {entry['label']: entry['sha'] for entry in data['sources']} == dict(v1=V1, **{'spec-baseline': SPEC}, candidate=source)
    specs = cases(); assert len(specs) == 128
    candidate = data['results'][2]
    assert [case['spec'] for case in candidate['cases']] == specs
    semantic_checks = sum(verify_candidate(case) for case in candidate['cases'])
    assert sum(len(case['observations']) for case in candidate['cases']) == 6400
    git = lambda *args: subprocess.check_output(['git', *args])
    runner = 'scripts/parity/script-tools.mjs'; fixture = 'tests/browser/basic-mark-tools-parity-fixture.js'
    reviewer = 'scripts/parity/checkpoints/2026-11-03/script-tools/review.py'
    native_sources = ['tests/browser/native-script-tools.js', 'tests/browser/physical-history.mjs', 'tests/browser/native-input-driver.js',
                      'tests/browser/script-panel.js', 'tests/browser/regressions/harness.js', fixture] + [
                      'tests/browser/native-script-tools-' + mode + '.html' for mode in ['sup', 'sub', 'none']] + ['tests/browser/native-script-host.html']
    red_bytes = gzip.decompress((root / 'source-red.json.gz').read_bytes())
    assert digest(red_bytes) == RED_RAW_SHA256
    red = json.loads(red_bytes)
    host_red_bytes = gzip.decompress((root / 'host-red.json.gz').read_bytes())
    assert digest(host_red_bytes) == HOST_RED_RAW_SHA256
    host_red = json.loads(host_red_bytes)
    assert host_red['headBefore'] == host_red['headAfter'] == HOST_RED_SOURCE and host_red['candidatePass'] is False
    assert host_red['filter'] == 'script/host/' and host_red['group'] == 'script'
    assert red['headBefore'] == red['headAfter'] == RED_SOURCE and red['candidatePass'] is False
    assert red['filter'] == 'script/sup/sup' and red['group'] == 'script'
    queries = [source + ':' + path for path in [runner, fixture, reviewer, *native_sources]]
    queries += [INTEGRATION + ':' + path for path in native_sources]
    for corpus in [data, red, host_red]:
        for entry in corpus['sources']:
            queries += [entry['sha'] + ':' + path for path in entry['loaded']]
            if corpus is data and entry['label'] == 'candidate': queries += [INTEGRATION + ':' + path for path in entry['loaded']]
    queries += [RED_SOURCE + ':' + runner, RED_SOURCE + ':' + fixture]
    queries += [HOST_RED_SOURCE + ':' + runner, HOST_RED_SOURCE + ':' + fixture]
    blobs = git_blobs(queries)
    assert Path(__file__).read_bytes() == blobs[source + ':' + reviewer]
    assert Path(runner).read_bytes() == blobs[source + ':' + runner] and Path(fixture).read_bytes() == blobs[source + ':' + fixture]
    assert data['runnerSha256'] == digest(blobs[source + ':' + runner]) and data['fixtureSha256'] == digest(blobs[source + ':' + fixture])
    assert red['runnerSha256'] == digest(blobs[RED_SOURCE + ':' + runner]) and red['fixtureSha256'] == digest(blobs[RED_SOURCE + ':' + fixture])
    assert host_red['runnerSha256'] == digest(blobs[HOST_RED_SOURCE + ':' + runner]) and host_red['fixtureSha256'] == digest(blobs[HOST_RED_SOURCE + ':' + fixture])
    for path in native_sources:
        assert blobs[source + ':' + path] == blobs[INTEGRATION + ':' + path]
        assert Path(path).read_bytes().replace(b'\r\n', b'\n') == blobs[source + ':' + path]
    runtime_paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts', 'package.json', 'package-lock.json']
    assert git('diff', '--name-only', INTEGRATION, source, '--', *runtime_paths) == b''
    integration_bytes = gzip.decompress((root / 'integration-manifest.json.gz').read_bytes())
    assert digest(integration_bytes) == INTEGRATION_MANIFEST_SHA256
    integration = json.loads(integration_bytes)
    assert integration['source']['head'] == INTEGRATION and integration['source']['dirty'] is False and integration['sourceUnchanged'] is True
    assert integration['outcome'] == 'passed' and len(integration['gates']) == 28
    assert all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True for gate in integration['gates'].values())
    browser_stored = opts.browser.read_bytes(); browser_bytes = gzip.decompress(browser_stored) if opts.browser.suffix == '.gz' else browser_stored
    assert digest(browser_bytes) == INTEGRATION_BROWSER_SHA256
    browser_text = browser_bytes.decode()
    environment = json.loads(browser_text.splitlines()[0].split('Browser environment: ', 1)[1])
    assert data['browser'] == environment['product'].split('/', 1)[1] and data['node'] == integration['environment']['node']
    assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ', browser_text, re.M)) == 48
    panel_cases = json.JSONDecoder().raw_decode(browser_text.split('script-panel.html: ', 1)[1].lstrip())[0]
    assert len(panel_cases) == len({case['name'] for case in panel_cases}) == 21 and all(case['status'] == 'PASS' for case in panel_cases)
    wanted = ['a retired Script panel cannot change data or close its replacement panel', 'a read-only round trip cannot revive retained Script panel buttons',
              'Normal on unformatted text closes its accepted panel without manufacturing history']
    wanted += [f'Script {mode} removes the same Alpha selection through {boundary} boundaries' for mode in ['sup', 'sub'] for boundary in ['Text', 'Element']]
    assert set(wanted) <= {case['name'] for case in panel_cases}
    native_hashes = {}
    for mode, path in [('sup', opts.native_sup), ('sub', opts.native_sub), ('none', opts.native_none), ('host', opts.native_host)]:
        value = path.read_bytes(); value = gzip.decompress(value) if path.suffix == '.gz' else value
        assert digest(value) == INTEGRATION_NATIVE_SHA256[mode]
        page = 'native-script-host.html' if mode == 'host' else 'native-script-tools-' + mode + '.html'
        records = json.loads(value.decode().splitlines()[-1])[page]
        wanted_specs = [spec for spec in specs if 'hostTag' in spec] if mode == 'host' else [spec for spec in specs if 'hostTag' not in spec and spec['mode'] == mode]
        assert [row['name'] for row in records] == ['Script action ' + spec['id'] for spec in wanted_specs]
        assert all(row['status'] == 'PASS' for row in records); native_hashes[mode] = digest(value)
    assert data['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
    expected_sources = dict(v1=V1, **{'spec-baseline': SPEC}, candidate=source)
    assert {entry['label']: entry['sha'] for entry in data['sources']} == expected_sources
    modules = 0
    for corpus in [data, red, host_red]:
        for entry in corpus['sources']:
            assert entry['tree'] == git('rev-parse', entry['sha'] + '^{tree}').decode().strip()
            for path, expected in entry['loaded'].items():
                assert not Path(path).is_absolute() and '..' not in Path(path).parts
                assert digest(blobs[entry['sha'] + ':' + path]) == expected
                if corpus is data:
                    modules += 1
                    if entry['label'] == 'candidate': assert digest(blobs[INTEGRATION + ':' + path]) == expected
    for path, expected in data['dependencyFiles'].items():
        assert '..' not in Path(path).parts and not Path(path).is_absolute()
        assert digest((Path('node_modules') / path).read_bytes()) == expected
    for name, expected in data['dependencyVersions'].items(): assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == expected
    summaries = []
    for row in data['results']:
        assert row['pageErrors'] == row['inputErrors'] == []
        assert [case['spec'] for case in row['cases']] == specs
        failures = []; incomplete = []
        for case in row['cases']:
            if case['error'] is not None or case['completedPhases'] != case['planned']: incomplete.append(case['id'])
            if row['source'] == 'candidate': assert case['error'] is None and not incomplete
            for item in case['observations']:
                status = 'PASS' if exact(item['actual'], item['expected']) else 'FAIL'
                assert item['status'] == status
                if item['property'] in ['fixedInputMeaning', 'fixedWidgetPayload', 'independentPrecedingEdit', 'exactInitialEndpoints']: assert status == 'PASS'
                if status == 'FAIL': failures.append(item['property'])
        summaries.append(dict(source=row['source'], cases=len(row['cases']), observations=sum(len(case['observations']) for case in row['cases']),
                              failedObservations=len(failures), incomplete=incomplete, failuresByProperty=dict(collections.Counter(failures)),
                              unsupported=sum(len(case['unsupported']) for case in row['cases'])))
    red_failures = []
    assert len(red['results'][2]['cases']) == 32
    assert [case['spec'] for case in red['results'][2]['cases']] == [spec for spec in specs if spec['id'].startswith('script/sup/sup/')]
    for case in red['results'][2]['cases']:
        assert case['error'] is None and case['planned'] == case['completedPhases']
        failed = [item for item in case['observations'] if item['status'] == 'FAIL']
        if not failed:
            verify_candidate(case); continue
        assert case['spec']['variant'] == 'mixed' and case['spec']['boundary'] == 'Element'
        assert [(item['phase'], item['property']) for item in failed] == [('apply', 'intendedTextAndMarks'), ('apply', 'visibleTextAndMarks'),
                                                                       ('redo-action', 'intendedTextAndMarks'), ('redo-action', 'visibleTextAndMarks')]
        for item in failed:
            assert exact(item['expected'], authored(case['spec'], changed=True, typed=True))
            assert not exact(item['actual'], item['expected'])
        red_failures.append(case['id'])
    assert len(red_failures) == 6
    assert [case['spec'] for case in host_red['results'][2]['cases']] == [spec for spec in specs if 'hostTag' in spec]
    for case in host_red['results'][2]['cases']:
        assert case['error'] is None and case['completedPhases'] == case['planned']
        items = {(item['phase'], item['property']): item for item in case['observations']}
        intended = items[('apply', 'intendedTextAndMarks')]
        assert intended['status'] == 'FAIL'
        assert exact(intended['actual'], authored(case['spec'], changed=False, typed=True))
        assert exact(intended['expected'], authored(case['spec'], changed=True, typed=True))
        assert exact(items[('apply', 'applicationHostBoundary')]['actual'], dict(same=True, tag=case['spec']['hostTag'], marker='outside'))
    assert sum(item['status'] == 'FAIL' for case in host_red['results'][2]['cases'] for item in case['observations']) == 288
    assert opts.raw.read_bytes() == stored
    report = dict(status='PASS', candidate=source, rawSha256=digest(raw_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_MANIFEST_SHA256, byteIdenticalRuntime=True,
                  browser=data['browser'], nativeCases=128, manualCandidateObservations=6400, manuallyRebuiltSemanticChecks=semantic_checks,
                  ordinaryPages=48, ordinaryScriptPanelCases=21, nativeSha256=native_hashes, sourceModulesVerified=modules,
                  dependencyFilesVerified=len(data['dependencyFiles']), dependencyVersionsVerified=len(data['dependencyVersions']),
                  sourceRed=dict(source=RED_SOURCE, rawSha256=RED_RAW_SHA256, cases=32, failedObservations=24, failedCases=red_failures),
                  hostRed=dict(source=HOST_RED_SOURCE, rawSha256=HOST_RED_RAW_SHA256, cases=24, failedCases=24, failedObservations=288),
                  summaries=summaries, rows=['TOOL_SCRIPT_ACTION', 'DEFECT_SCRIPT_PANEL'],
                  scope='Author verification by an independent character/mark/canonical/native-input/range/history/panel-focus and external-owner model. No runtime normalizer or browser fixture import. Original 28-gate integration and later comparative proof remain separate runs.')
    opts.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
    print(json.dumps(report))

if __name__ == '__main__': main()
