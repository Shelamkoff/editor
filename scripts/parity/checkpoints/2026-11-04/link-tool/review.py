"""Independent literal Link action model; no browser observation defines current expectations."""
import argparse,copy,hashlib,json,re,subprocess,math,sys
from pathlib import Path
from html.parser import HTMLParser
from html.parser import HTMLParser
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RUNTIME='4727534d3df182ba0fe0ae37580d1641083c35f4'
def sha(b):return hashlib.sha256(b).hexdigest()
def js(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def unit(t,marks=(),kind='text',bg=None,color=None,size=None):return dict(kind=kind,text=t,marks=sorted(marks),bg=bg,color=color,size=size)
def text(t,**kw):return[unit(c,**kw) for c in t]
def mark(href,target='_blank'):return'a:'+js([['href',href],['rel','noopener noreferrer'],['target',target]])
URL='https://chosen.example/path?q=proof#part';LINK=mark(URL);KEPT=mark('/kept','articlePreview')
WIDGET_MARKUP='<span class="oe-ip__dot" style="background-color: rgb(171, 205, 239);"></span><span class="oe-ip__label">#aBcDef</span>'
WIDGET=dict(id='swatch',type='color',value='#aBcDef',label='#aBcDef',dot='rgb(171, 205, 239)',editable='false')
def compact(fields):
 result=[]
 for units in fields:
  out=[]
  for u in units:
   if out and u['kind']==out[-1]['kind']=='text' and same(dict(u,text=''),dict(out[-1],text='')):out[-1]['text']+=u['text']
   else:out.append(copy.deepcopy(u))
  result.append(out)
 return result
def specs():
 result=[dict(id='/'.join([a,s,b,'backward' if back else 'forward']),action=a,shape=s,boundary=b,backward=back) for a in ['apply','enter','unlink','mixed','nested'] for s in (['single'] if a=='nested' else ['single','cross','fields']) for b in ['Text','Element'] for back in [False,True]]
 result += [dict(id='/'.join(['cancel',c,'backward' if back else 'forward']),action='cancel',cancel=c,shape='single',boundary='Text',backward=back) for c in ['back','escape','outside'] for back in [False,True]]
 result += [dict(id='/'.join(['empty',a,'backward' if back else 'forward']),action=a,empty=True,shape='single',boundary='Text',backward=back) for a in ['apply','enter'] for back in [False,True]]
 result += [dict(id='/'.join(['relink','single',b,'backward' if back else 'forward']),action='relink',shape='single',boundary=b,backward=back) for b in ['Text','Element'] for back in [False,True]]
 result += [dict(id='/'.join(['atomic',a,'backward' if back else 'forward']),action='apply' if a=='plain' else 'unlink',atomic=a,shape='single',boundary='Element',backward=back) for a in ['plain','linked'] for back in [False,True]]
 return result+[dict(id='lifetime/'+l,lifetime=l) for l in ['mode','render','destroy']]
def sidecar(old=False):return dict(swatch=dict(type='color',**({} if old else dict(dataVersion=1)),data=dict(value='#aBcDef')))
def initial(s):
 a=s['action'];linked=a in ['unlink','mixed','nested','relink'];both=a in ['unlink','relink']
 lead=text('un')+text('Alpha',marks=['b']+(['i'] if a=='nested' else [])+([mark('/old-alpha','_self')] if linked else []))+text(' ')+text('Beta & γ',marks=['i'],bg='#0000ff',color='#800000',size='24px')+[unit('\n',kind='break'),unit('{{swatch}}',kind='widget')]
 tail=text('Bravo',marks=['b']+([mark('/old-bravo','articlePreview')] if both else []))+text(' rest ')+text('Kept',marks=[KEPT])+text(' end')
 return [lead+text(' ')+tail] if s['shape']=='single' else [lead,tail]
def htmls(s):
 a=s['action'];alpha='<b>'+('<i>Alpha</i>' if a=='nested' else 'Alpha')+'</b>'
 if a in ['unlink','mixed','nested','relink']:alpha='<a href="/old-alpha" rel="noopener noreferrer" target="_self">'+alpha+'</a>'
 atom='<a href="/old-atom" rel="noopener noreferrer" target="_self">{{swatch}}</a>' if s.get('atomic')=='linked' else '{{swatch}}'
 lead='un'+alpha+' <span style="font-size:24px;color:#800000;background-color:#0000ff"><i>Beta &amp; γ</i></span><br>'+atom
 bravo='<b>Bravo</b>'
 if a in ['unlink','relink']:bravo='<a href="/old-bravo" rel="noopener noreferrer" target="articlePreview">'+bravo+'</a>'
 tail=bravo+' rest <a href="/kept" rel="noopener noreferrer" target="articlePreview">Kept</a> end'
 return[lead+' '+tail] if s['shape']=='single' else[lead,tail]
LIFE_HTML='<b><i>Alpha</i></b> <span style="font-size:24px;color:#800000;background-color:#0000ff">Beta</span><br>{{swatch}} tail'
LIFE_BEFORE=text('Alpha',marks=['b','i'])+text(' ')+text('Beta',bg='#0000ff',color='#800000',size='24px')+[unit('\n',kind='break'),unit('{{swatch}}',kind='widget')]+text(' tail')
def caller(s,old=False):
 life=bool(s.get('lifetime'));hs=[LIFE_HTML] if life else htmls(s);fields=s.get('shape')=='fields'
 blocks=[dict(id='a',type='quote',**({} if old else dict(dataVersion=1)),data=dict(text=hs[0],caption=hs[1]),inline=sidecar(old))] if fields else[dict(id='same-id' if life else 'b' if i else 'a',type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text=h),**({} if i else dict(inline=sidecar(old)))) for i,h in enumerate(hs)]
 return dict(version='1.0.5' if old else '2.0.0',blocks=blocks)
