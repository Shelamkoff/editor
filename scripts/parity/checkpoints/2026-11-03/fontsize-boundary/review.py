"""Independent literal oracle for the font-size field-boundary RED/GREEN."""
import argparse,gzip,hashlib,json,subprocess
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def specs():return [dict(id=tag+'/'+kind,tag=tag,styled=kind=='styled-field',ancestor=kind=='styled-ancestor') for tag in ['p','span'] for kind in ['plain-field','styled-field','styled-ancestor']]
def expected(spec,legacy):
    before=[dict(id='a',type='span-text',data=dict(text='Alpha'),**({} if legacy else dict(dataVersion=2)))]
    text='<span style="font-size: 24px;">Alpha</span>';after=[dict(before[0],data=dict(text=text))]
    field='36px' if spec['styled'] else '';ancestor='36px' if spec['ancestor'] else ''
    return {('load','canonical'):before,('load','fieldStyle'):field,('load','ancestorStyle'):ancestor,('load','fieldEditable'):'true',('load','toolActive'):(spec['styled'] and spec['tag']=='span'),
      ('apply','trustedPicker'):True,('apply','prefill'):('36' if spec['styled'] and spec['tag']=='span' else '16'),('apply','trustedInput'):True,('apply','auxiliaryFocus'):True,('apply','beforeApplyCanonical'):before,('apply','beforeApplyHistory'):[False,False],('apply','trustedApply'):True,('apply','canonical'):after,('apply','fieldStyle'):field,('apply','ancestorStyle'):ancestor,('apply','history'):[True,False],
      ('undo','available'):True,('undo','text'):'Alpha',('redo','available'):True,('redo','text'):text,('dispose','rootRemoved'):True}
def verify(case,legacy,broken):
    spec=case['spec'];assert case['id']==spec['id'] and case['error'] is None and case['diagnostics']==[]
    assert case['planned']==case['completedPhases']==['load','apply','undo','redo','dispose']
    wanted=expected(spec,legacy);actual={k:v for k,v in wanted.items()}
    lost=broken and spec['styled'] and spec['tag']=='span'
    if lost:actual.update({('apply','canonical'):wanted[('load','canonical')],('apply','fieldStyle'):'24px',('apply','history'):[False,False],('undo','available'):False,('redo','available'):False,('redo','text'):'Alpha'})
    observed={(o['phase'],o['property']):o for o in case['observations']};assert len(observed)==len(case['observations']) and set(observed)==set(wanted)
    for key,value in wanted.items():
        o=observed[key];assert same(o['expected'],value),(spec['id'],key,o,value)
        assert same(o['actual'],actual[key]),(spec['id'],key,o,actual[key])
        assert o['status']==('PASS' if same(actual[key],value) else 'FAIL')
    events=[] if legacy or lost else [dict(action=a,origin='user' if a=='commit' else 'history',name='inline.fontSize') for a in ['commit','undo','redo']]
    assert same(case['transactions'],events)
    assert [p['property'] for p in case['unsupported']]==(['currentTransactionPort'] if legacy else [])
    return sum(not same(wanted[k],actual[k]) for k in wanted)
def git_blobs(queries):
    queries=sorted(set(queries));out=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());pos=0;blobs={}
    for q in queries:
        end=out.index(b'\n',pos);header=out[pos:end].split();assert len(header)==3 and header[1]==b'blob',q
        size=int(header[2]);pos=end+1;blobs[q]=out[pos:pos+size];pos+=size;assert out[pos:pos+1]==b'\n';pos+=1
    assert pos==len(out);return blobs
def main():
    p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--mode',choices=['red','green'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    raw=a.raw.read_bytes();d=json.loads(raw)
    assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is (a.mode=='green')
    assert d['group']=='fontsize-boundary' and d['filter']=='' and d['serverErrors']==[]
    assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
    failures={}
    for row in d['results']:
        assert row['pageErrors']==row['inputErrors']==[] and [c['spec'] for c in row['cases']]==specs()
        broken=row['source']=='spec-baseline' or (row['source']=='candidate' and a.mode=='red')
        failures[row['source']]=sum(verify(c,row['source']=='v1',broken) for c in row['cases'])
        assert failures[row['source']]==(6 if broken else 0)
    own=['scripts/parity/fontsize-boundary.mjs','tests/browser/fontsize-boundary-fixture.js']
    queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[a.candidate+':'+path for path in own]
    blobs=git_blobs(queries)
    for s in d['sources']:
        assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip()
        for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
    for path in own:assert Path(path).read_bytes()==blobs[a.candidate+':'+path]
    assert sha(blobs[a.candidate+':'+own[0]])==d['runnerSha256'] and sha(blobs[a.candidate+':'+own[1]])==d['fixtureSha256']
    for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
    for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
    report=dict(status='PASS',mode=a.mode,candidate=a.candidate,candidatePass=d['candidatePass'],cases=6,observationsPerSource=126,failures=failures,positiveCandidateCases=6 if a.mode=='green' else 5,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),moduleIdentities=sum(len(s['loaded']) for s in d['sources']))
    a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
