"""Author's independent exact-alpha Bold contract model; no fixture/runtime imports."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
INTEGRATION = 'e2053f58258dcea153d16faae42e9d03c644e795'
INTEGRATION_SHA = 'e030e75826986a8e3c6c8d0b75d657caa6815be632a8bbcb178f8fc79c11bc8e'
ORDINARY_SOURCE = '247b4a42583b0d2179c52da1fd9960ad28e7ca1c'
ORDINARY_SHA = '1cf67be431851d9b405e722ceaebe73fc9c4a1f84fea61e6f8749587eb78e360'
ORDINARY_MANIFEST_SHA = 'e0df422547a7da89392fceee094a0674f243f067d338dff9471efcbfa9b1acb4'

def digest(value): return hashlib.sha256(value).hexdigest()
def exact(a, b): return json.dumps(a, sort_keys=True, separators=(',', ':')) == json.dumps(b, sort_keys=True, separators=(',', ':'))
def read(path):
    data = Path(path).read_bytes()
    return gzip.decompress(data) if str(path).endswith('.gz') else data

def specs():
    return [dict(id='/'.join([variant, boundary, 'backward' if backward else 'forward']), variant=variant, boundary=boundary, backward=backward)
            for variant in ['apply', 'remove', 'foreign', 'read-only', 'destroy'] for boundary in ['Text', 'Element'] for backward in [False, True]]

def blocks(spec, applied=False):
    bold = (spec['variant'] == 'remove') != applied
    text = '<i>' + ('<b>alpha</b>' if bold else 'alpha') + '</i> rest'
    return [dict(id='a', type='paragraph', dataVersion=2, data=dict(text=text)), dict(id='neighbor', type='paragraph', dataVersion=2, data=dict(text='Untouched'))]

def verify_case(case):
    spec = case['spec']; assert case['id'] == spec['id']
    retired = spec['variant'] in ['foreign', 'read-only', 'destroy']
    phases = ['load'] + (['retire'] if retired else []) + ['apply', 'undo', 'redo', 'dispose']
    assert case['planned'] == case['completedPhases'] == phases and case['error'] is None
    assert case['diagnostics'] == case['unsupported'] == []
    observations = {(o['phase'], o['property']): o for o in case['observations']}; checked = set()
    assert len(observations) == len(case['observations'])
    def check(phase, property, expected):
        key = (phase, property); checked.add(key); o = observations[key]
        assert o['status'] == 'PASS' and exact(o['actual'], expected) and exact(o['expected'], expected), (case['id'], key, o, expected)
    selected = dict(anchor=5 if spec['backward'] else 0, focus=0 if spec['backward'] else 5, text='alpha')
    check('load', 'canonical', blocks(spec)); check('load', 'selection', selected)
    if retired:
        check('retire', 'canonical', blocks(spec)); check('retire', 'selectionStable', True)
        check('retire', 'focus', True); check('retire', 'history', [False, False, 0])
        if spec['variant'] == 'foreign': check('retire', 'foreignCanonical', blocks(spec))
    check('apply', 'trustedBold', True)
    for phase in ['apply', 'undo', 'redo']:
        check(phase, 'canonical', blocks(spec, phase != 'undo')); check(phase, 'selection', selected)
        check(phase, 'history', [False, True] if phase == 'undo' else [True, False])
        if spec['variant'] == 'foreign': check(phase, 'foreignOwnerUnchanged', blocks(spec))
    check('dispose', 'rootsRemoved', True)
    assert checked == set(observations)
    events = [dict(action=action, origin='user' if action == 'commit' else 'history', name='inline.bold') for action in ['commit', 'undo', 'redo']]
    assert exact(case['transactions'], events)
    assert exact(case['trusted'], [dict(key='z', trusted=True)] * 2)
    return len(checked) + 2

def git_blobs(queries):
    queries = sorted(set(queries)); raw = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(queries) + '\n').encode())
    offset, result = 0, {}
    for query in queries:
        end = raw.index(b'\n', offset); fields = raw[offset:end].split(); assert len(fields) == 3 and fields[1] == b'blob', query
        size = int(fields[2]); offset = end + 1; result[query] = raw[offset:offset+size]; offset += size
        assert raw[offset:offset+1] == b'\n'; offset += 1
    assert offset == len(raw); return result

def main():
    parser = argparse.ArgumentParser()
    for name in ['raw', 'native', 'output']: parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    opts = parser.parse_args(); raw = read(opts.raw); data = json.loads(raw); root = Path(__file__).parent
    assert data['headBefore'] == data['headAfter'] == opts.candidate and data['candidatePass'] is True
    assert data['filter'] == '' and data['group'] == 'element-range' and data['serverErrors'] == []
    assert {s['label']: s['sha'] for s in data['sources']} == {'v1': V1, 'spec-baseline': BASELINE, 'candidate': opts.candidate}
    assert [r['source'] for r in data['results']] == ['v1', 'spec-baseline', 'candidate']
    for result in data['results']:
        assert exact([c['spec'] for c in result['cases']], specs()) and result['pageErrors'] == result['inputErrors'] == []
        for case in result['cases']:
            for o in case['observations']: assert o['status'] == ('PASS' if exact(o['actual'], o['expected']) else 'FAIL')
    checks = sum(verify_case(c) for c in data['results'][2]['cases'])
    own = ['scripts/parity/element-range.mjs', 'tests/browser/element-range-fixture.js', 'scripts/parity/checkpoints/2026-11-03/element-range/review.py']
    native_paths = ['tests/browser/native-element-range.html', 'tests/browser/native-element-range.js', 'tests/browser/native-input-driver.js', 'tests/browser/physical-history.mjs', 'tests/browser/regressions/harness.js']
    queries = [s['sha'] + ':' + path for s in data['sources'] for path in s['loaded']]
    queries += [opts.candidate + ':' + path for path in own + native_paths]
    queries += [INTEGRATION + ':' + path for path in data['sources'][2]['loaded']]
    blobs = git_blobs(queries)
    for source in data['sources']:
        assert source['tree'] == subprocess.check_output(['git', 'rev-parse', source['sha'] + '^{tree}']).decode().strip()
        for path, sha in source['loaded'].items(): assert digest(blobs[source['sha'] + ':' + path]) == sha
    for path in data['sources'][2]['loaded']: assert blobs[opts.candidate + ':' + path] == blobs[INTEGRATION + ':' + path]
    for path in own: assert Path(path).read_bytes() == blobs[opts.candidate + ':' + path]
    for path in native_paths: assert Path(path).read_bytes().replace(b'\r\n', b'\n') == blobs[opts.candidate + ':' + path]
    assert data['runnerSha256'] == digest(blobs[opts.candidate + ':' + own[0]]) and data['fixtureSha256'] == digest(blobs[opts.candidate + ':' + own[1]])
    runtime = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts', 'package.json', 'package-lock.json']
    assert subprocess.check_output(['git', 'diff', '--name-only', INTEGRATION, opts.candidate, '--', *runtime]) == b''
    changed_browser = set(subprocess.check_output(['git', 'diff', '--name-only', ORDINARY_SOURCE, opts.candidate, '--', 'tests/browser']).decode().splitlines())
    assert changed_browser == set([own[1], *native_paths[:2], 'tests/browser/physical-history.mjs'])
    integrated_bytes = read(root / 'integration-manifest.json.gz'); assert digest(integrated_bytes) == INTEGRATION_SHA
    integrated = json.loads(integrated_bytes)
    assert integrated['outcome'] == 'passed' and integrated['sourceUnchanged'] is True and integrated['source']['dirty'] is False
    assert integrated['source']['head'] == INTEGRATION and len(integrated['gates']) == 28
    assert all(g['outcome'] == 'passed' and g['sourceUnchanged'] is True for g in integrated['gates'].values())
    ordinary = read(root / 'ordinary-browser.log.gz'); assert digest(ordinary) == ORDINARY_SHA
    ordinary_manifest_bytes = read(root / 'ordinary-manifest.json.gz'); assert digest(ordinary_manifest_bytes) == ORDINARY_MANIFEST_SHA
    ordinary_manifest = json.loads(ordinary_manifest_bytes)
    assert ordinary_manifest['source']['head'] == ORDINARY_SOURCE and ordinary_manifest['source']['dirty'] is False
    gate = ordinary_manifest['gates']['browser-all']; assert gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True
    native = json.loads(read(opts.native).decode().splitlines()[-1])['native-element-range.html']
    assert [r['name'] for r in native] == ['Bold equivalent alpha ' + s['id'] for s in specs()] and all(r['status'] == 'PASS' for r in native)
    for path, sha in data['dependencyFiles'].items(): assert digest((Path('node_modules') / path).read_bytes()) == sha
    for name, version in data['dependencyVersions'].items(): assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == version
    assert data['node'] == 'v24.22.2' and data['browser'] == '156.0.8078.80' and data['platform'] == 'win32 x64'
    assert data['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
    result = dict(status='PASS', candidate=opts.candidate, cases=20, observations=sum(len(c['observations']) for c in data['results'][2]['cases']), semanticChecks=checks,
                  rawSha256=digest(raw), reviewerSha256=digest(Path(__file__).read_bytes()), nativeSha256=digest(read(opts.native)),
                  productionModuleIdentities=sum(len(s['loaded']) for s in data['sources']), dependencyFiles=len(data['dependencyFiles']), dependencyVersions=data['dependencyVersions'],
                  integratedRuntime=INTEGRATION, ordinarySource=ORDINARY_SOURCE,
                  history=[dict(source=r['source'], observations=sum(len(c['observations']) for c in r['cases']), failures=sum(o['status']=='FAIL' for c in r['cases'] for o in c['observations']),
                                incomplete=sum(c['error'] is not None or c['planned'] != c['completedPhases'] for c in r['cases'])) for r in data['results']])
    opts.output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8'); print(json.dumps(result))

if __name__ == '__main__': main()
