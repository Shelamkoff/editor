"""Independent author model of terminal public capabilities; no fixture imports."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
INTEGRATION='efc619d226117a4b0ee1308d1cbb114df5066210'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
OPERATIONS=['handle.blocks','handle.canUndo','handle.canRedo','handle.readOnly','handle.save','handle.render','handle.clear','handle.undo','handle.redo','handle.focus','handle.setReadOnly','handle.insertInlinePlugin','events.subscribe','blocks.count','blocks.currentId','blocks.get','blocks.at','blocks.list','blocks.indexOf','blocks.selectedIds','blocks.setCurrent','blocks.select','blocks.clearSelection','blocks.insert','blocks.update','blocks.remove','blocks.move','blocks.convert','blocks.focus','iterator.start','iterator.resume']
LEGACY_MARKUP='Alpha <span contenteditable="false" data-inline-plugin="color" data-id="swatch" data-value="#aBcDef" class="oe-ip oe-ip--color" data-hydrated="1"><span class="oe-ip__dot" style="background-color: rgb(171, 205, 239);"></span><span class="oe-ip__label">#aBcDef</span></span>'
def digest(raw):return hashlib.sha256(raw).hexdigest()
def exact(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def read(path):
    raw=Path(path).read_bytes();return gzip.decompress(raw) if str(path).endswith('.gz') else raw
def specs():return [dict(id='/'.join([shape,mode,timing]),shape=shape,mode=mode,timing=timing) for shape in ['known','opaque'] for mode in ['editable','read-only'] for timing in ['immediate','microtask']]
def para(ident,text,legacy=False):return dict(id=ident,type='paragraph',data=dict(text=text),**({} if legacy else dict(dataVersion=2)))
def document(spec,legacy=False,successor=False,changed=False):
    a=para('a',('Live' if changed else 'Successor' if successor else 'Alpha')+' {{swatch}}',legacy)
    a['inline']=dict(swatch=dict(type='color',data=dict(value='#aBcDef'),**({} if legacy else dict(dataVersion=1))))
    u=dict(id='u',type='future-block',data=dict(text='Opaque',rows=[dict(value=7)],__proto__=dict(literal=True)),**({} if legacy else dict(dataVersion=7)))
    return [a,*([u] if spec['shape']=='opaque' else []),para('c','Charlie',legacy)]
def expected_case(spec,legacy):
    values={};other=[para('a','Outside',legacy)]
    def put(phase,property,value):values[(phase,property)]=value
    put('load','canonical',document(spec,legacy));put('load','ready',True);put('load','readOnly',spec['mode']=='read-only');put('load','iteratorFirst','a')
    if not legacy:put('load','ownerCount',3);put('load','initialTaskAbort',[spec['mode']=='read-only']*3)
    put('destroy','ready',False);put('destroy','rootRemoved',True)
    if not legacy:put('destroy','destroyEvents',1);put('destroy','ownersDisposed',[1]*3);put('destroy','tasksAborted',[True]*3)
    put('destroy','holderReacquired',True);put('destroy','successorCanonical',document(spec,legacy,True))
    for name in OPERATIONS:
        if not legacy or name not in ['blocks.update','blocks.focus']:put('retained',name,dict(errorName='Error',reads=0,producers=0))
    if not legacy:
        put('retained','tasksDenied',dict(results=[False]*3,reads=0,producers=0));put('retained','contextReadsDenied',[True]*3)
        put('retained','ownersStillDisposed',[1]*3);put('retained','destroyEvents',1);put('retained','oldDocumentEvents',0)
    put('retained','unsubscribeSafe',None);put('retained','oldMarkupUnchanged',LEGACY_MARKUP if legacy else 'Alpha ')
    put('retained','successorCanonical',document(spec,legacy,True));put('retained','successorHistory',[False,False]);put('retained','otherCanonical',other);put('retained','otherHistory',[False,False])
    put('retained','foreignFocusAndRange',dict(active=True,anchor=True,focus=True,anchorOffset=1,focusOffset=3,text='ut'))
    if not legacy:put('live','freshTask',dict(accepted=True,calls=1,events=0))
    put('live','canonical',document(spec,legacy,True,True));put('live','history',[True,False]);put('live','undoAvailable',True);put('live','undoCanonical',document(spec,legacy,True));put('live','redoAvailable',True);put('live','redoCanonical',document(spec,legacy,True,True))
    if not legacy:put('live','oldDocumentEvents',0);put('live','destroyEvents',1)
    put('live','otherUnchanged',other);put('dispose','rootsRemoved',True)
    events=[] if legacy else [dict(action=a,origin='external' if a=='commit' else 'history',name='block.update') for a in ['commit','undo','redo']]
    return values,events
def verify_case(case,legacy=False,require_pass=True):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None and case['diagnostics']==[]
    assert case['planned']==case['completedPhases']==['load','destroy','retained','live','dispose']
    expected,events=expected_case(spec,legacy)
    observed={(o['phase'],o['property']):o for o in case['observations']};assert len(observed)==len(case['observations'])
    assert set(observed)==set(expected),(case['id'],set(observed)-set(expected),set(expected)-set(observed))
    for key,wanted in expected.items():
        o=observed[key];assert exact(o['expected'],wanted),(case['id'],key,o,wanted)
        assert o['status']==('PASS' if exact(o['actual'],wanted) else 'FAIL')
        if require_pass:assert exact(o['actual'],wanted),(case['id'],key,o,wanted)
    assert exact(case['transactions'],events)
    assert [o['property'] for o in case['unsupported']]==(['currentInstanceAndEventObservations','blocks.update','blocks.focus','currentLiveProducerApi'] if legacy else [])
    return len(expected)+1

def git_blobs(queries):
    queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode())
    result={};offset=0
    for query in queries:
        end=raw.index(b'\n',offset);header=raw[offset:end].split();assert len(header)==3 and header[1]==b'blob',query
        size=int(header[2]);offset=end+1;result[query]=raw[offset:offset+size];offset+=size
        assert raw[offset:offset+1]==b'\n';offset+=1
    assert offset==len(raw);return result

def main():
    import math
    import re
    parser=argparse.ArgumentParser()
    for name in ['raw','output']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--browser',type=Path);parser.add_argument('--candidate',required=True);parser.add_argument('--exploratory',action='store_true')
    opts=parser.parse_args();raw=read(opts.raw);data=json.loads(raw);root=Path('scripts/parity/checkpoints/2026-11-03/public-destroy')
    assert data['headBefore']==data['headAfter']==opts.candidate and data['candidatePass'] is True
    assert data['filter']=='' and data['group']=='public-destroy' and data['serverErrors']==[]
    assert [r['source'] for r in data['results']]==['v1','spec-baseline','candidate']
    assert {s['label']:s['sha'] for s in data['sources']}=={'v1':V1,'spec-baseline':BASELINE,'candidate':opts.candidate}
    semantic={};history=[]
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],specs()) and row['pageErrors']==row['inputErrors']==[]
        semantic[row['source']]=sum(verify_case(c,row['source']=='v1',row['source']=='candidate') for c in row['cases'])
        for c in row['cases']:
            for diagnostic in c['diagnostics']:assert type(diagnostic['timestamp']) in (int,float) and math.isfinite(diagnostic['timestamp'])
        history.append(dict(source=row['source'],cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations']),unsupportedObservations=sum(len(c['unsupported']) for c in row['cases'])))
    runner='scripts/parity/public-destroy.mjs';fixture='tests/browser/public-destroy-fixture.js'
    own=['tests/browser/public-destroy.html','tests/browser/public-destroy.js','tests/browser/run.mjs','tests/browser/regressions/harness.js','tests/browser/lifecycle.js','tests/browser/heap-gate.mjs','tests/browser/environment.mjs']
    queries=[s['sha']+':'+p for s in data['sources'] for p in s['loaded']]
    queries += [opts.candidate+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/public-destroy/review.py'
        queries += [opts.candidate+':'+p for p in [reviewer,*own]]
    acceptance='9f83e98ec054833278aaa387d5c9187b4939b791'
    inherited='scripts/parity/checkpoints/2026-11-03/public-snapshots/affected-manifest.json.gz'
    queries += [acceptance+':'+inherited]
    blobs=git_blobs(queries)
    for s in data['sources']:
        assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip()
        for p,sha in s['loaded'].items():assert digest(blobs[s['sha']+':'+p])==sha
    for p in [runner,fixture]:assert Path(p).read_bytes()==blobs[opts.candidate+':'+p]
    assert data['runnerSha256']==digest(blobs[opts.candidate+':'+runner]) and data['fixtureSha256']==digest(blobs[opts.candidate+':'+fixture])
    runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json']
    assert subprocess.check_output(['git','diff','--name-only',INTEGRATION,opts.candidate,'--',*runtime])==b''
    integrated_stored=(root/'integration-manifest.json.gz').read_bytes();assert integrated_stored==blobs[acceptance+':'+inherited]
    integrated_bytes=gzip.decompress(integrated_stored);integrated=json.loads(integrated_bytes)
    assert integrated['source']['head']==INTEGRATION and integrated['source']['dirty'] is False
    assert integrated['outcome']=='passed' and integrated['sourceUnchanged'] is True and len(integrated['gates'])==13
    assert all(g['outcome']=='passed' and g['sourceUnchanged'] is True for g in integrated['gates'].values())
    if not opts.exploratory:
        for p in [reviewer,*own]:assert Path(p).read_bytes().replace(b'\r\n',b'\n')==blobs[opts.candidate+':'+p]
        browser=read(opts.browser).decode();environment=json.loads(browser.splitlines()[0].split('Browser environment: ',1)[1])
        assert environment['product']=='Chrome/'+data['browser']
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==53
        current=json.JSONDecoder().raw_decode(browser.split('public-destroy.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in current]==['Public editor destroy '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in current)
        frozen=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert frozen['source']['head']==opts.candidate and frozen['source']['dirty'] is False
        for name in ['types','browser','heap']:
            gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
        heap_bytes=(opts.browser.parent/'heap.log').read_bytes();heap_log=heap_bytes.decode();heap_env=json.loads(heap_log.splitlines()[0].split('Heap environment: ',1)[1])
        assert heap_env['product']==environment['product'] and heap_env['revision']==environment['revision']
        heap=json.loads(heap_log.splitlines()[-1]);assert heap['sentinels']==23 and heap['retained']==0
        assert heap['historyEviction']['retainedControlReleased'] is True and heap['historyEviction']['replay']==dict(currentCase=12,undoCase=11,editorAlive=True)
        assert [p['phase'] for p in heap['historyEviction']['phases']]==['before-eviction','after-eviction-with-retained-control','after-releasing-control']
    for p,sha in data['dependencyFiles'].items():assert digest((Path('node_modules')/p).read_bytes())==sha
    for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=8,semanticChecks=semantic,history=history,rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),
                integratedRuntime=INTEGRATION,integrationManifestSha256=digest(integrated_bytes),primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'])
    if not opts.exploratory:report.update(browserSha256=digest(read(opts.browser)),heapSha256=digest(heap_bytes),heapSentinels=heap['sentinels'],heapRetained=heap['retained'])
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
