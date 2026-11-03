"""Literal concrete metadata state, history frames and callback ownership model."""
import argparse,gzip,hashlib,json,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RED='b4ac89a0ac56c679f25cc0ef1e84ca821616ee2c';GREEN='38dd32300fa68e6586a2c2a521aacb1eb6391923'
BEFORE='https://before.example/article';AFTER='https://next.example/article';NEWER='https://newer.example/article';PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
META=dict(title='Metadata title',description='Metadata description',image=PIXEL,favicon=PIXEL,domain='display.example');LIFETIMES=['replace','mode','remove-undo','render','destroy'];PHASES=['load','submit','intervene','complete','replay','dispose']
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return[dict(id=v,variant=v) for v in ['no-provider','adjacent','intervening','reject','auto-replay']]+[dict(id=v+'/'+o,variant=v,outcome=o) for v in LIFETIMES for o in ['resolve','reject']]+[dict(id='typed-'+v,variant='typed-'+v) for v in ['mode','remove-undo','render','destroy']]+[dict(id=v,variant=v,currentOnly=True) for v in ['host-title','host-away-back','host-url']]
def data(url=BEFORE,loaded=True):return dict(url=url,title='Before title' if loaded else '',description='Before description' if loaded else '',image='',favicon='',domain={BEFORE:'before.example',AFTER:'next.example',NEWER:'newer.example'}[url],template='horizontal')
def document(value,old=False,other=False):return[dict(id='link',type='linkPreview',**({} if old else dict(dataVersion=1)),data=value),dict(id='b',type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text='BravoX' if other else 'Bravo'))]
def view(value):return dict(input=value['url'],href=value['url'],title=value['title'] or value['url'],description=value['description'])
def situation(s,old=False,red=False):
 v=s['variant'];typed=v.startswith('typed-');life=v[6:] if typed else v;automatic=v=='auto-replay';request=v!='no-provider' and not typed;initial=data(BEFORE,not automatic);submitted=initial if automatic else data(AFTER,False);current=submitted;other=v=='intervening';retired=life in LIFETIMES or v=='host-url';broken=red and v=='intervening'
 if v=='replace':current=data(NEWER,False)
 elif life in ['render','destroy']:current=dict(data(NEWER),title='Rendered successor' if life=='render' else 'Successor title')
 elif v=='host-title':current=dict(current,title='Host title')
 elif v=='host-url':current=data(NEWER)
 completed=current
 if request and not retired and v!='reject' and not broken:completed=dict(current,**META);completed['title']='Host title' if v=='host-title' else '' if v=='host-away-back' else META['title']
 if v=='replace':completed=dict(current,**dict(META,title='Newest metadata'))
 before=document(initial,old);sub=document(submitted,old);last=document(completed,old,other);host=document(dict(submitted,title='Host title'),old)
 frames=[before,last];names=['block.update' if automatic else 'native-input']
 if life=='destroy':frames=[last];names=[]
 elif v=='intervening':frames=[before,sub,document(submitted,old,True)]+([] if broken else [last]);names=['native-input','native-input']+([] if broken else ['block.update'])
 elif v=='host-title':frames=[before,sub,host,last];names=['native-input','block.update','block.update']
 elif v=='host-away-back':frames=[before,sub,host,sub,last];names=['native-input','block.update','block.update','block.update']
 elif v=='host-url' or life=='render':frames=[before,sub,last];names=['native-input','block.update' if v=='host-url' else 'document.render']
 flags=[False,False] if life=='destroy' else [True,True] if life=='remove-undo' else [True,False]
 requests=[] if not request else [BEFORE if automatic else AFTER]+([NEWER] if v=='replace' else [AFTER] if broken else [])
 return dict(v=v,typed=typed,life=life,automatic=automatic,request=request,retired=retired,broken=broken,initial=initial,submitted=submitted,current=current,completed=completed,other=other,frames=frames,names=names,flags=flags,requests=requests)
