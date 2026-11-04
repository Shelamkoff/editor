"""Real Toggle/Spoiler fields against the immutable, literal rich-field oracle."""
import argparse,hashlib,json,subprocess
from datetime import datetime
from pathlib import Path
PARENT='54e04b11ad369fb68ed79314c6743c4de5bb7900';ORACLE='373ce247b986eb41fd268250a43386c9ef47d37d';ORACLE_PATH='scripts/parity/checkpoints/2026-11-04/quote-fields/review.py'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='a4a0c8c9c7c4af235312463188b913c395db6aa4'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def oracle():
 b=subprocess.check_output(['git','show',ORACLE+':'+ORACLE_PATH]);assert Path(ORACLE_PATH).read_bytes().replace(b'\r\n',b'\n')==b;n={'__name__':'immutable_rich_field_oracle'};exec(compile(b,'immutable-rich-field-oracle','exec'),n);return n,b
def specs(q):
 out=[]
 for family in ['toggle','spoiler']:
  first='title' if family=='toggle' else 'label'
  for s in q['specs']():
   if s['kind']=='navigate':continue
   w=dict(s,id=family+'/'+s['id'].replace('/text','/'+first).replace('/caption','/content'),family=family)
   if 'field' in w:w['field']={'text':first,'caption':'content'}[w['field']]
   out.append(w)
 return out
def qspec(s):
 q=dict(s)
 if 'field'in q:q['field']='caption' if q['field']=='content' else 'text'
 return q
def mapped(value,family):
 if isinstance(value,list):return [mapped(v,family)for v in value]
 if isinstance(value,dict):
  out={k:mapped(v,family)for k,v in value.items()}
  if out.get('type')=='quote':
   out['type']=family;out['data']={('title'if family=='toggle'else'label'):out['data']['text'],'content':out['data']['caption'],**({'open':True}if family=='toggle'else{})}
  return out
 return value
def observations(s,q):
 out=[];after=mapped(q['document'](qspec(s),True),s['family'])
 for p,k,v in q['observations'](qspec(s)):
  if p=='navigate':continue
  if p=='roundtrip'and k=='savedCaller':
   out.append((p,'readerInitialVisibility',s['family']=='toggle'))
   for role,visible in ([('initialReveal',True)]if s['family']=='spoiler'else[])+[('conceal',False),('reveal',True)]:out.extend([(p,role+'Visible',visible),(p,role+'Canonical',after),(p,role+'History',[False,False])])
  out.append((p,k,mapped(v,s['family'])))
  if k=='widgets'and p in ['action','undo','redo']and s['kind']in ['edit','format']:
   if s['kind']=='format':selection=dict(anchor=[None,2]if s['backward']else[2,None],focus=[2,None]if s['backward']else[None,2])
   else:
    index=1 if s['field']=='content'else 0;length=4 if index else 5;a=(length-1 if s['backward']else 2)if p=='undo'else(2 if s['backward']else 3);f=(1 if s['backward']else 2)if p=='undo'else a;selection=dict(anchor=[a if index==0 else None,a if index==1 else None],focus=[f if index==0 else None,f if index==1 else None])
   out.append((p,'nativeSelection',selection))
 return out
def native(s,q):return [e for e in q['native'](qspec(s))if e['role']not in ['next-field','return-field']]+[dict(role=role,type='mousedown',trusted=True)for role in (['initialReveal']if s['family']=='spoiler'else[])+['conceal','reveal']]
def corpus(d,candidate,q):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass']is True and d['serverErrors']==[]and d['filter']==''and d['group']=='disclosure-fields'
 assert [(r['source'],r['trustedPolicy'])for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha']for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/disclosure-fields.mjs','tests/browser/disclosure-fields-fixture.js'];b=q['blobs']([s['sha']+':'+p for s in d['sources']for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip()and len(s['loaded'])>95
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]])and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..'not in Path(p).parts and not Path(p).is_absolute()and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes());result={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy']and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[]and[c['spec']for c in r['cases']]==specs(q)
  for e in r['environmentRequests']:assert e['blocked']is True and e['type']=='script'and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  differences=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id']and c['error']is None and c['planned']==c['completedPhases'];count+=len(c['observations'])
   for o in c['observations']:
    assert o['status']==('PASS'if same(o['actual'],o['expected'])else'FAIL')
    if o['status']=='FAIL':differences.append([c['id'],o['phase'],o['property']])
   if r['source']in['parent','candidate']:
    wanted=observations(c['spec'],q);assert c['unsupported']==c['diagnostics']==[]and c['planned']==list(dict.fromkeys(p for p,k,v in wanted))and len(c['observations'])==len(wanted)
    for o,(p,k,v)in zip(c['observations'],wanted):
     if k=='savedCaller':
      stamp=o['actual'].get('time');assert type(stamp)==int and int(datetime.fromisoformat(d['startedAt'].replace('Z','+00:00')).timestamp()*1000)<=stamp<=int(datetime.fromisoformat(d['finishedAt'].replace('Z','+00:00')).timestamp()*1000);v=dict(v,time=stamp)
     assert(o['phase'],o['property'])==(p,k)and same(o['actual'],v)and same(o['expected'],v),(c['id'],p,k,o,v)
    assert c['nativeEvents']==native(c['spec'],q)and c['transactions']==q['events'](qspec(c['spec']))
   elif r['source']=='v1':assert len(c['unsupported'])==1 and c['unsupported'][0]['property']=='currentObservers'
   else:assert c['unsupported']==[]
  if r['source']in['parent','candidate']:assert differences==[]
  result[r['source']+('/trusted'if r['trustedPolicy']else'/compatible')]=dict(cases=len(specs(q)),observations=count,differences=differences)
 return result,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();q,b=oracle();raw=a.raw.read_bytes();result,modules=corpus(json.loads(raw),a.candidate,q)
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',PARENT,a.candidate,'--',*runtime])==b''
 current=[r for k,r in result.items()if k.startswith('candidate/')];report=dict(status='PASS',candidate=a.candidate,parent=PARENT,productionBasis=RUNTIME,productionChanged=False,inheritedVerificationSource=PARENT,currentCases=sum(r['cases']for r in current),currentObservations=sum(r['observations']for r in current),moduleIdentities=modules,results=result,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),fieldOracleSource=ORACLE,fieldOracleSha256=sha(b),scope='Immutable literal field oracle maps expected type/field names only. Real Toggle/Spoiler factories/classes execute. Native reader conceal/reveal preserves rich data and history, including default-closed Spoiler. No production parser or fixture arithmetic is imported.')
 a.output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items()if k!='results'}))
if __name__=='__main__':main()
