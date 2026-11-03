"""Independent literal LinkPreview native destination/mode state machine."""
import argparse,hashlib,json,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RED='7cafb8b1';GREEN='e8b2cd8f'
TEMPLATES=['horizontal','compact','large-top','minimal','twitter','notion','split'];MODES=['editable','reader','into-reader','back-to-editable','renderer']
def sha(b):return hashlib.sha256(b).hexdigest()
def normalize(v):return re.sub(r'http://127\.0\.0\.1:\d+','http://127.0.0.1:PORT',json.dumps(v,sort_keys=True,ensure_ascii=False))
def same(a,b):return normalize(a)==normalize(b)
def specs():
 return [dict(id=t+'/'+mode+'/click',template=t,mode=mode,gesture='click',trustedPolicy=False) for t in TEMPLATES for mode in MODES]+[dict(id='minimal/'+mode+'/'+gesture,template='minimal',mode=mode,gesture=gesture,trustedPolicy=False) for gesture in ['ctrl-click','middle-click'] for mode in MODES]+[dict(id='minimal/'+mode+'/trusted-policy',template='minimal',mode=mode,gesture='click',trustedPolicy=True) for mode in MODES]
def document(s,old=False):return[dict(id='link',type='linkPreview',**({} if old else dict(dataVersion=1)),data=dict(url='http://127.0.0.1:PORT/destination?case=subject',title='Navigation title',description='Description',image='',favicon='',domain='display.example',template=s['template']))]
def situation(s,profile):
 allow=s['mode'] in ['reader','into-reader','renderer'];actual_allow=allow or profile in ['baseline','red'] or profile=='legacy' and s['gesture']=='middle-click'
 return allow,actual_allow
def event(s,prevented=False,control=False):
 result=dict(type='auxclick' if s['gesture']=='middle-click' else 'click',trusted=True,button=1 if s['gesture']=='middle-click' else 0,ctrlKey=s['gesture']=='ctrl-click')
 if not control:result.update(shiftKey=False,altKey=False,metaKey=False)
 result['prevented']=prevented;return result
def pages(s,allow=True,control=False):return[dict(url='/trusted' if s['trustedPolicy'] else '/',openerIsNull=True)]+([dict(url='/destination?case='+('control' if control else 'subject'),openerIsNull=True)] if allow else [])
def requests(allow=True,control=False):return[dict(url='/destination?case='+('control' if control else 'subject'),referer='')] if allow else []
def view(s,profile,after=False):
 allow,actual_allow=situation(s,profile);return dict(href='/destination?case=subject',target='_blank',rel=['noopener','noreferrer'],title='Navigation title',canonical=document(s,profile=='legacy'),history=None if s['mode']=='renderer' else [False,False],activations=[event(s,not actual_allow)] if after else [],transactions=[])
def observations(s,profile,normative=False):
 old=profile=='legacy';allow,actual_allow=situation(s,profile);actual_allow=allow if normative else actual_allow;result=[]
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 add('control',pages=pages(s,control=True),requests=requests(control=True),activations=[event(s,control=True)])
 add('load',policyEnforced=s['trustedPolicy'],canonical=document(s,old),history=None if s['mode']=='renderer' else [False,False],href='/destination?case=subject',target='_blank',rel=['noopener','noreferrer'],title='Navigation title')
 add('activate',events=[event(s,not actual_allow)],pages=pages(s,actual_allow),requests=requests(actual_allow),canonical=document(s,old),history=None if s['mode']=='renderer' else [False,False],transactions=[])
 add('dispose',holderRemoved=0,pageErrors=[],externalRequests=[]);return result
