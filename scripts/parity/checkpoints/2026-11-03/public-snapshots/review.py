"""Author's independent public snapshot model. No runtime/fixture imports."""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

RED = '5dbf2458f88086e359a62c9619a23cb2efad739d'
RED_SHA = '70e7ae0b603dd93eb6a909bb506cb837af7efc7365b5ec0547552c54ff7957a4'
INTEGRATION = 'efb62a4b95a865f2607a427d75577affbe0a54bb'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE = 'e981ff308000c1d92d7e820df95113c1e19bcee8'

def digest(raw): return hashlib.sha256(raw).hexdigest()
def exact(a, b): return json.dumps(a, sort_keys=True, separators=(',', ':')) == json.dumps(b, sort_keys=True, separators=(',', ':'))
def read(path):
    raw = Path(path).read_bytes()
    return gzip.decompress(raw) if str(path).endswith('.gz') else raw

def payload(): return dict(nested=dict(value=7), tags=['kept'], __proto__=dict(literal=True), constructor='own')
def document(updated=False):
    result = []
    for index, ident in enumerate(['a', 'b', 'c']):
        data = (dict(text='Opaque', rows=[dict(cells=[dict(text='Nested', metadata=dict(alignment='left'))])], own=payload()) if index == 1
                else dict(text=('<b>Updated</b> {{opaque}}' if updated else '<b>Alpha</b> &amp; {{opaque}}') if index == 0 else 'Tail'))
        result.append(dict(id=ident, type='future-block' if index == 1 else 'paragraph', dataVersion=7 if index == 1 else 2, data=data,
                           tunes=dict(textAlign='right', layout=dict(gap=2)), inline=dict(opaque=dict(type='future-inline', dataVersion=3, data=payload()))))
        if index: result[-1]['revision'] = 17 if index == 1 else 'wire-c'
    return result

def snapshot(record): return dict(copy.deepcopy(record), status='unregistered' if record['type'] == 'future-block' else 'active')
def base_specs():
    result = [dict(id='/'.join(['read', mode, query, target]), kind='read', mode=mode, query=query, target=target)
              for mode in ['editable', 'read-only'] for query in ['get', 'at', 'list', 'iterator'] for target in ['known', 'unknown']]
    result += [dict(id='update/'+query, kind='update', mode='editable', query=query, target='known') for query in ['get', 'at', 'list', 'iterator']]
    result += [dict(id='catalog/'+mode, kind='catalog', mode=mode) for mode in ['editable', 'read-only']]
    result += [dict(id='retired-iterator/'+step, kind='retired-iterator', mode='editable', step=step) for step in ['before-first', 'after-first']]
    return result