def canonical(value,units,s):
 fields=s.get('shape')=='fields';assert len(value)==(1 if fields else len(units))
 for i,b in enumerate(value):
  assert set(b)=={'id','type','dataVersion','data'}|({'inline'} if not i else set())
  assert b['id']==('same-id' if s.get('lifetime') else 'b' if i else 'a') and b['type']==('quote' if fields else 'paragraph') and b['dataVersion']==(1 if fields else 2)
  if not i:assert same(b['inline'],sidecar())
  assert set(b['data'])==({'text','caption'} if fields else {'text'})
  for k,u in ([('text',units[0]),('caption',units[1])] if fields else [('text',units[i])]):assert same(Wire(b['data'][k]).units,u),(s['id'],k,b['data'][k])
def model(s):
 wanted={};canons={}
 def put(phase,**kw):wanted.update({(phase,k):v for k,v in kw.items()})
 def canon(phase,k,u):canons[phase,k]=u
 life=s.get('lifetime')
 def view(p,u,href=None):
  put(p,meaning=compact(u),visible=compact(u),sidecars=[sidecar()]+([] if s.get('shape')=='fields' else [None for _ in u[1:]]))
  if life:put(p,widget=dict(WIDGET,href=None))
  else:put(p,widgets=[[WIDGET]]+[[] for _ in u[1:]],widgetLinks=[[href]]+[[] for _ in u[1:]])
 if life:
  before=[copy.deepcopy(LIFE_BEFORE)+text(' updated' if life=='render' else '')];after=copy.deepcopy(before)
  for u in after[0][:5]:u['marks']=sorted(u['marks']+[LINK])
  prior=[dict(action='commit',origin='external',name='document.render')] if life=='render' else [];flags=[bool(prior),False]
  view('load',[LIFE_BEFORE]);put('load',history=[False,False],draftHistory=[False,False]);view('inactive',before);canon('inactive','retiredCanonical',before)
  prefix='<b><i>Alpha</i></b> <span style="background-color: rgb(0, 0, 255); color: rgb(128, 0, 0); font-size: 24px;">Beta</span><br>'
  widget='<span contenteditable="false" class="oe-ip oe-ip--color" data-value="#aBcDef" aria-label="#aBcDef" tabindex="0" data-inline-plugin="color" data-id="swatch">'+WIDGET_MARKUP+'</span>'
  put('inactive',retiredHistory=flags,retiredAuthorDom=prefix+(widget if life=='mode' else '')+' tail',successorPanel=True,successorUrl=URL,retiredUrl='https://retired.example/obsolete',retiredProducer=0,retiredEvents=prior,successorProducer=0,successorEvents=prior,noPriorProducer=0)
  if life=='mode':put('inactive',readOnly='false')
  view('live',after);put('live',history=[True,False],panelClosed=True,selection=dict(anchor=5,focus=0,collapsed=False),liveProducer=1,liveEvents=[dict(action='commit',origin='user',name='inline.link')])
  for p,u,f in [('undo',before,[bool(prior),True]),('redo',after,[True,False])]:canon(p,'canonical',u);view(p,u);put(p,history=f)
  put('redo',caller=caller(s),successorCaller=caller(s),diagnostics=[])
  if life=='destroy':put('redo',repeatedOldDestroy=True)
  put('dispose',rootRemoved=True);events=prior+[dict(action=a,origin='user' if a=='commit' else 'history',name='inline.link') for a in ['commit','undo','redo']]
  return wanted,canons,events,['load','inactive','live','undo','redo','dispose']
 before=initial(s);typed=copy.deepcopy(before);typed[-1]+=text('X');idle=bool(s.get('cancel') or s.get('empty') or s.get('atomic')=='plain');relink=s['action']=='relink';unlink=s['action'] in ['unlink','mixed','nested','relink']
 atom=next(i for i,u in enumerate(before[0]) if u['kind']=='widget');start=atom if s.get('atomic') else 4 if s['boundary']=='Text' else 2;end=atom+1 if s.get('atomic') else (len(before[0])-len(text('Bravo rest Kept end')) if s['shape']=='single' else 0)+(3 if s['boundary']=='Text' else 5)
 # The single-field Bravo starts after 18 lead units and one separating space.
 if not s.get('atomic') and s['shape']=='single':end=19+(3 if s['boundary']=='Text' else 5)
 first=dict(field=0,offset=start);last=dict(field=len(before)-1,offset=end);sel=dict(anchor=last if s['backward'] else first,focus=first if s['backward'] else last,collapsed=False)
 after=copy.deepcopy(before if idle else typed)
 if not idle and s.get('atomic')!='linked':
  for f,units in enumerate(after):
   for i,u in enumerate(units):
    if unlink:u['marks']=[m for m in u['marks'] if not(m.startswith('a:') and '/old-' in m)]
    elif u['kind']=='text' and (f>0 or i>=start) and (f<len(after)-1 or i<end):u['marks']=sorted(u['marks']+[LINK])
 oldHref='/old-atom' if s.get('atomic')=='linked' else None
 view('load',before,oldHref);put('load',history=[False,False]);view('input',typed,oldHref);put('input',history=[True,False])
 if idle:canon('prepare-redo','canonical',before);view('prepare-redo',before);put('prepare-redo',history=[False,True])
 put('selection',selection=sel,history=[False,True] if idle else [True,False]);put('action',panelOpened=not unlink)
 if not unlink:
  canon('action','draftCanonical',before if idle else typed);put('action',draftHistory=[False,True] if idle else [True,False],auxiliaryFocus=True)
  if s.get('cancel')=='outside':put('action',outsideFocus=True,historyRefocused=True)
  if s.get('empty'):put('action',emptyPanelStayed=True,emptyHistory=[False,True]);canon('action','emptyCanonical',before)
 view('action',after);put('action',history=[False,True] if idle else [True,False],panelClosed=True,widgetIdentity=True,widgetAttributes=sorted([['class','oe-ip oe-ip--color'],['contenteditable','false'],['data-id','swatch'],['data-inline-plugin','color'],['data-value','#aBcDef'],['aria-label','#aBcDef'],['tabindex','0']]),widgetMarkup=WIDGET_MARKUP,producerCalls=0 if idle and s.get('atomic')!='plain' else 1,actions=['commit','undo'] if idle else ['commit','commit'])
 if s.get('cancel')!='outside':put('action',selection=sel)
 linked=copy.deepcopy(after)
 if relink:
  for f,units in enumerate(linked):
   for i,u in enumerate(units):
    if u['kind']=='text' and (f>0 or i>=start) and (f<len(linked)-1 or i<end):u['marks']=sorted(u['marks']+[LINK])
  put('relink',panelOpened=True,draftHistory=[True,False],auxiliaryFocus=True,selection=sel,history=[True,False],panelClosed=True,widgetMarkup=WIDGET_MARKUP,producerCalls=2,actions=['commit']*3);canon('relink','draftCanonical',after);view('relink',linked)
 replay=[('redo-input',typed,[True,False]),('undo-input',before,[False,True])] if idle else ([('undo-relink',after,[True,True])] if relink else [])+[('undo-action',typed,[True,True]),('undo-input',before,[False,True]),('redo-input',typed,[True,True]),('redo-action',after,[True,relink])]+([('redo-relink',linked,[True,False])] if relink else [])
 actions=['commit','undo','redo','undo'] if idle else ['commit']*(3 if relink else 2)+['undo']*(3 if relink else 2)+['redo']*(3 if relink else 2)
 for p,u,f in replay:canon(p,'canonical',u);view(p,u,oldHref if p in ['undo-action','undo-input','redo-input'] else None);put(p,history=f)
 put(replay[-1][0],actions=actions,caller=caller(s),diagnostics=[]);put('dispose',rootRemoved=True)
 names=['native-input']+(['inline.link']*(2 if relink else 1) if not idle else [])
 if idle:events=[dict(action='commit',origin='native-input',name='native-input')]+[dict(action=a,origin='history',name='native-input') for a in ['undo','redo','undo']]
 else:events=[dict(action='commit',origin='native-input' if n=='native-input' else 'user',name=n) for n in names]+[dict(action=a,origin='history',name=n) for a,ns in [('undo',names[::-1]),('redo',names)] for n in ns]
 phases=['load','input']+(['prepare-redo'] if idle else [])+['selection','action']+(['relink'] if relink else [])+[p for p,_,_ in replay]+['dispose']
 return wanted,canons,events,phases

