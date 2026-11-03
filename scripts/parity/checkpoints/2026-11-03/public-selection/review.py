"""Independent author model for block control state; no fixture imports."""
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
    return [dict(id='/'.join([variant,mode,focus]),variant=variant,mode=mode,focus=focus)
            for variant in ['select-many','select-empty','clear','set-current','missing-select','missing-current','removed-select','removed-current','replaced-select','replaced-current','replaced-same-id']
            for mode in ['editable','read-only'] for focus in ['local','foreign']]
def paragraph(ident,text,legacy):return dict(id=ident,type='paragraph',data=dict(text=text),**({} if legacy else dict(dataVersion=2)))
def document(spec,legacy=False,seed=False):
    variant=spec['variant'];a=paragraph('a','Seed' if seed else 'New Alpha' if variant.startswith('replaced') else 'Alpha',legacy)
    b=dict(id='b',type='future-block',data=dict(text='Opaque',rows=[dict(value=7)]),**({} if legacy else dict(dataVersion=7)))
    missing=variant.startswith('removed') or variant in ['replaced-select','replaced-current']
    return [a,*([] if missing else [b]),paragraph('c','Charlie',legacy)]
def expected_case(spec,legacy):
    variant=spec['variant'];structural=variant.startswith(('removed','replaced'));version='1.0.5' if legacy else '2.0.0'
    available=[False,False] if spec['mode']=='read-only' else [structural,True]
    selected=(['a','b','c'] if variant=='select-many' else [] if variant in ['clear','select-empty'] else ['b','c'] if variant=='replaced-same-id' else ['a'])
    current='c' if variant in ['set-current','replaced-same-id'] else 'a'
    denied=variant.startswith(('missing','removed')) or variant in ['replaced-select','replaced-current']
    invalid_current=variant in ['missing-current','removed-current','replaced-current']
    text=('ew' if variant.startswith('replaced') else 'lp') if spec['focus']=='local' else 'ut'
    values={}
    def put(phase,property,value):values[(phase,property)]=value
    for phase in ['load','control']:
        put(phase,'canonical',document(spec,legacy));put(phase,'history',available);put(phase,'readOnly',spec['mode']=='read-only')
        put(phase,'current','a' if phase=='load' else current);put(phase,'selected',['a'] if phase=='load' else selected)
    put('load','version',version);put('load','focused',True);put('load','rangeText',text)
    if structural:put('load','oldRootRetired',True)
    put('control','errorName','Error' if denied and not (legacy and invalid_current) else None)
    put('control','focusPreserved',True);put('control','nativeRange',dict(anchor=True,focus=True,anchorOffset=1,focusOffset=3,text=text))
    if spec['focus']=='foreign':put('control','otherEditor',dict(canonical=[paragraph('a','Outside',legacy)],history=[False,False],readOnly=False,selected=[],current='a'))
    control_events=[]
    if not legacy:
        put('control','selectedSnapshotFrozen',True)
        if selected!=['a']:control_events.append(dict(type='selection:changed',selectedIds=selected))
        if current!='a':control_events.append(dict(type='currentBlock:changed',currentId=current))
        put('control','events',control_events)
    for action in ['redo','undo']:
        put('replay',action+'Available',True);put('replay',action+'Canonical',document(spec,legacy,action=='redo'))
        put('replay',action+'History',[True,False] if action=='redo' else [structural,True])
    put('dispose','rootRemoved',True)
    events=list(control_events)
    if not legacy:
        if spec['mode']=='read-only':events.append(dict(type='history:changed',action=None,name=None))
        if selected:events.append(dict(type='selection:changed',selectedIds=[]))
        for action in ['redo','undo']:
            events += [dict(type='transaction:committed',action=action,name='document.render'),dict(type='document:changed',action=action,name=None),dict(type='history:changed',action=None,name=None)]
    return values,events
