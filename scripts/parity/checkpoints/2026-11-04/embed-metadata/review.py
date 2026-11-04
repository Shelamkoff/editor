"""Literal model of public Embed metadata and cover-source workflows."""
import argparse,hashlib,json,math,re,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='64eef82a36d9a374c4fff045fa331a8a58535dd8'
PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
RECOVERY='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
FRESH='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return [dict(id='action/'+outcome,kind='action-error',outcome=outcome) for outcome in ['throw','reject','null','invalid']]+[dict(id='field/'+field,kind='field',field=field) for field in ['caption','title','duration']]+[dict(id='cover/'+action,kind='cover',action=action) for action in ['url','invalid-url','back','remove']]+[dict(id=source+'/'+variant+'/'+outcome,kind='task',source=source,variant=variant,outcome=outcome) for source in ['action','upload'] for variant in ['live','caption','mode','replace','remove-undo','render','destroy-successor'] for outcome in ['resolve','reject']]+[dict(id='preview/'+outcome,kind='preview',outcome=outcome) for outcome in ['timely','timeout']]+[dict(id='upload/local',kind='local')]
def initial(s):return dict(service='vimeo',videoId='12345',caption='Author caption',cover='' if s['kind']=='preview' else PIXEL,title='Author title',duration='1:23')
def blocks(d,old):return [dict(id='embed',type='embed',**({} if old else dict(dataVersion=1)),data=d)]
def file():return dict(name='cover.png',type='image/png',size=68,base64=PIXEL.split(',')[1])
def observations(s,source='candidate',blob=None,normative=False):
 old=source=='v1';base=source in ['spec-baseline','red'];before=initial(s);result=[]
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 def snapshot(phase,data,history):add(phase,canonical=blocks(data,old),history=history,faults=[])
 if s['kind']=='action-error':
  faults=[dict(kind='error',message='Uncaught Error: Cover source failed synchronously')] if base and s['outcome']=='throw' and not normative else []
  add('load',canonical=blocks(before,old),history=[False,False]);add('failure',calls=1,signalAtCall=False,faults=faults,canonical=blocks(before,old),history=[False,False]);after={**before,'cover':RECOVERY};add('recovery',calls=2,canonical=blocks(after,old),history=[True,False],faults=faults);add('replay',undo=blocks(before,old),redo=blocks(after,old),history=[True,False]);add('dispose',rootRemoved=True);return result
 snapshot('load',before,[False,False])
 if s['kind']=='task':
  add('pending',calls=1,signal=False)
  if s['source']=='upload':add('pending',file=file())
  snapshot('pending',before,[False,False]);current=before;states=[];cursor=[False,False];variant=s['variant']
  if variant=='caption':current={**before,'caption':before['caption']+' edited'};states=[before];cursor=[True,False]
  elif variant=='replace':current={**before,'videoId':'67890'};states=[before];cursor=[True,False]
  elif variant=='remove-undo':cursor=[False,True]
  elif variant=='render':current={**before,'videoId':'67890','title':'Rendered title'};states=[before];cursor=[True,False]
  elif variant=='destroy-successor':current={**before,'videoId':'67890','title':'Successor title'}
  retired=variant not in ['live','caption'];add('retire',aborted=retired);snapshot('retire',current,cursor)
  if not retired and s['outcome']=='resolve':states.append(current);current={**current,'cover':RECOVERY};cursor=[True,False]
  snapshot('late',current,cursor);add('fresh',calls=2,signalAtFresh=False);states.append(current);current={**current,'cover':FRESH};snapshot('fresh',current,[True,False]);add('replay',undo=[blocks(d,old) for d in reversed(states)],redo=[blocks(d,old) for d in states[1:]+[current]]);snapshot('replay',current,[True,False])
 elif s['kind']=='preview':
  add('settle',oneLiveRequest=1,request=dict(service='vimeo',videoId='12345',url='https://vimeo.com/12345'))
  view=dict(src=RECOVERY,alt='Resolved preview')
  if s['outcome']=='timeout':add('settle',aborted=False if base and not normative else True,reason=None if base and not normative else 'TimeoutError',preview=view if (old or base) and not normative else None)
  else:add('settle',preview=view,aborted=False)
  snapshot('settle',before,[False,False])
 else:
  after=before;authored=False
  if s['kind']=='field':
   value=before['caption']+' edited' if s['field']=='caption' else 'Edited title' if s['field']=='title' else '2:34';after={**before,s['field']:value};authored=True
   if s['field']!='caption':add('action',visible=value)
  elif s['kind']=='cover':
   action=s['action']
   if action=='remove':after={**before,'cover':''};authored=True
   elif action in ['url','invalid-url']:
    value=RECOVERY if action=='url' else 'javascript:alert(1)'
    if old:add('action',prompt=dict(type='prompt',message='Image URL:',value=value))
    elif action=='invalid-url':add('action',invalid='true')
    if action=='url':after={**before,'cover':RECOVERY};authored=True
  elif s['kind']=='local':after={**before,'cover':blob};authored=True;add('action',localUrl=True,imageSize=[1,1],localBytes=PIXEL.split(',')[1])
  snapshot('action',after,[authored,False]);add('replay',undo=[blocks(before,old)] if authored else [],redo=[blocks(after,old)] if authored else []);snapshot('replay',after,[authored,False])
  if s['kind']=='local':add('replay',localStillLive=True)
 add('dispose',rootRemoved=True)
 if s['kind']=='local':add('dispose',localRevoked=True)
 add('dispose',faults=[]);return result