def native(s):
 ev=[];points=[]
 def click(role):points.append(role);ev.append(dict(role=role,type='click',trusted=True))
 def typing(role):ev.append(dict(role=role,type='input',trusted=True,inputType='insertText'))
 def key(role,k):ev.append(dict(role=role,type='keydown',trusted=True,key=k))
 def history(redo=False):ev.append(dict(role='history',type='keydown',trusted=True,key='z',modifiers=10 if redo else 2))
 if s.get('lifetime'):
  for prefix in ['old','fresh']:click(prefix+'-tool');click(prefix+'-url');typing(prefix+'-url')
  click('retired-apply');click('fresh-apply');history();history(True);return ev,points
 idle=bool(s.get('cancel') or s.get('empty') or s.get('atomic')=='plain');unlink=s['action'] in ['unlink','mixed','nested','relink'];typing('author')
 if idle:history()
 click('tool')
 if not unlink:
  click('url')
  if not s.get('empty'):typing('url')
  cancel=s.get('cancel')
  if cancel=='back':click('cancel')
  elif cancel=='escape':key('cancel','Escape')
  elif cancel=='outside':click('outside');click('resume-editor')
  else:
   if s['action']=='enter':key('apply','Enter')
   else:click('apply')
   if s.get('empty'):key('close-empty','Escape')
 if s['action']=='relink':click('relink-tool');click('relink-url');typing('relink-url');click('relink-apply')
 for redo in ([True,False] if idle else [False,False,False,True,True,True] if s['action']=='relink' else [False,False,True,True]):history(redo)
 return ev,points