def verify_case(case, legacy=False):
    spec = case['spec']; assert case['id'] == spec['id']
    phases = ['legacy-control', 'dispose'] if legacy else ['load', spec['kind'], 'dispose']
    assert case['planned'] == case['completedPhases'] == phases
    assert case['error'] is None and case['diagnostics'] == []
    observations = {(o['phase'], o['property']): o for o in case['observations']}; checked = set()
    assert len(observations) == len(case['observations'])
    def check(phase, property, expected):
        key = (phase, property); checked.add(key); value = observations[key]
        assert value['status'] == 'PASS' and exact(value['actual'], expected) and exact(value['expected'], expected), (case['id'], key, value, expected)
    if legacy:
        check('legacy-control', 'actualLegacyCatalog', dict(count=3, byId='a', byIndex='a', index=0, current='a', ids=['a', 'b', 'c']))
        check('legacy-control', 'actualLegacyAuthorText', '<b>Alpha</b> &amp; {{opaque}}')
        assert len(case['unsupported']) == 1 and case['unsupported'][0]['property'] == 'currentDetachedSnapshotContract'
    else:
        assert case['unsupported'] == []
        check('load', 'canonical', document()); check('load', 'history', [False, False])
        phase = spec['kind']
        def selected(updated=False):
            records = document(updated)
            if spec.get('query') in ['get', 'at']: records = [records[1 if spec['target'] == 'unknown' else 0]]
            return [snapshot(r) for r in records]
        if phase == 'read':
            records = selected(); count = len(records)
            check(phase, 'snapshots', records); check(phase, 'secondSnapshots', records)
            check(phase, 'frozenEnvelopes', [True]*count); check(phase, 'listFrozen', spec['query'] == 'list')
            check(phase, 'mutableNestedPayload', [[False, False, False] for _ in records]); check(phase, 'noLiveDom', [False]*count)
            check(phase, 'immutableId', True); check(phase, 'otherReadUnchanged', records); check(phase, 'freshReadUnchanged', records)
            check(phase, 'canonicalUnchanged', document()); check(phase, 'history', [False, False, 0])
        elif phase == 'update':
            check(phase, 'producerInput', snapshot(document()[0])); check(phase, 'retainedSnapshot', selected())
            check(phase, 'freshSnapshot', selected(True)); check(phase, 'canonical', document(True)); check(phase, 'history', [True, False])
            check(phase, 'retainedInputDetached', document(True)); check(phase, 'undo', True); check(phase, 'undoCanonical', document())
            check(phase, 'redo', True); check(phase, 'redoCanonical', document(True)); check(phase, 'retainedProducerOriginal', 2)
        elif phase == 'catalog':
            check(phase, 'catalog', dict(count=3, current='a', indices=[0, 1, 2, -1], ids=['a', 'b', 'c']))
            check(phase, 'newCurrent', 'c'); check(phase, 'missingReads', [True]*3)
            check(phase, 'canonicalUnchanged', document()); check(phase, 'history', [False, False, 0])
        else:
            if spec['step'] == 'after-first': check(phase, 'first', snapshot(document()[0]))
            check(phase, 'iteratorDenied', True); check(phase, 'oldApiDenied', [True]*6)
            check(phase, 'successorCanonical', document()); check(phase, 'successorHistory', [False, False, 0])
    check('dispose', 'rootRemoved', True)
    assert checked == set(observations)
    expected_events = [dict(action=action, origin='external' if action == 'commit' else 'history', name='block.update') for action in ['commit', 'undo', 'redo']] if not legacy and spec['kind'] == 'update' else []
    assert exact(case['transactions'], expected_events)
    return len(checked) + 1

def git_blobs(queries):
    queries = sorted(set(queries)); raw = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(queries)+'\n').encode())
    result, offset = {}, 0
    for query in queries:
        end = raw.index(b'\n', offset); header = raw[offset:end].split(); assert len(header) == 3 and header[1] == b'blob', query
        size = int(header[2]); offset = end+1; result[query] = raw[offset:offset+size]; offset += size
        assert raw[offset:offset+1] == b'\n'; offset += 1
    assert offset == len(raw); return result

ITERATOR_RED = '05b286fa1f325ae010521f6a576742fecb0d9dbe'
ITERATOR_SHA = '72e05c4dcf2be996b5b78a6a1c9b6442b7ed12ecbf2b388574f6308d19140ed9'
MODE_GREEN_SHA = '10fed1e1106a543363beab747cc67ab9e700f167abdc525b189119ec46fa7504'
MODE_MANIFEST_SHA = '8895d8a0ed0e2b2c7b62f5b39bb7f72805f3e850558a97d3a2936d03130b45fc'

def specs():
    return base_specs() + [dict(id='iterator/'+mutation+'-status', kind='iterator-status', mode='editable', mutation=mutation) for mutation in ['render','remove']]

def verify_one(case, legacy=False, iterator_bug=False):
    if case['spec']['kind'] != 'iterator-status': return verify_case(case, legacy)
    spec = case['spec']; assert case['id'] == spec['id']
    assert case['error'] is None and case['diagnostics'] == []
    phases = ['legacy-control','dispose'] if legacy else ['load','change','iterate','dispose']
    assert case['planned'] == case['completedPhases'] == phases
    observations = {(o['phase'],o['property']):o for o in case['observations']}; checked=set()
    assert len(observations) == len(case['observations'])
    def check(phase, property, expected, actual=None):
        key=(phase,property);checked.add(key);o=observations[key]
        if actual is None: actual=expected
        assert exact(o['expected'],expected) and exact(o['actual'],actual), (case['id'],key,o,expected,actual)
        assert o['status'] == ('PASS' if exact(actual,expected) else 'FAIL')
    if legacy:
        check('legacy-control','actualLegacyIteratorIds',['a','b'])
        assert len(case['unsupported']) == 1 and case['unsupported'][0]['property'] == 'canonicalSnapshotStatus'
        events=[]
    else:
        assert case['unsupported'] == []
        para=lambda ident,text:dict(id=ident,type='paragraph',dataVersion=2,data=dict(text=text))
        initial=[para('a','Alpha'),dict(id='b',type='future-block',dataVersion=7,data=dict(text='Old Bravo')) if spec['mutation']=='render' else para('b','Old Bravo')]
        updated=[para('b','New Bravo')] if spec['mutation']=='render' else [para('a','Alpha')]
        check('load','firstSnapshot',dict(initial[0],status='active'));check('load','initialHistory',[False,False])
        check('change','canonical',updated);check('change','history',[True,False])
        wanted=dict(initial[1],status='unregistered' if spec['mutation']=='render' else 'active')
        actual=dict(wanted,status='active' if spec['mutation']=='render' else 'unregistered') if iterator_bug else wanted
        check('iterate','retainedSnapshot',wanted,actual)
        check('iterate','frozenEnvelope',True);check('iterate','exhausted',True)
        check('iterate','canonicalUnchanged',updated);check('iterate','historyUnchanged',[True,False])
        events=[dict(action='commit',origin='external',name='document.render' if spec['mutation']=='render' else 'block.remove')]
        check('iterate','oneExplicitAction',events)
    check('dispose','rootRemoved',True)
    assert checked == set(observations) and exact(case['transactions'],events)
    return len(checked)+1

