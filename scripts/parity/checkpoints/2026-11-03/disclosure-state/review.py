"""Independent literal state machine for authored Toggle and transient Spoiler."""
import argparse,hashlib,json,subprocess
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
PHASES=['load','activate','history','remount','dispose']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return [dict(id='/'.join([k,'reader' if r else 'editor',g]),kind=k,readOnly=r,gesture=g) for k in ['toggle-closed','toggle-open','spoiler'] for r in [False,True] for g in ['click','Enter','Space']]
def document(s,old=False,open=None,changed=False):
 toggle=s['kind']!='spoiler';open=s['kind']=='toggle-open' if open is None else open
 a=dict(id='a',type='paragraph',data=dict(text='Beta' if changed else 'Alpha'));r=dict(id='r',type='toggle' if toggle else 'spoiler',data=dict(title='<b>Title</b>',content='<i>Body</i>',open=open) if toggle else dict(label='<b>Title</b>',content='<i>Body</i>'))
 if not old:a['dataVersion']=2;r['dataVersion']=1
 return[a,r]
def view(open):return dict(expanded=str(open).lower(),visible=open,controls=True,enabled=True)
def oracle(s,old=False):
 toggle=s['kind']!='spoiler';persisted=s['kind']=='toggle-open';initial=persisted if toggle else not s['readOnly'];authoring=toggle and not s['readOnly'];authored=not persisted if authoring else persisted;available=[False,False] if s['readOnly'] else [False,True];after=document(s,old,authored);result=[]
 def add(phase,**values):result.extend((phase,key,value) for key,value in values.items())
 add('load',canonical=document(s,old),view=view(initial),history=available)
 add('activate',canonical=after,view=view(not initial),history=[True,False] if authoring else available,trustedActivation=[dict(trusted=True,detail=1 if s['gesture']=='click' else 0,onDisclosureControl=True)],trustedKeys=[] if s['gesture']=='click' else [dict(key=' ' if s['gesture']=='Space' else 'Enter',trusted=True,onDisclosureControl=True)])
 if not old:add('activate',documentActions=[dict(action='commit',changes=[dict(kind='block.update',id='r',before=document(s)[1],after=after[1])])] if authoring else [])
 if authoring:
  add('history',undoAvailable=True,undoCanonical=document(s,old),undoView=view(persisted),undoHistory=[False,True],redoAvailable=True,redoCanonical=after,redoView=view(authored),redoHistory=[True,False])
 else:add('history',revealedHistory=[False,True],redoAvailable=True,redoCanonical=document(s,old,persisted,True),redoView=view(persisted if toggle else True),undoAvailable=True,undoCanonical=after,undoView=view(persisted if toggle else True),history=[False,True])
 add('remount',retiredRootRemoved=True,canonical=after,view=view(authored if toggle else not s['readOnly']),history=[False,False],readOnly=s['readOnly'],facts=[],dataKeys=['content','open','title'] if toggle else ['content','label'])
 add('dispose',rootRemoved=True,ready=False)
 return result
def verify_case(case,old=False):
 s=case['spec'];assert case['id']==s['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==[]
 assert len(case['unsupported'])==(1 if old else 0)
 if old:assert case['unsupported'][0]['property']=='typedDisclosureFacts'
 expected=oracle(s,old);assert len(case['observations'])==len(expected)
 broken=old and not s['readOnly'] and s['gesture']=='Enter';toggle=s['kind']!='spoiler';persisted=s['kind']=='toggle-open'
 extra=None
 if broken:
  rows=next(o for o in case['observations'] if o['phase']=='activate' and o['property']=='canonical')['actual'];assert len(rows)==3
  ident=rows[2]['id'];assert type(ident) is str and ident not in ['a','r'] and 0<len(ident)<=64
  extra=document(s,True)+[dict(id=ident,type='paragraph',data=dict(text=''))]
 differences=[]
 for o,(phase,key,wanted) in zip(case['observations'],expected):
  assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],wanted),(s['id'],phase,key,'fixture expectation changed')
  actual=wanted
  if broken:
   if (phase,key)==('activate','canonical'):actual=extra
   elif (phase,key)==('activate','view'):actual=view(persisted if toggle else True)
   elif (phase,key)==('activate','trustedActivation'):actual=[]
   elif phase=='history' and key=='redoCanonical':actual=extra
   elif toggle and (phase,key) in [('history','redoView'),('remount','view')]:actual=view(persisted)
   elif toggle and (phase,key)==('remount','canonical'):actual=extra
   elif not toggle and (phase,key) in [('activate','history'),('history','revealedHistory')]:actual=[True,False]
   elif not toggle and (phase,key)==('history','redoAvailable'):actual=False
  assert same(o['actual'],actual),(s['id'],phase,key,o['actual'],actual)
  status='PASS' if same(actual,wanted) else 'FAIL';assert o['status']==status
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 native=[]
 if s['gesture']!='click':native.append(dict(phase='activate',type='keydown',key=' ' if s['gesture']=='Space' else 'Enter',detail=0,trusted=True,onDisclosureControl=True))
 if not broken:native.append(dict(phase='activate',type='click',key=None,detail=1 if s['gesture']=='click' else 0,trusted=True,onDisclosureControl=True))
 assert case['nativeEvents']==native,(s['id'],'native input graph')
 return len(expected),differences
def git_blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());result={};offset=0
 for query in queries:
  end=raw.index(b'\n',offset);header=raw[offset:end].split();assert len(header)==3 and header[1]==b'blob',query
  size=int(header[2]);offset=end+1;result[query]=raw[offset:offset+size];offset+=size;assert raw[offset:offset+1]==b'\n';offset+=1
 assert offset==len(raw);return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--exploratory',action='store_true');a=p.parse_args()
 raw=a.raw.read_bytes();d=json.loads(raw);assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is True and d['filter']=='' and d['group']=='disclosure-state' and d['serverErrors']==[]
 assert [r['source'] for r in d['results']]==['v1','spec-baseline','candidate']
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
 summaries={}
 for row in d['results']:
  assert row['inputErrors']==row['pageErrors']==[] and [c['spec'] for c in row['cases']]==specs()
  verified=[verify_case(c,row['source']=='v1') for c in row['cases']]
  summaries[row['source']]=dict(cases=len(verified),observations=sum(n for n,_ in verified),differences=[f for _,failures in verified for f in failures],unavailableObservationPorts=sum(len(c['unsupported']) for c in row['cases']))
 own=['scripts/parity/disclosure-state.mjs','tests/browser/disclosure-state-fixture.js','scripts/parity/checkpoints/2026-11-03/disclosure-state/review.py','tests/browser/native-disclosure-state.js','tests/browser/native-disclosure-state.html','tests/browser/native-disclosure-state-trusted.html']
 queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+([] if a.exploratory else [a.candidate+':'+path for path in own]);blobs=git_blobs(queries)
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>=90
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 if not a.exploratory:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
  assert d['runnerSha256']==sha(blobs[a.candidate+':'+own[0]]) and d['fixtureSha256']==sha(blobs[a.candidate+':'+own[1]])
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64' and d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only','4e153854221027141a2b7152f4f067be9d74f228',a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,results=summaries,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),moduleIdentities=sum(len(s['loaded']) for s in d['sources']))
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
