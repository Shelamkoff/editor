"""Independent public task/occurrence state machine and continuation history."""
import argparse,gzip,hashlib,importlib.util,json,re,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
PHASES=['load','transition','completion','live','other-editor','dispose']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return [dict(id='/'.join([k,p,l]),kind=k,projection=p,lifetime=l) for k in ['block','inline'] for p in ['in-place','remount'] for l in ['other-edit','own-edit','mode','render','remove-undo','destroy-successor']]
def document(kind,label='A',count=0,other=False):return [dict(id='a',type='lease-probe',dataVersion=1,data=dict(label=label,count=count if kind=='block' else 0,text='{{ref}}'),inline=dict(ref=dict(type='lease-inline',dataVersion=1,data=dict(label=label,count=count if kind=='inline' else 0)))),dict(id='b',type='paragraph',dataVersion=2,data=dict(text='Other changed' if other else 'Bravo'))]
def values(s,baseline=False):
 life=s['lifetime'];remount=s['projection']=='remount';kind=s['kind'];nominal=life=='other-edit' or life=='own-edit' and not remount;missing=baseline and kind=='inline' and remount;accepted=nominal or missing and life=='own-edit'
 label='C' if life=='destroy-successor' else 'A';count=5 if label=='C' else 1 if life=='own-edit' else 0;initial_widget=5 if label=='C' else 0;other=life=='other-edit';prior=document(kind,label,count,other);before=[True,False] if life in ['other-edit','own-edit','render'] else [False,True] if life=='remove-undo' else [False,False];result=[]
 def add(phase,**entries):result.extend((phase,key,value) for key,value in entries.items())
 add('load',canonical=document(kind),otherCanonical=document(kind,'B',100),history=[False]*4,separateScopes=[True]*3)
 add('transition',canonical=prior,history=before,taskAborted=not accepted,callbacksBeforeCompletion=[0,0],otherTaskAlive=True,otherCanonical=document(kind,'B',100))
 add('completion',accepted=accepted,callbackCounts=[1 if baseline or accepted else 0,1 if accepted else 0,[count] if accepted else []])
 if accepted:count+=10
 completed=document(kind,label,count,other)
 add('completion',canonical=completed,taskAborted=not accepted or remount and not missing,otherTaskAlive=True,repeatAccepted=False,repeatCallbackCounts=[2 if baseline else 1 if accepted else 0,1 if accepted else 0],history=[True,False] if accepted else before)
 if nominal:add('completion',undoAvailable=True,undoCanonical=prior,undoHistory=[True,True],redoAvailable=True,redoCanonical=completed,redoHistory=[True,False])
 count+=20;live=document(kind,label,count,other)
 add('live',accepted=True,canonical=live,visible=label+':'+str(initial_widget if missing else count),undoAvailable=True,undoCanonical=completed,undoHistory=[accepted or life in ['own-edit','render'],True],redoAvailable=True,redoCanonical=live,redoHistory=[True,False],otherCanonical=document(kind,'B',100))
 add('other-editor',pendingAccepted=True,canonical=document(kind,'B',101),firstCanonical=live,undoAvailable=True,undoCanonical=document(kind,'B',100),undoHistory=[False,True],redoAvailable=True,redoCanonical=document(kind,'B',101),redoHistory=[True,False])
 add('dispose',firstRootRemoved=True,otherRuntimeAlive=[0],otherStillAccepted=True,otherCanonical=document(kind,'B',102),rootsRemoved=[True,True],runtimeCounts=[3,3] if label=='C' else [2,2],runtimesDestroyedOnce=True,instancesDestroyedOnce=True)
 return result
def events(s,baseline=False):
 life=s['lifetime'];kind=s['kind'];nominal=life=='other-edit' or life=='own-edit' and s['projection']=='in-place';accepted=nominal or baseline and kind=='inline' and s['projection']=='remount' and life=='own-edit';name='block.update' if kind=='block' else 'inline-widget.update';label='C' if life=='destroy-successor' else 'A';sequence={};result=[]
 def add(editor,phase,action,origin,name):
  sequence[editor]=sequence.get(editor,0)+1;result.append(dict(editor=editor,phase=phase,sequence=sequence[editor],action=action,origin=origin,name=name))
 if life in ['other-edit','own-edit','render']:add('A','transition','commit','plugin' if life=='own-edit' else 'external',name if life=='own-edit' else 'document.render' if life=='render' else 'block.update')
 if life=='remove-undo':add('A','transition','commit','external','block.remove');add('A','transition','undo','history','block.remove')
 if accepted:add(label,'completion','commit','plugin',name)
 if nominal:
  for action in ['undo','redo']:add(label,'completion',action,'history',name)
 for owner,phase in [(label,'live'),('B','other-editor')]:
  for action in ['commit','undo','redo']:add(owner,phase,action,'plugin' if action=='commit' else 'history',name)
 add('B','dispose','commit','plugin',name)
 return result
