#!/usr/bin/env python3
"""Reconstruct fixed Columns expectations without importing the JS fixture.

This is an audit of recorded evidence, not another browser test framework.
Only fresh generated IDs and measured pixel widths are accepted by properties;
all authored text, sidecars, layouts, history states and old failures are fixed.
"""
import argparse
import gzip
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

BASE = '69c8425e0081fde69cf5176ccb73d032720c15fc'
CANDIDATE = 'b7ac66388e44999d794368cd00a99b4057d41083'
PINS = {
    'v1': '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',
    'spec-baseline': 'e981ff308000c1d92d7e820df95113c1e19bcee8',
    'candidate': CANDIDATE,
}
RICH = [
    '<b>Alpha</b> {{leftMention}} {{leftColor}} tail',
    '<i>Bravo</i> {{middleMention}} {{middleColor}} tail',
    '<s>Charlie</s> {{rightMention}} {{rightColor}} tail',
]
IDS = ['left', 'middle', 'right']
LAYOUTS = {'1-1': [1, 1], '1-2': [1, 2], '2-1': [2, 1], '1-1-1': [1, 1, 1]}
CASES = ['reduce-rich-1-1', 'reduce-rich-1-2', 'reduce-rich-2-1', 'expand-1-1-1', 'empty-removed', 'empty-destination']
CHECKPOINT = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    data = Path(path).read_bytes()
    return gzip.decompress(data) if str(path).endswith('.gz') else data


def markup(text):
    class Parser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.nodes = []
            self.stack = [self.nodes]

        def handle_starttag(self, tag, attributes):
            children = []
            self.stack[-1].append({'tag': tag, 'attributes': dict(attributes), 'children': children})
            if tag != 'br':
                self.stack.append(children)

        def handle_endtag(self, tag):
            self.stack.pop()

        def handle_data(self, value):
            self.stack[-1].append(value)
    parser = Parser()
    parser.feed(text)
    return parser.nodes


