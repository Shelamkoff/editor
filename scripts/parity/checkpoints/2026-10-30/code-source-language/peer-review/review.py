#!/usr/bin/env python3
"""Independent fixed-author review; imports neither fixture nor runtime helpers."""
import argparse
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

SOURCE = 'e6842abf21aee9655d56900ec9fb784edd864609'
BASE = '414c6af17e9ec8bab4bde6ac0026e653bb1ed9ab'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
SPEC = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
LITERAL = '<p>Alpha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>'
TWO_INDENTED = '    <p>Alpha &amp; Beta</p>\n    \t<b>Bravo</b>\n<p>Tail</p>'
MIXED = '\t<p>Alpha</p>\n    <p>Bravo</p>\n\t<p>Tail</p>'
TWO_DEDENTED = '<p>Alpha</p>\n<p>Bravo</p>\n\t<p>Tail</p>'


def caret(start, end=None, direction='forward'):
    end = start if end is None else end
    return dict(start=start, end=end, direction='none' if start == end else direction)


def corpus():
    """Literal author examples; no production indentation/menu implementation."""
    rows = [
        ('tab-caret', LITERAL, caret(5), '<p>Al    pha &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', caret(9), False, False),
        ('tab-single-line-range', LITERAL, caret(3, 8), '<p>     &amp; Beta</p>\n\t<b>Bravo</b>\n<p>Tail</p>', caret(7), False, False),
        ('tab-next-line-boundary-forward', LITERAL, caret(0, 38), TWO_INDENTED, caret(0, 46), False, False),
        ('tab-next-line-boundary-backward', LITERAL, caret(0, 38, 'backward'), TWO_INDENTED, caret(0, 46, 'backward'), False, False),
        ('tab-partial-lines-forward', LITERAL, caret(3, 32), TWO_INDENTED, caret(0, 40), False, False),
        ('tab-partial-lines-backward', LITERAL, caret(3, 32, 'backward'), TWO_INDENTED, caret(0, 40, 'backward'), False, False),
        ('tab-empty-lines', '\n\n<p>Tail</p>', caret(0, 2), '    \n    \n<p>Tail</p>', caret(0, 10), False, False),
        ('tab-final-newline', '<p>Alpha</p>\n<p>Bravo</p>\n', caret(0, 26, 'backward'), '    <p>Alpha</p>\n    <p>Bravo</p>\n', caret(0, 34, 'backward'), False, False),
        ('dedent-mixed-prefixes-forward', MIXED, caret(1, 31), TWO_DEDENTED, caret(0, 26), True, False),
        ('dedent-mixed-prefixes-backward', MIXED, caret(1, 31, 'backward'), TWO_DEDENTED, caret(0, 26, 'backward'), True, False),
        ('dedent-caret-inside-spaces', '    <p>Alpha</p>\n<p>Tail</p>', caret(2), '<p>Alpha</p>\n<p>Tail</p>', caret(0), True, False),
        ('dedent-unindented-no-op', LITERAL, caret(3, 8, 'backward'), LITERAL, caret(3, 8, 'backward'), True, True),
    ]
    cases = []
    for name, source, selected, after, after_selection, shift, noop in rows:
        case = dict(id='CODE_SOURCE/' + name, kind='indent', source=source, selection=selected,
                    after=after, afterSelection=after_selection)
        if shift:
            case['shift'] = True
        if noop:
            case['noOp'] = True
        cases.append(case)
    choices = [
        ('filter-down-javascript', 'auto', 'script', ['ArrowDown', 'Enter'], None, 'javascript', ['javascript', 'typescript'], False),
        ('filter-up-typescript', 'auto', 'script', ['ArrowUp', 'Enter'], None, 'typescript', ['javascript', 'typescript'], False),
        ('enter-auto', 'javascript', 'auto', ['Enter'], None, 'auto', ['auto'], False),
        ('click-plain', 'auto', 'plain', None, 'plaintext', 'plaintext', ['plaintext'], False),
        ('unknown-to-known', 'custom-unknown-language', 'javascript', None, 'javascript', 'javascript', ['javascript'], False),
        ('same-language-no-op', 'javascript', 'javascript', ['Enter'], None, 'javascript', ['javascript'], True),
        ('escape-no-op', 'auto', 'rust', ['Escape'], None, 'auto', ['rust'], True),
        ('no-results-no-op', 'javascript', 'no-language-987', ['Enter', 'Escape'], None, 'javascript', [], True),
    ]
    for name, initial, query, keys, click, language, visible, noop in choices:
        case = dict(id='CODE_LANGUAGE/' + name, kind='language', source=LITERAL, initial=initial,
                    query=query, language=language, visible=visible)
        case['keys' if keys else 'click'] = keys or click
        if noop:
            case['noOp'] = True
        cases.append(case)
    return cases


