"""Literal, source-bound oracle for pending RGB followed by native opacity input."""
import argparse,hashlib,json,subprocess
from pathlib import Path
def sha(raw):return hashlib.sha256(raw).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def specs():return [dict(id=('trusted' if trusted else 'plain')+'/'+action,trustedTypes=trusted,action=action) for trusted in [False,True] for action in ['apply','enter','reset','escape','outside','alpha']]
def meaning(bg):return [dict(kind='text',text=letter,marks=['b'] if index<5 else [],bg=bg if index<5 else None,color='#800000' if index<5 else None,size=None) for index,letter in enumerate('Alpha rest')]
def document(bg):
    style=('background-color: '+bg+'; ' if bg else '')+'color: rgb(128, 0, 0);'
    return [dict(id='a',type='paragraph',dataVersion=2,data=dict(text='<b><span style="'+style+'">Alpha</span></b> rest'))]
def expected(spec,broken):
    action=spec['action'];cancel=action in ['escape','outside'];alpha=action=='alpha'
    before=document('rgb(0, 0, 255)');selected=dict(anchor=5,focus=0,text='Alpha',field=True,collapsed=False)
    intended=None if action=='reset' else '#ff0000@0.5' if alpha else '#ff0000'
    actualColor='#0000ff@0.5' if broken and alpha else intended
    after=document(None if action=='reset' else ('rgba(0, 0, 255, 0.5)' if broken else 'rgba(255, 0, 0, 0.5)') if alpha else 'rgb(255, 0, 0)')
    events=[dict(action='commit',origin='user',name='inline.bgcolor')]
    wanted={('load','actualTrustedTypesPolicy'):spec['trustedTypes'],('load','initialMeaning'):meaning('#0000ff'),('load','history'):[False,False],('load','selection'):selected,
      ('auxiliary','trustedPicker'):True,('auxiliary','nativeRealmOwner'):dict(owner=True,fallback=True,parentPickers=0),('auxiliary','trustedInput'):True,('auxiliary','auxiliaryFocus'):True,('auxiliary','beforeAction'):before,('auxiliary','beforeActionHistory'):[False,False],
      ('action','trustedAction'):True,('action','intendedMeaning'):meaning(intended),('action','producer'):1,('action','events'):events,('action','history'):[True,False],('action','closed'):True,('action','selection'):selected,
      ('undo','exactCanonical'):before,('undo','history'):[False,True],('redo','exactCanonical'):after,('redo','meaning'):meaning(intended),('redo','history'):[True,False],
      ('dispose','retiredProducer'):1,('dispose','ownedRootRemoved'):True,('dispose','noParentLeak'):0}
    if cancel:
      wanted.update({('action','cancelCanonical'):before,('action','cancelHistory'):[False,False],('action','cancelProducer'):0,('action','cancelClosed'):True,('action','trustedReopen'):True,('action','trustedReinput'):True})
      wanted[('action','cancelRestoredSelection') if action=='escape' else ('action','trustedOutside')]=selected if action=='escape' else True
    if alpha:wanted.update({('action','typedColorBeforeOpacity'):'#ff0000',('action','trustedAlpha'):True,('action','alphaValue'):'0.5'})
    actual=dict(wanted)
    if broken and alpha:
      actual[('action','intendedMeaning')]=meaning(actualColor);actual[('redo','meaning')]=meaning(actualColor)
    return wanted,actual,events
def git_blobs(queries):
    queries=sorted(set(queries));out=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());pos=0;blobs={}
    for q in queries:
      end=out.index(b'\n',pos);header=out[pos:end].split();assert len(header)==3 and header[1]==b'blob',q
      size=int(header[2]);pos=end+1;blobs[q]=out[pos:pos+size];pos+=size;assert out[pos:pos+1]==b'\n';pos+=1
    assert pos==len(out);return blobs
def main():
    p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--mode',choices=['red','green'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    raw=a.raw.read_bytes();d=json.loads(raw);broken=a.mode=='red'
    assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is not broken
    assert d['group']=='bgcolor-realm' and d['filter']=='' and d['serverErrors']==[]
    assert len(d['sources'])==len(d['results'])==1 and d['sources'][0]['label']=='candidate' and d['sources'][0]['sha']==a.candidate
    row=d['results'][0];assert row['source']=='candidate' and row['pageErrors']==row['inputErrors']==[]
    assert [c['spec'] for c in row['cases']]==specs()
    observations=0;failures=0;positive=0
    for case in row['cases']:
      assert case['id']==case['spec']['id'] and case['error'] is None and case['diagnostics']==case['unsupported']==[]
      assert case['planned']==case['completedPhases']==['load','auxiliary','action','undo','redo','dispose']
      wanted,actual,events=expected(case['spec'],broken)
      observed={(o['phase'],o['property']):o for o in case['observations']}
      assert len(observed)==len(case['observations']) and set(observed)==set(wanted),(case['id'],set(observed)^set(wanted))
      caseFailures=0
      for key,value in wanted.items():
        o=observed[key];assert same(o['expected'],value),(case['id'],key,'expected',o,value)
        assert same(o['actual'],actual[key]),(case['id'],key,'actual',o,actual[key])
        passed=same(actual[key],value);assert o['status']==('PASS' if passed else 'FAIL')
        caseFailures+=not passed
      assert caseFailures==(2 if broken and case['spec']['action']=='alpha' else 0)
      assert case['transactions']==events+[dict(action=action,origin='history',name='inline.bgcolor') for action in ['undo','redo']]
      failures+=caseFailures;positive+=not caseFailures;observations+=len(observed)
    assert failures==(4 if broken else 0) and positive==(10 if broken else 12)
    own=['scripts/parity/bgcolor-realm.mjs','tests/browser/bgcolor-realm-fixture.js','tests/browser/bgcolor-realm-host.html','tests/browser/bgcolor-realm-trusted-host.html']
    source=d['sources'][0];assert len(source['loaded'])>=100
    assert {'core/index.js','inline-tools/colorPicker.js','shared/colorPickerRealm.js'}.issubset(source['loaded'])
    blobs=git_blobs([a.candidate+':'+path for path in set(source['loaded'])|set(own)])
    assert source['tree']==subprocess.check_output(['git','rev-parse',a.candidate+'^{tree}']).decode().strip()
    for path,h in source['loaded'].items():assert sha(blobs[a.candidate+':'+path])==h
    for path in own:assert Path(path).read_bytes()==blobs[a.candidate+':'+path]
    assert sha(blobs[a.candidate+':'+own[0]])==d['runnerSha256'] and sha(blobs[a.candidate+':'+own[1]])==d['fixtureSha256']
    assert d['fixtureFiles']=={path:sha(blobs[a.candidate+':'+path]) for path in own[2:]}
    for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
    for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
    assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
    assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
    report=dict(status='PASS',mode=a.mode,candidate=a.candidate,candidatePass=not broken,cases=12,observations=observations,failures=failures,positiveCases=positive,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),moduleIdentities=len(source['loaded']))
    a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