def audit(repo, path):
    raw = read(path)
    data = json.loads(raw)
    git = lambda *args, **kwargs: subprocess.check_output(['git', '-C', str(repo), *args], **kwargs)
    assert data['headBefore'] == data['headAfter'] == CANDIDATE
    assert data['candidatePass'] is True and data['serverErrors'] == [] and data['filter'] == ''
    assert [source['label'] for source in data['sources']] == list(PINS)
    source_objects = {}
    modules = 0
    for source in data['sources']:
        label, sha = source['label'], source['sha']
        assert sha == PINS[label]
        if subprocess.run(['git', '-C', str(repo), 'cat-file', '-e', sha + '^{tree}'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            assert label == 'candidate', 'Pinned historical source is missing from this repository'
            # The published checkpoint retains a complete patch from reachable
            # BASE. A fresh index reconstructs the tree without a checkout edit.
            with tempfile.TemporaryDirectory() as temporary:
                environment = {**os.environ, 'GIT_INDEX_FILE': str(Path(temporary) / 'index')}
                git('read-tree', BASE, env=environment)
                git('apply', '--cached', '--binary', input=read(CHECKPOINT / 'sources/b7ac6638.patch.gz'), env=environment)
                tree = git('write-tree', env=environment).decode().strip()
        else:
            tree = git('rev-parse', sha + '^{tree}').decode().strip()
        assert tree == source['tree']
        source_objects[label] = tree
        for module, expected in source['loaded'].items():
            assert digest(git('show', tree + ':' + module)) == expected, (label, module)
            modules += 1
    for field, filename in [('runnerSha256', 'scripts/parity/columns-layout-parity.mjs'),
                            ('fixtureSha256', 'tests/browser/columns-layout-parity-fixture.js')]:
        assert digest(git('show', source_objects['candidate'] + ':' + filename)) == data[field]
    changed = set(git('diff', '--name-only', BASE, source_objects['candidate']).decode().splitlines())
    assert changed == {
        'scripts/parity/columns-layout-parity.mjs', 'tests/browser/columns-layout-parity-fixture.js',
        'tests/browser/native-plugin-parity.js', 'tests/browser/regressions/columns-layout-native.js',
    }, changed
    for name, version in data['dependencyVersions'].items():
        assert json.loads((repo / 'node_modules' / name / 'package.json').read_bytes())['version'] == version
    for filename, expected in data['dependencyFiles'].items():
        assert digest((repo / 'node_modules' / filename).read_bytes()) == expected, filename

    total_verdicts = 0
    total_phases = 0
    summary = []
    expected_ids = [f'COLUMNS_LAYOUT/{surface}/{case}' for surface in ['direct', 'menu'] for case in CASES]
    for result in data['results']:
        legacy = result['source'] == 'v1'
        assert result['errors'] == [] and result['incompleteCases'] == []
        assert [case['id'] for case in result['cases']] == expected_ids
        failures = []
        supported = 0
        for case in result['cases']:
            surface, name = case['id'].split('/')[1:]
            assert case['error'] is None
            if legacy and surface == 'menu':
                assert case['unsupported'] and case['observations'] == case['phases'] == case['completedPhases'] == case['trusted'] == []
                continue
            supported += 1
            assert not case.get('unsupported')
            observations = {}
            for observation in case['observations']:
                key = observation['phase'], observation['property']
                assert key not in observations
                observations[key] = observation
                verdict = 'PASS' if observation['actual'] == observation['expected'] else 'FAIL'
                assert observation['status'] == verdict, (case['id'], key)
                if verdict == 'FAIL':
                    failures.append({'id': case['id'], **observation})
                total_verdicts += 1
            def actual(phase, property):
                return observations[(phase, property)]['actual']

            expand = name != 'expand-1-1-1'
            initial_layout = '1-1-1' if expand else '1-1'
            original = RICH.copy() if expand else RICH[:2]
            if name == 'empty-removed':
                original[2] = ''
            if name == 'empty-destination':
                original[1] = ''
            target = name.removeprefix('reduce-rich-') if name.startswith('reduce-rich-') else {
                'expand-1-1-1': '1-1-1', 'empty-removed': '1-2', 'empty-destination': '2-1',
            }[name]
            typed = [original[0] + 'X', *original[1:]]
            if name == 'expand-1-1-1':
                changed_text = [typed[0], typed[1], '']
            elif name == 'empty-removed':
                changed_text = typed[:2]
            elif name == 'empty-destination':
                changed_text = [typed[0], typed[2]]
            else:
                changed_text = [typed[0], typed[1] + '<br>' + typed[2]]
            final_text = [changed_text[0], changed_text[1], ''] if expand else changed_text
            phases = ['load', 'input', 'layout'] + (['expand', 'undo-expand'] if expand else [])
            phases += ['undo-layout', 'undo-input', 'redo-input', 'redo-layout'] + (['redo-expand'] if expand else [])
            assert [phase['phase'] for phase in case['phases']] == phases
            assert case['completedPhases'] == phases + ['retired-control']
            original_phases = {'load', 'input', 'undo-layout', 'undo-input', 'redo-input'}
            final_phases = {'expand', 'redo-expand'}
            records = {}
            new_id = None
            expected_inline = {}
            for prefix, name_value, person_id, color in [('left', 'Ada', 'ada', '#123456'), ('middle', 'Grace', 'grace', '#654321'), ('right', 'Linus', 'linus', '#abcdef')]:
                for suffix, kind, value in [('Mention', 'mention', {'id': person_id, 'name': name_value}), ('Color', 'color', {'value': color})]:
                    token = prefix + suffix
                    if any('{{' + token + '}}' in text for text in original):
                        expected_inline[token] = {'type': kind, **({} if legacy else {'dataVersion': 1}), 'data': value}
            for index, phase in enumerate(case['phases']):
                label = phase['phase']
                if label in {'load', 'undo-input'}:
                    texts, layout = original, initial_layout
                elif label in original_phases:
                    texts, layout = typed, initial_layout
                elif label in final_phases:
                    texts, layout = final_text, '1-1-1'
                else:
                    texts, layout = changed_text, target
                assert len(phase['blocks']) == 1
                block = phase['blocks'][0]
                columns = block['data']['columns']
                assert [column['content'] for column in columns] == texts, (case['id'], label)
                assert block['id'] == 'columns' and block['type'] == 'columns' and block['data']['layout'] == layout
                assert block['inline'] == expected_inline
                if legacy:
                    assert all(set(column) == {'content'} for column in columns)
                    assert 'dataVersion' not in block
                else:
                    assert block['dataVersion'] == 2
                    column_ids = [column['id'] for column in columns]
                    assert column_ids[:2] == IDS[:2] and len(set(column_ids)) == len(column_ids)
                    if len(columns) == 3:
                        if label in original_phases and expand:
                            assert column_ids[2] == 'right'
                        else:
                            assert isinstance(column_ids[2], str) and column_ids[2] and column_ids[2] not in IDS
                            if new_id is None:
                                new_id = column_ids[2]
                            assert column_ids[2] == new_id
                    assert actual(label, 'completedActions') == index
                history = {
                    'canUndo': label not in {'load', 'undo-input'},
                    'canRedo': label in {'undo-expand', 'undo-layout', 'undo-input', 'redo-input'} or label == 'redo-layout' and expand,
                }
                assert actual(label, 'history') == history
                assert actual(label, 'canonicalLayout') == layout
                assert actual(label, 'sidecars') == expected_inline
                for property in ['canonicalColumns', 'editorColumns', 'rendererColumns']:
                    assert actual(label, property) == [markup(text) for text in texts], (case['id'], label, property)
                widgets = [[{'id': token, 'type': expected_inline[token]['type'], 'text':
                    '@' + expected_inline[token]['data']['name'] if expected_inline[token]['type'] == 'mention'
                    else expected_inline[token]['data']['value']} for token in re.findall(r'\{\{(\w+)\}\}', text)] for text in texts]
                for destination in ['editor', 'renderer']:
                    assert actual(label, destination + 'Widgets') == widgets
                    weights = LAYOUTS[layout]
                    assert actual(label, destination + '.trackDefinition') == ' '.join(str(weight) + 'fr' for weight in weights)
                    assert actual(label, destination + '.gridDisplay') == 'grid'
                    widths = phase['widths'][destination]
                    assert len(widths) == len(weights)
                    unit = sum(widths) / sum(weights)
                    assert all(width > 0 and abs(width - unit * weight) < 1 for width, weight in zip(widths, weights))
                assert actual(label, 'providerCalls') == 0
                records[label] = phase['blocks']
                total_phases += 1
            assert records['load'] == records['undo-input']
            assert records['input'] == records['undo-layout'] == records['redo-input']
            assert records['layout'] == records['redo-layout']
            if expand:
                assert records['layout'] == records['undo-expand']
                assert records['expand'] == records['redo-expand']
            assert actual('retired-control', 'canonicalUnchanged') == records[phases[-1]]
            assert actual('retired-control', 'differentLayout') is True
            assert actual('retired-control', 'editableBeforeProbe' if surface == 'menu' else 'readOnlyBeforeProbe') is (surface == 'menu')
            # direct.readOnlyBeforeProbe records isContentEditable, hence false.
            assert actual('retired-control', 'historyUnchanged') == {'canUndo': True, 'canRedo': False}
            if not legacy:
                assert actual('retired-control', 'noCompletedAction') == len(phases) - 1
            assert actual('gestures', 'trustedInput') is True
            assert len(actual('gestures', 'trustedClicks')) == (2 if expand else 1) * (2 if surface == 'menu' else 1)
        assert result['failures'] == failures
        if legacy:
            expected_failure_properties = {
                ('layout', 'unchangedFirstHost'), ('layout', 'survivingHosts'), ('layout', 'unchangedFirstWidgets'),
                ('layout', 'focusInsideEditor'), ('undo-input', 'nativeCaret'),
            }
            assert len(failures) == 30
            for case_id in expected_ids[:6]:
                case_failures = [failure for failure in failures if failure['id'] == case_id]
                assert {(failure['phase'], failure['property']) for failure in case_failures} == expected_failure_properties
                for failure in case_failures:
                    expected_actual = {'focused': False, 'anchor': None, 'focus': None, 'collapsed': True} if failure['property'] == 'nativeCaret' else [False, False] if failure['property'] in {'survivingHosts', 'unchangedFirstWidgets'} else False
                    assert failure['actual'] == expected_actual
            assert len(result['unsupportedCases']) == 6 and [entry['id'] for entry in result['unsupportedCases']] == expected_ids[6:]
        else:
            assert failures == [] and result['unsupportedCases'] == []
        summary.append({'source': result['source'], 'executedCases': supported, 'unsupportedCases': len(result['unsupportedCases']),
                        'observations': sum(len(case['observations']) for case in result['cases']), 'rawFailures': len(failures)})
    assert total_verdicts == 7013 and total_phases == 285 and modules == 489
    return {'status': 'PASS', 'rawSha256': digest(raw), 'candidate': CANDIDATE, 'sourceTree': source_objects['candidate'],
            'recomputedVerdicts': total_verdicts, 'reconstructedPhaseStates': total_phases,
            'verifiedProductionModules': modules, 'verifiedDependencyFiles': len(data['dependencyFiles']),
            'verifiedDependencyVersions': len(data['dependencyVersions']), 'results': summary,
            'scope': ['BLOCK_COLUMNS_LAYOUTS', 'BLOCK_COLUMNS_NO_LOSS_REDUCE'],
            'limitations': ['Historical v1 menu surface is unsupported; no stable v1 column IDs are fabricated.',
                            'One native X edits the first field; focusEnd is set before the history sequence on every source.',
                            'Only a literal empty removed/destination field is covered by empty controls.',
                            'Full BLOCK_COLUMNS_FIELDS, exact post-menu caret, IME and other browser/platform behavior remain open.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=CHECKPOINT.parents[4])
    parser.add_argument('--raw', type=Path, default=CHECKPOINT / 'layouts-final-differential.json.gz')
    arguments = parser.parse_args()
    print(json.dumps(audit(arguments.repo.resolve(), arguments.raw.resolve()), indent=2))
