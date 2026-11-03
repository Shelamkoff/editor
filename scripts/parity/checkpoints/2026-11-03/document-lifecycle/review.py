"""Independent author model for public document replacement; no fixture imports."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

INTEGRATION='efc619d226117a4b0ee1308d1cbb114df5066210'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def digest(raw):return hashlib.sha256(raw).hexdigest()
def exact(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def read(path):
    raw=Path(path).read_bytes()
    return gzip.decompress(raw) if str(path).endswith('.gz') else raw

def specs():
    result=[dict(id='/'.join([operation,shape,mode]),operation=operation,shape=shape,mode=mode)
            for operation in ['render-change','render-equal','render-empty','clear','clear-empty']
            for shape in (['known'] if operation=='clear-empty' else ['known','opaque']) for mode in ['editable','read-only']]
    result += [dict(id='/'.join(['invalid',invalid,shape,channel]),operation='invalid',invalid=invalid,shape=shape,validationChannel=channel,mode='editable')
               for invalid in ['no-version','legacy-version','wrong-blocks','future-registered'] for shape in ['known','opaque'] for channel in ['callback','no-callback']]
    return result

def para(ident,text,legacy):return dict(id=ident,type='paragraph',data=dict(text=text),**({} if legacy else dict(dataVersion=2)))
def document(spec,legacy=False,changed=False):
    if spec['operation']=='clear-empty':return [para('a','',legacy)]
    a=para('a','<i>Replaced</i> {{swatch}}' if changed else '<b>Alpha</b> {{swatch}}',legacy)
    a['inline']=dict(swatch=dict(type='color',data=dict(value='#aBcDef'),**({} if legacy else dict(dataVersion=1))))
    c=para('c','<b>Replaced C</b>' if changed else '<i>Charlie</i>',legacy)
    b=None
    if spec['shape']=='opaque':
        a['data']['text']+=' {{future}}'
        a['inline']['future']=dict(type='future-inline',data=dict(nested=dict(value=7),__proto__=dict(literal=True)),**({} if legacy else dict(dataVersion=3)))
        b=dict(id='b',type='future-block',data=dict(text='Opaque',rows=[dict(value=7)]),tunes=dict(layout=dict(gap=2)),**({} if legacy else dict(dataVersion=7)))
    return ([b,c,a] if b else [c,a]) if changed else ([a,b,c] if b else [a,c])

def owner_count(spec):return 1 if spec['operation']=='clear-empty' else 3
def closed(count):return dict(results=[False]*count,producers=0,options=0,aborted=[True]*count)
NOOP=dict(result=True,producers=1,newEvents=0)

def expected_case(spec,legacy,allocated):
    version='1.0.5' if legacy else '2.0.0';initial=document(spec,legacy);count=owner_count(spec);values={}
    def put(phase,property,value):values[(phase,property)]=value
    put('load','knownRootCount',count);put('load','version',version);put('load','canonical',initial);put('load','history',[False,False])
    if not legacy:put('load','initialTaskAbort',[spec['mode']=='read-only']*count)
    if spec['operation']=='invalid':
        if legacy:put('reject','legacyEditorUsable',dict(version='1.0.0' if spec['invalid']=='no-version' else version,blocks=True,root=True))
        else:
            supplied=dict(version=version,blocks=document(spec,False,True))
            if spec['invalid']=='no-version':del supplied['version']
            elif spec['invalid']=='legacy-version':supplied['version']='1.0.5'
            elif spec['invalid']=='wrong-blocks':supplied['blocks']={'not':'an array'}
            else:next(b for b in supplied['blocks'] if b['type']=='paragraph')['dataVersion']=999
            error='TypeError' if spec['invalid'] in ['no-version','wrong-blocks'] else 'RangeError'
            issue=(dict(reason='unsupported-document-version') if spec['invalid']=='legacy-version' else
                   dict(reason='unsupported-data-version',blockId='c',type='paragraph') if spec['invalid']=='future-registered' else dict(reason='invalid-input'))
            put('reject','callerInputUnchanged',supplied);put('reject','rejected',True);put('reject','canonical',initial);put('reject','version',version);put('reject','errorName',error)
            put('reject','validationIssues',[dict(issue=issue,frozen=True)] if spec['validationChannel']=='callback' else [])
            put('reject','expectedDiagnostic',[dict(code='command.failed',operation='document.render',errorName=error)])
            put('reject','diagnosticTimestamp',True);put('reject','history',[False,False]);put('reject','oldRootsPreserved',True)
            put('reject','tasksStillLive',[False]*count);put('reject','liveBlockNoop',NOOP);put('reject','liveInlineNoop',NOOP)
            put('reject','afterNoopCanonical',initial)
        events=[]
    else:
        default=spec['operation'] in ['render-empty','clear','clear-empty']
        if default:
            assert isinstance(allocated,str) and allocated and allocated not in [r['id'] for r in initial]
            target=[para(allocated,'',legacy)];put('apply','freshDefaultIdentity',True)
        else:
            assert allocated is None
            target=document(spec,legacy,True) if spec['operation']=='render-change' else initial
        if spec['operation'].startswith('render'):put('apply','callerInputUnchanged',dict(version=version,blocks=[] if spec['operation']=='render-empty' else target))
        put('apply','canonical',target);put('apply','version',version);put('apply','oldRootsRetired',True);put('apply','mode',spec['mode']=='read-only')
        if not legacy:
            put('apply','oldTasksDenied',closed(count));put('apply','oldOwnersDisposed',[1]*count);put('apply','liveBlockNoop',NOOP)
            if not default:put('apply','liveInlineNoop',NOOP)
        put('apply','afterNoopCanonical',target);put('apply','history',[True,False])
        for phase in ['undo','redo']:
            put(phase,'available',True);put(phase,'canonical',initial if phase=='undo' else target);put(phase,'version',version)
            if not legacy:
                previous=(1 if default else 3) if phase=='undo' else count
                put(phase,'previousTasksInitiallyLive',[False]*previous);put(phase,'oldTasksDenied',closed(count))
                put(phase,'previousTasksDenied',closed(previous));put(phase,'previousOwnersDisposed',[1]*previous);put(phase,'liveBlockNoop',NOOP)
            put(phase,'history',[False,True] if phase=='undo' else [True,False])
        name='document.render' if spec['operation'].startswith('render') else 'document.clear'
        events=[] if legacy else [dict(action=action,origin='external' if action=='commit' else 'history',name=name) for action in ['commit','undo','redo']]
    put('dispose','rootRemoved',True)
    return values,events

def verify_case(case,legacy=False,require_pass=True):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None
    planned=['load','reject','dispose'] if spec['operation']=='invalid' else ['load','apply','undo','redo','dispose']
    assert case['planned']==case['completedPhases']==planned
    expected,events=expected_case(spec,legacy,case['allocatedId'])
    observations={(o['phase'],o['property']):o for o in case['observations']};assert len(observations)==len(case['observations'])
    assert set(observations)==set(expected),(case['id'],set(observations)-set(expected),set(expected)-set(observations))
    for key,wanted in expected.items():
        o=observations[key];assert exact(o['expected'],wanted),(case['id'],key,o,wanted)
        assert o['status']==('PASS' if exact(o['actual'],wanted) else 'FAIL')
        if require_pass:assert exact(o['actual'],wanted),(case['id'],key,o,wanted)
    assert exact(case['transactions'],events)
    if legacy:
        assert [o['property'] for o in case['unsupported']]==['currentInstanceTaskAndEventObservations']+(['currentVersionValidationContract'] if spec['operation']=='invalid' else [])
        assert case['diagnostics']==[]
        if spec['operation']=='invalid':
            outcome=case['legacyOutcome'];assert outcome['rejected'] is False and outcome['errorName'] is None
            assert outcome['canUndo'] is True and outcome['canRedo'] is False and isinstance(outcome['document']['blocks'],list)
            assert outcome['document']['version']==('1.0.0' if spec['invalid']=='no-version' else '1.0.5')
            if spec['invalid']=='wrong-blocks' and spec['validationChannel']=='callback':
                fallback=outcome['document']['blocks'][0]
                assert isinstance(fallback['id'],str) and fallback['id'] not in [r['id'] for r in document(spec,True)]
                assert exact(fallback,para(fallback['id'],'',True))
                assert exact(case['validationIssues'],[dict(issue=dict(blockId=fallback['id'],type='paragraph',data=dict(text='')),frozen=False)])
            else:assert case['validationIssues']==[]
        else:assert case['legacyOutcome'] is None and case['validationIssues']==[]
    else:
        assert case['unsupported']==[] and case['legacyOutcome'] is None
        if spec['operation']=='invalid':
            diagnostic=case['diagnostics'];assert len(diagnostic)==1
            assert set(diagnostic[0])=={'code','timestamp','operation','errorName'}
            assert exact([{k:v for k,v in diagnostic[0].items() if k!='timestamp'}],expected[('reject','expectedDiagnostic')])
            assert isinstance(diagnostic[0]['timestamp'],(int,float)) and diagnostic[0]['timestamp']>0
            assert exact(case['validationIssues'],expected[('reject','validationIssues')])
        else:assert case['diagnostics']==case['validationIssues']==[]
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
    opts=parser.parse_args();raw=read(opts.raw);data=json.loads(raw);root=Path('scripts/parity/checkpoints/2026-11-03/document-lifecycle')
    assert data['headBefore']==data['headAfter']==opts.candidate and data['candidatePass'] is True
    assert data['filter']=='' and data['group']=='document-lifecycle' and data['serverErrors']==[]
    assert [r['source'] for r in data['results']]==['v1','spec-baseline','candidate']
    assert {s['label']:s['sha'] for s in data['sources']}=={'v1':V1,'spec-baseline':BASELINE,'candidate':opts.candidate}
    semantic={};history=[]
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],specs()) and row['pageErrors']==row['inputErrors']==[]
        semantic[row['source']]=sum(verify_case(c,row['source']=='v1',row['source']=='candidate') for c in row['cases'])
        for c in row['cases']:
            for diagnostic in c['diagnostics']:assert type(diagnostic['timestamp']) in (int,float) and math.isfinite(diagnostic['timestamp'])
        history.append(dict(source=row['source'],cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations']),unsupportedObservations=sum(len(c['unsupported']) for c in row['cases'])))
    runner='scripts/parity/document-lifecycle.mjs';fixture='tests/browser/document-lifecycle-fixture.js'
    own=['tests/browser/document-lifecycle.html','tests/browser/document-lifecycle.js','tests/browser/run.mjs','tests/browser/regressions/harness.js']
    queries=[s['sha']+':'+p for s in data['sources'] for p in s['loaded']]
    queries += [opts.candidate+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/document-lifecycle/review.py'
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
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==50
        current=json.JSONDecoder().raw_decode(browser.split('document-lifecycle.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in current]==['Public document lifecycle '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in current)
        frozen=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert frozen['source']['head']==opts.candidate and frozen['source']['dirty'] is False
        for name in ['types','browser']:
            gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
    for p,sha in data['dependencyFiles'].items():assert digest((Path('node_modules')/p).read_bytes())==sha
    for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=34,semanticChecks=semantic,history=history,rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),
                integratedRuntime=INTEGRATION,integrationManifestSha256=digest(integrated_bytes),primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'])
    if not opts.exploratory:report['browserSha256']=digest(read(opts.browser))
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