def verify_case(c):
 s=c['spec'];wanted,canons,events,phases=model(s);assert c['id']==s['id'] and c['error'] is None and c['planned']==c['completedPhases']==phases and c['diagnostics']==c['unsupported']==[]
 observed={(o['phase'],o['property']):o for o in c['observations']};assert len(observed)==len(c['observations']) and set(observed)==set(wanted)|set(canons),(s['id'],'schema',set(observed)^(set(wanted)|set(canons)))
 for key,v in wanted.items():
  o=observed[key];assert same(o['expected'],v) and same(o['actual'],v) and o['status']=='PASS',(s['id'],key,o,v)
 for key,u in canons.items():
  o=observed[key];canonical(o['actual'],u,s);canonical(o['expected'],u,s);assert same(o['actual'],o['expected']) and o['status']=='PASS'
 assert c['transactions']==events,(s['id'],'transactions',c['transactions'],events)
 ev,points=native(s);assert c['nativeEvents']==ev,(s['id'],'nativeEvents',c['nativeEvents'],ev);assert [p['role'] for p in c['pointTrace']]==points
 for p in c['pointTrace']:assert p['connected'] is p['hit'] is True and all(isinstance(p[k],(int,float)) and math.isfinite(p[k]) for k in ['x','y','width','height']) and p['width']>0 and p['height']>0
 return len(observed)

