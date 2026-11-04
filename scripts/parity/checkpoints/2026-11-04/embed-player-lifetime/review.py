"""Literal public Embed player/preview retirement and replay model."""
import argparse,hashlib,json,math,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='e8b2cd8fa902e1bbfbc0422df13576be4aea619f';SERVICE_ACCEPT='cb88f9fbb7be0afb45763651932dabae3c1d5efd'
PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII=';VARIANTS=['mode','replace','remove-undo','render','destroy-successor']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return[dict(id=service+'/'+variant+'/'+('playing' if playing else 'preview'),service=service,variant=variant,playing=playing) for service in ['youtube','vimeo'] for variant in VARIANTS for playing in [True,False]]+[dict(id='pending/'+variant+'/'+outcome,kind='pending',variant=variant,outcome=outcome) for variant in VARIANTS for outcome in ['resolve','reject']]
def initial(s):
 pending=s.get('kind')=='pending';service='vimeo' if pending else s['service'];return dict(service=service,videoId='dQw4w9WgXcQ' if service=='youtube' else '12345',caption='<b>Author caption</b>',cover='' if pending else PIXEL,title='Author title',duration='1:23')
def current(s):
 d=initial(s)
 if s['variant'] in ['replace','render','destroy-successor']:
  if s.get('kind')=='pending':d['videoId']='67890'
  else:d.update(service='vimeo' if s['service']=='youtube' else 'youtube',videoId='67890' if s['service']=='youtube' else 'aaaaaaaaaaa')
 if s['variant']=='render':d['title']='Rendered title'
 if s['variant']=='destroy-successor':d['title']='Successor title'
 return d
def blocks(d,old=False):return[dict(id='embed',type='embed',**({} if old else dict(dataVersion=1)),data=d)]
def flags(s):return[True,False] if s['variant'] in ['replace','render'] else [False,True] if s['variant']=='remove-undo' else [False,False]
def url(d):return 'https://www.youtube.com/embed/'+d['videoId']+'?autoplay=1&rel=0' if d['service']=='youtube' else 'https://player.vimeo.com/video/'+d['videoId']+'?autoplay=1'
def observations(s,old=False):
 before=blocks(initial(s),old);after=blocks(current(s),old);cursor=flags(s);result=[]
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 if s.get('kind')=='pending':
  add('load',canonical=before,history=[False,False],oneLiveRequest=1,preview=None);add('retire',canonical=after,history=cursor,oldRequestsAborted=True,oneCurrentRequest=1,newPlayerIdentity=True)
  add('late',retiredPreview=None,currentPreview=None,canonical=after,history=cursor,unhandled=[]);add('fresh',preview=dict(src=PIXEL,alt='Fresh preview'),retiredPreview=None,canonical=after,history=cursor,unhandled=[]);add('dispose',rootsRemoved=True,unhandled=[])
 else:
  add('load',canonical=before,history=[False,False],frame=url(initial(s)) if s['playing'] else None);add('retire',canonical=after,history=cursor,oldPlayerDetached=True,oldFrameDetached=True,newPlayerIdentity=True,noAutomaticFrame=0)
  if not s['playing']:add('stale',oldFrameCount=0,newFrameCount=0)
  add('stale',canonical=after,history=cursor);add('play',frame=url(current(s)),frameCount=1,sameFrame=True,canonical=after,history=cursor)
  authored=s['variant'] in ['replace','render'];add('replay',undoStates=[before] if authored else [],redoStates=[after] if authored else [],canonical=after,history=cursor,frameCount=0 if authored else 1);add('dispose',rootsRemoved=True,freshFrameDetached=True)
 return result
