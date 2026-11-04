"""Literal public plural and Attaches display oracle, independent of fixture arithmetic."""
import argparse,copy,hashlib,json,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.dont_write_bytecode=True
COUNTS=[-21,-2,-1,0,1,2,5,11,12,14,21,22,25,101,1.5,-2.5]
RU=['one','few','one','many','one','few','many','many','many','many','one','few','many','one','other','other']
OLD_RU=['many','many','many','many','one','few','many','many','many','many','one','few','many','one','many','many']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def num(n):return format(n,'g')
def specs():return[dict(id=l+'/'+str(n),locale=l,count=n) for l in ['en','ru','ru-RU'] for n in [2,5,21]]+[dict(id='runtime/'+l+'/'+num(n),kind='runtime',locale=l,count=n) for l in ['en','ru','ru-RU','ru_RU','RU'] for n in COUNTS]
def category(s,old=False):
 n=s['count'];l=s['locale']
 if old:return OLD_RU[COUNTS.index(n)] if l=='ru' else 'one' if n==1 else 'other'
 return RU[COUNTS.index(n)] if l!='en' else 'one' if n in [-1,1] else 'other'
def initial(s,old=False,canonical=False):
 if s.get('kind')=='runtime':return[dict(id='a',type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text='Alpha {{swatch}} tail'),inline=dict(swatch=dict(type='color',**({} if old else dict(dataVersion=1)),data=dict(value='#aBcDef'))))]
 files=[dict(id='file-'+str(i),url='/file-'+str(i)+'.txt',name='File '+str(i),extension='txt',size=1) for i in range(s['count'])]
 if old and canonical:
  for f in files:del f['id']
 return[dict(id='files',type='attaches',**({} if old else dict(dataVersion=2)),data=dict(variant='a',files=files))]
def sample(s,source,green):
 n=num(s['count']);old=source=='v1';form=category(s,True) if old else category(s) if source=='candidate' and green else 'other'
 return dict(form=form+':'+n,plain='Value '+n+': A {name} '+n if old else 'Value '+n+': A $& {count}',missing='Fallback',inherited='other:{count}',stringCount='other:'+n,missingGetter='Fallback',prototypeReads=0,missingReads=0)
def observations(s,old=False):
 r=[]
 def put(p,**items):r.extend((p,k,v) for k,v in items.items())
 caller=dict(version='1.0.5' if old else '2.0.0',blocks=initial(s,old))
 if s.get('kind')=='runtime':
  n=num(s['count']);value=dict(form=category(s)+':'+n,plain='Value '+n+': A $& {count}',missing='Fallback',inherited='other:{count}',stringCount='other:'+n,missingGetter='Fallback',prototypeReads=0,missingReads=0)
  for namespace in ['block','inline']:put('load',**{namespace:value,namespace+'Reads':2})
  put('load',callerFormsFrozen=False,history=[False,False],caller=caller,diagnostics=[]);put('dispose',rootRemoved=True)
 else:
  label=str(s['count'])+' '+('files' if s['locale']=='en' else {2:'вложения',5:'вложений',21:'вложение'}[s['count']]);canonical=initial(s,old,True)
  put('load',label=label,history=[False,False]);put('reader',label=label,canonical=canonical,history=[False,False],caller=caller);put('output',label=label,caller=caller,canonical=canonical,history=[False,False]);put('dispose',rootRemoved=True)
 return r
def verify_case(c,source,green=True):
 s=c['spec'];old=source=='v1';runtime=s.get('kind')=='runtime';phases=['load','dispose'] if runtime else ['load','reader','output','dispose'];assert c['id']==s['id'] and c['error'] is None and c['unsupported']==c['diagnostics']==[] and c['planned']==c['completedPhases']==phases
 wanted=observations(s,old);assert len(c['observations'])==len(wanted);fail=[]
 for o,(p,k,v) in zip(c['observations'],wanted):
  assert (o['phase'],o['property'])==(p,k) and same(o['expected'],v),(source,s['id'],p,k,'expected',o,v)
  actual=v
  if runtime and k in ['block','inline']:actual=sample(s,source,green)
  elif not runtime and k=='label' and p in ['load','reader'] and s['locale']!='en' and not(source=='candidate' and green) and not(old and s['locale']=='ru'):actual=str(s['count'])+' вложения'
  status='PASS' if same(actual,v) else 'FAIL';assert same(o['actual'],actual) and o['status']==status,(source,s['id'],p,k,'actual',o,actual)
  if status=='FAIL':fail.append(dict(id=s['id'],phase=p,property=k))
 return fail