def observations(s,old=False,red=False,history=True):
 q=situation(s,old,red);v=q['v'];result=[]
 def add(phase,**items):result.extend((phase,k,value) for k,value in items.items())
 add('load',canonical=document(q['initial'],old),history=[False,False],producerPort='undefined' if old else 'function')
 submit_view=dict(view(q['initial']),input=AFTER) if q['typed'] else view(q['submitted'])
 first_requests=[] if not q['request'] else [BEFORE if q['automatic'] else AFTER]
 add('submit',canonical=document(q['submitted'],old),view=submit_view,requests=first_requests,pendingSignals=[False] if q['request'] else [],history=[False,False] if q['automatic'] else [True,False])
 add('intervene',canonical=document(q['current'],old,q['other']))
 if q['request']:add('intervene',firstAborted=q['retired'] or q['broken'])
 add('intervene',requests=q['requests'])
 add('complete',canonical=document(q['completed'],old,q['other']),view=view(q['completed']),unhandled=[],requests=q['requests'])
 undo=list(reversed(q['frames'][:-1]));redo=q['frames'][1:]
 if history:add('replay',historyBefore=q['flags'],undoStates=undo,redoStates=redo)
 add('replay',finalCanonical=document(q['completed'],old,q['other']),cursorRoundtrip=q['flags'],requestCountAfterReplay=len(q['requests']))
 errors=[dict(name='Error',message='Uncaught Error: Cannot mutate instance context during applying-projection phase')] if red and q['life'] in ['remove-undo','render'] else []
 add('dispose',rootsRemoved=True,unhandled=[],pageErrors=errors)
 return result
def native(s,other=True):
 q=situation(s);r=[]
 if not q['automatic']:
  r.append(dict(kind='url-input',trusted=True,type='insertText'))
  if not q['typed']:r.append(dict(kind='submit',trusted=True,key='Enter'))
 if q['v']=='replace':r.extend([dict(kind='url-input',trusted=True,type='insertText'),dict(kind='submit',trusted=True,key='Enter')])
 if q['v']=='intervening' and other:r.append(dict(kind='other-input',trusted=True,type='insertText'))
 return r
def events(s,red=False):
 q=situation(s,red=red);v=q['v'];result=[]
 def add(phase,action,origin,name):result.append(dict(owner='first',phase=phase,action=action,origin=origin,name=name))
 if not q['automatic']:add('submit','commit','native-input','native-input')
 if v in ['intervening','replace']:add('intervene','commit','native-input','native-input')
 elif q['life']=='remove-undo':add('intervene','commit','external','block.remove');add('intervene','undo','history','block.remove')
 elif q['life']=='render':add('intervene','commit','external','document.render')
 elif v.startswith('host-'):
  add('intervene','commit','external','block.update')
  if v=='host-away-back':add('intervene','commit','external','block.update')
 if q['request'] and not q['retired'] and v!='reject' and not q['broken'] or v=='replace':add('complete','commit','plugin','block.update')
 for action,names in [('undo',reversed(q['names'])),('redo',q['names'])]:
  for name in names:add('replay',action,'history',name)
 return result
def request_trace(s,red=False):
 q=situation(s,red=red)
 if not q['request']:return []
 first=dict(url=BEFORE if q['automatic'] else AFTER,phase='load' if q['automatic'] else 'submit',aborted=q['retired'] or q['v']=='reject' or q['broken'])
 return [first]+([dict(url=NEWER if q['v']=='replace' else AFTER,phase='intervene',aborted=q['broken'])] if q['v']=='replace' or q['broken'] else [])
def changes(s):
 q=situation(s)
 if q['automatic']:return []
 return [dict(phase='intervene' if q['v']=='intervening' or q['life'] in ['remove-undo','render','destroy'] else 'dispose',trusted=True,connected=True,blockConnected=True,active=False,value=NEWER if q['v'] in ['replace','host-url'] else AFTER)]