def csscolor(value):
 value=value.strip().lower()
 if re.fullmatch(r'#[0-9a-f]{3}',value):return '#'+''.join(c*2 for c in value[1:])
 m=re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)',value)
 if m:return '#'+''.join(f'{int(c):02x}' for c in m.groups()[:3])+('@'+str(float(m[4])).rstrip('0').rstrip('.') if m[4] and float(m[4])!=1 else '')
 return value
def fontsize(value):
 return 'calc(10px + 1em)' if re.fullmatch(r'calc\(\s*(?:10px\s*\+\s*1em|1em\s*\+\s*10px)\s*\)',value.strip(),re.I) else value.strip()
class Wire(HTMLParser):
 def __init__(self,html):
  super().__init__(convert_charrefs=True);self.stack=[(None,unit(''))];self.units=[];self.feed(html);assert len(self.stack)==1
 def handle_starttag(self,tag,pairs):
  if tag=='br':self.units.append(unit('\n',kind='break'));return
  attrs=dict(pairs);s=copy.deepcopy(self.stack[-1][1]);styles={}
  for raw in attrs.pop('style','').split(';'):
   if raw.strip():name,value=raw.split(':',1);styles[name.strip()]=value.strip()
  for name,key in [('background-color','bg'),('color','color'),('font-size','size')]:
   if name in styles:s[key]=csscolor(styles.pop(name)) if key!='size' else fontsize(styles.pop(name))
  if styles:s['marks'].append('css:'+js(sorted(styles.items())))
  if tag!='span' or attrs:s['marks'].append({'strong':'b','em':'i','strike':'s','del':'s'}.get(tag,tag)+(':'+js(sorted(attrs.items())) if attrs else ''))
  s['marks']=sorted(set(s['marks']));self.stack.append((tag,s))
 def handle_endtag(self,tag):
  assert self.stack[-1][0]==tag;self.stack.pop()
 def handle_data(self,value):
  for part in re.split(r'(\{\{swatch\}\})',value):
   if part=='{{swatch}}':self.units.append(unit(part,kind='widget'))
   else:
    for c in part:self.units.append(dict(self.stack[-1][1],text=c))


