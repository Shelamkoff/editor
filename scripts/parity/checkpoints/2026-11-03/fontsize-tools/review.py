"""Independent fixed-unit oracle for the common font-size tool workflows."""
import argparse,copy,hashlib,json,re,subprocess
from html.parser import HTMLParser
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def js(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def sha(b):return hashlib.sha256(b).hexdigest()
def unit(text,marks=(),bg=None,color=None,size=None,kind='text'):return dict(kind=kind,text=text,marks=sorted(marks),bg=bg,color=color,size=size)
def text(value,**style):return [unit(c,**style) for c in value]
LINK='a:'+js([['href','/kept'],['rel','noopener noreferrer'],['target','articlePreview']])
LEAD=text('un')+text('Alpha',marks=['b'])+text(' ')+text('Beta',marks=['i'])+[unit('\n',kind='break')]+text('γ ',bg='#0000ff',color='#800000',size='24px')+text('T',marks=[LINK],bg='#0000ff',color='#800000',size='24px')+text('ai',marks=[LINK,'i'],bg='#0000ff',color='#800000',size='24px')+text('l',marks=[LINK],bg='#0000ff',color='#800000',size='24px')+text(' ')+[unit('{{swatch}}',kind='widget')]+text(' tail')
TAIL=text('Bravo',marks=['b'])+text(' rest')
LEAD_HTML='un<b>Alpha</b> <i>Beta</i><br><span style="background-color:#0000ff;color:#800000;font-size:24px">γ <a href="/kept" rel="noopener noreferrer" target="articlePreview">T<i>ai</i>l</a></span> {{swatch}} tail'
TAIL_HTML='<b>Bravo</b> rest'
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
def specs():
 result=[]
 for action in ['apply','enter','reset']:
  for shape in ['single','cross','fields']:
   for boundary in ['Text','Element']:
    for back in [False,True]:result.append(dict(id='/'.join([action,shape,boundary,'backward' if back else 'forward']),action=action,shape=shape,boundary=boundary,backward=back))
 for action in ['apply','reset']:
  for boundary in ['Text','Element']:
   for back in [False,True]:result.append(dict(id='/'.join(['partial',action,boundary,'backward' if back else 'forward']),action=action,shape='single',boundary=boundary,backward=back,partial=True,**(dict(size=32) if action=='apply' else {})))
 for noop in ['plain-reset','atomic-apply','atomic-reset']:
  for back in [False,True]:result.append(dict(id='/'.join(['noop',noop,'backward' if back else 'forward']),action='apply' if noop.endswith('apply') else 'reset',shape='single',boundary='Element',backward=back,noop=noop))
 for action in ['escape','outside']:
  for boundary in ['Text','Element']:
   for back in [False,True]:result.append(dict(id='/'.join(['cancel',action,boundary,'backward' if back else 'forward']),action=action,shape='single',boundary=boundary,backward=back,cancel=True))
 result += [dict(id='lifetime/'+life,lifetime=life) for life in ['read-only','destroy','render']]
 result += [dict(id='preset/'+str(size),action='preset',shape='single',boundary='Text',backward=False,size=size) for size in [12,14,16,18,20,24,28,32,40,48,64]]
 result += [dict(id='custom/'+str(size),action='enter' if size==1 else 'apply',shape='single',boundary='Text',backward=False,size=size) for size in [1,200]]
 result += [dict(id='invalid/'+value,action='enter' if value=='201' else 'apply',shape='single',boundary='Text',backward=False,inputValue=value,invalid=True) for value in ['0','1.5','201']]
 for size in ['16px','16.5px','1.5em','150%','1.5rem','calc(10px + 1em)','201px','250px','inherit','0.75em']:
  for boundary in ['Text','Element']:
   for back in [False,True]:result.append(dict(id='/'.join(['imported',size,boundary,'backward' if back else 'forward']),action='apply',shape='single',boundary=boundary,backward=back,preserveSize=size))
 return result
def sidecar(legacy=False):return dict(swatch=dict(type='color',**({} if legacy else dict(dataVersion=1)),data=dict(value='#aBcDef')))
def canonical(value,units,spec,legacy=False,lifetime=False):
 fields=spec.get('shape')=='fields';assert len(value)==(1 if fields else len(units))
 for index,b in enumerate(value):
  expectedKeys={'id','type','data'}|({'dataVersion'} if not legacy else set())|({'inline'} if not index else set())
  assert set(b)==expectedKeys,(spec,b.keys(),expectedKeys)
  assert b['id']==('same-id' if lifetime else 'b' if index else 'a') and b['type']==('quote' if fields else 'paragraph')
  if not legacy:assert b['dataVersion']==(1 if fields else 2)
  if not index:assert same(b['inline'],sidecar(legacy))
  assert set(b['data'])==({'text','caption'} if fields else {'text'})
  for key,wanted in ([('text',units[0]),('caption',units[1])] if fields else [('text',units[index])]):assert same(Wire(b['data'][key]).units,wanted),(spec,key,b['data'][key],wanted)
def main_expected(spec,legacy=False):
 shape=spec['shape'];before=copy.deepcopy([LEAD+text(' ')+TAIL] if shape=='single' else [LEAD,TAIL])
 if spec.get('preserveSize'):
  for u in before[0][13:19]:u['size']=spec['preserveSize']
 typed=copy.deepcopy(before);typed[-1]+=text('X');idle=bool(spec.get('noop') or spec.get('cancel') or spec.get('invalid'));noop=spec.get('noop','')
 start=27 if spec.get('preserveSize') else 16 if spec.get('partial') else 20 if noop.startswith('atomic') else 0 if noop else 5 if spec['boundary']=='Text' else 2
 end=32 if spec.get('preserveSize') else 18 if spec.get('partial') else 21 if noop.startswith('atomic') else 2 if noop else (27 if shape=='single' else 0)+(3 if spec['boundary']=='Text' else 5)
 first=dict(field=0,offset=start);last=dict(field=len(before)-1,offset=end);selection=dict(anchor=last if spec['backward'] else first,focus=first if spec['backward'] else last,collapsed=False)
 after=copy.deepcopy(before if idle else typed)
 if not idle:
  for field,units in enumerate(after):
   for index,u in enumerate(units):
    if u['kind']=='text' and (field>0 or index>=start) and (field<len(after)-1 or index<end):u['size']=None if spec['action']=='reset' or spec.get('size')==16 else str(spec.get('size',24))+'px'
 ids=[['a','quote']] if shape=='fields' else [['a','paragraph']]+([['b','paragraph']] if shape=='cross' else [])
 widgets=[[dict(id='swatch',type='color',value='#aBcDef',label='#aBcDef',dot='rgb(171, 205, 239)',editable='false')]]+[[] for _ in before[1:]]
 wanted={};canons={}
 def put(phase,**properties):wanted.update({(phase,p):v for p,v in properties.items()})
 def visible(phase,units):put(phase,visibleMeaning=units,widgets=widgets)
 def canon(phase,prop,units):canons[(phase,prop)]=units
 put('load',fixedMeaning=before,idsAndTypes=ids,sidecar=sidecar(legacy),history=[False,False]);visible('load',before)
 put('input',independentEdit=typed,trustedInput=True);visible('input',typed)
 if not legacy:put('input',events=['commit'])
 if idle:canon('prepare-redo','exactCanonical',before);put('prepare-redo',history=[False,True]);visible('prepare-redo',before)
 put('selection',endpoints=selection)
 put('action',trustedPicker=True,trustedAuxiliaryInput=True,auxiliaryFocus=True,beforeApplyHistory=[False,True] if idle else [True,False])
 canon('action','beforeApplyCanonical',before if idle else typed)
 if spec.get('cancel'):
  if spec['action']=='outside':put('action',trustedOutside=True,outsideFocus=True)
  else:put('action',trustedCancel=True)
 else:put('action',trustedAction=True)
 if spec.get('invalid'):
  put('action',invalidKeptOpen=True,invalidBeforeCancelHistory=[False,True],trustedCancel=True);canon('action','invalidBeforeCancelCanonical',before)
 put('action',intendedMeaning=after,widgetIdentity=True,widgetMarkup='<span class="oe-ip__dot" style="background-color: rgb(171, 205, 239);"></span><span class="oe-ip__label">#aBcDef</span>',sidecars=[sidecar(legacy)]+([] if shape!='cross' else [None]),idsAndTypes=ids,history=[False,True] if idle else [True,False],pickerClosed=True)
 attributes=[['class','oe-ip oe-ip--color'],['contenteditable','false'],['data-id','swatch'],['data-inline-plugin','color'],['data-value','#aBcDef']]
 attributes+=([['data-hydrated','1']] if legacy else [['aria-label','#aBcDef'],['tabindex','0']]);put('action',widgetAttributes=sorted(attributes));visible('action',after)
 if not(spec.get('cancel') and spec['action']=='outside'):put('action',selection=selection)
 if idle:canon('action','canonicalNoop',before)
 if not legacy:
  put('action',producerCalls=0 if spec.get('cancel') or spec.get('invalid') or (spec.get('noop') and spec['action']=='reset') else 1,events=['commit','undo'] if idle else ['commit','commit'])
  if not idle:put('action',semanticTransaction=dict(action='commit',origin='user',name='inline.fontSize'))
 replays=[('redo-input',typed,[True,False]),('undo-input',before,[False,True])] if idle else [('undo-action',typed,[True,True]),('undo-input',before,[False,True]),('redo-input',typed,[True,True]),('redo-action',after,[True,False])]
 for phase,units,history in replays:
  canon(phase,'exactCanonical',units);put(phase,meaning=units,history=history);visible(phase,units)
  if phase.endswith('action'):put(phase,selection=selection)
 phase=replays[-1][0];put(phase,trustedHistory=[True]* (3 if idle else 4))
 if not legacy:put(phase,events=['commit','undo','redo','undo'] if idle else ['commit','commit','undo','undo','redo','redo'])
 htmlLead=LEAD_HTML.replace('font-size:24px','font-size:'+spec['preserveSize']) if spec.get('preserveSize') else LEAD_HTML
 html=[htmlLead+' '+TAIL_HTML] if shape=='single' else [htmlLead,TAIL_HTML]
 blocks=[dict(id='a',type='quote',**({} if legacy else dict(dataVersion=1)),data=dict(text=html[0],caption=html[1]),inline=sidecar(legacy))] if shape=='fields' else [dict(id='b' if i else 'a',type='paragraph',**({} if legacy else dict(dataVersion=2)),data=dict(text=h),**({} if i else dict(inline=sidecar(legacy)))) for i,h in enumerate(html)]
 put(phase,inputNotMutated=js(dict(version='1.0.5' if legacy else '2.0.0',blocks=blocks)));put('dispose',rootRemoved=True)
 return wanted,canons
def lifetime_expected(spec,legacy=False):
 life=spec['lifetime'];suffix=' updated' if life=='render' else ''
 before=[text('Alpha',marks=['b'],bg='#0000ff',color='#800000',size='32px')+text(' ')+[unit('{{swatch}}',kind='widget')]+text(' tail'+suffix)]
 after=copy.deepcopy(before)
 for u in after[0][:5]:u['size']='24px'
 prefix='<b><span style="'+('font-size: 32px; background-color: #0000ff; color: #800000;' if legacy else 'background-color: rgb(0, 0, 255); color: rgb(128, 0, 0); font-size: 32px;')+'">Alpha</span></b> '
 widget='<span contenteditable="false" data-inline-plugin="color" data-id="swatch" data-value="#aBcDef" class="oe-ip oe-ip--color" data-hydrated="1"><span class="oe-ip__dot" style="background-color: rgb(171, 205, 239);"></span><span class="oe-ip__label">#aBcDef</span></span>' if legacy else '<span contenteditable="false" class="oe-ip oe-ip--color" data-value="#aBcDef" aria-label="#aBcDef" tabindex="-1" data-inline-plugin="color" data-id="swatch"><span class="oe-ip__dot" style="background-color: rgb(171, 205, 239);"></span><span class="oe-ip__label">#aBcDef</span></span>'
 markup=prefix+(widget if legacy or life=='read-only' else '')+' tail'
 event=dict(action='commit',origin='user',name='inline.fontSize')
 prior=[dict(action='commit',origin='external',name='document.render')] if life=='render' and not legacy else []
 wanted={('load','canonicalText'):'<b><span style="colors">Alpha</span></b> {{swatch}} tail',('load','history'):[False,False],('load','trustedOpen'):True,('load','trustedAuxiliary'):True,
  ('inactive','retiredHistory'):[True,False] if life=='render' and not legacy else [False,False],('inactive','retiredAuthorDom'):markup,
  ('live','trustedOpen'):True,('live','trustedInput'):True,('live','trustedApply'):True,('live','authorText'):'Alpha {{swatch}} tail'+suffix,('live','intendedFontSize'):'24px',('live','otherBackground'):'rgb(0, 0, 255)',('live','otherColor'):'rgb(128, 0, 0)',('live','sidecars'):sidecar(legacy),('live','history'):[True,False],('dispose','rootRemoved'):True}
 if life=='read-only':wanted[('inactive','actualReadOnly')]='false'
 if not legacy:wanted.update({('inactive','retiredProducer'):0,('inactive','retiredEvents'):prior,('inactive','noPriorProducer'):0,('live','liveProducer'):1,('live','liveEvent'):[event]})
 canons={('inactive','retiredCanonical'):before,('undo','exactCanonical'):before,('redo','exactCanonical'):after}
 return wanted,canons
def verify_candidate(case):
 spec=case['spec'];life=bool(spec.get('lifetime'));assert case['id']==spec['id'] and case['error'] is None and case['diagnostics']==case['unsupported']==[]
 idle=bool(spec.get('noop') or spec.get('cancel') or spec.get('invalid'))
 planned=['load','inactive','live','undo','redo','dispose'] if life else ['load','input','prepare-redo','selection','action','redo-input','undo-input','dispose'] if idle else ['load','input','selection','action','undo-action','undo-input','redo-input','redo-action','dispose']
 assert case['planned']==case['completedPhases']==planned
 wanted,canons=lifetime_expected(spec) if life else main_expected(spec)
 observed={(o['phase'],o['property']):o for o in case['observations']};assert len(observed)==len(case['observations']) and set(observed)==set(wanted)|set(canons),(spec,set(observed)^(set(wanted)|set(canons)))
 for key,value in wanted.items():
  o=observed[key];assert same(o['expected'],value),(spec['id'],key,'expected',o['expected'],value);assert same(o['actual'],value),(spec['id'],key,'actual',o['actual'],value);assert o['status']=='PASS'
 for key,units in canons.items():
  o=observed[key];canonical(o['expected'],units,spec,lifetime=life);canonical(o['actual'],units,spec,lifetime=life);assert same(o['actual'],o['expected']) and o['status']=='PASS'
 if life:
  events=([dict(action='commit',origin='external',name='document.render')] if spec['lifetime']=='render' else [])+[dict(action=a,origin='user' if a=='commit' else 'history',name='inline.fontSize') for a in ['commit','undo','redo']]
 else:
  events=[dict(action='commit',origin='native-input',name='native-input')]
  if idle:events += [dict(action=a,origin='history',name='native-input') for a in ['undo','redo','undo']]
  else:events += [dict(action='commit',origin='user',name='inline.fontSize')]+[dict(action=a,origin='history',name=n) for a,n in [('undo','inline.fontSize'),('undo','native-input'),('redo','native-input'),('redo','inline.fontSize')]]
 assert same(case['transactions'],events),(spec['id'],case['transactions'],events)
 return len(observed)
def git_blobs(queries):
 queries=sorted(set(queries));out=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());pos=0;blobs={}
 for q in queries:
  end=out.index(b'\n',pos);header=out[pos:end].split();assert len(header)==3 and header[1]==b'blob',q
  size=int(header[2]);pos=end+1;blobs[q]=out[pos:pos+size];pos+=size;assert out[pos:pos+1]==b'\n';pos+=1
 assert pos==len(out);return blobs
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=a.raw.read_bytes();d=json.loads(raw);assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is True and d['filter']=='' and d['serverErrors']==[]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
 for row in d['results']:
  assert row['inputErrors']==[] and [c['spec'] for c in row['cases']]==specs()
  if row['source']=='spec-baseline':
   assert len(row['pageErrors'])==7
   for error in row['pageErrors']:assert error.split('\n')[0]=='Error: Font-size reset selection is unavailable' and '/spec-baseline/inline-tools/fontSize.js:331:' in error
  else:assert row['pageErrors']==[]
 current=next(row for row in d['results'] if row['source']=='candidate');count=sum(verify_candidate(c) for c in current['cases'])
 # Historical actions remain fully visible, including missing panel activation.
 # Their exact observed graphs are additionally bound by the reviewed corpus hash.
 historical={}
 goldens=json.loads(Path(__file__).with_name('historical-goldens.json').read_bytes())
 assert goldens['basisCandidate']=='ce0192ef3ad690c3a74fcac916f173e24998e339' and goldens['rawSha256']=='9418af5941c908924c81893e65422007efffc734b70d5062aa59b05087f6f478'
 assert set(goldens['sources'])==set(goldens['pageErrors'])=={'v1','spec-baseline'}
 for row in d['results']:
  if row['source']=='candidate':continue
  failures=[];incomplete=[]
  assert set(goldens['sources'][row['source']])=={c['id'] for c in row['cases']}
  assert [re.sub(r'http://127\.0\.0\.1:\d+/', 'http://127.0.0.1:PORT/',e) for e in row['pageErrors']]==goldens['pageErrors'][row['source']]
  for case in row['cases']:
   graph={k:case.get(k,[] if k in ['diagnostics','transactions','trusted','unsupported'] else None) for k in ['id','spec','planned','completedPhases','phase','diagnostics','transactions','trusted','unsupported','observations']}
   graph['error']=case['error'].split('\n')[0] if case['error'] else None
   graphHash=sha(json.dumps(graph,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
   assert graphHash==goldens['sources'][row['source']][case['id']]['sha256'],(row['source'],case['id'],'historical graph changed')
   if case['error']:incomplete.append(dict(id=case['id'],phase=case['phase'],completedPhases=case['completedPhases'],error=case['error'].split('\n')[0]))
   for o in case['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':failures.append(dict(id=case['id'],phase=o['phase'],property=o['property']))
  historical[row['source']]=dict(pageErrors=row['pageErrors'],cases=len(row['cases']),complete=len(row['cases'])-len(incomplete),observations=sum(len(c['observations']) for c in row['cases']),failures=failures,incomplete=incomplete)
 assert d['group']=='fontsize-tools'
 own=['scripts/parity/fontsize-tools.mjs','tests/browser/fontsize-tools-fixture.js','scripts/parity/checkpoints/2026-11-03/fontsize-tools/review.py','scripts/parity/checkpoints/2026-11-03/fontsize-tools/historical-goldens.json']
 queries=[s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[a.candidate+':'+path for path in own];blobs=git_blobs(queries)
 for source in d['sources']:
  assert len(source['loaded'])>=100 and source['tree']==subprocess.check_output(['git','rev-parse',source['sha']+'^{tree}']).decode().strip()
  for path,h in source['loaded'].items():assert sha(blobs[source['sha']+':'+path])==h
 for path in own:assert Path(path).read_bytes()==blobs[a.candidate+':'+path]
 assert d['runnerSha256']==sha(blobs[a.candidate+':'+own[0]]) and d['fixtureSha256']==sha(blobs[a.candidate+':'+own[1]])
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 assert d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 report=dict(status='PASS',candidate=a.candidate,cases=117,observations=count,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),historical=historical,moduleIdentities=sum(len(s['loaded']) for s in d['sources']))
 a.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='historical'}))
if __name__=='__main__':main()
