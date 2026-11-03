"""Author's independent alignment contract model; no fixture/runtime imports."""
import argparse
import collections
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess

INTEGRATION = 'e2053f58258dcea153d16faae42e9d03c644e795'
INTEGRATION_SHA = 'e030e75826986a8e3c6c8d0b75d657caa6815be632a8bbcb178f8fc79c11bc8e'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
LEAD = 'un<i>Alpha</i> &amp; <b>MiXeD</b><br><a href="/kept" rel="noopener noreferrer">Link</a> {{swatch}} {{mention}}'
TAIL = '<i>Bravo</i> rest'
VALUES = ['left', 'center', 'right', 'justify']

def digest(value):
    return hashlib.sha256(value).hexdigest()

def exact(a, b):
    return json.dumps(a, sort_keys=True, ensure_ascii=False, separators=(',', ':')) == json.dumps(b, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

def read(path):
    value = Path(path).read_bytes()
    return gzip.decompress(value) if str(path).endswith('.gz') else value

def specs():
    result = []
    for value in VALUES:
        for shape in ['single', 'cross', 'fields']:
            for boundary in ['Text', 'Element']:
                for backward in [False, True]:
                    result.append(dict(id='/'.join([value, shape, boundary, 'backward' if backward else 'forward']), value=value, shape=shape, boundary=boundary, backward=backward))
        for kind in ['atomic', 'noop', 'mixed']:
            for backward in [False, True]:
                result.append(dict(id='/'.join([value, kind, 'backward' if backward else 'forward']), value=value, kind=kind,
                                   shape='cross' if kind == 'mixed' else 'single', boundary='Element' if kind == 'atomic' else 'Text', backward=backward))
        for lifetime in ['read-only', 'destroy']:
            result.append(dict(id=value + '/' + lifetime, value=value, lifetime=lifetime, shape='single', boundary='Text', backward=True))
    return result

def initial(spec, index=0):
    if spec.get('kind') == 'noop': return None if spec['value'] == 'left' else spec['value']
    if spec.get('kind') == 'mixed': return ['center', 'justify'][index]
    return 'center' if spec['value'] == 'left' else None

def document(spec, legacy=False, typed=False, aligned=False):
    first = 'un{{swatch}} {{mention}} rest' if spec.get('kind') == 'atomic' else LEAD + (' ' + TAIL if spec['shape'] == 'single' else '')
    data = dict(text=('X' if typed else '') + first)
    if spec['shape'] == 'fields': data['caption'] = TAIL
    a = dict(id='a', type='quote' if spec['shape'] == 'fields' else 'paragraph', data=data)
    if not legacy: a['dataVersion'] = 1 if spec['shape'] == 'fields' else 2
    a['inline'] = {key: dict(type=typ, data=payload, **({} if legacy else dict(dataVersion=1))) for key, typ, payload in [
        ('swatch', 'color', dict(value='#aBcDef')), ('mention', 'mention', dict(id='ada', name='Ada'))]}
    blocks = [a]
    if spec['shape'] == 'cross': blocks.append(dict(id='b', type='paragraph', data=dict(text=TAIL), **({} if legacy else dict(dataVersion=2))))
    for index, block in enumerate(blocks):
        align = (None if spec['value'] == 'left' else spec['value']) if aligned else initial(spec, index)
        if align:
            block['tunes'] = dict(textAlign=align)
            if legacy and block['type'] == 'paragraph': block['data']['align'] = align
    neighbor = 'center' if spec['value'] == 'right' else 'right'
    blocks.append(dict(id='c', type='paragraph', data=dict(text='Neighbor', **(dict(align=neighbor) if legacy else {})), tunes=dict(textAlign=neighbor), **({} if legacy else dict(dataVersion=2))))
    return blocks

def selected(spec):
    typed = int(not spec.get('lifetime') and spec.get('kind') != 'noop')
    whole = spec['boundary'] == 'Element'
    first = 2 + typed if whole else 4 + typed
    end = (25 + typed if spec['shape'] == 'single' else 0) + (5 if whole else 3)
    if spec.get('kind') == 'atomic': end = 3 + typed
    names = ['quote.text', 'quote.caption'] if spec['shape'] == 'fields' else ['a', 'a' if spec['shape'] == 'single' else 'b']
    positions = [dict(field=names[0], offset=first), dict(field=names[1], offset=end)]
    return dict(anchor=positions[int(spec['backward'])], focus=positions[int(not spec['backward'])], collapsed=False)

class Meaning(HTMLParser):
    def __init__(self, value):
        super().__init__(convert_charrefs=True)
        self.tokens, self.marks, self.depth, self.widget = [], [], 0, None
        self.feed(value)
        assert not self.marks and self.depth == 0
    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if self.depth:
            self.depth += 1
        elif 'data-inline-plugin' in attrs:
            assert tag == 'span'
            ident = attrs['data-id']; typ = attrs['data-inline-plugin']
            assert (ident, typ) in [('swatch', 'color'), ('mention', 'mention')]
            self.tokens.append(('widget', ident, typ)); self.depth = 1
        elif tag == 'br':
            assert attrs == {}; self.tokens.append(('break',))
        else:
            assert tag in ['i', 'b', 'a'], (tag, attrs)
            assert attrs == (dict(href='/kept', rel='noopener noreferrer') if tag == 'a' else {})
            self.marks.append(tag)
    def handle_endtag(self, tag):
        if self.depth: self.depth -= 1
        else: assert self.marks.pop() == tag
    def handle_data(self, value):
        if not self.depth:
            self.tokens.extend(('char', char, tuple(self.marks)) for char in value)

def meanings(spec, typed):
    lead = [('char', c, ()) for c in ('X' if typed else '') + 'un']
    widgets = [('widget', 'swatch', 'color'), ('char', ' ', ()), ('widget', 'mention', 'mention')]
    if spec.get('kind') == 'atomic': return [lead + widgets + [('char', c, ()) for c in ' rest']]
    lead += [('char', c, ('i',)) for c in 'Alpha'] + [('char', c, ()) for c in ' & ']
    lead += [('char', c, ('b',)) for c in 'MiXeD'] + [('break',)]
    lead += [('char', c, ('a',)) for c in 'Link'] + [('char', ' ', ())] + widgets
    tail = [('char', c, ('i',)) for c in 'Bravo'] + [('char', c, ()) for c in ' rest']
    return [lead + [('char', ' ', ())] + tail] if spec['shape'] == 'single' else [lead, tail]

def plans(spec):
    if spec.get('lifetime'): return ['load', 'inactive', 'apply', 'undo', 'redo', 'dispose']
    if spec.get('kind') == 'noop': return ['load', 'input', 'prepare-redo', 'selection', 'apply', 'redo-input', 'undo-input', 'dispose']
    return ['load', 'input', 'selection', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']

def events(spec):
    event = lambda action, name: dict(action=action, origin=('native-input' if name == 'native-input' else 'user') if action == 'commit' else 'history', name=name)
    native, align = 'native-input', 'format.text-align'
    if spec.get('lifetime'): actions = [('commit', align), ('undo', align), ('redo', align)]
    elif spec.get('kind') == 'noop': actions = [('commit', native), ('undo', native), ('redo', native), ('undo', native)]
    else: actions = [('commit', native), ('commit', align), ('undo', align), ('undo', native), ('redo', native), ('redo', align)]
    return [event(*item) for item in actions]

def verify_case(case):
    spec = case['spec']; assert case['id'] == spec['id']
    assert case['planned'] == case['completedPhases'] == plans(spec)
    assert case['error'] is None and case['diagnostics'] == case['unsupported'] == []
    observations = {(o['phase'], o['property']): o for o in case['observations']}
    assert len(observations) == len(case['observations'])
    checked = set()
    def check(phase, prop, value):
        item = observations[(phase, prop)]; checked.add((phase, prop))
        assert item['status'] == 'PASS' and exact(item['actual'], item['expected']), (spec['id'], phase, prop, item)
        assert exact(item['actual'], value) and exact(item['expected'], value), (spec['id'], phase, prop, item, value)
    noop, lifetime = spec.get('kind') == 'noop', bool(spec.get('lifetime'))
    typed = not noop and not lifetime
    state = {'load': (False, False), 'input': (True, False), 'prepare-redo': (False, False),
             'apply': (typed, True), 'undo-action': (True, False), 'undo-input': (False, False),
             'redo-input': (True, False), 'redo-action': (True, True), 'undo': (False, False), 'redo': (False, True)}
    for phase in plans(spec):
        if phase in state:
            has_input, aligned = state[phase]
            check(phase, 'canonical', document(spec, typed=has_input, aligned=aligned))
            if phase == 'load': history = [False, False]
            elif phase == 'input': history = [True, False]
            elif phase == 'prepare-redo': history = [False, True]
            elif phase == 'apply': history = [False, True] if noop else [True, False]
            elif aligned: history = [True, False]
            elif has_input: history = [True, not noop]
            else: history = [False, True]
            check(phase, 'history', history)
            if phase not in ['input', 'prepare-redo']:
                fields = 1 if spec['shape'] == 'single' else 2
                styles = [(spec['value'] if aligned else initial(spec, 0 if spec['shape'] == 'fields' else index)) or 'left' for index in range(fields)]
                check(phase, 'styles', styles + ['center' if spec['value'] == 'right' else 'right'])
    phase = 'inactive' if lifetime else 'selection'
    check(phase, 'selectionBefore', selected(spec)); check(phase, 'trustedParent', True)
    if lifetime:
        check(phase, 'retiredCanonical', document(spec)); check(phase, 'successorPanel', True)
        check(phase, 'retiredFocus', True); check(phase, 'retiredSelection', selected(spec))
        check(phase, 'noHistory', [False, False, 0])
        check(phase, 'staleScalarPort', [dict(value=None if spec['value'] == 'left' else spec['value'], result=False)])
        check(phase, 'staleRead', 'mixed')
    for prop in ['panelFocus', 'trustedMode', 'widgetIdentity', 'panelClosed']: check('apply', prop, True)
    check('apply', 'activeValues', [] if spec.get('kind') == 'mixed' else [initial(spec) or 'left'])
    check('apply', 'selection', selected(spec))
    check('apply', 'scalarPort', [dict(value=None if spec['value'] == 'left' else spec['value'], result=not noop)])
    check('apply', 'scalarRead', ['mixed' if spec.get('kind') == 'mixed' else initial(spec) or 'left'])
    dom = observations[('apply', 'richDomPreserved')]
    assert dom['status'] == 'PASS' and exact(dom['actual'], dom['expected'])
    for key in ['actual', 'expected']: assert [Meaning(value).tokens for value in dom[key]] == meanings(spec, typed)
    checked.add(('apply', 'richDomPreserved'))
    check('dispose', 'rootRemoved', True)
    assert checked == set(observations), set(observations) - checked
    assert exact(case['transactions'], events(spec)), (spec['id'], case['transactions'], events(spec))
    expected_trusted = ([] if lifetime else [dict(kind='input', type='insertText', trusted=True)]) + [dict(kind='keydown', key='z', trusted=True)] * (2 if lifetime else 3 if noop else 4)
    assert exact(case['trusted'], expected_trusted)
    return len(checked) + 2

def git_blobs(queries):
    queries = sorted(set(queries))
    raw = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(queries) + '\n').encode())
    offset, result = 0, {}
    for query in queries:
        end = raw.index(b'\n', offset); fields = raw[offset:end].split(); assert len(fields) == 3 and fields[1] == b'blob', query
        count = int(fields[2]); offset = end + 1; result[query] = raw[offset:offset+count]; offset += count
        assert raw[offset:offset+1] == b'\n'; offset += 1
    assert offset == len(raw)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--exploratory', action='store_true')
    parser.add_argument('--browser', type=Path)
    for mode in VALUES: parser.add_argument('--native-' + mode, type=Path)
    opts = parser.parse_args(); raw = read(opts.raw); data = json.loads(raw)
    assert data['headBefore'] == data['headAfter'] == opts.candidate
    assert data['filter'] == '' and data['group'] == 'alignment' and data['candidatePass'] and data['serverErrors'] == []
    assert {s['label']: s['sha'] for s in data['sources']} == {'v1': V1, 'spec-baseline': BASELINE, 'candidate': opts.candidate}
    assert [r['source'] for r in data['results']] == ['v1', 'spec-baseline', 'candidate']
    for result in data['results']:
        assert exact([case['spec'] for case in result['cases']], specs())
        assert result['pageErrors'] == result['inputErrors'] == []
        for case in result['cases']:
            for o in case['observations']:
                assert o['status'] == ('PASS' if exact(o['actual'], o['expected']) else 'FAIL')
    checks = sum(verify_case(case) for case in data['results'][2]['cases'])
    queries = [s['sha'] + ':' + path for s in data['sources'] for path in s['loaded']]
    queries += [INTEGRATION + ':' + path for path in data['sources'][2]['loaded']]
    if not opts.exploratory:
        own = ['scripts/parity/alignment.mjs', 'tests/browser/alignment-parity-fixture.js', 'scripts/parity/checkpoints/2026-11-03/alignment/review.py']
        queries += [opts.candidate + ':' + path for path in own]
        native_sources = ['tests/browser/native-alignment.js', 'tests/browser/native-input-driver.js', 'tests/browser/regressions/harness.js', 'tests/browser/physical-history.mjs'] + ['tests/browser/native-alignment-' + mode + '.html' for mode in VALUES]
        queries += [opts.candidate + ':' + path for path in native_sources]
    blobs = git_blobs(queries)
    for s in data['sources']:
        assert s['tree'] == subprocess.check_output(['git', 'rev-parse', s['sha'] + '^{tree}']).decode().strip()
        for path, sha in s['loaded'].items(): assert digest(blobs[s['sha'] + ':' + path]) == sha
    for path in data['sources'][2]['loaded']: assert blobs[opts.candidate + ':' + path] == blobs[INTEGRATION + ':' + path]
    if not opts.exploratory:
        for path in own: assert Path(path).read_bytes() == blobs[opts.candidate + ':' + path]
        assert data['runnerSha256'] == digest(blobs[opts.candidate + ':' + own[0]])
        assert data['fixtureSha256'] == digest(blobs[opts.candidate + ':' + own[1]])
        for path in native_sources: assert Path(path).read_bytes().replace(b'\r\n', b'\n') == blobs[opts.candidate + ':' + path]
        runtime_paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts', 'package.json', 'package-lock.json']
        assert subprocess.check_output(['git', 'diff', '--name-only', INTEGRATION, opts.candidate, '--', *runtime_paths]) == b''
        integrated_bytes = read(Path(__file__).parent / 'integration-manifest.json.gz')
        assert digest(integrated_bytes) == INTEGRATION_SHA
        integrated = json.loads(integrated_bytes)
        assert integrated['source']['head'] == INTEGRATION and integrated['source']['dirty'] is False
        assert integrated['sourceUnchanged'] is True and integrated['outcome'] == 'passed' and len(integrated['gates']) == 28
        assert all(g['outcome'] == 'passed' and g['sourceUnchanged'] is True for g in integrated['gates'].values())
        browser = read(opts.browser).decode()
        environment = json.loads(browser.splitlines()[0].split('Browser environment: ', 1)[1])
        assert environment['product'] == 'Chrome/' + data['browser']
        pages = re.findall(r'^([-a-z0-9]+\.(?:html|htm)): ', browser, re.M)
        assert len(pages) == len(set(pages)) == 48
        for page in pages:
            records = json.JSONDecoder().raw_decode(browser.split(page + ': ', 1)[1].lstrip())[0]
            assert records and all(row['status'] == 'PASS' for row in records)
        native_hashes = {}
        for mode in VALUES:
            native_bytes = read(getattr(opts, 'native_' + mode)); native = json.loads(native_bytes.decode().splitlines()[-1])['native-alignment-' + mode + '.html']
            assert [row['name'] for row in native] == ['Alignment action ' + spec['id'] for spec in specs() if spec['value'] == mode]
            assert len(native) == 20 and all(row['status'] == 'PASS' for row in native)
            native_hashes[mode] = digest(native_bytes)
    for path, sha in data['dependencyFiles'].items(): assert digest((Path('node_modules') / path).read_bytes()) == sha
    versions = data['dependencyVersions']
    for name, version in versions.items(): assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == version
    assert data['node'] == 'v24.22.2' and data['browser'] == '156.0.8078.80' and data['platform'] == 'win32 x64'
    assert data['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
    result = dict(status='PASS', candidate=opts.candidate, cases=80, semanticChecks=checks, observations=sum(len(c['observations']) for c in data['results'][2]['cases']), rawSha256=digest(raw),
                  reviewerSha256=digest(Path(__file__).read_bytes()), productionModuleIdentities=len(set((s['sha'], p) for s in data['sources'] for p in s['loaded'])),
                  dependencyFiles=len(data['dependencyFiles']), dependencyVersions=versions,
                  history=[dict(source=r['source'], observations=sum(len(c['observations']) for c in r['cases']), failed=sum(o['status'] == 'FAIL' for c in r['cases'] for o in c['observations']),
                                incomplete=sum(bool(c['error']) or c['planned'] != c['completedPhases'] for c in r['cases'])) for r in data['results']])
    if not opts.exploratory: result.update(integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_SHA, browserSha256=digest(read(opts.browser)), nativeSha256=native_hashes)
    opts.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__': main()