def records(text, language, versions=False):
    result = [dict(id='before', type='paragraph', data=dict(text='Before <b>code</b>')),
              dict(id='code', type='code', data=dict(code=text, language=language)),
              dict(id='after', type='paragraph', data=dict(text='After <i>code</i>'))]
    if versions:
        for block in result:
            block['dataVersion'] = 1 if block['type'] == 'code' else 2
    return result


def plan(case):
    source, noop = case['source'], case.get('noOp', False)
    # phase -> literal source, language, history, transaction-event count, caret
    if case['kind'] == 'indent':
        initial, after, chosen = case['selection'], case['after'], case['afterSelection']
        typed = after[:chosen['start']] + 'X' + after[chosen['end']:]
        typed_caret = caret(chosen['start'] + 1)
        result = [('load', source, 'plaintext', [False, False], 0, None),
                  ('selected', source, 'plaintext', [False, False], 0, initial),
                  ('indent', after, 'plaintext', [not noop, False], 0 if noop else 1, chosen),
                  ('input', typed, 'plaintext', [True, False], 1 if noop else 2, typed_caret),
                  ('undo-input', after, 'plaintext', [not noop, True], 2 if noop else 3, chosen)]
        if not noop:
            result.extend([('undo-indent', source, 'plaintext', [False, True], 4, initial),
                           ('redo-indent', after, 'plaintext', [True, True], 5, chosen)])
        result.append(('redo-input', typed, 'plaintext', [True, False], 3 if noop else 6, typed_caret))
        return result
    initial, final = case['initial'], case['language']
    typed, end = source + 'X', caret(len(source) + 1)
    result = [('load', source, initial, [False, False], 0, None),
              ('input', typed, initial, [True, False], 1, end),
              ('filter', typed, initial, [True, False], 1, None),
              ('control', typed, final, [True, False], 1 if noop else 2, None)]
    if not noop:
        result.append(('undo-control', typed, initial, [True, True], 3, end))
    result.extend([('undo-input', source, initial, [False, True], 2 if noop else 4, caret(len(source))),
                   ('redo-input', typed, initial, [True, not noop], 3 if noop else 5, end)])
    if not noop:
        result.append(('redo-control', typed, final, [True, False], 6, end))
    result.append(('read-only-control', typed, final, [False, False], 3 if noop else 6, None))
    return result


