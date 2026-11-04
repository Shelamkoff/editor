"""Warning's real public fields checked against the immutable rich-field oracle."""
import argparse,hashlib,json,subprocess
from datetime import datetime
from pathlib import Path
PARENT='a6eb2e898e99137a96af4be0326aa799912c0038';ORACLE='373ce247b986eb41fd268250a43386c9ef47d37d';ORACLE_PATH='scripts/parity/checkpoints/2026-11-04/quote-fields/review.py'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='3c02d2d46e1ecf2641cc7a6753189f12c7e4a1e7'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def oracle():
 b=subprocess.check_output(['git','show',ORACLE+':'+ORACLE_PATH]);assert Path(ORACLE_PATH).read_bytes().replace(b'\r\n',b'\n')==b;n={'__name__':'immutable_rich_field_oracle'};exec(compile(b,'immutable-rich-field-oracle','exec'),n);return n,b
def specs(q):
 result=[]
 for s in q['specs']():
  w=dict(s,id=s['id'].replace('/text','/title').replace('/caption','/message'))
  if 'field' in w:w['field']={'text':'title','caption':'message'}[w['field']]
  result.append(w)
 return result+[dict(id='navigate/title-enter',kind='navigate',field='title',enter=True)]
def qspec(s):
 q=dict(s)
 if 'field' in q:q['field']={'title':'text','message':'caption'}[q['field']]
 return q
def warning_value(value):
 if isinstance(value,list):return [warning_value(v) for v in value]
 if isinstance(value,dict):
  out={k:warning_value(v) for k,v in value.items()}
  if out.get('type')=='quote':out['type']='warning';out['data']={'title':out['data']['text'],'message':out['data']['caption']}
  return out
 return value
def observations(s,q):return [(p,k,warning_value(v)) for p,k,v in q['observations'](qspec(s))]
def native(s,q):
 out=q['native'](qspec(s))
 if s.get('enter'):
  event=next(e for e in out if e['role']=='next-field');assert event['key']=='Tab' and event['modifiers']==0;event['key']='Enter'
 return out
def corpus(d,candidate,q):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is True and d['serverErrors']==[] and d['filter']=='' and d['group']=='warning-fields'
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/warning-fields.mjs','tests/browser/warning-fields-fixture.js'];b=q['blobs']([s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>95
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]]) and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..' not in Path(p).parts and not Path(p).is_absolute() and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes());result={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[] and [c['spec'] for c in r['cases']]==specs(q)
  for e in r['environmentRequests']:assert e['blocked'] is True and e['type']=='script' and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  differences=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id'] and c['error'] is None and c['planned']==c['completedPhases'];count+=len(c['observations'])
   for o in c['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':differences.append([c['id'],o['phase'],o['property']])
   if r['source'] in ['parent','candidate']:
    wanted=observations(c['spec'],q);assert c['unsupported']==c['diagnostics']==[] and c['planned']==list(dict.fromkeys(p for p,k,v in wanted)) and len(c['observations'])==len(wanted)
    for o,(p,k,v) in zip(c['observations'],wanted):
     if k=='savedCaller':
      stamp=o['actual'].get('time');assert type(stamp)==int and int(datetime.fromisoformat(d['startedAt'].replace('Z','+00:00')).timestamp()*1000)<=stamp<=int(datetime.fromisoformat(d['finishedAt'].replace('Z','+00:00')).timestamp()*1000);v=dict(v,time=stamp)
     assert (o['phase'],o['property'])==(p,k) and same(o['actual'],v) and same(o['expected'],v),(c['id'],p,k,o,v)
    assert c['nativeEvents']==native(c['spec'],q) and c['transactions']==q['events'](qspec(c['spec']))
   elif r['source']=='v1':assert len(c['unsupported'])==1 and c['unsupported'][0]['property']=='currentObservers'
   else:assert c['unsupported']==[]
  assert count==498 and len(differences)==(51 if r['source']=='v1' else 35 if r['source']=='spec-baseline' else 0)
  result[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=17,observations=count,differences=differences)
 return result,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();q,b=oracle();raw=a.raw.read_bytes();result,modules=corpus(json.loads(raw),a.candidate,q)
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',ORACLE,a.candidate,'--',*runtime])==b'' and subprocess.check_output(['git','diff','--name-only',PARENT,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,parent=PARENT,productionBasis=RUNTIME,productionChanged=False,inheritedVerificationSource=ORACLE,currentCases=34,currentObservations=996,moduleIdentities=modules,results=result,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),fieldOracleSource=ORACLE,fieldOracleSha256=sha(b),scope='The immutable literal rich-field oracle maps expected document type and field names only. Real Warning classes/factories execute unchanged, including their actual title Enter shortcut. Actual data, marks, IDs, widgets, focus, history and trusted events are checked; clocks are real and bounded.',limitations=['Legacy transaction/diagnostic subscriptions are absent; empty fixture arrays are not measured legacy event counts.'])
 a.output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if __name__=='__main__':main()
