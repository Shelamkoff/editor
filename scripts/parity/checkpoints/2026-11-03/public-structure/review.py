"""Independent author model of public structural commands; no fixture imports."""
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
VARIANTS=['insert-head','insert-middle','insert-tail','insert-default','insert-rich','update-data','update-table','update-tunes','reset-tunes','update-noop','update-noop-keyorder','move-forward','move-backward','move-noop','remove-first','remove-middle','remove-last','remove-final','remove-final-opaque','unknown-update','unknown-insert','missing-remove','move-invalid','insert-index-invalid','update-invalid-patch','nested-other','nested-same','nested-insert-remove','caught-nested-failure']
def digest(raw):return hashlib.sha256(raw).hexdigest()
def exact(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def read(path):
    raw=Path(path).read_bytes();return gzip.decompress(raw) if str(path).endswith('.gz') else raw
def specs():return [dict(id='/'.join([v,mode]),variant=v,mode=mode) for v in VARIANTS for mode in ['editable','read-only']]
def para(ident,text,legacy=False):return dict(id=ident,type='paragraph',data=dict(text=text),**({} if legacy else dict(dataVersion=2)))
def table_data(legacy=False,changed=False):
    if legacy:return dict(withHeadings=False,content=[['Left','Right']])
    return dict(withHeadings=False,rows=[dict(id='r0',cells=[dict(id='c0',text='<b>Changed</b>' if changed else 'Left'),dict(id='c1',text='Right')])]+([dict(id='r1',cells=[dict(id='c0',text='Below'),dict(id='c1',text='Last')])] if changed else []))
def initial(spec,legacy=False):
    v=spec['variant'];a=para('a','<b>Alpha</b>',legacy)
    u=dict(id='u',type='future-block',data=dict(text='Opaque',rows=[dict(value=7)],__proto__=dict(literal=True)),tunes=dict(layout=dict(gap=2)),**({} if legacy else dict(dataVersion=7)))
    if v=='remove-final':return [a]
    if v=='remove-final-opaque':return [u]
    if v in ['reset-tunes','update-noop-keyorder']:a['tunes']=dict(layout=dict(gap=2,width=3),textAlign='right')
    return [a,dict(id='t',type='table',data=table_data(legacy),**({} if legacy else dict(dataVersion=2))),u,para('c','Charlie',legacy)]
def inserted(v,ident,legacy):
    record=para(ident,'' if v=='insert-default' else '<b>Inserted</b> {{future}}' if v=='insert-rich' else 'Inserted',legacy)
    if v=='insert-rich':
        record['tunes']=dict(textAlign='center',layout=dict(gap=5))
        record['inline']=dict(future=dict(type='future-inline',data=dict(nested=dict(value=9),__proto__=dict(literal=True)),**({} if legacy else dict(dataVersion=3))))
    return record
def producer(v):return v.startswith(('update','nested')) or v in ['reset-tunes','unknown-update','caught-nested-failure']
def denied(v):return v in ['unknown-update','unknown-insert','missing-remove','move-invalid','insert-index-invalid','update-invalid-patch','caught-nested-failure']
def no_change(v):return v in ['update-noop','update-noop-keyorder','move-noop'] or denied(v)
def target(spec,legacy,ident):
    v=spec['variant'];rows=initial(spec,legacy)
    if (legacy and producer(v)) or no_change(v):return rows
    if v.startswith('insert'):rows.insert(0 if v=='insert-head' else 2 if v=='insert-middle' else len(rows),inserted(v,ident,legacy))
    elif v=='move-forward':rows.append(rows.pop(0))
    elif v=='move-backward':rows.insert(0,rows.pop())
    elif v.startswith('remove-final'):return [] if legacy else [para(ident,'')]
    elif v.startswith('remove'):rows.pop(0 if v=='remove-first' else 2 if v=='remove-middle' else 3)
    elif v=='update-data':rows[0]['data']['text']='<i>Updated</i>'
    elif v=='update-table':rows[1]['data']=table_data(False,True);rows[1]['tunes']=dict(layout=dict(gap=5))
    elif v=='update-tunes':rows[0]['tunes']=dict(textAlign='center',layout=dict(gap=5))
    elif v=='reset-tunes':del rows[0]['tunes']
    elif v=='nested-other':rows[0]['data']['text']='<i>Updated</i>';rows[3]['data']['text']='Nested C'
    elif v=='nested-same':rows[0]['data']['text']='Nested A';rows[0]['tunes']=dict(textAlign='center')
    elif v=='nested-insert-remove':
        rows[0]['data']['text']='<i>Updated</i>';return [rows[3],rows[0],para(ident,'Nested inserted'),rows[1]]
    return rows
def expected_case(spec,legacy,ident):
    v=spec['variant'];starting=initial(spec,legacy);version='1.0.5' if legacy else '2.0.0';skipped=legacy and (producer(v) or v=='missing-remove');changed=not (no_change(v) or skipped)
    values={}
    def put(phase,property,value):values[(phase,property)]=value
    allocation=not skipped and not no_change(v) and (v.startswith(('insert','remove-final')) or v=='nested-insert-remove') and not (legacy and v.startswith('remove-final'))
    if allocation:
        assert isinstance(ident,str) and ident and ident not in [r['id'] for r in starting]
        put('apply','freshIdentity',True)
    if not legacy and not allocation:assert ident is None
    wanted=target(spec,legacy,ident);seeded=copy.deepcopy(starting);seeded[0]['data']['text']='Seed'
    put('load','canonical',starting);put('load','version',version);put('load','history',[False,False] if spec['mode']=='read-only' else [False,True])
    error=None if skipped or not denied(v) else 'TypeError' if v=='update-invalid-patch' else 'RangeError' if v in ['move-invalid','insert-index-invalid'] else 'Error'
    put('apply','errorName',error)
    if not skipped and (v.startswith('insert') or v=='unknown-insert'):
        record=inserted(v,'unused',legacy);caller=dict(type='missing-type' if v=='unknown-insert' else 'paragraph')
        if v!='insert-default':caller['data']=record['data']
        for key in ['tunes','inline']:
            if key in record:caller[key]=record[key]
        put('apply','callerUnchanged',caller)
    put('apply','canonical',wanted);put('apply','afterCallerMutation',wanted);put('apply','version',version);put('apply','readOnly',spec['mode']=='read-only')
    calls=0 if legacy or v=='unknown-update' or not producer(v) else 2 if v in ['nested-other','nested-same','caught-nested-failure'] else 1
    put('apply','producerCalls',calls)
    if not legacy and v=='caught-nested-failure':put('apply','innerCaught',True)
    put('apply','history',[False,False] if spec['mode']=='read-only' else [True,False] if changed else [False,True])
    name='block.insert' if v.startswith('insert') or v=='unknown-insert' else 'block.move' if v.startswith('move') else 'block.remove' if v.startswith('remove') or v=='missing-remove' else 'block.update'
    events=[] if legacy or not changed else [dict(action='commit',origin='external',name=name)]
    if not legacy:
        put('apply','events',events)
        put('apply','diagnostics',[dict(code='command.failed',operation=name,errorName=error)] if error else [])
    put('replay','revealedHistory',[True,False] if changed else [False,True])
    put('replay','undoAvailable',True);put('replay','undoCanonical',starting);put('replay','undoHistory',[False,True])
    put('replay','redoAvailable',True);put('replay','redoCanonical',wanted if changed else seeded);put('replay','redoHistory',[True,False]);put('dispose','rootRemoved',True)
    if not legacy:events=events+[dict(action=action,origin='history',name=name if changed else 'document.render') for action in (['undo','redo'] if changed else ['redo','undo'])]
    return values,events
def verify_case(case,legacy=False,require_pass=True):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None
    assert case['planned']==case['completedPhases']==['load','apply','replay','dispose']
    expected,events=expected_case(spec,legacy,case['allocatedId'])
    actual={(o['phase'],o['property']):o for o in case['observations']};assert len(actual)==len(case['observations'])
    assert set(actual)==set(expected),(case['id'],set(actual)-set(expected),set(expected)-set(actual))
    for key,wanted in expected.items():
        o=actual[key];assert exact(o['expected'],wanted),(case['id'],key,o,wanted)
        assert o['status']==('PASS' if exact(o['actual'],wanted) else 'FAIL')
        if require_pass:assert exact(o['actual'],wanted),(case['id'],key,o,wanted)
    assert exact(case['transactions'],events),(case['id'],case['transactions'],events)
    if legacy:
        ports=['currentTransactionPort']+(['currentProducerApi'] if producer(spec['variant']) else [])+(['currentRemoveIdRejection'] if spec['variant']=='missing-remove' else [])+(['currentDefaultMaterialization'] if spec['variant'].startswith('remove-final') else [])
        assert [o['property'] for o in case['unsupported']]==ports
        diagnostics=case['diagnostics']
        assert exact([{k:v for k,v in o.items() if k!='timestamp'} for o in diagnostics],[dict(code='command.failed',operation='block.insert',errorName='Error')] if spec['variant']=='unknown-insert' else [])
        for o in diagnostics:assert set(o)=={'code','timestamp','operation','errorName'} and type(o['timestamp']) in (int,float) and o['timestamp']>0
    else:
        assert case['unsupported']==[]
        diagnostics=case['diagnostics'];assert exact([{k:v for k,v in o.items() if k!='timestamp'} for o in diagnostics],expected[('apply','diagnostics')])
        for o in diagnostics:assert set(o)=={'code','timestamp','operation','errorName'} and type(o['timestamp']) in (int,float) and o['timestamp']>0
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
    opts=parser.parse_args();raw=read(opts.raw);data=json.loads(raw);root=Path('scripts/parity/checkpoints/2026-11-03/public-structure')
    assert data['headBefore']==data['headAfter']==opts.candidate and data['candidatePass'] is True
    assert data['filter']=='' and data['group']=='public-structure' and data['serverErrors']==[]
    assert [r['source'] for r in data['results']]==['v1','spec-baseline','candidate']
    assert {s['label']:s['sha'] for s in data['sources']}=={'v1':V1,'spec-baseline':BASELINE,'candidate':opts.candidate}
    semantic={};history=[]
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],specs()) and row['pageErrors']==row['inputErrors']==[]
        semantic[row['source']]=sum(verify_case(c,row['source']=='v1',row['source']=='candidate') for c in row['cases'])
        for c in row['cases']:
            for diagnostic in c['diagnostics']:assert type(diagnostic['timestamp']) in (int,float) and math.isfinite(diagnostic['timestamp'])
        history.append(dict(source=row['source'],cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations']),unsupportedObservations=sum(len(c['unsupported']) for c in row['cases'])))
    runner='scripts/parity/public-structure.mjs';fixture='tests/browser/public-structure-fixture.js'
    own=['tests/browser/public-structure.html','tests/browser/public-structure.js','tests/browser/run.mjs','tests/browser/regressions/harness.js']
    queries=[s['sha']+':'+p for s in data['sources'] for p in s['loaded']]
    queries += [opts.candidate+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/public-structure/review.py'
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
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==52
        current=json.JSONDecoder().raw_decode(browser.split('public-structure.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in current]==['Public block structure '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in current)
        frozen=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert frozen['source']['head']==opts.candidate and frozen['source']['dirty'] is False
        for name in ['types','browser']:
            gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
    for p,sha in data['dependencyFiles'].items():assert digest((Path('node_modules')/p).read_bytes())==sha
    for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=58,semanticChecks=semantic,history=history,rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),
                integratedRuntime=INTEGRATION,integrationManifestSha256=digest(integrated_bytes),primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'])
    if not opts.exploratory:report['browserSha256']=digest(read(opts.browser))
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
