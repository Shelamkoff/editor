"""Independent literal translation/context/menu/replay oracle."""
import argparse,copy,hashlib,json,math,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.dont_write_bytecode=True
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def sha(b):return hashlib.sha256(b).hexdigest()
def specs():return[dict(id='literal-key/public-runtime-contexts')]+[dict(id='menus/'+l,locale=l) for l in ['default','en','ru','ru-RU','literal']]
def blocks():return[dict(id='a',type='paragraph',dataVersion=2,data=dict(text='Alpha {{swatch}} tail'),inline=dict(swatch=dict(type='color',dataVersion=1,data=dict(value='#aBcDef')))),dict(id='empty',type='paragraph',dataVersion=2,data=dict(text=''))]
def expected(c,defective=False):
 s=c['spec'];rows=[]
 def put(phase,**kw):rows.extend((phase,k,v) for k,v in kw.items())
 if not s.get('locale'):
  for namespace in ['plugin.paragraph','inlinePlugin.color']:
   for key,value in [('echo',namespace+'.echo'),('missing','Fallback'),('empty',''),('params','Hello A $& {next}; B'),('forms','Other 21')]:rows.append(('create',namespace+'/'+key,value))
  put('create',history=[False,False],diagnostics=[]);put('dispose',rootRemoved=True);return rows,{},['create','dispose']
 initial=blocks();named=next(o for o in c['observations'] if (o['phase'],o['property'])==('redo-toolbox','canonical'))['actual'];assert len(named)==3 and re.fullmatch('quote-[A-Za-z0-9]{6}',named[1]['id']);newid=named[1]['id'];assert newid not in ['a','empty']
 inserted=[copy.deepcopy(initial[0]),dict(id=newid,type='quote',dataVersion=1,data=dict(text='',caption='')),copy.deepcopy(initial[1])];slash=copy.deepcopy(inserted);slash[2]['data']['text']='/';after=copy.deepcopy(inserted);after[2].update(type='quote',dataVersion=1,data=dict(text='',caption=''))
 literal=s['locale']=='literal';russian=s['locale'] in ['ru','ru-RU'];names=['plugin.paragraph.title','plugin.quote.title','inlinePlugin.color.title'] if literal else ['Текст','Цитата','Цвет'] if russian else ['Text','Quote','Color']
 put('load',addLabel='toolbar.add' if literal else 'Добавить блок' if russian else 'Add block',tuneLabel='toolbar.tune' if literal else 'Настройки блока' if russian else 'Block settings',canonical=initial,history=[False,False])
 put('inline',typeName=names[0],labels=names[:2],canonical=initial,history=[False,False]);put('toolbox',labels=names,canonical=initial,history=[False,False]);put('toolbox-action',insertedType='quote',insertedData=dict(text='',caption=''),others=initial,history=[True,False])
 put('undo-toolbox',canonical=initial,history=[False,True]);put('redo-toolbox',canonical=inserted,history=[True,False]);put('slash',labels=names,slashText='/',history=[True,False]);put('slash-action',finalTypes=['paragraph','quote','quote'],finalData=[b['data'] for b in after],history=[True,False]);put('undo-slash',canonical=slash,history=[True,True]);put('redo-slash',canonical=after,history=[True,False],caller=dict(version='2.0.0',blocks=initial),diagnostics=[]);put('dispose',rootRemoved=True)
 overrides={('load','addLabel'):'Add block',('load','tuneLabel'):'Block settings',('inline','typeName'):'Text',('inline','labels'):['Text','Quote'],('toolbox','labels'):['Text','Quote','Color'],('slash','labels'):['Text','Quote','Color']} if literal and defective else {}
 return rows,overrides,['load','inline','toolbox','toolbox-action','undo-toolbox','redo-toolbox','slash','slash-action','undo-slash','redo-slash','dispose']
def verify_case(c,defective=False):
 s=c['spec'];assert c['id']==s['id'] and c['error'] is None and c['unsupported']==[];wanted,overrides,phases=expected(c,defective);assert c['planned']==c['completedPhases']==phases and len(c['observations'])==len(wanted)
 if not s.get('locale') and defective:overrides={('create',n+'/echo'):'Fallback' for n in ['plugin.paragraph','inlinePlugin.color']}
 failures=[]
 for o,(p,k,value) in zip(c['observations'],wanted):
  assert (o['phase'],o['property'])==(p,k) and same(o['expected'],value),(s['id'],p,k,o,value)
  actual=overrides.get((p,k),value);status='PASS' if same(actual,value) else 'FAIL';assert same(o['actual'],actual) and o['status']==status,(s['id'],p,k,o,actual)
  if status=='FAIL':failures.append(dict(id=s['id'],phase=p,property=k))
 if not s.get('locale'):return failures
 assert c['diagnostics']==[]
 tx=[dict(action=a,origin=origin,name=name) for a,origin,name in [('commit','user','toolbox.block'),('undo','history','toolbox.block'),('redo','history','toolbox.block'),('commit','native-input','native-input'),('commit','user','slash.block'),('undo','history','slash.block'),('redo','history','slash.block')]];assert c['transactions']==tx
 points=['type-menu','focus-toolbox','open-toolbox','choose-toolbox-quote'];events=[dict(role=r,type='mousedown',trusted=True) for r in points]
 history=[dict(role='history',type='keydown',trusted=True,key='z',modifiers=m) for m in [2,10]]
 events+=history+[dict(role='slash-input',type='input',trusted=True,inputType='insertText')]+[dict(role=r,type='keydown',trusted=True,key=k) for r,k in [('slash-next','ArrowDown'),('slash-choose','Enter')]]+history
 assert c['nativeEvents']==events,(s['id'],'native delivery',c['nativeEvents'],events);assert [p['role'] for p in c['pointTrace']]==points
 for p in c['pointTrace']:assert set(p)=={'role','connected','hit','x','y','width','height'} and p['connected'] is p['hit'] is True and all(isinstance(p[k],(int,float)) and math.isfinite(p[k]) for k in ['x','y','width','height']) and p['width']>0 and p['height']>0
 return failures

BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';PARENT='23f010c45a1fb1f4d34ce086e035aed0e9683ae0';RED='f081857448c7813696c46c563cf4321864d68e9c';FIX='5a5030eccd92d72dc04365dc7f828ed0a9732443'
def validate_identity(d,source,helper,working=False):
 assert d['headBefore']==d['headAfter']==source and d['group']=='i18n-contexts' and d['filter']=='' and d['serverErrors']==[] and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('spec-baseline',BASELINE),('parent',PARENT),('candidate',source)]
 own=['scripts/parity/i18n-contexts.mjs','tests/browser/i18n-contexts-fixture.js'];queries=[s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[source+':'+p for p in own];blobs=helper['git_blobs'](queries)
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
 modules=validate_identity(d,source,helper,not red);assert d['candidatePass'] is (not red) and [(r['source'],r['trustedPolicy']) for r in d['results']]==[('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 summaries={}
 for r in d['results']:
  assert r['policyEnforced'] is r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['unavailable']==r['mediaRequests']==r['externalRequests']==[] and [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:
   u=urlsplit(e['url']);assert set(e)=={'url','type','blocked'} and e['type']=='script' and e['blocked'] is True and u.scheme=='http' and u.hostname=='gc.kis.v2.scr.kaspersky-labs.com' and u.path=='/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js' and u.username is None and u.password is None
   q=parse_qs(u.query,keep_blank_values=True);assert set(q)=={'attr'} and len(q['attr'])==1 and 0<len(q['attr'][0])<1024
  defective=red or r['source']!='candidate';diff=[f for c in r['cases'] for f in verify_case(c,defective)];assert len(diff)==(8 if defective else 0)
  if not red:
   for c in r['cases']:assert c['diagnostics']==[]
  count=sum(len(c['observations']) for c in r['cases']);assert count==173
  summaries[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=6,observations=count,differences=diff,blockedEnvironmentRequests=len(r['environmentRequests']))
 return summaries,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 hp='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';hb=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+hp]);assert Path(hp).read_bytes().replace(b'\r\n',b'\n')==hb;helper={'__name__':'accepted_identity_helper'};exec(compile(hb,'accepted-identity-helper','exec'),helper)
 raw=a.raw.read_bytes();results,modules=corpus(json.loads(raw),a.candidate,helper);redraw=a.red.read_bytes();redresults,redmodules=corpus(json.loads(redraw),RED,helper,True)
 own=['scripts/parity/checkpoints/2026-11-04/i18n-contexts/review.py','scripts/parity/checkpoints/2026-11-04/i18n-contexts/controls.mjs'];blobs=helper['git_blobs']([a.candidate+':'+p for p in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];changed=['core/BlockToolbar.js','core/InlineToolbar.js','core/SlashCommandController.js','core/createEditorRuntime.js']
 assert subprocess.check_output(['git','diff','--name-only',PARENT,RED,'--',*runtime])==b'' and subprocess.check_output(['git','diff','--name-only',RED,FIX,'--',*runtime]).decode().splitlines()==changed and subprocess.check_output(['git','diff','--name-only',FIX,a.candidate,'--',*runtime])==b''
 before=helper['git_blobs']([RED+':tests/browser/i18n-contexts-fixture.js'])[RED+':tests/browser/i18n-contexts-fixture.js'];after=Path('tests/browser/i18n-contexts-fixture.js').read_bytes().replace(b'\r\n',b'\n');assert before.replace(b'completedPhases,unsupported:[],error}',b'completedPhases,diagnostics,unsupported:[],error}')==after
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=FIX,parent=PARENT,red=RED,currentCases=12,currentObservations=346,casesPerPolicy=6,observationsPerPolicy=173,moduleIdentities=modules,results=results,redResults=redresults,redModuleIdentities=redmodules,rawSha256=sha(raw),redRawSha256=sha(redraw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(hb),scope='Public block/inline translation contexts, explicit key-equal and empty translations, missing fallback, literal interpolation and plural-object other form. Default/bundled/regional/custom labels retain actual native toolbox and slash action IDs and exact history. The immutable pre-fix parent executes the identical final fixture. Original RED differs only by returning its already observed diagnostic array. The absent legacy v1 definition/runtime context contract is not emulated. Existing plural/interpolation/catalog unit tests remain explicit controls.')
 a.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['results','redResults']}))
if __name__=='__main__':main()
