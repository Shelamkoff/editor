"""Independent observable Slash contract and immutable source verification."""
import argparse,hashlib,json,subprocess
from pathlib import Path
PARENT='c26e3f594e9903fae4faeacfd97d45f071a02cdb'
RED='e201a77a98c161b571df052a59dc56556d09a447'
FIX='8b84e6d20d377ed1dae2103c967f3e99197cf09b'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def specs():return [dict(id=m,method=m) for m in ['pointer','keyboard','hover-keyboard','repeat','filter','escape','outside','no-results']]+[dict(id='lifetime/'+l,method='pointer',lifetime=l) for l in ['mode','render','destroy']]
def doc(text='',kind='paragraph'):
 return [dict(id='a',type=kind,dataVersion=1 if kind=='quote' else 2,data=dict(text=text,**(dict(caption='') if kind=='quote' else {})))]
def expected(s):
 m=s['method'];l=s.get('lifetime');idle=m=='outside';cancel=m in ['escape','no-results'];q='/qu' if m=='filter' else '/zzz-no-choice' if m=='no-results' else '/';initial=doc();typed=doc(q);before=doc('/q') if l else typed;after=typed if idle else doc('', 'paragraph' if cancel or m=='hover-keyboard' else 'quote');out=[]
 def put(p,**items):out.extend((p,k,v) for k,v in items.items())
 def meaning(d):return [dict(type=b['type'],data=b['data']) for b in d]
 put('load',canonical=initial,history=[False,False]);put('input',meaning=meaning(typed),history=[True,False],visible=True,choices=1 if m=='filter' else 0 if m=='no-results' else 2)
 if l:
  retired=typed if l=='mode' else initial
  put('retire',closed=True,**{'retired-before-freshDelivered':True},canonical=retired,history=[True,False] if l=='render' else [False,False])
  if l=='mode':put('retire',readOnly='false')
  put('fresh',meaning=meaning(before),visible=True,choices=1,history=[True,False],**{'retired-with-freshDelivered':True},retiredCanonical=before,retiredHistory=[True,False],successorVisible=True)
  if l=='destroy':put('fresh',oldDestroyKeptSuccessor=True)
 else:put('move',nodesRetained=True,childReplacements=0,canonical=typed,history=[True,False],visible=True)
 if idle:put('action',outsideDelivered=True,outsideFocus=True)
 elif cancel:
  if m=='no-results':put('action',emptyEnterCanonical=typed,emptyEnterKeptMenu=True,emptyEnterHistory=[True,False])
 elif m not in ['keyboard','hover-keyboard']:put('action',confirmDelivered=True)
 put('action',meaning=meaning(after),canonical=after,closed=True,history=[True,False],actions=['commit']*(3 if l=='mode' else 4 if l=='render' else 2 if l else 1 if idle else 2))
 if idle:put('action',**{'resume-historyDelivered':True})
 replay=[('undo-input',initial,[False,True]),('redo-input',typed,[True,False])] if idle else [('undo-action',before,[True,True]),('redo-action',after,[True,False])] if l else [('undo-action',typed,[True,True]),('undo-input',initial,[False,True]),('redo-input',typed,[True,True]),('redo-action',after,[True,False])]
 for p,d,h in replay:put(p,canonical=d,history=h)
 caller=dict(version='2.0.0',blocks=initial);put(replay[-1][0],caller=caller,originalCaller=caller,diagnostics=[]);put('dispose',rootRemoved=True)
 return out
def events(s):
 m=s['method'];l=s.get('lifetime');idle=m=='outside';name='slash.cancel' if m in ['escape','no-results'] else 'slash.block';out=[]
 def add(action,origin,name):out.append(dict(action=action,origin=origin,name=name))
 add('commit','native-input','native-input')
 if l=='render':add('commit','external','document.render')
 if l:add('commit','native-input','native-input')
 if not idle:add('commit','user',name)
 if idle:add('undo','history','native-input');add('redo','history','native-input')
 elif l:add('undo','history',name);add('redo','history',name)
 else:
  add('undo','history',name);add('undo','history','native-input');add('redo','history','native-input');add('redo','history',name)
 return out