def verify_case(case,profile):
 s=case['spec'];assert case['error'] is None and case['pageErrors']==case['externalRequests']==[]
 expected=observations(s,profile,True);actual=observations(s,profile);assert len(case['observations'])==len(expected)==19;differences=[]
 for o,(phase,key,wanted),(_,_,observed) in zip(case['observations'],expected,actual):
  status='PASS' if same(wanted,observed) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o['actual'],observed) and same(o['expected'],wanted) and o['status']==status,(case['source'],s['id'],phase,key,o,observed,wanted)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 _,allow=situation(s,profile);wanted_raw=dict(before=view(s,profile),after=view(s,profile,True),pages=pages(s,allow),control=dict(pages=pages(s,control=True),requests=requests(control=True),activations=[event(s,control=True)]),navigationRequests=requests(allow),policyEnforced=s['trustedPolicy']);assert same(case['raw'],wanted_raw),(s['id'],'raw graph')
 for e in case['environmentRequests']:
  u=urlsplit(e['url']);assert set(e)=={'url','type','blocked'} and e['blocked'] is True and e['type']=='script' and u.scheme=='http' and u.hostname=='gc.kis.v2.scr.kaspersky-labs.com' and u.path=='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js' and u.username is None and u.password is None
  q=parse_qs(u.query,keep_blank_values=True);assert set(q)=={'attr'} and len(q['attr'])==1 and 0<len(q['attr'][0])<1024
 return differences

def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='link-preview-navigation' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('candidate',source)]
 own=['scripts/parity/link-preview-navigation.mjs','tests/browser/link-preview-navigation-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
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

LIMITATIONS=[dict(port='transaction:committed',source='v1',reason='The legacy fixture has no public event subscription. Its empty harness trace is not evidence of zero legacy transaction events. Native destinations, canonical data and history are measured.')]
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--browser',type=Path,required=True);p.add_argument('--node',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==helper_bytes;helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper)
 raw=a.raw.read_bytes();red=a.red.read_bytes();d=json.loads(raw);r=json.loads(red);red_source=subprocess.check_output(['git','rev-parse',RED]).decode().strip();green=subprocess.check_output(['git','rev-parse',GREEN]).decode().strip();modules=validate_identity(d,a.candidate,helper,True);red_modules=validate_identity(r,red_source,helper)
 assert d['candidatePass'] is True and r['candidatePass'] is False and d['legacyObservationLimitations']==LIMITATIONS
 summaries={}
 for corpus,label in [(d,'final'),(r,'red')]:
  assert len(corpus['results'])==140;summaries[label]={}
  for source,profile in [('v1','legacy'),('spec-baseline','baseline'),('candidate','current' if label=='final' else 'red')]:
   cases=[c for c in corpus['results'] if c['source']==source];assert [c['spec'] for c in cases]==[s for s in specs() if source=='candidate' or not s['trustedPolicy']]
   failures=[f for c in cases for f in verify_case(c,profile)];assert len(failures)==dict(legacy=6,baseline=54,current=0,red=60)[profile]
   summaries[label][source]=dict(cases=len(cases),observations=sum(len(c['observations']) for c in cases),differences=failures,blockedEnvironmentRequests=sum(len(c['environmentRequests']) for c in cases))
 browser=a.browser.read_bytes();pages_found=re.findall(r'^([-a-z0-9]+\.html?): ',browser.decode(),re.M);runner=helper['git_blobs']([a.candidate+':tests/browser/run.mjs'])[a.candidate+':tests/browser/run.mjs'];inventory=re.findall(r"['\"]([-a-z0-9]+\.html?)['\"]",runner.decode());assert pages_found==inventory and len(pages_found)==len(set(pages_found))==55
 node=a.node.read_bytes();assert b'Node test files: 197' in node and 'ℹ pass 2208'.encode() in node and 'ℹ fail 0'.encode() in node and 'ℹ skipped 3'.encode() in node
 own=['scripts/parity/checkpoints/2026-11-04/link-preview-navigation/review.py','scripts/parity/checkpoints/2026-11-04/link-preview-navigation/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',green,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=green,redSource=red_source,currentCases=50,currentObservations=950,commonHistoricalCases=45,currentEnforcedPolicyCases=5,ordinaryPages=55,nodeFiles=197,nodePassed=2208,nodeSkipped=3,moduleIdentities=modules,redModuleIdentities=red_modules,results=summaries,legacyObservationLimitations=LIMITATIONS,historicalPolicyScope='All 45 common cases use the declared compatible policy. Five additional enforced-policy cases run only on the current source; no historical policy verdict is inferred.',rawSha256=sha(raw),redSha256=sha(red),reviewerSha256=sha(Path(__file__).read_bytes()),browserSha256=sha(browser),nodeSha256=sha(node))
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
