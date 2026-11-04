"""Long-menu keyboard oracle, with immutable pointer and selection models."""
import argparse,hashlib,json,subprocess
from pathlib import Path
PARENT='8883222dca4713f9f51049a7ace1d3150d9e80ad';RED='9f5c1ecdbefdfaf6f4fa40161dc2bb09bfc56d7d';FIX='3c02d2d46e1ecf2641cc7a6753189f12c7e4a1e7'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASE='e981ff308000c1d92d7e820df95113c1e19bcee8'
PATHS={'down':list(range(2,22)),'up':list(range(24,4,-1)),'wrap':[0],'pointer':[]}
START={'down':1,'up':25,'wrap':30,'pointer':30};TARGET={'down':21,'up':5,'wrap':0,'pointer':30}
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def specs():return [dict(id=m,method=m) for m in ['down','up','wrap','pointer']]
def doc(text='',target=0):return [dict(id='a',type='paragraph' if target==0 else 'choice-'+str(target-1),dataVersion=2 if target==0 else 1,data=dict(text=text,**({} if target==0 else dict(caption=''))))]
def expected(method):
 initial=doc();typed=doc('/');after=doc(target=TARGET[method]);out=[]
 def put(p,**items):out.extend((p,k,v) for k,v in items.items())
 put('load',canonical=initial,history=[False,False]);put('input',choices=31,history=[True,False],scrollable=True);put('hover',active=START[method])
 for step,value in enumerate(PATHS[method],1):put('navigate',**{'active-'+str(step):value})
 put('navigate',active=TARGET[method],nodesRetained=True,scrollMoved=True,canonical=typed,history=[True,False])
 if method=='pointer':put('action',confirmDelivered=True)
 put('action',meaning=[dict(type=b['type'],data=b['data']) for b in after],canonical=after,closed=True,history=[True,False])
 for p,d,h in [('undo-action',typed,[True,True]),('undo-input',initial,[False,True]),('redo-input',typed,[True,True]),('redo-action',after,[True,False])]:put(p,canonical=d,history=h)
 put('redo-action',caller=dict(version='2.0.0',blocks=initial),diagnostics=[]);put('dispose',rootRemoved=True);return out
def native(method):
 out=[dict(role='query',type='input',trusted=True)];k='ArrowUp' if method=='up' else 'ArrowDown'
 for _ in PATHS[method]:out.append(dict(role=k,type='keydown',key=k,trusted=True,modifiers=0))
 out.append(dict(role='confirm',type='mousedown',trusted=True,hit=True) if method=='pointer' else dict(role='confirm',type='keydown',key='Tab' if method=='wrap' else 'Enter',trusted=True,modifiers=0))
 for role,modifiers in [('undo',2),('undo',2),('redo',10),('redo',10)]:out.append(dict(role=role,type='keydown',key='z',trusted=True,modifiers=modifiers))
 return out