def native(s):
 m=s['method'];l=s.get('lifetime');idle=m=='outside';out=[dict(role='query',type='input',trusted=True,inputType='insertText')]
 def click(role):out.append(dict(role=role,type='mousedown',trusted=True,hit=True))
 def key(role,key,modifiers=0):out.append(dict(role=role,type='keydown',trusted=True,key=key,modifiers=modifiers))
 if l:click('retired-before-fresh');out.append(dict(role='fresh-query',type='input',trusted=True,inputType='insertText'));click('retired-with-fresh')
 elif m in ['keyboard','hover-keyboard']:key('choose-active','ArrowDown' if m=='keyboard' else 'ArrowUp')
 if idle:click('outside');click('resume-history')
 elif m in ['escape','no-results']:
  if m=='no-results':key('empty-enter','Enter')
  key('cancel','Escape')
 elif m in ['keyboard','hover-keyboard']:key('confirm','Enter')
 else:click('confirm')
 for i in range(1 if l or idle else 2):key('undo','z',2)
 for i in range(1 if l or idle else 2):key('redo','z',10)
 return out
def blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());o=0;out={}
 for q in queries:
  e=raw.index(b'\n',o);h=raw[o:e].split();assert len(h)==3 and h[1]==b'blob',q;o=e+1;n=int(h[2]);out[q]=raw[o:o+n];o+=n;assert raw[o:o+1]==b'\n';o+=1
 assert o==len(raw);return out
def corpus(d,candidate,red=False):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is (not red) and d['serverErrors']==[] and d['filter']=='' and d['group']=='slash-menu'
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/slash-menu.mjs','tests/browser/slash-menu-fixture.js'];b=blobs([s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>90
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]]) and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..' not in Path(p).parts and not Path(p).is_absolute() and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 summary={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[]
  assert [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:assert e['blocked'] is True and e['type']=='script' and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  green=r['source']=='candidate' and not red;diff=[];errors=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id']
   for o in c['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':diff.append([c['id'],o['phase'],o['property']])
   if c['error']:errors.append([c['id'],c['error'].split('\n')[0]])
   count+=len(c['observations'])
   if green:
    assert c['error'] is None and c['unsupported']==c['diagnostics']==[] and c['completedPhases']==c['planned']
    wanted=expected(c['spec']);assert c['planned']==list(dict.fromkeys(p for p,k,v in wanted));assert len(c['observations'])==len(wanted),(c['id'],len(c['observations']),len(wanted))
    for o,(p,k,v) in zip(c['observations'],wanted):assert (o['phase'],o['property'])==(p,k) and same(o['expected'],v) and same(o['actual'],v),(c['id'],p,k,o,v)
    assert c['transactions']==events(c['spec']),(c['id'],c['transactions'],events(c['spec']))
    assert c['nativeEvents']==native(c['spec']),(c['id'],c['nativeEvents'],native(c['spec']))
    assert c['pointTrace'] and all(p['connected'] and p['hit'] and p['width']>0 and p['height']>0 for p in c['pointTrace']) if c['spec']['method'] not in ['keyboard','escape','no-results'] else True
  if r['source']=='parent' or red and r['source']=='candidate':assert diff and errors
  summary[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=len(r['cases']),observations=count,differences=diff,incomplete=errors)
 return summary,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();raw=a.raw.read_bytes();red=a.red.read_bytes();summaries,modules=corpus(json.loads(raw),a.candidate);redsummary,redmodules=corpus(json.loads(red),RED,True)
 paths=['scripts/parity/slash-menu.mjs','tests/browser/slash-menu-fixture.js'];b=blobs([s+':'+p for s in [RED,a.candidate] for p in paths])
 for path in paths:assert b[RED+':'+path]==b[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',PARENT,RED,'--',*runtime])==b'';assert subprocess.check_output(['git','diff','--name-only',RED,FIX,'--',*runtime]).decode().splitlines()==['core/SlashCommandController.js'];assert subprocess.check_output(['git','diff','--name-only',FIX,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,productionBasis=FIX,parent=PARENT,red=RED,results=summaries,redResults=redsummary,currentCases=22,currentObservations=sum(x['observations'] for k,x in summaries.items() if k.startswith('candidate/')),moduleIdentities=modules,redModuleIdentities=redmodules,rawSha256=sha(raw),redSha256=sha(red),reviewerSha256=sha(Path(__file__).read_bytes()),limitations=['Legacy transaction and diagnostic subscriptions are absent. Their empty arrays are fixture bookkeeping, not measured legacy event counts.','Historical incomplete traces and DOM replacement counts are retained without treating missing observations as passes.']);a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['results','redResults']}))
if __name__=='__main__':main()