def events(s,old=False):
 result=[]
 def click(role):result.append(dict(role=role,type='click',trusted=True))
 def text(role):result.append(dict(role=role,type='input',trusted=True,inputType='insertText'))
 def choose(role):
  click(role+'-cover');click(role+'-source')
  if s.get('source')!='action':result.append(dict(role=role+'-file',type='change',trusted=True,name='cover.png',mimeType='image/png',size=68,multiple=False))
 if s['kind']=='action-error':
  for role in ['failed-cover','failed-source','recovery-cover','recovery-source']:click(role)
 elif s['kind']=='task':
  choose('pending')
  if s['variant']=='caption':text('caption')
  elif s['variant']=='replace':text('replacement');result.append(dict(role='replacement',type='keydown',trusted=True,key='Enter'))
  choose('fresh')
 elif s['kind']=='field':
  if s['field']!='caption':click('settings')
  text('field')
  if s['field']!='caption':result.append(dict(role='field',type='change',trusted=True))
 elif s['kind']=='cover':
  click('cover')
  if s['action'] in ['back','remove']:click(s['action'])
  else:
   click('url')
   if not old:
    text('url');click('submit')
    if s['action']=='invalid-url':click('cancel')
 elif s['kind']=='local':choose('local')
 return result
def verify_case(c,source='candidate'):
 s=c['spec'];old=source=='v1';kind=s['kind'];blob=c.get('blobUrl')
 if kind=='local':assert isinstance(blob,str) and re.fullmatch(r'blob:http://127\.0\.0\.1:[1-9][0-9]{3,4}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',blob)
 else:assert blob is None
 phases=['load','failure','recovery','replay','dispose'] if kind=='action-error' else ['load','pending','retire','late','fresh','replay','dispose'] if kind=='task' else ['load','settle','dispose'] if kind=='preview' else ['load','action','replay','dispose']
 assert c['id']==s['id'] and c['planned']==c['completedPhases']==phases and c['error'] is None and c['unsupported']==[]
 observed=observations(s,source,blob);wanted=observations(s,source,blob,True);assert len(c['observations'])==len(wanted);failures=[]
 for o,(phase,key,actual),(_,_,expected) in zip(c['observations'],observed,wanted):
  status='PASS' if same(actual,expected) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o.get('actual'),actual) and same(o['expected'],expected) and o['status']==status,(s['id'],phase,key,o,actual,expected)
  if status=='FAIL':failures.append(dict(id=s['id'],phase=phase,property=key))
 assert c['nativeEvents']==events(s,old),(s['id'],'native events',c['nativeEvents'],events(s,old))
 assert [p['role'] for p in c['pointTrace']]==[e['role'] for e in events(s,old) if e['type']=='click']
 for p in c['pointTrace']:assert set(p)=={'role','connected','hit','x','y','width','height'} and p['connected'] is p['hit'] is True and all(isinstance(p[k],(int,float)) and math.isfinite(p[k]) for k in ['x','y','width','height']) and p['width']>0 and p['height']>0
 if kind!='action-error':
  assert c['fileTrace']==(file() if kind=='task' and s['source']=='upload' else None)
  if kind=='preview':
   assert c['requestTrace']
   for request in c['requestTrace']:assert set(request)=={'service','videoId','url','aborted'} and isinstance(request['aborted'],bool) and request==dict(service='vimeo',videoId='12345',url='https://vimeo.com/12345',aborted=request['aborted'])
  else:assert c['requestTrace']==[]
 return failures