def verify_current(case,red=False,history=True,other=True):
 s=case['spec'];assert case['id']==s['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==case['unhandled']==case['unsupported']==[]
 expected=observations(s,history=history);actual=observations(s,red=red,history=history);assert len(case['observations'])==len(expected);differences=[]
 for o,(phase,key,value),(_,_,observed) in zip(case['observations'],expected,actual):
  status='PASS' if same(value,observed) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],value) and same(o['actual'],observed) and o['status']==status,(s['id'],phase,key,o,observed,value)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 q=situation(s,red=red);assert case['replayTrace']==dict(before=q['flags'],after=q['flags'],undo=list(reversed(q['frames'][:-1])),redo=q['frames'][1:]),(s['id'],'replay trace')
 assert case['transactions']==events(s,red) and case['nativeEvents']==native(s,other) and case['requestTrace']==request_trace(s,red) and case['changeTrace']==changes(s),(s['id'],'delivery graph')
 assert same(case['pageErrors'],next(value for phase,key,value in actual if phase=='dispose' and key=='pageErrors'))
 return len(expected),differences

SEED='66f45e5abfd37334208b46d5be92d46f2ef9aaeb';SEED_SOURCE='1ab4105afc958df9bf35912deaddebbce16fd713';SEED_RAW='7417fbeb3877a1c60fb9f2fcb2d30aceff5d7ca209d83b2a4a9d1200409fd07c';SEED_MODEL='bafc8ba44b6dc10fde51afaac5f8e9ba27983ddb17f879609bdcf1d728a4becd'

def verify_environment(row):
 assert row['externalRequests']==[] and len(row['environmentRequests'])<=1
 for entry in row['environmentRequests']:
  url=urlsplit(entry['url']);assert set(entry)=={'url','type','blocked'} and entry['type']=='script' and entry['blocked'] is True
  assert url.scheme=='http' and url.hostname=='gc.kis.v2.scr.kaspersky-labs.com' and url.path=='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js' and url.username is None and url.password is None
  query=parse_qs(url.query,keep_blank_values=True);assert set(query)=={'attr'} and len(query['attr'])==1 and 0<len(query['attr'][0])<1024

def verify_expectations(case,old=False,history=True):
 wanted=observations(case['spec'],old=old,history=history);assert len(case['observations'])==len(wanted)
 for o,(phase,key,value) in zip(case['observations'],wanted):
  # The old source may have a different cursor because its URL is deferred.
  # The round-trip relation remains checked against that source's own start.
  if key=='cursorRoundtrip':value=case['replayTrace']['before']
  assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],value),(case['id'],phase,key,'changed oracle')
  assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')

def historical_graph(row):
 product={key:row[key] for key in ['source','cases','pageErrors','inputErrors','externalRequests','unavailable']}
 return re.sub(r'http://127\.0\.0\.1:\d+/','http://127.0.0.1:PORT/',json.dumps(product,sort_keys=True,ensure_ascii=False))

def validate_raw_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['serverErrors']==[] and d['filter']=='' and d['group']=='link-preview-metadata' and d['platform']=='win32 x64'
 assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80'
 assert [row['source'] for row in d['results']]==['v1','spec-baseline','candidate']
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':source})
 own=['scripts/parity/link-preview-metadata.mjs','tests/browser/link-preview-metadata-fixture.js'];queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
 for item in d['sources']:
  assert item['tree']==subprocess.check_output(['git','rev-parse',item['sha']+'^{tree}']).decode().strip() and len(item['loaded'])>=80
  for path,h in item['loaded'].items():assert sha(blobs[item['sha']+':'+path])==h
 assert d['runnerSha256']==sha(blobs[source+':'+own[0]]) and d['fixtureSha256']==sha(blobs[source+':'+own[1]])
 if working:
  for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[source+':'+path]
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 return sum(len(s['loaded']) for s in d['sources'])

