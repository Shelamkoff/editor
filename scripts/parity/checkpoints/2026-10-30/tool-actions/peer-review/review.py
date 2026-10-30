#!/usr/bin/env python3
"""Independent read-only audit of the immutable TOOL action differential."""
import argparse
import collections
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess

BASE = '69c8425e0081fde69cf5176ccb73d032720c15fc'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
SPEC = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
STYLE = 'style(background-color:rgb(255, 255, 0);color:rgb(128, 0, 0);font-size:24px)'
LINK = 'a[["href","/kept"],["rel","noopener noreferrer"]]'
COLOR = {'value': '#aBcDef'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def exact(left, right):
    return json.dumps(left, ensure_ascii=False, separators=(',', ':'), sort_keys=True) == json.dumps(right, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def cases():
    result = []
    for tool in ['clearFormatting', 'caseTransform']:
        for variant in ['mixed', 'upper'] if tool == 'caseTransform' else ['mixed']:
            for shape in ['single', 'cross', 'fields']:
                for boundary in ['Text', 'Element']:
                    for backward in [False, True]:
                        result.append(dict(id='/'.join([tool, variant, shape, boundary, 'backward' if backward else 'forward']), tool=tool, variant=variant, shape=shape, boundary=boundary, backward=backward))
        for noop in ['text', 'atomic']:
            for backward in [False, True]:
                result.append(dict(id='/'.join([tool, 'noop', noop, 'backward' if backward else 'forward']), tool=tool, noop=noop, shape='single', boundary='Element' if noop == 'atomic' else 'Text', backward=backward))
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
    """Manual text/mark oracle; does not consume fixture expectations."""
    lead, end = [], []
    prefix = 'X' if typed else ''
    if 'lifetime' in spec:
        append(lead, 'ABC' if changed and spec['tool'] == 'caseTransform' else 'Abc', () if changed and spec['tool'] == 'clearFormatting' else ['b'])
        append(lead, ' ')
        append(lead, '{{swatch}}', kind='widget')
        append(lead, ' Tail')
        return [lead]
    append(lead, prefix + 'un')
    if 'noop' in spec:
        if spec['noop'] == 'text':
            append(lead, '123!?🙂', ['b'] if spec['tool'] == 'caseTransform' else [])
            append(lead, ' ')
        append(lead, '{{swatch}}', kind='widget')
        if spec['noop'] == 'text':
            append(lead, ' ')
            append(lead, '678', [LINK])
        append(lead, ' rest')
        return [lead]
    lower = spec['variant'] == 'upper'
    whole = spec['boundary'] == 'Element'
    clear = changed and spec['tool'] == 'clearFormatting'
    if clear:
        if whole:
            append(lead, 'MiXeD')
        else:
            append(lead, 'Mi', ['b'])
            append(lead, 'XeD')
        append(lead, ' straße ΟΣ')
    else:
        first = ('mixed' if whole else 'MIxed') if changed and lower else ('MIXED' if whole else 'MiXED') if changed else 'MIXED' if lower else 'MiXeD'
        append(lead, first, ['b'])
        append(lead, ' ')
        word = 'strasse' if changed and lower else 'STRASSE' if changed or lower else 'straße'
        append(lead, word, ['b', 'code', 'i', 'mark', 's', STYLE, 'sub', 'sup'])
        append(lead, ' i\u0307ο' if changed and lower else ' İΟ' if lower else ' Ο', [STYLE])
        append(lead, 'ς' if changed and lower else 'Σ', ['b', STYLE])
    append(lead, '\n', kind='break')
    append(lead, 'tail' if changed and lower else 'TAIL' if (changed and not clear) or lower else 'Tail', [LINK] if clear else [LINK, 'i'])
    append(lead, ' ')
    append(lead, '{{swatch}}', kind='widget')
    if spec['shape'] == 'single':
        append(lead, ' ')
    if clear:
        append(end, 'BrAvO' if whole else 'BrA')
        if not whole:
            append(end, 'vO', ['b'])
    else:
        last = ('bravo' if whole else 'braVO') if changed and lower else ('BRAVO' if whole else 'BRAvO') if changed else 'BRAVO' if lower else 'BrAvO'
        append(end, last, ['b'])
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
        first = dict(field='a', offset=2 if spec['noop'] == 'atomic' else 3)
        last = dict(field='a', offset=3 if spec['noop'] == 'atomic' else 14)
    else:
        names = ['quote.text', 'quote.caption'] if spec['shape'] == 'fields' else ['a', 'b']
        first = dict(field=names[0], offset=3 if spec['boundary'] == 'Element' else 5)
        last = dict(field=names[0 if spec['shape'] == 'single' else 1], offset=logical_length(authored(spec, changed, typed=True)[-1]) - 5 - (2 if spec['boundary'] == 'Text' else 0))
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
        for part in re.split(r'(\{\{swatch\}\})', data):
            append(self.result, part, self.marks(), 'widget' if part == '{{swatch}}' else 'text')


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--repo', type=Path, required=True)
    args.add_argument('--raw', type=Path, required=True)
    args.add_argument('--output', type=Path, required=True)
    opts = args.parse_args()
    env = os.environ.copy()
    for name in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']:
        env.pop(name, None)
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_NO_REPLACE_OBJECTS='1')
    def git(*parts):
        return subprocess.check_output(['git', '-C', str(opts.repo), *parts], env=env)
    raw_bytes = opts.raw.read_bytes()
    data = json.loads(raw_bytes)
    source = data['headBefore']
    assert source == data['headAfter']
    allowed_paths = {'scripts/parity/tool-actions.mjs', 'tests/browser/native-tools.js', 'tests/browser/regressions/tool-actions.js', 'tests/browser/tool-actions-parity-fixture.js'}
    changed_paths = git('diff', '--name-only', BASE, source).decode().splitlines()
    assert set(changed_paths) <= allowed_paths, changed_paths
    assert data['fixtureSha256'] == digest(git('show', source + ':tests/browser/tool-actions-parity-fixture.js'))
    assert data['runnerSha256'] == digest(git('show', source + ':scripts/parity/tool-actions.mjs'))
    assert data['packageLockSha256'] == digest(git('show', source + ':package-lock.json'))
    expected_sources = {'v1': V1, 'spec-baseline': SPEC, 'candidate': source}
    assert {entry['label']: entry['sha'] for entry in data['sources']} == expected_sources
    source_hashes = 0
    for entry in data['sources']:
        assert git('rev-parse', entry['sha'] + '^{tree}').decode().strip() == entry['tree']
        for path, expected in entry['loaded'].items():
            assert digest(git('show', entry['sha'] + ':' + path)) == expected, (entry['label'], path)
            source_hashes += 1
    dependencies = opts.repo / 'node_modules'
    for path, expected in data['dependencyFiles'].items():
        assert digest((dependencies / path).read_bytes()) == expected, path
    for name, expected in data['dependencyVersions'].items():
        assert json.loads((dependencies / name / 'package.json').read_text())['version'] == expected
    assert data['serverErrors'] == []
    expected_specs = cases()
    assert len(expected_specs) == 48
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
                if verdict == 'FAIL':
                    failed.append(dict(case=case['id'], phase=key[0], property=key[1]))
            if row['source'] != 'candidate':
                continue
            assert case['unsupported'] == []
            spec = case['spec']
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
                    widget = dict(id='swatch', type='color', value='#aBcDef', label='#aBcDef', dot='rgb(171, 205, 239)', contenteditable='false')
                    expected = [widget] if 'lifetime' in spec else [[widget]] + ([[]] if spec.get('shape') in ['cross', 'fields'] else [])
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
                assert states[0]['inline'] == {'swatch': dict(type='color', dataVersion=1, data=COLOR)}
                assert all(not block.get('inline') for block in states[1:])
                assert [block['type'] for block in states] == (['quote'] if spec.get('shape') == 'fields' else ['paragraph'] * len(states))
                independent_checks += 1
        if row['source'] == 'candidate':
            assert not failed and not incomplete
        all_summaries.append(dict(source=row['source'], cases=len(row['cases']), observations=sum(len(case['observations']) for case in row['cases']), failed=len(failed), incomplete=incomplete, failuresByProperty=dict(collections.Counter(item['property'] for item in failed))))
    assert data['candidatePass'] is True
    assert opts.raw.read_bytes() == raw_bytes
    report = dict(status='PASS', reviewedSource=source, base=BASE, rawPath=str(opts.raw), rawSha256=digest(raw_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  sourceFilesChecked=source_hashes, dependencyFilesChecked=len(data['dependencyFiles']), dependencyVersionsChecked=len(data['dependencyVersions']),
                  rawVerdictsRecomputed=raw_verdicts, independentlyRebuiltOracleChecks=independent_checks, summaries=all_summaries,
                  missingVisibleOracleCases=missing_visible, productionChanges=0, mainRefWrites=0, runtimeSuitesRerun=0,
                  reviewScope='Independent source/hash/raw-verdict audit and manually rebuilt current text/marks/selection/transactions/canonical history oracle. Live projection scope requires the additional static review recorded in README.')
    opts.output.parent.mkdir(parents=True, exist_ok=True)
    opts.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key:report[key] for key in ['status','reviewedSource','rawVerdictsRecomputed','independentlyRebuiltOracleChecks','sourceFilesChecked','dependencyFilesChecked','dependencyVersionsChecked']}))


if __name__ == '__main__':
    main()