def digest(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--dependencies', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    dependencies = args.dependencies or args.repo / 'node_modules'
    checkpoint = args.checkpoint
    checks = collections.Counter()

    def equal(actual, expected, context, category='evidence'):
        assert actual == expected, (context, str(actual)[:400], str(expected)[:400])
        checks[category] += 1

    def load(name):
        payload = (checkpoint / name).read_bytes()
        return json.loads(gzip.decompress(payload) if name.endswith('.gz') else payload)

    payload = gzip.decompress((checkpoint / 'final-differential.json.gz').read_bytes())
    raw, manifest = json.loads(payload), load('manifest.json')
    equal(digest(payload), '3933f6c82d12f2b727ae6a1776ceea9849ad31f475e278b833714b2e9001b0a7', 'immutable report hash')
    equal(manifest['rawSha256'], digest(payload), 'manifest report hash')
    equal([raw[key] for key in ['headBefore', 'headAfter', 'fixtureSource']], [SOURCE] * 3, 'exact execution sources')
    equal(raw['sourceUnchanged'], True, 'source unchanged')
    equal(raw['filter'], '', 'unfiltered report')
    equal(raw['serverErrors'], [], 'server errors')
    equal(raw['candidatePass'], True, 'current summary')
    equal(load('differential-process-outcome.json.gz')['exitCode'], 1, 'historical raw process fails honestly')
    native_process = load('process-outcomes.json.gz')
    equal(native_process['headBefore'], SOURCE, 'native starting source')
    equal(native_process['records'], [manifest['native']], 'native process record')
    equal(manifest['native']['exitCode'], 0, 'native exit')

    env = os.environ.copy()
    for name in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']:
        env.pop(name, None)
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_NO_REPLACE_OBJECTS='1')

    def git(*parts, input=None):
        return subprocess.check_output(['git', '-C', str(args.repo), *parts], env=env, input=input)

    with tempfile.TemporaryDirectory(prefix='code-peer-proof-') as directory:
        temporary = Path(directory)
        objects = temporary / 'objects'
        objects.mkdir()
        existing = git('rev-parse', '--path-format=absolute', '--git-path', 'objects').decode().strip()
        env.update(GIT_INDEX_FILE=str(temporary / 'index'), GIT_OBJECT_DIRECTORY=str(objects), GIT_ALTERNATE_OBJECT_DIRECTORIES=existing)
        patch = gzip.decompress((checkpoint / manifest['sourcePatch']).read_bytes())
        equal(digest(patch), manifest['sourcePatchSha256'], 'source patch hash', 'source')
        git('read-tree', BASE)
        git('apply', '--cached', '--binary', '--whitespace=nowarn', '-', input=patch)
        equal(git('write-tree').decode().strip(), manifest['tree'], 'reconstructed source tree', 'source')
        commit = manifest['rawCommit'].encode()
        equal(hashlib.sha1(b'commit ' + str(len(commit)).encode() + b'\0' + commit).hexdigest(), SOURCE, 'original commit bytes', 'source')
        equal(git('hash-object', '-w', '-t', 'commit', '--stdin', input=commit).decode().strip(), SOURCE, 'reconstructed commit object', 'source')
        equal(git('diff', BASE, SOURCE, '--', 'core', 'plugins', 'inline-tools', 'inline-plugins', 'shared', 'renderer'), b'', 'no production edits', 'source')
        expected_sources = [('v1', V1), ('spec-baseline', SPEC), ('candidate', SOURCE)]
        equal([(s['label'], s['sha']) for s in raw['sources']], expected_sources, 'source inventory', 'source')
        for source in raw['sources']:
            equal(git('rev-parse', source['sha'] + '^{tree}').decode().strip(), source['tree'], 'source tree ' + source['label'], 'source')
            for path, checksum in source['loaded'].items():
                equal(digest(git('show', source['sha'] + ':' + path)), checksum, 'loaded ' + path, 'servedModule')
        for key, path in [('fixtureSha256', 'tests/browser/code-source-language-parity-fixture.js'), ('runnerSha256', 'scripts/parity/code-source-language.mjs')]:
            equal(digest(git('show', SOURCE + ':' + path)), raw[key], key, 'source')
            equal(raw[key], manifest[key], key + ' manifest', 'source')

    for path, checksum in raw['dependencyFiles'].items():
        equal(digest((dependencies / path).read_bytes()), checksum, 'dependency bytes ' + path, 'dependencyFile')
    for name, version in raw['dependencyVersions'].items():
        equal(json.loads((dependencies / name / 'package.json').read_text())['version'], version, 'dependency version ' + name, 'dependencyVersion')
    for record in load('artifact-hashes.json')['files']:
        data = (checkpoint / record['path']).read_bytes()
        equal(len(data), record['bytes'], record['path'] + ' bytes', 'archive')
        equal(digest(data), record['sha256'], record['path'] + ' hash', 'archive')
        if record['path'].endswith('.gz'):
            decoded = gzip.decompress(data)
            equal(len(decoded), record['decodedBytes'], record['path'] + ' decoded bytes', 'archive')
            equal(digest(decoded), record['decodedSha256'], record['path'] + ' decoded hash', 'archive')

    specifications = corpus()
    native_lines = gzip.decompress((checkpoint / 'native.log.gz').read_bytes()).decode().splitlines()
    equal(native_lines[0], 'Native native-plugin-parity.html: 20 passed', 'native count')
    native_cases = json.loads(next(line for line in native_lines if line.startswith('{')))['native-plugin-parity.html']
    equal(native_cases, [dict(name='Code source-language parity ' + c['id'], status='PASS') for c in specifications], 'native full case inventory')
    summary = []
    for row in raw['results']:
        equal([case['id'] for case in row['cases']], [case['id'] for case in specifications], 'ordered case inventory ' + row['source'])
        equal(row['errors'], [], 'page errors ' + row['source'])
        equal(row['casePageErrors'], [], 'case page errors ' + row['source'])
        equal(row['incompleteCases'], [], 'complete cases ' + row['source'])
        failures = []
        for recorded, specification in zip(row['cases'], specifications, strict=True):
            context = row['source'] + '/' + specification['id']
            equal(recorded['specification'], specification, context + ' independently fixed specification', 'oracle')
            transitions = plan(specification)
            phases = [state[0] for state in transitions] + ['dispose']
            equal(recorded['plannedPhases'], phases, context + ' planned phases', 'phase')
            equal(recorded['completedPhases'], phases, context + ' completed phases', 'phase')
            equal([phase['phase'] for phase in recorded['phases']], phases[:-1], context + ' snapshot phases', 'phase')
            equal(recorded['error'], None, context + ' no exception')
            equal(recorded['pageErrors'], [], context + ' local errors')
            observations = {}
            for observation in recorded['observations']:
                expected_status = 'PASS' if observation['actual'] == observation['expected'] else 'FAIL'
                equal(observation['status'], expected_status, context + '/' + observation['phase'] + '/' + observation['property'], 'rawVerdict')
                if expected_status == 'FAIL':
                    failures.append(dict(id=recorded['id'], **observation))
                observations.setdefault((observation['phase'], observation['property']), []).append(observation)

            def expect(phase, property, expected):
                items = observations[(phase, property)]
                equal(len(items), 1, context + '/' + phase + '/' + property + ' cardinality', 'oracle')
                equal(items[0]['expected'], expected, context + '/' + phase + '/' + property + ' fixed expectation', 'oracle')
                if row['source'] == 'candidate':
                    equal(items[0]['actual'], expected, context + '/' + phase + '/' + property + ' actual', 'candidateOracle')

            for phase, text, language, history, count, selection in transitions:
                expect(phase, 'canonicalRecords', records(text, language))
                expect(phase, 'literalSource', text)
                expect(phase, 'literalPaint', text + '\n')
                expect(phase, 'sourceMarkupIsInert', [0, 0])
                expect(phase, 'history', dict(zip(['canUndo', 'canRedo'], history)))
                expect(phase, 'languageLabel', {'auto':'Auto', 'javascript':'JavaScript', 'typescript':'TypeScript', 'plaintext':'Plain text'}.get(language, language))
                highlighted = language in ['auto', 'javascript', 'typescript']
                expect(phase, 'highlightSpanCount', 1 if highlighted else 0)
                if highlighted:
                    provider = dict(kind='auto', code=text) if language == 'auto' else dict(kind='explicit', code=text, language=language)
                    expect(phase, 'providerSelection', provider)
                else:
                    expect(phase, 'plainLanguageProviderSilent', 0)
                if row['source'] != 'v1':
                    expect(phase, 'completedTransactions', count)
                if selection:
                    expect(phase, 'sourceSelection', selection)
                    expect(phase, 'sourceFocus', True)
                if row['source'] == 'candidate':
                    snapshot = next(value for value in recorded['phases'] if value['phase'] == phase)
                    equal(snapshot['blocks'], records(text, language, True), context + '/' + phase + ' full typed document', 'candidateSnapshot')
                    equal(snapshot['history'], dict(zip(['canUndo', 'canRedo'], history)), context + '/' + phase + ' snapshot history', 'candidateSnapshot')
            if specification['kind'] == 'language':
                expect('filter', 'filteredOptions', specification['visible'])
                expect('filter', 'filterFocus', True)
                expect('control', 'menuClosed', 'false')
                expect('read-only-control', 'sourceReadOnly', True)
                # This negative control freezes the preceding actual state.
                # A historical failed language choice is not silently repaired
                # before asking whether the subsequent read-only click mutates it.
                before_readonly = recorded['phases'][-2]['blocks']
                expect('read-only-control', 'readOnlyUnchanged', before_readonly)
            else:
                expect('indent', 'trustedIndentation', [dict(trusted=True, shift=specification.get('shift', False))])
            expect('dispose', 'editableHistoryRestored', dict(canUndo=True, canRedo=False))
            expect('dispose', 'editorRemoved', False)
            if row['source'] == 'candidate':
                equal(all(event['trusted'] for event in recorded['trusted']), True, context + ' trusted gestures', 'native')
                equal(sum(event['phase'] == 'input' and event['type'] == 'input' and event.get('sourceField') is True and event.get('inputType') == 'insertText' for event in recorded['trusted']), 1, context + ' one actual native source input', 'native')
                for property in ['retiredMarkupUnchanged', 'retiredProviderSilent', 'retiredAuthorSilent']:
                    observation = observations['dispose', property][0]
                    equal(observation['actual'], observation['expected'], context + '/' + property, 'lifetime')
        equal(row['failures'], failures, 'honest failure list ' + row['source'])
        summary.append(dict(source=row['source'], cases=len(row['cases']), observations=sum(len(c['observations']) for c in row['cases']), failures=len(failures)))
    equal(summary, [dict(source='v1', cases=20, observations=1894, failures=178), dict(source='spec-baseline', cases=20, observations=2062, failures=232), dict(source='candidate', cases=20, observations=2062, failures=0)], 'fixed report totals')
    result = dict(status='PASS', reviewer='code_peer_finish (independent of fixture author)', source=SOURCE,
                  sourceTree=manifest['tree'], rawSha256=digest(payload), checks=dict(checks), totalChecks=sum(checks.values()), sources=summary,
                  scope=['BLOCK_CODE_SOURCE', 'BLOCK_CODE_LANGUAGE'], sourceReconstructedInTemporaryObjectStore=True,
                  limitations=['Recorded Chrome environment only; no new browser run performed by reviewer.',
                               'Console messages and onDiagnostic were not collected by the author fixture.',
                               'Native harness process metadata records starting HEAD and actual exit; only the separate differential records before/after source equality.',
                               'Language history explicitly refocuses the source; no historical post-menu focus equivalence is claimed.',
                               'No other Code row, B-HTML/B-STYLE or whole-library acceptance.'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