def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--normal',type=Path,required=True);p.add_argument('--trusted',type=Path,required=True);p.add_argument('--browser',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 root='scripts/parity/checkpoints/2026-11-04/link-preview-metadata/';helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes
 helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 seed_blobs=helper['git_blobs']([SEED+':'+root+p for p in ['seed-history.json.gz','seed-manual-model.py.gz']]);seed_raw=gzip.decompress(seed_blobs[SEED+':'+root+'seed-history.json.gz']);manual=gzip.decompress(seed_blobs[SEED+':'+root+'seed-manual-model.py.gz']);assert sha(seed_raw)==SEED_RAW and sha(manual)==SEED_MODEL and Path(__file__).read_bytes().replace(b'\r\n',b'\n').startswith(manual.replace(b'\r\n',b'\n'))
 seed=json.loads(seed_raw);raw=a.raw.read_bytes();red=a.red.read_bytes();d=json.loads(raw);r=json.loads(red)
 modules=validate_raw_identity(d,a.candidate,helper,True);red_modules=validate_raw_identity(r,RED,helper);seed_modules=validate_raw_identity(seed,SEED_SOURCE,helper);assert d['candidatePass'] is True and r['candidatePass'] is False and seed['candidatePass'] is True
 summaries={}
 for corpus,label,history in [(d,'final',True),(r,'red',False)]:
  rows={}
  for index,row in enumerate(corpus['results']):
   verify_environment(row);old=row['source']=='v1';assert row['inputErrors']==[] and [case['spec'] for case in row['cases']]==[s for s in specs() if not old or not s.get('currentOnly')]
   assert row['unavailable']==([dict(id=v,port='blocks.update producer',reason='Absent in the public v1 surface; common native/provider/abort/replay actions execute without producer emulation.') for v in ['host-title','host-away-back','host-url']] if old else [])
   for case in row['cases']:verify_expectations(case,old,history)
   if label=='final' and row['source']!='candidate':assert historical_graph(row)==historical_graph(seed['results'][index]),(row['source'],'historical graph changed')
   if row['source']=='candidate':
    verified=[verify_current(case,red=label=='red',history=history,other=label!='red') for case in row['cases']];assert len(row['pageErrors'])==(6 if label=='red' else 0);assert sum(len(f) for _,f in verified)==(13 if label=='red' else 0)
   rows[row['source']]=dict(cases=len(row['cases']),observations=sum(len(c['observations']) for c in row['cases']),differences=sum(o['status']!='PASS' for c in row['cases'] for o in c['observations']),pageErrors=len(row['pageErrors']),unavailableProducerCases=len(row['unavailable']),blockedEnvironmentRequests=len(row['environmentRequests']))
  summaries[label]=rows
 assert summaries['final']['candidate']['observations']==523 and summaries['final']['v1']['differences']==87 and summaries['final']['spec-baseline']['differences']==46
 normal=a.normal.read_bytes();trusted=a.trusted.read_bytes()
 for page,text,policy in [('native-link-preview-metadata.html',normal,False),('native-link-preview-metadata-trusted.html',trusted,True)]:
  assert ('Native '+page+': '+str(23 if policy else 22)+' passed').encode() in text
  summary=next(json.loads(line)[page] for line in text.decode().splitlines() if line.startswith('{"'+page+'":'))
  assert [c['name'] for c in summary]==(['LinkPreview Trusted Types policy rejects untrusted HTML'] if policy else [])+['LinkPreview metadata '+s['id'] for s in specs()] and all(c['status']=='PASS' for c in summary)
 browser=a.browser.read_bytes();pages=re.findall(r'^[-a-z0-9]+\.html: ',browser.decode(),re.M);assert len(pages)==len(set(pages))==55
 own=[root+'review.py',root+'controls.mjs','tests/browser/native-link-preview-metadata.js','tests/browser/native-link-preview-metadata.html','tests/browser/native-link-preview-metadata-trusted.html','tests/browser/physical-history.mjs'];blobs=helper['git_blobs']([a.candidate+':'+p for p in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',GREEN,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,results=summaries,currentCases=22,currentObservations=523,nativeCases=22,trustedCases=23,ordinaryPages=55,rawSha256=sha(raw),redSha256=sha(red),reviewerSha256=sha(Path(__file__).read_bytes()),nativeNormalSha256=sha(normal),nativeTrustedSha256=sha(trusted),browserSha256=sha(browser),moduleIdentities=modules,redModuleIdentities=red_modules,seedModuleIdentities=seed_modules,seedCommit=SEED,seedRawSha256=SEED_RAW,manualSeedModelSha256=SEED_MODEL,runtimeBasis=GREEN)
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