def verify_corpus(data, expected_specs, candidate, iterator_bug=False):
    assert data['headBefore'] == data['headAfter'] == candidate and data['filter'] == '' and data['group'] == 'public-snapshots'
    assert {s['label']:s['sha'] for s in data['sources']} == {'v1':V1,'spec-baseline':BASELINE,'candidate':candidate}
    assert [r['source'] for r in data['results']] == ['v1','spec-baseline','candidate'] and data['serverErrors'] == []
    counts={}
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],expected_specs) and row['pageErrors'] == row['inputErrors'] == []
        counts[row['source']]=sum(verify_one(c,row['source']=='v1',iterator_bug or row['source']=='spec-baseline') for c in row['cases'])
    return counts

def check_index(root, name):
    index=json.loads((root/name).read_bytes())
    for path,metadata in index.items():
        stored=(root/path).read_bytes();assert digest(stored) == metadata['sha256']
        if 'decodedSha256' in metadata: assert digest(gzip.decompress(stored)) == metadata['decodedSha256']
    return len(index)

def main():
    import re
    parser=argparse.ArgumentParser()
    for name in ['raw','output']: parser.add_argument('--'+name,type=Path,required=True)
    for name in ['browser','node']: parser.add_argument('--'+name,type=Path)
    parser.add_argument('--candidate',required=True);parser.add_argument('--exploratory',action='store_true')
    opts=parser.parse_args();root=Path('scripts/parity/checkpoints/2026-11-03/public-snapshots')
    raw=read(opts.raw);data=json.loads(raw);assert data['candidatePass'] is True
    semantic=verify_corpus(data,specs(),opts.candidate)
    mode_bytes=read(root/'source-red.json.gz');assert digest(mode_bytes)==RED_SHA
    mode=json.loads(mode_bytes);assert mode['headBefore']==mode['headAfter']==RED and mode['candidatePass'] is False
    assert mode['filter']=='' and mode['group']=='public-snapshots' and mode['serverErrors']==[]
    for row in mode['results']:
        assert exact([c['spec'] for c in row['cases']],base_specs()) and row['pageErrors']==row['inputErrors']==[]
        for case in row['cases']:
            if row['source']=='candidate' and case['spec']['mode']=='read-only':
                assert '#captureFieldModes' in case['error'] and "reading 'map'" in case['error']
                assert case['phase']=='load' and case['completedPhases']==case['observations']==case['diagnostics']==case['transactions']==case['unsupported']==[]
            else: verify_case(case,row['source']=='v1')
    iterator_bytes=read(root/'iterator-red.json.gz');assert digest(iterator_bytes)==ITERATOR_SHA
    iterator=json.loads(iterator_bytes);assert iterator['candidatePass'] is False
    verify_corpus(iterator,specs(),ITERATOR_RED,True)
    green_bytes=read(root/'mode-green-corpus.json.gz');assert digest(green_bytes)==MODE_GREEN_SHA
    green=json.loads(green_bytes);assert green['candidatePass'] is True
    verify_corpus(green,base_specs(),INTEGRATION)
    queries=[s['sha']+':'+p for corpus in [data,mode,iterator,green] for s in corpus['sources'] for p in s['loaded']]
    runner='scripts/parity/public-snapshots.mjs';fixture='tests/browser/public-snapshots-fixture.js'
    own=['tests/browser/public-snapshots.html','tests/browser/public-snapshots.js','tests/browser/run.mjs','tests/browser/regressions/harness.js']
    for corpus in [data,mode,iterator,green]: queries += [corpus['headBefore']+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/public-snapshots/review.py'
        queries += [opts.candidate+':'+p for p in [reviewer,*own]]
    blobs=git_blobs(queries)
    for corpus in [data,mode,iterator,green]:
        for s in corpus['sources']:
            assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip()
            for path,sha in s['loaded'].items(): assert digest(blobs[s['sha']+':'+path])==sha
        assert corpus['runnerSha256']==digest(blobs[corpus['headBefore']+':'+runner])
        assert corpus['fixtureSha256']==digest(blobs[corpus['headBefore']+':'+fixture])
        for path,sha in corpus['dependencyFiles'].items(): assert digest((Path('node_modules')/path).read_bytes())==sha
    for path in [runner,fixture]:
        assert blobs[opts.candidate+':'+path]==blobs[ITERATOR_RED+':'+path]==Path(path).read_bytes()
    runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json',':(exclude)**/*.test.js']
    assert subprocess.check_output(['git','diff','--name-only',INTEGRATION,opts.candidate,'--',*runtime]).decode().splitlines()==['core/PublicEditorApi.js']
    patch=subprocess.check_output(['git','diff','--unified=0',INTEGRATION,opts.candidate,'--','core/PublicEditorApi.js']).decode()
    additions=[line for line in patch.splitlines() if line.startswith('+') and not line.startswith('+++') and not line[1:].lstrip().startswith('//')]
    assert additions==['+    const records = this.#runtime.list().map(record => snapshot(this.#runtime, record))','+    for (const record of records) {','+      yield record']
    assert [line for line in patch.splitlines() if line.startswith('-') and not line.startswith('---')]==['-    for (const record of this.#runtime.list()) {','-      yield snapshot(this.#runtime, record)']
    field_patch=subprocess.check_output(['git','diff','--unified=0',RED,INTEGRATION,'--','core/BlockReconciler.js']).decode()
    assert [line for line in field_patch.splitlines() if line.startswith('+') and not line.startswith('+++')]==['+        fields: [],']
    mode_manifest_bytes=read(root/'mode-integration-manifest.json.gz');assert digest(mode_manifest_bytes)==MODE_MANIFEST_SHA
    integrated=json.loads(mode_manifest_bytes)
    assert integrated['source']['head']==INTEGRATION and integrated['source']['dirty'] is False and integrated['sourceUnchanged'] is True
    assert integrated['outcome']=='passed' and len(integrated['gates'])==33
    assert all(g['outcome']=='passed' and g['sourceUnchanged'] is True for g in integrated['gates'].values())
    verified_artifacts=sum(check_index(root,name) for name in ['source-red-hashes.json','iterator-red-hashes.json','mode-integration-hashes.json'])
    if not opts.exploratory:
        for path in [reviewer,*own]: assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[opts.candidate+':'+path]
        browser=read(opts.browser).decode();environment=json.loads(browser.splitlines()[0].split('Browser environment: ',1)[1])
        assert environment['product']=='Chrome/'+data['browser']
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==49
        public_cases=json.JSONDecoder().raw_decode(browser.split('public-snapshots.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in public_cases]==['Public block snapshots '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in public_cases)
        node=read(opts.node).decode();assert 'fail 0' in node
        for prefix in ['mode transitions keep unregistered placeholders inert:', 'public iterator keeps its initial activation metadata after ']:
            assert sum(line.startswith('✔ '+prefix) for line in node.splitlines())==2
        run=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert run['source']['head']==opts.candidate and run['source']['dirty'] is False
        for name in ['build','node','types','browser','native-tools','native-element']:
            gate=run['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==run['source']['identity']
    for name,version in data['dependencyVersions'].items(): assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=26,currentObservations=sum(len(c['observations']) for c in data['results'][2]['cases']),semanticChecks=semantic,
                rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),modeIntegration=INTEGRATION,modeManifestSha256=MODE_MANIFEST_SHA,
                sourceRed=dict(source=RED,sha256=RED_SHA,incomplete=9,positiveControls=15),iteratorRed=dict(source=ITERATOR_RED,sha256=ITERATOR_SHA,failedObservations=2,positiveControls=24),
                primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'],historicalArtifactsVerified=verified_artifacts)
    if not opts.exploratory: report.update(browserSha256=digest(read(opts.browser)),nodeSha256=digest(read(opts.node)))
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__': main()