def verify_case(case,baseline=False):
 assert case['id']==case['spec']['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==case['unsupported']==[]
 expected=values(case['spec']);actual=values(case['spec'],baseline);assert len(expected)==len(actual)==len(case['observations']);differences=[]
 for o,(phase,key,wanted),(_,_,observed) in zip(case['observations'],expected,actual):
  assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],wanted),(case['id'],phase,key,'fixture expectation changed')
  assert same(o['actual'],observed),(case['id'],phase,key,o['actual'],observed)
  status='PASS' if same(observed,wanted) else 'FAIL';assert o['status']==status
  if status=='FAIL':differences.append(dict(id=case['id'],phase=phase,property=key))
 assert case['events']==events(case['spec'],baseline),(case['id'],'publication graph')
 return len(expected),differences
def verify_legacy(case):
 assert case['id']=='legacy-public-control' and case['error'] is None and case['diagnostics']==[] and len(case['unsupported'])==1 and case['unsupported'][0]['property']=='instanceDataTaskContract'
 assert case['planned']==case['completedPhases']==['load','async-host-control','replay','dispose']
 wanted=[('load','text','Alpha'),('async-host-control','text','Deferred host'),('async-host-control','history',[True,False]),('replay','undoAvailable',True),('replay','undoText','Alpha'),('replay','redoAvailable',True),('replay','redoText','Deferred host'),('replay','declaredPortShapes',[dict(beginTask='undefined',mutate='function')]),('dispose','rootRemoved',True)]
 assert len(case['observations'])==len(wanted)
 for o,(phase,key,value) in zip(case['observations'],wanted):assert (o['phase'],o['property'])==(phase,key) and same(o['actual'],value) and same(o['expected'],value) and o['status']=='PASS'
 return len(wanted)

def git_blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());result={};offset=0
 for query in queries:
  end=raw.index(b'\n',offset);header=raw[offset:end].split();assert len(header)==3 and header[1]==b'blob',query
  size=int(header[2]);offset=end+1;result[query]=raw[offset:offset+size];offset+=size;assert raw[offset:offset+1]==b'\n';offset+=1
 assert offset==len(raw);return result

def identity(d,candidate,runner,fixture,continuation=False):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is True and d['serverErrors']==[]
 assert [r['source'] for r in d['results']]==['v1','spec-baseline','candidate']
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':candidate})
 own=[runner,fixture];queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[candidate+':'+path for path in own]
 queries += [candidate+':'+path for path in d.get('fixtureFiles',{})];blobs=git_blobs(queries)
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>=80
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[candidate+':'+path]
 assert d['runnerSha256']==sha(blobs[candidate+':'+runner]) and d['fixtureSha256']==sha(blobs[candidate+':'+fixture])
 for path,h in d.get('fixtureFiles',{}).items():assert sha(blobs[candidate+':'+path])==h
 if continuation:
  assert d['fixtureSource']==dict(storage='git-objects',sha=candidate)
  wrapper=re.search(r'const harnessWrapper = String\.raw`(.*?)`\n',blobs[candidate+':'+runner].decode(),re.S)
  assert wrapper and sha(wrapper.group(1).encode())==d['harnessWrapperSha256']
 for path,h in d['dependencyFiles'].items():
  assert '..' not in Path(path).parts and not Path(path).is_absolute();assert sha((Path('node_modules')/path).read_bytes())==h
 for name,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==v
 assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 return sum(len(s['loaded']) for s in d['sources'])

