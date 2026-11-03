"""Independent author model of public fact ordering and observer containment."""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
INTEGRATION='efc619d226117a4b0ee1308d1cbb114df5066210'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
TYPES=['editor:ready','currentBlock:changed','selection:changed','transaction:committed','document:changed','history:changed','readOnly:changed','editor:destroyed']
CAUSES=['undefined','null','false','zero','empty','nan','error']
VOID={'$undefined':True}
def digest(raw):return hashlib.sha256(raw).hexdigest()
def exact(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def read(path):
    raw=Path(path).read_bytes();return gzip.decompress(raw) if str(path).endswith('.gz') else raw
def specs():
    result=[]
    for target in TYPES:
        result.append(dict(id=target+'/clean',target=target,profile='clean',cause='none'))
        result += [dict(id='/'.join([target,profile,cause]),target=target,profile=profile,cause=cause) for profile in ['throw','reject'] for cause in CAUSES]
    return result+[dict(id='document:changed/'+p,target='document:changed',profile=p,cause='none') for p in ['unsubscribe-before','unsubscribe-after-first']]
def document(legacy=False,changed=False):
    a=dict(id='a',type='paragraph',data=dict(text='Beta' if changed else 'Alpha'))
    c=dict(id='c',type='paragraph',data=dict(text='Charlie'))
    if not legacy:
        a['dataVersion']=c['dataVersion']=2
        a['tunes']=dict(layout=dict(gap=3 if changed else 2),__proto__=dict(literal=True))
        if changed:a['tunes']['textAlign']='center'
    return [a,c]
def current_facts():
    before=document()[0];after=document(changed=True)[0]
    result=[('editor:ready',VOID),('currentBlock:changed',dict(currentId='c')),('selection:changed',dict(selectedIds=['a','c'])),('selection:changed',dict(selectedIds=[]))]
    for sequence,action in enumerate(['commit','undo','redo'],1):
        origin='external' if action=='commit' else 'history';history=dict(canUndo=action!='undo',canRedo=action=='undo')
        changes=[dict(kind='block.update',id='a',before=after if action=='undo' else before,after=before if action=='undo' else after)]
        result += [('transaction:committed',dict(sequence=sequence,origin=origin,action=action,name='block.update',changes=changes,history=history)),('document:changed',dict(origin=origin,action=action,changes=changes)),('history:changed',history)]
    return result+[('readOnly:changed',dict(readOnly=True)),('history:changed',dict(canUndo=False,canRedo=False)),('readOnly:changed',dict(readOnly=False)),('history:changed',dict(canUndo=True,canRedo=False)),('editor:destroyed',VOID)]
def legacy_facts_by_type():
    # Old timing is not the new typed fact contract. Compare each real topic's
    # ordered payloads/fan-out; retain its full cross-topic chronology raw.
    return {'editor:ready':[], 'transaction:committed':[],
        'currentBlock:changed':[dict(blockId='c')]+[dict(blockId='a')]*6,
        'selection:changed':[dict(blockIds=['a','c']),dict(blockIds=[])],
        'document:changed':[VOID]*3,
        'history:changed':[dict(canUndo=True,canRedo=False),dict(canUndo=False,canRedo=True),dict(canUndo=True,canRedo=False),dict(canUndo=False,canRedo=False),dict(canUndo=True,canRedo=False)],
        'readOnly:changed':[dict(readOnly=True),dict(readOnly=False)],'editor:destroyed':[VOID]}
def event_trace(spec,legacy=False):
    facts=[(kind,payload) for kind,values in legacy_facts_by_type().items() for payload in values] if legacy else current_facts()
    result=[];hits=0
    for kind,payload in facts:
        common=dict(type=kind,payload=payload,deepFrozen=None if exact(payload,VOID) else not legacy)
        if kind.startswith('editor:'):common['readyState']=True if legacy else kind=='editor:ready'
        result.append(dict(role='first',**common))
        if kind==spec['target'] and spec['profile']!='unsubscribe-before' and (spec['profile']!='unsubscribe-after-first' or hits==0):
            result.append(dict(role='middle',**common));hits+=1
        result.append(dict(role='last',**common))
    return result
def expected_case(spec,legacy):
    values={}
    def put(phase,property,value):values[(phase,property)]=value
    put('load','canonical',document(legacy));put('load','ready',True);put('load','readyHookCalls',1);put('load','history',[False,False])
    put('controls','canonical',document(legacy));put('controls','history',[False,False])
    put('commit','canonical',document(legacy,True));put('commit','history',[True,False]);put('commit','producerCalls',0 if legacy else 1)
    for phase in ['undo','redo']:
        put(phase,'available',True);put(phase,'canonical',document(legacy,phase=='redo'));put(phase,'history',[True,False] if phase=='redo' else [False,True])
    put('modes','readOnlyHistory',[True,False,False]);put('modes','editableHistory',[False,True,False]);put('modes','canonical',document(legacy,True))
    put('dispose','rootRemoved',True);put('dispose','ready',False);put('dispose','removedCalls',0);put('dispose','unhandled',[])
    if not legacy:
        trace=event_trace(spec);hits=sum(t['role']=='middle' for t in trace)
        put('dispose','eventTrace',trace);put('dispose','faultHits',hits)
        diagnostics=[dict(code='command.failed',operation='event:'+spec['target'],errorName='Error' if spec['cause']=='error' else 'UnknownError')]*hits if spec['profile'] in ['throw','reject'] else []
        put('dispose','diagnostics',diagnostics);put('dispose','diagnosticFrozen',[True]*len(diagnostics))
    return values
def verify_case(case,legacy=False,require_pass=True):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None and case['unhandled']==[]
    assert case['planned']==case['completedPhases']==['load','controls','commit','undo','redo','modes','dispose']
    expected=expected_case(spec,legacy)
    observed={(o['phase'],o['property']):o for o in case['observations']};assert len(observed)==len(case['observations']) and set(observed)==set(expected)
    for key,wanted in expected.items():
        o=observed[key];assert exact(o['expected'],wanted),(case['id'],key,o,wanted)
        assert o['status']==('PASS' if exact(o['actual'],wanted) else 'FAIL')
        if require_pass:assert exact(o['actual'],wanted),(case['id'],key,o,wanted)
    wanted=event_trace(spec,legacy);actual=case['trace']
    if legacy:
        assert all(t['type'] in TYPES for t in actual)
        for kind in TYPES:assert exact([t for t in actual if t['type']==kind],[t for t in wanted if t['type']==kind]),(case['id'],kind)
        assert case['diagnostics']==[]
    else:
        assert exact(actual,wanted)
        assert exact([{k:v for k,v in o.items() if k!='timestamp'} for o in case['diagnostics']],expected[('dispose','diagnostics')])
        for o in case['diagnostics']:assert set(o)=={'code','timestamp','operation','errorName'} and type(o['timestamp']) in (int,float) and o['timestamp']>0
    assert [o['property'] for o in case['unsupported']]==(['currentFactGraphAndTiming'] if legacy else [])
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
    opts=parser.parse_args();raw=read(opts.raw);data=json.loads(raw);root=Path('scripts/parity/checkpoints/2026-11-03/public-events')
    assert data['headBefore']==data['headAfter']==opts.candidate and data['candidatePass'] is True
    assert data['filter']=='' and data['group']=='public-events' and data['serverErrors']==[]
    assert [r['source'] for r in data['results']]==['v1','spec-baseline','candidate']
    assert {s['label']:s['sha'] for s in data['sources']}=={'v1':V1,'spec-baseline':BASELINE,'candidate':opts.candidate}
    semantic={};history=[]
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],specs()) and row['pageErrors']==row['inputErrors']==[]
        semantic[row['source']]=sum(verify_case(c,row['source']=='v1',row['source']=='candidate') for c in row['cases'])
        for c in row['cases']:
            for diagnostic in c['diagnostics']:assert type(diagnostic['timestamp']) in (int,float) and math.isfinite(diagnostic['timestamp'])
        history.append(dict(source=row['source'],cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations']),unsupportedObservations=sum(len(c['unsupported']) for c in row['cases'])))
    runner='scripts/parity/public-events.mjs';fixture='tests/browser/public-events-fixture.js'
    own=['tests/browser/public-events.html','tests/browser/public-events.js','tests/browser/run.mjs','tests/browser/regressions/harness.js']
    queries=[s['sha']+':'+p for s in data['sources'] for p in s['loaded']]
    queries += [opts.candidate+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/public-events/review.py'
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
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==54
        current=json.JSONDecoder().raw_decode(browser.split('public-events.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in current]==['Public editor events '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in current)
        frozen=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert frozen['source']['head']==opts.candidate and frozen['source']['dirty'] is False
        for name in ['types','browser']:
            gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
    for p,sha in data['dependencyFiles'].items():assert digest((Path('node_modules')/p).read_bytes())==sha
    for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=122,semanticChecks=semantic,history=history,rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),
                integratedRuntime=INTEGRATION,integrationManifestSha256=digest(integrated_bytes),primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'])
    if not opts.exploratory:report['browserSha256']=digest(read(opts.browser))
    report.update(fanoutDeliveries={r['source']:sum(len(c['trace']) for c in r['cases']) for r in data['results']},factNotifications={r['source']:sum(t['role']=='first' for c in r['cases'] for t in c['trace']) for r in data['results']},observerDiagnostics={r['source']:sum(len(c['diagnostics']) for c in r['cases']) for r in data['results']})
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
