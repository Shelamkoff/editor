"""Literal public Embed provider/ID, native submission and replay model."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='e8b2cd8fa902e1bbfbc0422df13576be4aea619f'
PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
VALID=[('youtube-watch','https://youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-www','https://www.youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-mobile','https://m.youtube.com/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-short-host','https://youtu.be/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-embed','https://youtube.com/embed/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-shorts','https://youtube.com/shorts/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-case','https://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('youtube-query','https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=2','youtube','dQw4w9WgXcQ'),('youtube-http','http://youtu.be/dQw4w9WgXcQ','youtube','dQw4w9WgXcQ'),('vimeo-main','https://vimeo.com/12345','vimeo','12345'),('vimeo-www','https://www.vimeo.com/12345','vimeo','12345'),('vimeo-player','https://player.vimeo.com/video/12345','vimeo','12345')]
INVALID=[('unknown-host','https://videos.example/watch?v=dQw4w9WgXcQ'),('lookalike-host','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'),('userinfo-host','https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ'),('script-scheme','javascript:alert(1)'),('relative-url','/watch?v=dQw4w9WgXcQ'),('youtube-missing-id','https://youtube.com/watch'),('youtube-short-id','https://youtube.com/watch?v=short'),('youtube-long-id','https://youtube.com/watch?v=dQw4w9WgXcQx'),('youtube-bad-id','https://youtu.be/dQw4w9WgXc!'),('youtube-wrong-path','https://youtube.com/channel/dQw4w9WgXcQ'),('vimeo-bad-id','https://vimeo.com/12bad'),('vimeo-missing-id','https://player.vimeo.com/video/'),('prototype-host','https://constructor/video/12345')]
MALFORMED=[('unknown','foreign','12345'),('prototype','__proto__','12345'),('constructor','constructor','12345'),('to-string','toString','12345'),('youtube-short','youtube','short'),('youtube-long','youtube','dQw4w9WgXcQx'),('youtube-symbol','youtube','dQw4w9WgXc!'),('vimeo-word','vimeo','12bad'),('vimeo-negative','vimeo','-1'),('vimeo-decimal','vimeo','1.2')]
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return[dict(id=id+'/'+method,kind='url',url=url,service=service,videoId=video,method=method) for id,url,service,video in VALID for method in ['enter','button']]+[dict(id=id,kind='url',url=url,service='',videoId='',method='enter') for id,url in INVALID]+[dict(id='schema/'+id,kind='schema',service=service,videoId=video) for id,service,video in MALFORMED]+[dict(id='loaded/'+service+'/'+mode,kind='loaded',service=service,videoId='dQw4w9WgXcQ' if service=='youtube' else '12345',mode=mode) for service in ['youtube','vimeo'] for mode in ['reader','renderer']]
def data(s=None):return dict(service=s['service'] if s else '',videoId=s['videoId'] if s else '',caption='<b>Author caption</b>',cover=PIXEL,title='Author title',duration='1:23')
def blocks(s=None,old=False):return[dict(id='embed',type='embed',**({} if old else dict(dataVersion=1)),data=data(s))]
def document(s,old=False):return dict(version='1.0.5' if old else '2.0.0',blocks=blocks(s,old))
def frame(s):return dict(src=('https://www.youtube.com/embed/'+s['videoId']+'?autoplay=1&rel=0') if s['service']=='youtube' else 'https://player.vimeo.com/video/'+s['videoId']+'?autoplay=1',sandbox='allow-scripts allow-same-origin allow-presentation allow-popups',allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',title='Author title',fullscreen=True)
def observations(s,old=False,normative=False):
 result=[];kind=s['kind']
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 if kind=='schema':
  add('create',rejected=not old or normative,holderEmpty=not old or normative,noIframe=True,callerUnchanged=document(s,old));add('dispose',editorRemoved=True)
 elif kind=='loaded':
  add('load',noIframe=None,callerUnchanged=document(s,old))
  if s['mode']=='reader':add('load',history=[False,False])
  add('play',iframe=frame(s),callerUnchanged=document(s,old))
  if s['mode']=='reader':add('play',canonical=blocks(s,old),history=[False,False]);add('dispose',editorRemoved=True)
 else:
  action=bool(s['service']);actual_action=action or old and not normative;flags=[actual_action,False]
  add('load',canonical=blocks(old=old),history=[False,False]);add('submit',canonical=blocks(s,old),history=flags);add('play',iframe=frame(s) if action else None,canonical=blocks(s,old),history=flags)
  add('replay',before=flags,undoStates=[blocks(old=old)] if actual_action else [],redoStates=[blocks(s,old)] if actual_action else [],after=[action,False],final=blocks(s,old),iframeAfterReplay=None);add('dispose',rootRemoved=True)
 return result
def verify_case(c,old=False):
 s=c['spec'];kind=s['kind'];phases=['create','dispose'] if kind=='schema' else ['load','play','dispose'] if kind=='loaded' else ['load','submit','play','replay','dispose'];assert c['id']==s['id'] and c['planned']==c['completedPhases']==phases and c['error'] is None and c['unsupported']==[]
 expected=observations(s,old,True);actual=observations(s,old);assert len(c['observations'])==len(expected);differences=[]
 for o,(phase,key,wanted),(_,_,observed) in zip(c['observations'],expected,actual):
  status='PASS' if same(wanted,observed) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],wanted) and same(o['actual'],observed) and o['status']==status,(s['id'],phase,key,o,observed,wanted)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 events=[]
 if kind=='url':
  events=[dict(type='input',trusted=True,inputType='insertText'),dict(type='insert-click',trusted=True) if s['method']=='button' else dict(type='keydown',trusted=True,key='Enter')]
  if s['service']:
   point=c['nativeEvents'][2];assert set(point)=={'type','connected','hit','className','rect'} and point['type']=='pointer-target' and point['connected'] is point['hit'] is True and (point['className'] is None or isinstance(point['className'],str)) and set(point['rect'])=={'x','y','width','height'} and all(isinstance(n,(int,float)) for n in point['rect'].values()) and point['rect']['width']>0 and point['rect']['height']>0
   events.extend([point,dict(type='click',trusted=True)])
 elif kind=='loaded':events=[dict(type='click',trusted=True)]
 assert c['nativeEvents']==events,(s['id'],'native delivery')
 if kind=='schema':
  message='Embed service must be youtube, vimeo, or empty' if s['service'] not in ['youtube','vimeo'] else 'YouTube video id is invalid' if s['service']=='youtube' else 'Vimeo video id is invalid'
  assert c['creationError']==(None if old else dict(name='TypeError',message=message))
 return differences

def validate_environment(row):
 assert row['externalRequests']==[]
 for e in row['environmentRequests']:
  u=urlsplit(e['url']);assert set(e)=={'url','type','blocked'} and e['type']=='script' and e['blocked'] is True and u.scheme=='http' and u.hostname=='gc.kis.v2.scr.kaspersky-labs.com' and u.path=='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js' and u.username is None and u.password is None
  q=parse_qs(u.query,keep_blank_values=True);assert set(q)=={'attr'} and len(q['attr'])==1 and 0<len(q['attr'][0])<1024

def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='embed-services' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('candidate',source)]
 own=['scripts/parity/embed-services.mjs','tests/browser/embed-services-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
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

NAV_ACCEPT='e2c8c74632434e7f36d467256656cf9b957e0ed9';NAV_ROOT='scripts/parity/checkpoints/2026-11-04/link-preview-navigation/'
def inherited_integration(helper):
 import gzip,re
 blobs=helper['git_blobs']([NAV_ACCEPT+':'+NAV_ROOT+p for p in ['artifact-hashes.json','full-integration-manifest.json.gz','browser.log.gz','node.log.gz','bundle.log.gz','heap.log.gz']]);hashes=json.loads(blobs[NAV_ACCEPT+':'+NAV_ROOT+'artifact-hashes.json']);decoded={}
 for name in ['full-integration-manifest.json.gz','browser.log.gz','node.log.gz','bundle.log.gz','heap.log.gz']:
  raw=blobs[NAV_ACCEPT+':'+NAV_ROOT+name];decoded[name]=gzip.decompress(raw);assert sha(raw)==hashes[name]['sha256'] and sha(decoded[name])==hashes[name]['decodedSha256']
 m=json.loads(decoded['full-integration-manifest.json.gz']);assert m['outcome']=='passed' and m['sourceUnchanged'] is True and m['source']['dirty'] is False and len(m['gates'])==18
 runner=helper['git_blobs']([m['source']['head']+':tests/browser/run.mjs'])[m['source']['head']+':tests/browser/run.mjs'];pages=re.findall(r'^([-a-z0-9]+\.html?): ',decoded['browser.log.gz'].decode(),re.M);assert pages==re.findall(r"['\"]([-a-z0-9]+\.html?)['\"]",runner.decode()) and len(pages)==len(set(pages))==55
 bundle=next(line for line in decoded['bundle.log.gz'].decode().splitlines() if "'fullPreset'" in line);numbers=re.findall(r"'(\d+(?:\.\d+)?)'",bundle);assert len(numbers)==3 and float(numbers[1])==95.6 and float(numbers[2])==96
 for g in m['gates'].values():assert g['outcome']=='passed' and g['sourceUnchanged'] is True and g['sourceBefore']['identity']==g['sourceAfter']['identity']==m['source']['identity']
 assert b'Node test files: 197' in decoded['node.log.gz'] and 'ℹ pass 2208'.encode() in decoded['node.log.gz'] and 'ℹ fail 0'.encode() in decoded['node.log.gz'] and 'ℹ skipped 3'.encode() in decoded['node.log.gz']
 heap=json.loads(decoded['heap.log.gz'].decode().strip().splitlines()[-1]);assert heap['sentinels']==23 and heap['retained']==0
 return dict(acceptance=NAV_ACCEPT,source=m['source']['head'],sourceIdentity=m['source']['identity'],gates=18,outcome='passed',canonicalNodeFiles=197,nodePassed=2208,nodeSkipped=3,ordinaryPages=55,selectedNativeCases=271,navigationCases=50,bundleKiBGzip=95.6,budgetKiB=96,heapSentinels=23,heapRetained=0)

def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes;helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 raw=a.raw.read_bytes();d=json.loads(raw);modules=validate_identity(d,a.candidate,helper,True);assert d['candidatePass'] is True and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 summaries={}
 for row in d['results']:
  old=row['source']=='v1';validate_environment(row);assert row['pageErrors']==row['inputErrors']==[] and row['policyEnforced'] is row['trustedPolicy'];wanted=[s for s in specs() if not old or s.get('method')!='button'];assert [c['spec'] for c in row['cases']]==wanted
  assert row['unavailable']==([dict(id=s['id'],port='URL Insert button',reason='Absent in the public v1 URL bar. Common Enter, native play and replay execute without a substitute action.') for s in specs() if s.get('method')=='button'] if old else [])
  failures=[f for c in row['cases'] for f in verify_case(c,old)];assert len(failures)==(85 if old else 0)
  media=[dict(url=frame(s)['src'],type='document',fulfilled=True) for s in wanted if s['kind']=='loaded' or s['kind']=='url' and s['service']];assert row['mediaRequests']==media
  key=row['source']+('/trusted' if row['trustedPolicy'] else '/compatible');summaries[key]=dict(cases=len(wanted),observations=sum(len(c['observations']) for c in row['cases']),differences=failures,mediaDocuments=len(media),unavailableInsertCases=len(row['unavailable']),blockedEnvironmentRequests=len(row['environmentRequests']))
 own=['scripts/parity/checkpoints/2026-11-04/embed-services/review.py','scripts/parity/checkpoints/2026-11-04/embed-services/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 inherited=inherited_integration(helper);runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json']
 for basis in [RUNTIME,inherited['source']]:assert subprocess.check_output(['git','diff','--name-only',basis,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=RUNTIME,currentCases=102,currentObservations=1184,casesPerPolicy=51,observationsPerPolicy=592,historicalCommonCases=39,unavailableLegacyInsertCases=12,moduleIdentities=modules,results=summaries,inheritedIntegration=inherited,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),transport='Only literal expected YouTube/Vimeo iframe document URLs are requested; their responses are inert test content. No real provider is contacted. Known blocked environmental script attempts remain separately recorded.')
 assert summaries['candidate/compatible']['observations']==summaries['candidate/trusted']['observations']==592 and summaries['v1/compatible']['observations']==424
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
