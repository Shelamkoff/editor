"""Caret/range revocation model and unchanged native pointer model."""
import argparse,hashlib,json,subprocess
from pathlib import Path
PARENT='bcef01e235d6b95b2b750019d3799cee028e41ea'
RED='55af1ee1d2e7b6885d6aa37fe002c52e9f1a3c41'
FIX='b0afefea6f54d2f9d09b4ded2e10377d33b32ca8'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def expected(method,action):
 def doc(text='',kind='paragraph'):return [dict(id='a',type=kind,dataVersion=1 if kind=='quote' else 2,data=dict(text=text,**(dict(caption='') if kind=='quote' else {})))]
 out=[];initial=doc();typed=doc('/');fresh=doc('/q');after=doc('','quote');tf=[True,False]
 def put(p,**items):out.extend((p,k,v) for k,v in items.items())
 put('load',canonical=initial,history=[False,False]);put('query',visible=True,choices=2,history=tf)
 put('revoke',nativeSelection=dict(anchor=0 if method=='caret' else 1,focus=0,collapsed=method=='caret'),closed=True,canonical=typed,history=tf)
 if action=='cancel':put('revoke',cancelCanonical=typed,cancelHistory=tf)
 put('retired',retiredDelivered=True,canonical=typed,history=tf,closed=True)
 put('fresh',meaning=[dict(type='paragraph',data=dict(text='/q'))],choices=1,visible=True,**{'retired-with-freshDelivered':True},canonical=fresh,history=tf,successorVisible=True)
 put('action',confirmDelivered=True,meaning=[dict(type='quote',data=dict(text='',caption=''))],canonical=after,closed=True,history=tf)
 put('undo',canonical=fresh,history=[True,True]);put('redo',canonical=after,history=tf,caller=dict(version='2.0.0',blocks=initial),diagnostics=[]);put('dispose',rootRemoved=True)
 return out
def events():return [dict(action=a,origin=o,name=n) for a,o,n in [('commit','native-input','native-input'),('commit','native-input','native-input'),('commit','user','slash.block'),('undo','history','slash.block'),('redo','history','slash.block')]]
def native(method,action):
 out=[dict(role='query',type='input',trusted=True),dict(role='ArrowLeft' if method=='caret' else 'Home',type='keydown',key='ArrowLeft' if method=='caret' else 'Home',trusted=True,modifiers=0 if method=='caret' else 8)]
 if action=='cancel':out.append(dict(role='retired-cancel',type='keydown',key='Escape',trusted=True,modifiers=0))
 for role in ['retired','fresh-query','retired-with-fresh','confirm']:
  out.append(dict(role=role,type='input',trusted=True) if role=='fresh-query' else dict(role=role,type='mousedown',trusted=True,hit=True))
 for role,modifiers in [('undo',2),('redo',10)]:out.append(dict(role=role,type='keydown',key='z',trusted=True,modifiers=modifiers))
 return out
def corpus(d,candidate,helper,red=False):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is (not red) and d['serverErrors']==[] and d['filter']=='' and d['group']=='slash-revocation'
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/slash-revocation.mjs','tests/browser/slash-revocation-fixture.js'];b=helper['blobs']([s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>90
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]]) and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..' not in Path(p).parts and not Path(p).is_absolute() and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 summaries={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[]
  assert [c['spec'] for c in r['cases']]==[dict(id=m+'/'+a,method=m,action=a) for m in ['caret','selection'] for a in ['click','cancel']]
  for e in r['environmentRequests']:assert e['blocked'] is True and e['type']=='script' and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  differences=[];errors=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id'];count+=len(c['observations'])
   for o in c['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':differences.append([c['id'],o['phase'],o['property']])
   if c['error']:errors.append([c['id'],c['error'].split('\n')[0]])
   if r['source']=='candidate' and not red:
    wanted=expected(c['spec']['method'],c['spec']['action']);assert c['planned']==c['completedPhases']==list(dict.fromkeys(p for p,k,v in wanted)) and c['error'] is None and c['unsupported']==c['diagnostics']==[] and len(c['observations'])==len(wanted)
    for o,(p,k,v) in zip(c['observations'],wanted):assert (o['phase'],o['property'])==(p,k) and same(o['actual'],v) and same(o['expected'],v),(c['id'],p,k,o,v)
    assert c['transactions']==events() and c['nativeEvents']==native(c['spec']['method'],c['spec']['action']),(c['id'],c['transactions'],c['nativeEvents'])
  if r['source']=='parent' or red and r['source']=='candidate':assert differences and errors
  summaries[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=len(r['cases']),observations=count,differences=differences,incomplete=errors)
 return summaries,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--pointer',type=Path,required=True);p.add_argument('--pointer-red',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 path='scripts/parity/checkpoints/2026-11-04/slash-menu/review.py';b=subprocess.check_output(['git','show',PARENT+':'+path]);assert Path(path).read_bytes().replace(b'\r\n',b'\n')==b;helper={'__name__':'immutable_pointer_model'};exec(compile(b,'immutable-pointer-model','exec'),helper)
 raw=a.raw.read_bytes();red=a.red.read_bytes();pointer=a.pointer.read_bytes();pointerred=a.pointer_red.read_bytes();results,modules=corpus(json.loads(raw),a.candidate,helper);redresults,redmodules=corpus(json.loads(red),RED,helper,True);pres,pmodules=helper['corpus'](json.loads(pointer),a.candidate);pred,predmodules=helper['corpus'](json.loads(pointerred),helper['RED'],True)
 paths=['scripts/parity/slash-revocation.mjs','tests/browser/slash-revocation-fixture.js'];blobs=helper['blobs']([s+':'+p for s in [RED,a.candidate] for p in paths])
 for path in paths:assert blobs[RED+':'+path]==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',PARENT,RED,'--',*runtime])==b'';assert subprocess.check_output(['git','diff','--name-only',RED,FIX,'--',*runtime]).decode().splitlines()==['core/SlashCommandController.js','core/SlashCommandController.retired.test.js'];assert subprocess.check_output(['git','diff','--name-only',FIX,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,productionBasis=FIX,parent=PARENT,red=RED,results=results,redResults=redresults,pointerResults=pres,pointerRedResults=pred,currentCases=30,currentObservations=sum(s['observations'] for r in [results,pres] for k,s in r.items() if k.startswith('candidate/')),moduleIdentities=modules,redModuleIdentities=redmodules,pointerModuleIdentities=pmodules,pointerRedModuleIdentities=predmodules,rawSha256=sha(raw),redSha256=sha(red),pointerRawSha256=sha(pointer),pointerRedSha256=sha(pointerred),pointerModelSha256=sha(b),reviewerSha256=sha(Path(__file__).read_bytes()),limitations=['The legacy transaction/diagnostic subscriptions are absent; empty bookkeeping arrays are not zero legacy event counts.','Historical incomplete traces remain explicit. No missing history or control observation is accepted as a pass.']);a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if not k.endswith('Results') and k not in ['results','redResults']}))
if __name__=='__main__':main()
