"""Independent public read-only mode oracle: literal documents and fact graph."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
PHASES=['load','seed','read-only','denied','reader','editable','replay','author','dispose']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return [dict(id='/'.join([r,'initial-reader' if i else 'initial-editor',h]),reader=r,initial=i,history=h) for r in ['paragraph','toggle-closed','toggle-open','spoiler'] for i in [False,True] for h in ['empty','undo','redo']]
def document(s,old=False,changed=False,authored=False):
 p=dict(id='a',type='paragraph',data=dict(text=('Beta' if changed else 'Alpha')+('Y' if authored else '')))
 if not old:p['dataVersion']=2
 result=[p]
 if s['reader']!='paragraph':
  spoiler=s['reader']=='spoiler';r=dict(id='r',type='spoiler' if spoiler else 'toggle',data=dict(label='Reader label',content='Hidden content') if spoiler else dict(title='Reader title',content='Hidden content',open=s['reader']=='toggle-open'))
  if not old:r['dataVersion']=1
  result.append(r)
 return result
def oracle(s,old=False):
 c=s['history']=='undo';empty=s['history']=='empty';available=[False,False] if empty else [c,not c];data=document(s,old,c);result=[]
 def add(phase,**values):result.extend((phase,key,value) for key,value in values.items())
 fields=lambda ro:['false' if ro else 'true']*(1 if s['reader']=='paragraph' else 3)
 def facts(ro):return [dict(type='readOnly:changed',payload=dict(readOnly=ro)),dict(type='history:changed',payload=dict(canUndo=False if ro else available[0],canRedo=False if ro else available[1]))]
 add('load',canonical=document(s,old),readOnly=s['initial'],history=[False,False],fields=fields(s['initial']))
 add('seed',canonical=data,history=available,readOnly=False)
 add('read-only',canonical=data,readOnly=True,history=[False,False],fields=fields(True),modeFacts=facts(True))
 add('denied',publicReplayRejected=[dict(method=m,error='Error',result=None) for m in ['undo','redo']],trustedKeys=[dict(key=k,trusted=True) for k in ['X','Delete','z']],inputEvents=[],canonical=data,history=[False,False],facts=[],fieldText='Beta' if c else 'Alpha')
 if s['reader']!='paragraph':
  initial=s['reader']=='toggle-open';add('reader',initialView=dict(expanded=str(initial).lower(),visible=initial))
  for index in range(2):
   opened=not initial if index==0 else initial
   add('reader',**{'view'+str(index):dict(expanded=str(opened).lower(),visible=opened),'canonical'+str(index):data,'history'+str(index):[False,False]})
  add('reader',trustedClicks=[True,True])
 add('reader',facts=[],canonical=data)
 add('editable',canonical=data,readOnly=False,history=available,fields=fields(False),modeFacts=facts(False))
 first='undo' if s['history']=='undo' else 'redo';second='redo' if first=='undo' else 'undo'
 for method,changed in [(first,False if empty else not c),(second,c)]:
  add('replay',**{method+'Available':not empty,method+'Canonical':document(s,old,changed),method+'History':[False,False] if empty else [changed,not changed]})
 add('author',canonical=document(s,old,c,True),history=[True,False],trustedInput=[True],undoAvailable=True,undoCanonical=data,redoAvailable=True,redoCanonical=document(s,old,c,True))
 if not old:add('author',documentActions=[dict(origin='native-input',action='commit'),dict(origin='history',action='undo'),dict(origin='history',action='redo')])
 add('dispose',rootRemoved=True,ready=False)
 return result
def verify_case(case,old=False):
 s=case['spec'];assert case['id']==s['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==[]
 assert len(case['unsupported'])==(1 if old else 0)
 if old:assert case['unsupported'][0]['property']=='typedDocumentFacts'
 expected=oracle(s,old);observations=case['observations'];assert len(expected)==len(observations),(s['id'],len(expected),len(observations))
 failures=[]
 for o,(phase,key,wanted) in zip(observations,expected):
  assert (o['phase'],o['property'])==(phase,key),(s['id'],phase,key,o['phase'],o['property'])
  assert same(o['expected'],wanted),(s['id'],phase,key,'fixture expected changed')
  actual=[dict(method=m,error=None,result=False) for m in ['undo','redo']] if old and key=='publicReplayRejected' else wanted
  assert same(o['actual'],actual),(s['id'],phase,key,o['actual'],actual)
  status='PASS' if same(actual,wanted) else 'FAIL';assert o['status']==status
  if status=='FAIL':failures.append(dict(id=s['id'],phase=phase,property=key))
 native=case['nativeEvents'];assert all(e['trusted'] is True for e in native)
 assert [dict(key=e['key'],trusted=e['trusted']) for e in native if e['phase']=='denied' and e['type']=='keydown']==[dict(key=k,trusted=True) for k in ['X','Delete','z']]
 assert [e for e in native if e['phase']=='denied' and e['type']=='input']==[]
 assert [e['trusted'] for e in native if e['phase']=='reader' and e['type']=='click']==([] if s['reader']=='paragraph' else [True,True])
 assert [e['trusted'] for e in native if e['phase']=='author' and e['type']=='input']==[True]
 if old:
  history=[dict(canUndo=True,canRedo=False)] if s['history']!='undo' else []
  history += [dict(canUndo=s['history']=='undo',canRedo=True),dict(canUndo=True,canRedo=False)]
  assert case['events']==[dict(type='history:changed',payload=h) for h in history]
 else:
  events=case['events'];assert len(events)==9
  assert [e['type'] for e in events]==['transaction:committed','document:changed','history:changed']*3
  before=document(s,False,s['history']=='undo')[0];after=document(s,False,s['history']=='undo',True)[0]
  for index,(origin,action,history) in enumerate([('native-input','commit',[True,False]),('history','undo',[s['history']=='undo',True]),('history','redo',[True,False])]):
   tx,doc,hist=[e['payload'] for e in events[index*3:index*3+3]]
   assert tx['sequence']=={'empty':1,'undo':4,'redo':5}[s['history']]+index and tx['name']=='native-input'
   assert tx['origin']==doc['origin']==origin and tx['action']==doc['action']==action
   assert tx['history']==hist==dict(canUndo=history[0],canRedo=history[1])
   wanted=[dict(kind='block.update',id='a',before=after if action=='undo' else before,after=before if action=='undo' else after)]
   assert same(tx['changes'],wanted) and same(doc['changes'],wanted)
 return len(expected),failures
def git_blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());result={};offset=0
 for query in queries:
  end=raw.index(b'\n',offset);header=raw[offset:end].split();assert len(header)==3 and header[1]==b'blob',query
  size=int(header[2]);offset=end+1;result[query]=raw[offset:offset+size];offset+=size;assert raw[offset:offset+1]==b'\n';offset+=1
 assert offset==len(raw);return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--structure',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--exploratory',action='store_true');a=p.parse_args()
 raw=a.raw.read_bytes();d=json.loads(raw);assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is True and d['filter']=='' and d['group']=='public-readonly' and d['serverErrors']==[]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
 assert [row['source'] for row in d['results']]==['v1','spec-baseline','candidate']
 summaries={}
 for row in d['results']:
  assert row['inputErrors']==row['pageErrors']==[] and [c['spec'] for c in row['cases']]==specs()
  verified=[verify_case(c,row['source']=='v1') for c in row['cases']]
  summaries[row['source']]=dict(cases=len(verified),observations=sum(n for n,_ in verified),differences=[f for _,failures in verified for f in failures],unavailableObservationPorts=sum(len(c['unsupported']) for c in row['cases']))
 structure_raw=a.structure.read_bytes();structure=json.loads(structure_raw)
 assert structure['headBefore']==structure['headAfter']==a.candidate and structure['candidatePass'] is True and structure['filter']=='' and structure['group']=='public-structure' and structure['serverErrors']==[]
 assert {s['label']:s['sha'] for s in structure['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
 structural_model='scripts/parity/checkpoints/2026-11-03/public-structure/review.py'
 spec=importlib.util.spec_from_file_location('accepted_structure_oracle',structural_model);model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
 structural={}
 for row in structure['results']:
  assert row['pageErrors']==row['inputErrors']==[] and [c['spec'] for c in row['cases']]==model.specs()
  checks=sum(model.verify_case(c,row['source']=='v1',row['source']!='v1') for c in row['cases'])
  failures=sum(o['status']=='FAIL' for c in row['cases'] for o in c['observations'])
  assert failures==(57 if row['source']=='v1' else 0)
  structural[row['source']]=dict(cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),independentChecks=checks,differences=failures)
 own=['scripts/parity/public-readonly.mjs','tests/browser/public-readonly-fixture.js','scripts/parity/checkpoints/2026-11-03/public-readonly/review.py','tests/browser/native-public-readonly.js','tests/browser/native-public-readonly.html','tests/browser/native-public-readonly-trusted.html',structural_model,'scripts/parity/public-structure.mjs','tests/browser/public-structure-fixture.js']
 all_sources=[*d['sources'],*structure['sources']]
 queries=[s['sha']+':'+path for s in all_sources for path in s['loaded']]+([] if a.exploratory else [a.candidate+':'+path for path in own]);blobs=git_blobs(queries)
 for s in all_sources:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>=90
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 if not a.exploratory:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
  assert d['runnerSha256']==sha(blobs[a.candidate+':'+own[0]]) and d['fixtureSha256']==sha(blobs[a.candidate+':'+own[1]])
  assert structure['runnerSha256']==sha(blobs[a.candidate+':'+own[-2]]) and structure['fixtureSha256']==sha(blobs[a.candidate+':'+own[-1]])
 for data in [d,structure]:
  for path,h in data['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
  for name,version in data['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
  assert data['node']=='v24.22.2' and data['browser']=='156.0.8078.80' and data['platform']=='win32 x64' and data['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json']
 assert subprocess.check_output(['git','diff','--name-only','4e153854221027141a2b7152f4f067be9d74f228',a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,results=summaries,structuralHostControls=structural,rawSha256=sha(raw),structureRawSha256=sha(structure_raw),reviewerSha256=sha(Path(__file__).read_bytes()),moduleIdentities=sum(len(s['loaded']) for s in d['sources']),structuralModuleIdentities=sum(len(s['loaded']) for s in structure['sources']))
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