def continuation(d):
 root='scripts/parity/checkpoints/2026-11-03/continuation-authority/';accepted='9f5c79cfc8c3913bf272998b78332f19929ecd26'
 blobs=git_blobs([accepted+':'+root+p for p in ['review.py','final-differential.json.gz']]);model_bytes=blobs[accepted+':'+root+'review.py'];prior_bytes=gzip.decompress(blobs[accepted+':'+root+'final-differential.json.gz'])
 assert sha(model_bytes)=='63de3ba1fd252c9a968255a7fe4308b1093dc49ff5da5cf9e79ef673a04d00e7' and sha(prior_bytes)=='a9bd184cdae6c736a0edcae6350dfababa3701da2308eb09b9fff293c96dca01'
 namespace={'__name__':'manual_continuation_model'};exec(compile(model_bytes,'accepted-continuation-model','exec'),namespace);models=namespace['model']();prior=json.loads(prior_bytes)
 normalize=lambda x:re.sub(r'http://127\.0\.0\.1:\d+/','http://127.0.0.1:PORT/',json.dumps(x,sort_keys=True,ensure_ascii=False))
 assert normalize(d['results'][1])==normalize(prior['results'][1]),'Historical continuation graph changed'
 legacy,baseline,current=d['results'];assert same(legacy,prior['results'][0]),'Legacy native diagnostic control changed'
 for key,roots in [('legacyTaskDeclarations',['core','plugins','plugin-kit']),('legacyPublicTaskDeclarations',['core','plugin-kit'])]:
  r=subprocess.run(['git','grep','-n','-F','beginTask',V1,'--',*roots],capture_output=True);assert r.returncode in [0,1] and r.stdout.decode()==d[key]
 assert d['legacyPublicTaskDeclarations']=='' and len(d['legacyTaskDeclarations'].splitlines())==6
 assert current['pageErrors']==[] and [c['name'] for c in current['cases']]==[t['name'] for t in current['traces']]==list(models)
 for case,trace in zip(current['cases'],current['traces']):
  assert case['status']=='PASS' and trace['complete'] is True and trace['error'] is None and len(trace['observations'])==len(models[trace['name']])
  for o,(kind,value) in zip(trace['observations'],models[trace['name']]):assert o['kind']==kind and same(o['actual'],value) and same(o['expected'],value),(trace['name'],o)
 return dict(cases=len(models),observations=sum(map(len,models.values())),historicalCases=len(baseline['cases']),historicalObservations=sum(len(t['observations']) for t in baseline['traces']),historicalFailedCases=sum(c['status']!='PASS' for c in baseline['cases']),acceptedHistoricalRawSha256=sha(prior_bytes),manualModelSha256=sha(model_bytes))

def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--continuation',type=Path,required=True);p.add_argument('--browser',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=a.raw.read_bytes();cont=a.continuation.read_bytes();d=json.loads(raw);c=json.loads(cont);assert d['filter']=='' and d['group']=='extension-tasks' and d['platform']=='win32 x64'
 summaries={}
 for row in d['results']:
  assert row['inputErrors']==row['pageErrors']==[]
  if row['source']=='v1':assert len(row['cases'])==1;summaries['v1']=dict(realControlCases=1,realControlObservations=verify_legacy(row['cases'][0]),unavailableTaskContracts=1);continue
  assert [case['spec'] for case in row['cases']]==specs()
  verified=[verify_case(case,row['source']=='spec-baseline') for case in row['cases']]
  summaries[row['source']]=dict(cases=len(verified),observations=sum(n for n,_ in verified),differences=[f for _,failures in verified for f in failures])
 modules=identity(d,a.candidate,'scripts/parity/extension-tasks.mjs','tests/browser/extension-tasks-fixture.js')+identity(c,a.candidate,'scripts/parity/continuation-authority.mjs','tests/browser/continuation-authority.js',True)
 history=continuation(c);assert summaries['candidate']['observations']==1116 and len(summaries['spec-baseline']['differences'])==57
 browser=a.browser.read_bytes();text=browser.decode();pages=re.findall(r'^[-a-z0-9]+\.(?:html|htm): ',text,re.M);assert len(pages)==len(set(pages))==55
 for page,names in [('extension-tasks.html',['Public extension task '+s['id'] for s in specs()]),('continuation-authority.html',list(exec_model()))]:
  cases,_=json.JSONDecoder().raw_decode(text.split(page+': ',1)[1].lstrip());assert [case['name'] for case in cases]==names and all(case['status']=='PASS' for case in cases)
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only','4e153854221027141a2b7152f4f067be9d74f228',a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,taskResults=summaries,continuation=history,currentCases=46,currentObservations=1346,ordinaryPages=55,productionModulesVerified=modules,rawSha256=sha(raw),continuationRawSha256=sha(cont),browserSha256=sha(browser),reviewerSha256=sha(Path(__file__).read_bytes()),runtimeBasis='4e153854221027141a2b7152f4f067be9d74f228',productionUnchanged=True)
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

def exec_model():
 namespace={'__name__':'manual_model'};exec(compile(Path('scripts/parity/checkpoints/2026-11-03/continuation-authority/review.py').read_bytes(),'continuation-model','exec'),namespace);return namespace['model']()

if __name__=='__main__':main()