V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';PARENT='7d7edfd59f18061b2a2dce534e6f198058d7fba4';RED='aba84b1c62fd181d5c13ab88d715c07007bfdc33';FIX='a7363edda4d507745928425fce2771f1e3d6b653'
def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='i18n-counts' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('parent',PARENT),('candidate',source)]
 own=['scripts/parity/i18n-counts.mjs','tests/browser/i18n-counts-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>80
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 assert d['runnerSha256']==sha(blobs[source+':'+own[0]]) and d['fixtureSha256']==sha(blobs[source+':'+own[1]])
 if working:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[source+':'+path]
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 return sum(len(s['loaded']) for s in d['sources'])



def corpus(d,source,helper,red=False):
 modules=validate_identity(d,source,helper,not red);assert d['candidatePass'] is (not red) and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 summaries={}
 for r in d['results']:
  assert r['policyEnforced'] is r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['unavailable']==r['mediaRequests']==r['externalRequests']==[] and [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:
   u=urlsplit(e['url']);assert set(e)=={'url','type','blocked'} and e['type']=='script' and e['blocked'] is True and u.scheme=='http' and u.hostname=='gc.kis.v2.scr.kaspersky-labs.com' and u.path=='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js' and u.username is None and u.password is None
   q=parse_qs(u.query,keep_blank_values=True);assert set(q)=={'attr'} and len(q['attr'])==1 and 0<len(q['attr'][0])<1024
  differences=[f for c in r['cases'] for f in verify_case(c,r['source'],not red)];assert len(differences)==(164 if r['source']=='v1' else 124 if red or r['source']!='candidate' else 0)
  count=sum(len(c['observations']) for c in r['cases']);assert count==819
  summaries[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=89,observations=count,differences=differences,blockedEnvironmentRequests=len(r['environmentRequests']))
 return summaries,modules
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--raw',type=Path,required=True);parser.add_argument('--red',type=Path,required=True);parser.add_argument('--literal',type=Path,required=True);parser.add_argument('--candidate',required=True);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args()
 hp='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';hb=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+hp]);assert Path(hp).read_bytes().replace(b'\r\n',b'\n')==hb;helper={'__name__':'accepted_identity_helper'};exec(compile(hb,'accepted-identity-helper','exec'),helper)
 raw=a.raw.read_bytes();results,modules=corpus(json.loads(raw),a.candidate,helper);redraw=a.red.read_bytes();redresults,redmodules=corpus(json.loads(redraw),RED,helper,True)
 cp='scripts/parity/checkpoints/2026-11-04/i18n-contexts/review.py';cb=helper['git_blobs']([PARENT+':'+cp])[PARENT+':'+cp];assert Path(cp).read_bytes().replace(b'\r\n',b'\n')==cb;contexts={'__name__':'accepted_literal_context_model'};exec(compile(cb,'accepted-literal-model','exec'),contexts);literalraw=a.literal.read_bytes();literalresults,literalmodules=contexts['corpus'](json.loads(literalraw),a.candidate,helper)
 own=['scripts/parity/checkpoints/2026-11-04/i18n-counts/review.py','scripts/parity/checkpoints/2026-11-04/i18n-counts/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];changed=['core/createEditorRuntime.js','plugin-kit/types.d.ts','plugins/attaches/index.js']
 assert subprocess.check_output(['git','diff','--name-only',PARENT,RED,'--',*runtime])==b'' and subprocess.check_output(['git','diff','--name-only',RED,FIX,'--',*runtime]).decode().splitlines()==changed and subprocess.check_output(['git','diff','--name-only',FIX,a.candidate,'--',*runtime])==b''
 q=[s+':'+path for s in [RED,a.candidate] for path in ['scripts/parity/i18n-counts.mjs','tests/browser/i18n-counts-fixture.js']];blobs=helper['git_blobs'](q)
 for path in ['scripts/parity/i18n-counts.mjs','tests/browser/i18n-counts-fixture.js']:assert blobs[RED+':'+path]==blobs[a.candidate+':'+path]
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=FIX,parent=PARENT,red=RED,currentCases=178,currentObservations=1638,casesPerPolicy=89,observationsPerPolicy=819,moduleIdentities=modules,redModuleIdentities=redmodules,results=results,redResults=redresults,literalCurrentCases=12,literalCurrentObservations=346,literalResults=literalresults,literalModuleIdentities=literalmodules,combinedCurrentCases=190,combinedCurrentObservations=1984,rawSha256=sha(raw),redRawSha256=sha(redraw),literalRawSha256=sha(literalraw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(hb),literalHelperSha256=sha(cb),legacyObservationLimitations=['The legacy diagnostic option is absent; its empty fixture diagnostic array is not evidence of zero legacy diagnostic events. Real page errors and history flags are measured.','The v1 canonical Attaches wire has no member IDs. Current records must preserve their actual stable file IDs.'],scope='All 89 cases execute actual public APIs on v1, baseline, immutable parent and both current policies. Legacy protected _p/_t and inline scoped plural/t map operation spelling only; no translation behavior is emulated. Literal plural tables, getter counters, own/inherited/string counts, missing fallbacks and literal interpolation are independent of fixture arithmetic. Editor/reader labels are checked against a real locale-configured renderer and exact canonical data/history. The original literal-key/native-command model reruns unchanged on the final source.')
 a.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['results','redResults','literalResults']}))
if __name__=='__main__':main()