def historical_graph(c):
 def normalize(v):
  if isinstance(v,dict):return{k:0 if k=='timestamp' else normalize(x) for k,x in v.items() if k!='pointTrace'}
  if isinstance(v,list):return[normalize(x) for x in v]
  return v
 g=normalize(c);g['error']=c['error'].split('\n')[0] if c['error'] else None
 return sha(json.dumps(g,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();raw=a.raw.read_bytes();d=json.loads(raw)
 helper_path='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';hb=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+helper_path]);assert Path(helper_path).read_bytes().replace(b'\r\n',b'\n')==hb;helper={'__name__':'accepted_identity_helper'};exec(compile(hb,'accepted-identity-helper','exec'),helper)
 assert d['headBefore']==d['headAfter']==a.candidate and d['group']=='link-tool' and d['filter']=='' and d['serverErrors']==[] and d['candidatePass'] is True and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 assert [(s['label'],s['sha']) for s in d['sources']]==[('v1',V1),('spec-baseline',BASELINE),('candidate',a.candidate)]
 root='scripts/parity/checkpoints/2026-11-04/link-tool/';own=['scripts/parity/link-tool.mjs','tests/browser/link-tool-fixture.js',root+'review.py',root+'controls.mjs',root+'historical-goldens.json'];queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[a.candidate+':'+path for path in own];blobs=helper['git_blobs'](queries)
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>80
  for path,h in s['loaded'].items():assert sha(blobs[s['sha']+':'+path])==h
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 assert d['runnerSha256']==sha(blobs[a.candidate+':'+own[0]]) and d['fixtureSha256']==sha(blobs[a.candidate+':'+own[1]]) and d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==v
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('candidate',False),('candidate',True)]
 golden=json.loads(blobs[a.candidate+':'+root+'historical-goldens.json']);assert golden['basisCandidate']=='e005a7595dc45e59c5d449b3a1ea00943a15eb75'
 summaries={}
 for r in d['results']:
  assert r['policyEnforced'] is r['trustedPolicy'] and r['inputErrors']==r['unavailable']==r['mediaRequests']==r['externalRequests']==[] and [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:assert set(e)=={'url','type','blocked'} and e['url'].startswith('https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js') and e['type']=='script' and e['blocked'] is True
  failures=[dict(id=c['id'],phase=o['phase'],property=o['property']) for c in r['cases'] for o in c['observations'] if o['status']=='FAIL'];incomplete=[dict(id=c['id'],completedPhases=c['completedPhases'],error=c['error'].split('\n')[0]) for c in r['cases'] if c['error']]
  if r['source']=='candidate':
   assert r['pageErrors']==[] and sum(verify_case(c) for c in r['cases'])==4494
  else:
   assert [re.sub(r'http://127\.0\.0\.1:\d+/','http://127.0.0.1:PORT/',e) for e in r['pageErrors']]==golden['pageErrors'][r['source']]
   for c in r['cases']:
    assert historical_graph(c)==golden['sources'][r['source']][c['id']],(r['source'],c['id'],'historical graph changed')
    for o in c['observations']:assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    for e in c['nativeEvents']:assert e['trusted'] is True
    for point in c['pointTrace']:assert point['connected'] is point['hit'] is True and point['width']>0 and point['height']>0
   assert len(failures)==(49 if r['source']=='v1' else 214) and len(incomplete)==(5 if r['source']=='v1' else 14)
  summaries[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=len(r['cases']),observations=sum(len(c['observations']) for c in r['cases']),differences=failures,incomplete=incomplete,pageErrors=r['pageErrors'])
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',RUNTIME,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,runtimeBasis=RUNTIME,currentCases=146,currentObservations=8988,casesPerPolicy=73,observationsPerPolicy=4494,moduleIdentities=sum(len(s['loaded']) for s in d['sources']),results=summaries,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(hb),scope='Current observations are checked by independent literal unit, canonical shape, sidecar, selection, native delivery, history and retired authority models. Historical graphs retain every difference and incomplete real action, with normalized diagnostic timestamps and server ports only. Missing legacy observer ports are not simulated. Runtime bytes equal the preceding accepted async/package checkpoint; this checkpoint changes tests and evidence only.')
 a.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if __name__=='__main__':main()