def corpus(d,candidate,helper,red=False):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is (not red) and d['serverErrors']==[] and d['filter']=='' and d['group']=='slash-scroll'
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/slash-scroll.mjs','tests/browser/slash-scroll-fixture.js'];b=helper['blobs']([s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>90
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]]) and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..' not in Path(p).parts and not Path(p).is_absolute() and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 summaries={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[] and [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:assert e['blocked'] is True and e['type']=='script' and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  differences=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id'] and c['error'] is None and c['planned']==c['completedPhases'];count+=len(c['observations'])
   for o in c['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':differences.append([c['id'],o['phase'],o['property']])
   if r['source']=='candidate' and not red:
    method=c['spec']['method'];wanted=expected(method);assert c['unsupported']==c['diagnostics']==[] and c['planned']==list(dict.fromkeys(p for p,k,v in wanted)) and len(c['observations'])==len(wanted)
    for o,(p,k,v) in zip(c['observations'],wanted):assert (o['phase'],o['property'])==(p,k) and same(o['actual'],v) and same(o['expected'],v),(method,p,k,o,v)
    assert c['nativeEvents']==native(method) and c['transactions']==helper['events'](dict(method='keyboard')),(method,c['nativeEvents'],c['transactions'])
    assert [s['step'] for s in c['steps']]==list(range(1,len(PATHS[method])+1)) and [s['active'] for s in c['steps']]==PATHS[method]
  if r['source']=='parent' or red and r['source']=='candidate':assert differences
  summaries[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=4,observations=count,differences=differences,incomplete=[])
 return summaries,modules
def main():
 p=argparse.ArgumentParser()
 for name in ['raw','red','revocation','revocation-red','pointer','pointer-red','output']:p.add_argument('--'+name,type=Path,required=True)
 p.add_argument('--candidate',required=True);a=p.parse_args()
 models={};modelbytes={}
 for name,source,path in [('pointer','bcef01e235d6b95b2b750019d3799cee028e41ea','scripts/parity/checkpoints/2026-11-04/slash-menu/review.py'),('revocation',PARENT,'scripts/parity/checkpoints/2026-11-04/slash-revocation/review.py')]:
  b=subprocess.check_output(['git','show',source+':'+path]);assert Path(path).read_bytes().replace(b'\r\n',b'\n')==b;namespace={'__name__':'immutable_'+name+'_model'};exec(compile(b,'immutable-'+name+'-model','exec'),namespace);models[name]=namespace;modelbytes[name]=b
 h=models['pointer'];raw=a.raw.read_bytes();red=a.red.read_bytes();pointer=a.pointer.read_bytes();pointerred=a.pointer_red.read_bytes();revocation=a.revocation.read_bytes();revocationred=a.revocation_red.read_bytes()
 results,modules=corpus(json.loads(raw),a.candidate,h);redresults,redmodules=corpus(json.loads(red),RED,h,True);pres,pm=h['corpus'](json.loads(pointer),a.candidate);pred,prm=h['corpus'](json.loads(pointerred),h['RED'],True);v=models['revocation'];vres,vm=v['corpus'](json.loads(revocation),a.candidate,h);vred,vrm=v['corpus'](json.loads(revocationred),v['RED'],h,True)
 paths=['scripts/parity/slash-scroll.mjs','tests/browser/slash-scroll-fixture.js'];b=h['blobs']([s+':'+p for s in [RED,a.candidate] for p in paths])
 for path in paths:assert b[RED+':'+path]==b[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',PARENT,RED,'--',*runtime])==b'';assert subprocess.check_output(['git','diff','--numstat',RED,FIX,'--',*runtime]).decode().strip()=='1\t1\tcore/SlashCommandController.js';assert subprocess.check_output(['git','diff','--name-only',FIX,a.candidate,'--',*runtime])==b''
 patch=subprocess.check_output(['git','diff','--unified=0',RED,FIX,'--','core/SlashCommandController.js']).decode();assert "-      element.addEventListener('mouseenter', () => {" in patch and "+      element.addEventListener('mousemove', () => {" in patch
 report=dict(status='PASS',candidate=a.candidate,productionBasis=FIX,parent=PARENT,red=RED,results=results,redResults=redresults,pointerResults=pres,pointerRedResults=pred,revocationResults=vres,revocationRedResults=vred,currentCases=38,currentObservations=sum(x['observations'] for r in [results,pres,vres] for k,x in r.items() if k.startswith('candidate/')),moduleIdentities=modules+pm+vm,redModuleIdentities=redmodules+prm+vrm,rawSha256=sha(raw),redSha256=sha(red),pointerRawSha256=sha(pointer),pointerRedSha256=sha(pointerred),revocationRawSha256=sha(revocation),revocationRedSha256=sha(revocationred),pointerModelSha256=sha(modelbytes['pointer']),revocationModelSha256=sha(modelbytes['revocation']),reviewerSha256=sha(Path(__file__).read_bytes()),inheritedIntegrationSource=PARENT,productionDelta='Exactly one runtime line: mouseenter becomes mousemove. All other runtime bytes match the complete eighteen-gate integration.',limitations=['Legacy diagnostic/transaction subscriptions are absent; their empty fixture arrays are not measured legacy event counts.','Historical incomplete pointer/revocation paths stay explicit; every long-menu historical case completes.'])
 a.output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if not k.endswith('Results') and k not in ['results','redResults']}))
if __name__=='__main__':main()
