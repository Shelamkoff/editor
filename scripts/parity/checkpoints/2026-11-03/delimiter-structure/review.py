"""Literal delimiter ordering, view, public command and replay model."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
VARIANTS=['insert-head','insert-middle','insert-tail','move-forward','move-backward','remove-first','remove-middle','remove-last','remove-final','select'];PHASES=['load','select','apply','replay','output','dispose']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return[dict(id=v+'/'+('reader' if ro else 'editor'),variant=v,readOnly=ro) for v in VARIANTS for ro in [False,True]]
def doc(s,old=False,allocated=None,after=False):
 def p(id,text):return dict(id=id,type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text=text))
 a=p('a','<b>Alpha</b>');b=p('b','<i>Bravo</i>');d=dict(id='d',type='delimiter',**({} if old else dict(dataVersion=1)),data={});v=s['variant']
 order=['a','b'] if v.startswith('insert') else ['d'] if v=='remove-final' else ['d','a','b'] if v=='remove-first' else ['a','b','d'] if v=='remove-last' else ['a','d','b'];records={'a':a,'b':b,'d':d}
 if after:
  if v.startswith('insert'):
   records[allocated]=dict(d,id=allocated);order={'insert-head':[allocated,'a','b'],'insert-middle':['a',allocated,'b'],'insert-tail':['a','b',allocated]}[v]
  elif v=='move-forward':order=['a','b','d']
  elif v=='move-backward':order=['d','a','b']
  elif v=='remove-final':return [] if old else [p(allocated,'')]
  elif v.startswith('remove'):order=['a','b']
 return[records[id] for id in order]
def oracle(s,old,allocated):
 before=doc(s,old);after=doc(s,old,allocated,True);v=s['variant'];changed=v!='select';ro=s['readOnly'];selected='a' if v.startswith('insert') else 'd';result=[];available=[False,False] if ro else [False,True]
 def add(phase,**items):result.extend((phase,k,value) for k,value in items.items())
 def shells(rows):return[dict(id=r['id'],type=r['type'],hrCount=1 if r['type']=='delimiter' else 0) for r in rows]
 click=[dict(trusted=True,onDelimiter=True)]
 add('load',canonical=before,order=[r['id'] for r in before],shells=shells(before),history=available)
 add('select',selected=[selected],current=selected,canonical=before,history=available,nativeClick=[] if selected=='a' else click)
 if selected=='d':add('select',hrContract=dict(tag='HR',editable='false',tabIndex=-1,editableChildren=0))
 add('apply',canonical=after,order=[r['id'] for r in after],shells=shells(after),history=[False,False] if ro else [True,False] if changed else [False,True],neighborsRetained=True,nativeClick=click)
 if changed:add('replay',undoAvailable=True,undoCanonical=before,undoOrder=[r['id'] for r in before],undoHistory=[False,True],redoAvailable=True,redoCanonical=after,redoOrder=[r['id'] for r in after],redoHistory=[True,False])
 else:add('replay',redoAvailable=True,redoCanonical=[dict(id='seed',type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text='<i>Bravo</i>'))],undoAvailable=True,undoCanonical=before,undoHistory=[False,True])
 add('output',rendered=[dict(type=r['type'],tag='HR' if r['type']=='delimiter' else 'P',html='' if r['type']=='delimiter' else r['data']['text']) for r in after],canonical=after,delimiterDataKeys=[[] for r in after if r['type']=='delimiter'])
 add('dispose',rootRemoved=True);return result
def verify(case,old=False):
 s=case['spec'];assert case['id']==s['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==[]
 assert len(case['unsupported'])==(1 if old else 0)
 if old:assert case['unsupported'][0]['property']=='currentTransactionFacts'
 allocated=case['allocatedId'];fresh=s['variant'].startswith('insert') or not old and s['variant']=='remove-final'
 if fresh:assert type(allocated) is str and 0<len(allocated)<=64 and allocated not in ['a','b','d','seed']
 else:assert allocated is None
 expected=oracle(s,old,allocated);assert len(case['observations'])==len(expected);differences=[];historical=None
 if old and s['variant']=='remove-final':
  historical=next(o['actual'] for o in case['observations'] if o['phase']=='replay' and o['property']=='redoCanonical');assert len(historical)==1
  ident=historical[0]['id'];assert type(ident) is str and 0<len(ident)<=64 and ident not in ['a','b','d','seed'];assert same(historical,[dict(id=ident,type='paragraph',data=dict(text=''))])
 for o,(phase,key,value) in zip(case['observations'],expected):
  actual=value
  if historical is not None:
   if (phase,key) in [('replay','redoCanonical'),('output','canonical')] or s['readOnly'] and (phase,key)==('replay','undoCanonical'):actual=historical
   elif (phase,key)==('replay','redoOrder') or s['readOnly'] and (phase,key)==('replay','undoOrder'):actual=[historical[0]['id']]
   elif (phase,key)==('output','rendered'):actual=[dict(type='paragraph',tag='P',html='')]
   elif s['readOnly'] and (phase,key)==('replay','undoHistory'):actual=[True,True]
   elif s['readOnly'] and (phase,key)==('replay','redoAvailable'):actual=False
  status='PASS' if same(actual,value) else 'FAIL'
  assert (o['phase'],o['property'])==(phase,key) and same(o['actual'],actual) and same(o['expected'],value) and o['status']==status,(s['id'],phase,key,o,actual,value)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 assert case['nativeEvents']==[dict(trusted=True,onDelimiter=True)]
 if old:assert case['transactions']==[]
 else:
  v=s['variant'];name='block.insert' if v.startswith('insert') else 'block.move' if v.startswith('move') else 'block.remove' if v.startswith('remove') else 'document.render';actions=['commit','undo','redo'] if v!='select' else ['redo','undo']
  assert case['transactions']==[dict(action=action,origin='external' if action=='commit' else 'history',name=name) for action in actions]
 return len(expected),differences

def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--normal',type=Path,required=True);p.add_argument('--trusted',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=a.raw.read_bytes();d=json.loads(raw);assert d['group']=='delimiter-structure' and d['filter']=='' and d['platform']=='win32 x64'
 root='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+root]);assert Path(root).read_bytes().replace(b'\r\n',b'\n')==helper_bytes
 helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper);modules=helper['identity'](d,a.candidate,'scripts/parity/delimiter-structure.mjs','tests/browser/delimiter-structure-fixture.js')
 summaries={}
 for row in d['results']:
  assert row['inputErrors']==row['pageErrors']==[] and [c['spec'] for c in row['cases']]==specs()
  verified=[verify(case,row['source']=='v1') for case in row['cases']];summaries[row['source']]=dict(cases=len(verified),observations=sum(n for n,_ in verified),differences=[f for _,failures in verified for f in failures],unavailableFactPorts=sum(len(c['unsupported']) for c in row['cases']))
  assert summaries[row['source']]['observations']==548 and len(summaries[row['source']]['differences'])==(12 if row['source']=='v1' else 0)
 normal=a.normal.read_bytes();trusted=a.trusted.read_bytes();assert b'Native native-delimiter-structure.html: 20 passed' in normal and b'Native native-delimiter-structure-trusted.html: 21 passed' in trusted
 own=['scripts/parity/checkpoints/2026-11-03/delimiter-structure/review.py','scripts/parity/checkpoints/2026-11-03/delimiter-structure/controls.mjs','tests/browser/native-delimiter-structure.js','tests/browser/native-delimiter-structure.html','tests/browser/native-delimiter-structure-trusted.html','tests/browser/physical-history.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 assert 'native-delimiter-structure-trusted.html' in blobs[a.candidate+':tests/browser/physical-history.mjs'].decode()
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only','4e153854221027141a2b7152f4f067be9d74f228',a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,results=summaries,moduleIdentities=modules,currentCases=20,currentObservations=548,nativeCases=20,trustedCases=21,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(helper_bytes),nativeNormalSha256=sha(normal),nativeTrustedSha256=sha(trusted),productionUnchanged=True,runtimeBasis='4e153854221027141a2b7152f4f067be9d74f228')
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