def verify_case(c,old=False):
 s=c['spec'];pending=s.get('kind')=='pending';phases=['load','retire','late','fresh','dispose'] if pending else ['load','retire','stale','play','replay','dispose'];assert c['id']==s['id'] and c['planned']==c['completedPhases']==phases and c['error'] is None and c['unsupported']==[]
 wanted=observations(s,old);assert len(c['observations'])==len(wanted)
 for o,(phase,key,value) in zip(c['observations'],wanted):assert (o['phase'],o['property'])==(phase,key) and same(o['actual'],value) and same(o['expected'],value) and o['status']=='PASS',(s['id'],phase,key,o,value)
 if pending:
  expected=[dict(type='input',trusted=True,inputType='insertText'),dict(type='keydown',trusted=True,key='Enter')] if s['variant']=='replace' else [];assert c['nativeEvents']==expected and c['unhandled']==[]
  trace=c['requestTrace'];assert trace and set(r['phase'] for r in trace)=={'load','retire'}
  for r in trace:
   video='12345' if r['phase']=='load' else current(s)['videoId'];assert set(r)=={'service','videoId','url','phase','aborted'} and r['service']=='vimeo' and r['videoId']==video and r['url']=='https://vimeo.com/'+video and isinstance(r['aborted'],bool)
   if r['phase']=='load':assert r['aborted'] is True
  assert sum(not r['aborted'] for r in trace if r['phase']=='retire')<=1
 else:
  events=[]
  if s['playing']:events.append(dict(role='initial',type='click',trusted=True))
  if s['variant']=='replace':events.extend([dict(role='replacement',type='input',trusted=True,inputType='insertText'),dict(role='replacement',type='keydown',trusted=True,key='Enter')])
  if not s['playing']:events.append(dict(role='stale',type='click',trusted=True))
  events.extend([dict(role='fresh',type='click',trusted=True),dict(role='repeat',type='click',trusted=True)]);assert c['nativeEvents']==events,(s['id'],'native delivery')
  points=c['pointTrace'];assert [p['role'] for p in points]==['initial' if s['playing'] else 'stale','fresh','repeat']
  for point in points:assert set(point)=={'role','connected','hit','x','y','width','height'} and point['connected'] is point['hit'] is True and all(isinstance(point[k],(int,float)) and math.isfinite(point[k]) for k in ['x','y','width','height']) and point['width']>0 and point['height']>0
 return len(wanted)

def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='embed-player-lifetime' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('candidate',source)]
 own=['scripts/parity/embed-player-lifetime.mjs','tests/browser/embed-player-lifetime-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
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


def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes;helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 service_path='scripts/parity/checkpoints/2026-11-04/embed-services/review.py';service_bytes=helper['git_blobs']([SERVICE_ACCEPT+':'+service_path])[SERVICE_ACCEPT+':'+service_path];assert Path(service_path).read_bytes().replace(b'\r\n',b'\n')==service_bytes;service={'__name__':'accepted_services_helper'};exec(compile(service_bytes,'accepted-services-helper','exec'),service)
 raw=a.raw.read_bytes();d=json.loads(raw);modules=validate_identity(d,a.candidate,helper,True);assert d['candidatePass'] is True and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 summaries={}
 for row in d['results']:
  old=row['source']=='v1';service['validate_environment'](row);assert row['pageErrors']==row['inputErrors']==row['unavailable']==[] and row['policyEnforced'] is row['trustedPolicy'];wanted=specs();assert [c['spec'] for c in row['cases']]==wanted
  count=sum(verify_case(c,old) for c in row['cases']);assert count==690
  media=[]
  for s in wanted:
   if s.get('kind')=='pending':continue
   if s['playing']:media.append(dict(url=url(initial(s)),type='document',fulfilled=True))
   media.append(dict(url=url(current(s)),type='document',fulfilled=True))
  assert row['mediaRequests']==media and len(media)==30
  key=row['source']+('/trusted' if row['trustedPolicy'] else '/compatible');summaries[key]=dict(cases=len(wanted),observations=count,differences=0,mediaDocuments=len(media),blockedEnvironmentRequests=len(row['environmentRequests']))
 own=['scripts/parity/checkpoints/2026-11-04/embed-player-lifetime/review.py','scripts/parity/checkpoints/2026-11-04/embed-player-lifetime/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 inherited=service['inherited_integration'](helper);runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json']
 for basis in [RUNTIME,inherited['source']]:assert subprocess.check_output(['git','diff','--name-only',basis,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=RUNTIME,currentCases=60,currentObservations=1380,casesPerPolicy=30,observationsPerPolicy=690,playerCasesPerPolicy=20,pendingCasesPerPolicy=10,moduleIdentities=modules,results=summaries,inheritedIntegration=inherited,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(helper_bytes),serviceHelperSha256=sha(service_bytes),transport='Only literal expected YouTube/Vimeo iframe document URLs are requested; their responses are inert test content. Pending preview callbacks are explicitly controlled through the public resolver. No real provider is contacted. Known blocked environmental script attempts remain separately recorded.')
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