def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='embed-metadata' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('candidate',source)]
 own=['scripts/parity/embed-metadata.mjs','tests/browser/embed-metadata-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
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


SERVICE_ACCEPT='cb88f9fbb7be0afb45763651932dabae3c1d5efd';LIFETIME_ACCEPT='efe3d0bb73fef41593cf56e827b6a84060e40f7b';RED='6684a878fed4369ff7458dc6d970e259fb86eb7d'
def accepted_helper(helper,commit,path,name):
 b=helper['git_blobs']([commit+':'+path])[commit+':'+path];assert Path(path).read_bytes().replace(b'\r\n',b'\n')==b;ns={'__name__':name};exec(compile(b,name,'exec'),ns);return ns,b
def page_errors(row,bug=False):
 errors=row['pageErrors']
 if not bug:assert errors==[];return
 assert len(errors)==1
 pattern=r'Error: Cover source failed synchronously\n    at Object.handler \(http://127\.0\.0\.1:([0-9]+)/fixture\.js:[0-9]+:[0-9]+\)\n    at button.addEventListener.signal \(http://127\.0\.0\.1:\1/'+row['source']+r'/plugins/embed/index\.js:[0-9]+:[0-9]+\)'
 assert re.fullmatch(pattern,errors[0]),errors
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--lifetime',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes;helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 service,service_bytes=accepted_helper(helper,SERVICE_ACCEPT,'scripts/parity/checkpoints/2026-11-04/embed-services/review.py','accepted_services_helper');lifetime,lifetime_bytes=accepted_helper(helper,LIFETIME_ACCEPT,'scripts/parity/checkpoints/2026-11-04/embed-player-lifetime/review.py','accepted_lifetime_helper')
 raw=a.raw.read_bytes();d=json.loads(raw);modules=validate_identity(d,a.candidate,helper,True);assert d['candidatePass'] is True and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 summaries={}
 for row in d['results']:
  service['validate_environment'](row);page_errors(row,row['source']=='spec-baseline');assert row['inputErrors']==row['unavailable']==row['mediaRequests']==[] and row['policyEnforced'] is row['trustedPolicy'];assert [c['spec'] for c in row['cases']]==specs()
  failures=[f for c in row['cases'] for f in verify_case(c,row['source'])];assert len(failures)==(1 if row['source']=='v1' else 5 if row['source']=='spec-baseline' else 0)
  key=row['source']+('/trusted' if row['trustedPolicy'] else '/compatible');summaries[key]=dict(cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),differences=failures,pageErrors=len(row['pageErrors']),blockedEnvironmentRequests=len(row['environmentRequests']))
 assert summaries['candidate/compatible']['observations']==summaries['candidate/trusted']['observations']==967 and summaries['v1/compatible']['observations']==968
 late_raw=a.lifetime.read_bytes();late=json.loads(late_raw);late_modules=lifetime['validate_identity'](late,a.candidate,helper,True);assert late['candidatePass'] is True and [(r['source'],r['trustedPolicy']) for r in late['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 for row in late['results']:
  service['validate_environment'](row);assert row['pageErrors']==row['inputErrors']==row['unavailable']==[] and row['policyEnforced'] is row['trustedPolicy'] and [c['spec'] for c in row['cases']]==lifetime['specs']()
  assert sum(lifetime['verify_case'](c,row['source']=='v1') for c in row['cases'])==690;media=[]
  for s in lifetime['specs']():
   if s.get('kind')=='pending':continue
   if s['playing']:media.append(dict(url=lifetime['url'](lifetime['initial'](s)),type='document',fulfilled=True))
   media.append(dict(url=lifetime['url'](lifetime['current'](s)),type='document',fulfilled=True))
  assert row['mediaRequests']==media and len(media)==30
 red_raw=a.red.read_bytes();red=json.loads(red_raw);validate_identity(red,RED,helper);assert red['candidatePass'] is False and [(r['source'],r['trustedPolicy']) for r in red['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 for row in red['results']:
  service['validate_environment'](row);page_errors(row,row['source']!='v1');assert row['inputErrors']==row['unavailable']==row['mediaRequests']==[] and row['policyEnforced'] is row['trustedPolicy'] and [c['spec'] for c in row['cases']]==specs()[:2]
  assert sum(len(verify_case(c,'red' if row['source']=='candidate' else row['source'])) for c in row['cases'])==(0 if row['source']=='v1' else 2)
 own=['scripts/parity/checkpoints/2026-11-04/embed-metadata/review.py','scripts/parity/checkpoints/2026-11-04/embed-metadata/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',RUNTIME,a.candidate,'--',*runtime])==b''
 assert subprocess.check_output(['git','diff','--name-only','e8b2cd8fa902e1bbfbc0422df13576be4aea619f',RUNTIME,'--',*runtime]).decode().splitlines()==['plugins/embed/index.js','plugins/embed/reconciliation.test.js']
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=RUNTIME,currentCases=84,currentObservations=1934,casesPerPolicy=42,observationsPerPolicy=967,moduleIdentities=modules,lifetimeModuleIdentities=late_modules,results=summaries,lifetime=dict(currentCases=60,currentObservations=1380,acceptance=LIFETIME_ACCEPT,rawSha256=sha(late_raw)),red=dict(source=RED,currentCases=4,currentDifferences=4,currentPageErrors=2,rawSha256=sha(red_raw)),rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(helper_bytes),serviceHelperSha256=sha(service_bytes),lifetimeHelperSha256=sha(lifetime_bytes),transport='No real provider or product network is contacted. Real native file chooser events receive exact local PNG files. Temporary local object URLs are read before and after replay, then must be revoked on destruction. Known blocked environment script attempts remain separate.')
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