def verify_case(case,legacy=False,require_pass=True):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None and case['diagnostics']==[]
    assert case['planned']==case['completedPhases']==['load','control','replay','dispose']
    expected,events=expected_case(spec,legacy)
    observations={(o['phase'],o['property']):o for o in case['observations']};assert len(observations)==len(case['observations'])
    assert set(observations)==set(expected),(case['id'],set(observations)-set(expected),set(expected)-set(observations))
    for key,wanted in expected.items():
        o=observations[key];assert exact(o['expected'],wanted),(case['id'],key,o,wanted)
        assert o['status']==('PASS' if exact(o['actual'],wanted) else 'FAIL')
        if require_pass:assert exact(o['actual'],wanted),(case['id'],key,o,wanted)
    assert exact(case['events'],events),(case['id'],case['events'],events)
    unsupported=['currentControlEventAndSnapshotPorts']+(['currentIdRejection'] if spec['variant'] in ['missing-current','removed-current','replaced-current'] else []) if legacy else []
    assert [o['property'] for o in case['unsupported']]==unsupported
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
    opts=parser.parse_args();raw=read(opts.raw);data=json.loads(raw);root=Path('scripts/parity/checkpoints/2026-11-03/public-selection')
    assert data['headBefore']==data['headAfter']==opts.candidate and data['candidatePass'] is True
    assert data['filter']=='' and data['group']=='public-selection' and data['serverErrors']==[]
    assert [r['source'] for r in data['results']]==['v1','spec-baseline','candidate']
    assert {s['label']:s['sha'] for s in data['sources']}=={'v1':V1,'spec-baseline':BASELINE,'candidate':opts.candidate}
    semantic={};history=[]
    for row in data['results']:
        assert exact([c['spec'] for c in row['cases']],specs()) and row['pageErrors']==row['inputErrors']==[]
        semantic[row['source']]=sum(verify_case(c,row['source']=='v1',row['source']=='candidate') for c in row['cases'])
        for c in row['cases']:
            for diagnostic in c['diagnostics']:assert type(diagnostic['timestamp']) in (int,float) and math.isfinite(diagnostic['timestamp'])
        history.append(dict(source=row['source'],cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations']),unsupportedObservations=sum(len(c['unsupported']) for c in row['cases'])))
    runner='scripts/parity/public-selection.mjs';fixture='tests/browser/public-selection-fixture.js'
    own=['tests/browser/public-selection.html','tests/browser/public-selection.js','tests/browser/run.mjs','tests/browser/regressions/harness.js']
    queries=[s['sha']+':'+p for s in data['sources'] for p in s['loaded']]
    queries += [opts.candidate+':'+p for p in [runner,fixture]]
    if not opts.exploratory:
        reviewer='scripts/parity/checkpoints/2026-11-03/public-selection/review.py'
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
        assert len(re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',browser,re.M))==51
        current=json.JSONDecoder().raw_decode(browser.split('public-selection.html: ',1)[1].lstrip())[0]
        assert [c['name'] for c in current]==['Public block selection '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in current)
        frozen=json.loads((opts.browser.parent/'manifest.json').read_bytes())
        assert frozen['source']['head']==opts.candidate and frozen['source']['dirty'] is False
        for name in ['types','browser']:
            gate=frozen['gates'][name];assert gate['outcome']=='passed' and gate['sourceUnchanged'] is True
            assert gate['sourceBefore']['identity']==gate['sourceAfter']['identity']==frozen['source']['identity']
    for p,sha in data['dependencyFiles'].items():assert digest((Path('node_modules')/p).read_bytes())==sha
    for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64'
    assert data['packageLockSha256']==digest(Path('package-lock.json').read_bytes())
    report=dict(status='PASS',candidate=opts.candidate,cases=44,semanticChecks=semantic,history=history,rawSha256=digest(raw),reviewerSha256=digest(Path(__file__).read_bytes()),
                integratedRuntime=INTEGRATION,integrationManifestSha256=digest(integrated_bytes),primaryProductionModuleIdentities=sum(len(s['loaded']) for s in data['sources']),dependencyFiles=len(data['dependencyFiles']),dependencyVersions=data['dependencyVersions'])
    if not opts.exploratory:report['browserSha256']=digest(read(opts.browser))
    opts.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
