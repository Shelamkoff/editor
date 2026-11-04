"""Literal field/mark/identity oracle for Quote; no production parser imports."""
import argparse,hashlib,json,subprocess
from datetime import datetime
from pathlib import Path
PARENT='22b6b77d8c55760de4a153836d042a28bdb561f2';RUNTIME='3c02d2d46e1ecf2641cc7a6753189f12c7e4a1e7';INHERIT='932f119b9cae2830ead9bfe872091ddd149e3566'
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def specs():
 return [dict(id='edit/'+f+'/'+('backward' if b else 'caret'),kind='edit',field=f,backward=b) for f in ['text','caption'] for b in [False,True]]+[dict(id='format/'+a+'/'+n+'/'+('backward' if b else 'forward'),kind='format',action=a,boundary=n,backward=b) for a in ['apply','remove'] for n in ['Text','Element'] for b in [False,True]]+[dict(id=k+'/'+f,kind=k,field=f) for k in ['empty','navigate'] for f in ['text','caption']]
def words(s,after=False):
 if s['kind']=='edit' and after:return {'text':{'False':'AlXpha','True':'AXa'},'caption':{'False':'BeXta','True':'BXa'}}[s['field']][str(s['backward'])]
 return 'Alpha' if s.get('field')=='text' else 'Beta'
def document(s,after=False,old=False):
 text='<b>Al</b>pha' if s['kind']=='format' and s['action']=='apply' else '<b>Alpha</b>';caption='<i>Beta</i>';text+=' {{swatch}}<br>tail';caption+=' {{capref}}<br>finish'
 if s['kind']=='empty':
  if s['field']=='text':text=''
  else:caption=''
 if after and s['kind']=='edit':
  if s['field']=='text':text=text.replace('Alpha',words(s,True))
  else:caption=caption.replace('Beta',words(s,True))
 if after and s['kind']=='format':
  text='<b>Alpha </b>{{swatch}}<br><b>tail</b>' if s['action']=='apply' else '<b>Al</b>pha {{swatch}}<br>tail'
  caption='<i><b>Be</b>ta</i> {{capref}}<br>finish' if s['action']=='apply' else caption
 def record(i,t,d):return dict(id=i,type=t,**({} if old else dict(dataVersion=1 if t=='quote' else 2)),data=d)
 refs={}
 for key,value in [('swatch','#aBcDef'),('capref','#123456')]:
  if (key=='swatch' and text) or (key=='capref' and caption):refs[key]=dict(type='color',**({} if old else dict(dataVersion=1)),data=dict(value=value))
 q=record('subject','quote',dict(text=text,caption=caption));q['inline']=refs
 return [record('prefix','paragraph',dict(text='Before')),q,record('suffix','paragraph',dict(text='After'))]
def unit(text,marks=(),kind='text'):return dict(kind=kind,text=text,marks=sorted(marks),bg=None,color=None,size=None)
def field_units(s,field,after=False):
 if s['kind']=='empty' and s['field']==field:return []
 text='Alpha' if field=='text' else 'Beta'
 if s['kind']=='edit' and s['field']==field and after:text=words(s,True)
 marks=[['b'] if field=='text' else ['i'] for _ in text];space=[];tail=[]
 if s['kind']=='format' and field=='text':
  if after and s['action']=='apply':marks=[['b']]*len(text);space=tail=['b']
  elif (after and s['action']=='remove') or (not after and s['action']=='apply'):marks=[['b'] if i<2 else [] for i in range(len(text))]
 if s['kind']=='format' and field=='caption' and after and s['action']=='apply':marks=[['b','i'] if i<2 else ['i'] for i in range(4)]
 ref='swatch' if field=='text' else 'capref';suffix='tail' if field=='text' else 'finish'
 return [unit(c,m) for c,m in zip(text,marks)]+[unit(' ',space),unit('{{'+ref+'}}',kind='widget'),unit('\n',kind='break')]+[unit(c,tail) for c in suffix]
def meaning(s,after=False):return [dict(id='prefix',type='paragraph',data=dict(text='Before')),dict(id='subject',type='quote',data={f:field_units(s,f,after) for f in ['text','caption']}),dict(id='suffix',type='paragraph',data=dict(text='After'))]
def widgets(s):
 result=[]
 for f,ref,value,dot in [('text','swatch','#aBcDef','rgb(171, 205, 239)'),('caption','capref','#123456','rgb(18, 52, 86)')]:result.append([] if s['kind']=='empty' and s['field']==f else [dict(id=ref,type='color',value=value,label=value,dot=dot,editable='false')])
 return result
def point(field,offset):return dict(field=field,anchor=[offset if field==0 else None,offset if field==1 else None],focus=[offset if field==0 else None,offset if field==1 else None])
def observations(s):
 initial=document(s);after=document(s,True);active=s['kind'] in ['edit','format'];h=[True,False] if active else [False,False];out=[]
 def put(p,**items):out.extend((p,k,v) for k,v in items.items())
 def view(p,post=False):put(p,visible=[field_units(s,f,post) for f in ['text','caption']],widgets=widgets(s))
 put('load',canonical=initial,history=[False,False]);view('load')
 if s['kind']=='format':put('action',directedSelection=dict(anchor=[None,2],focus=[2,None]) if s['backward'] else dict(anchor=[2,None],focus=[None,2]),boldDelivered=True)
 put('action',meaning=meaning(s,True),sidecars=[None,initial[1]['inline'],None],history=h);view('action',True)
 if s['kind']!='format':put('action',canonical=after)
 put('action',neighborsRetained=True,fieldsRetained=True)
 if s['kind']!='format':put('action',widgetsRetained=True)
 if s['kind'] in ['edit','navigate']:
  field=s['field'];length=12
  if s['kind']=='edit' and field=='text':length=13 if not s['backward'] else 10
  put('navigate',firstFocus=point(0,12) if field=='caption' else point(1,0),returnFocus=point(1,0) if field=='caption' else point(0,length),canonical=after,history=h)
 if active:
  put('undo',canonical=initial,history=[False,True]);view('undo');put('redo',canonical=after,history=[True,False]);view('redo',True)
 caller=dict(version='2.0.0',blocks=initial);saved=dict(version='2.0.0',blocks=after)
 put('roundtrip',canonical=after,history=[False,False],readerFields=['false','false']);view('roundtrip',True);put('roundtrip',savedCaller=saved,caller=caller,diagnostics=[]);put('dispose',rootsRemoved=True)
 return out
def native(s):
 out=[]
 def key(role,k,mod=0):out.append(dict(role=role,type='keydown',key=k,trusted=True,modifiers=mod))
 if s['kind']=='edit':out.append(dict(role='edit',type='input',trusted=True,inputType='insertText'))
 if s['kind']=='format':out.append(dict(role='bold',type='mousedown',trusted=True,hit=True))
 if s['kind']=='empty':key('Backspace','Backspace');key('Delete','Delete')
 if s['kind'] in ['edit','navigate']:key('next-field','Tab',8 if s['field']=='caption' else 0);key('return-field','Tab',0 if s['field']=='caption' else 8)
 if s['kind'] in ['edit','format']:key('undo','z',2);key('redo','z',10)
 return out
def events(s):
 if s['kind'] not in ['edit','format']:return []
 name='native-input' if s['kind']=='edit' else 'inline.bold';origin='native-input' if s['kind']=='edit' else 'user'
 return [dict(action=a,origin=o,name=name) for a,o in [('commit',origin),('undo','history'),('redo','history')]]
def blobs(queries):
 queries=sorted(set(queries));raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());pos=0;out={}
 for q in queries:
  end=raw.index(b'\n',pos);h=raw[pos:end].split();assert len(h)==3 and h[1]==b'blob',q;pos=end+1;n=int(h[2]);out[q]=raw[pos:pos+n];pos+=n;assert raw[pos:pos+1]==b'\n';pos+=1
 assert pos==len(raw);return out
def corpus(d,candidate):
 assert d['headBefore']==d['headAfter']==candidate and d['candidatePass'] is True and d['serverErrors']==[] and d['filter']=='' and d['group']=='quote-fields'
 assert [(r['source'],r['trustedPolicy']) for r in d['results']]==[('v1',False),('spec-baseline',False),('parent',False),('candidate',False),('candidate',True)]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASE,'parent':PARENT,'candidate':candidate})
 own=['scripts/parity/quote-fields.mjs','tests/browser/quote-fields-fixture.js'];b=blobs([s['sha']+':'+p for s in d['sources'] for p in s['loaded']]+[candidate+':'+p for p in own]);modules=0
 for s in d['sources']:
  assert s['tree']==subprocess.check_output(['git','rev-parse',s['sha']+'^{tree}']).decode().strip() and len(s['loaded'])>95
  for p,h in s['loaded'].items():assert sha(b[s['sha']+':'+p])==h;modules+=1
 assert d['runnerSha256']==sha(b[candidate+':'+own[0]]) and d['fixtureSha256']==sha(b[candidate+':'+own[1]])
 for p,h in d['dependencyFiles'].items():assert '..' not in Path(p).parts and not Path(p).is_absolute() and sha((Path('node_modules')/p).read_bytes())==h
 for p,v in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/p/'package.json').read_bytes())['version']==v
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes())
 result={}
 for r in d['results']:
  assert r['policyEnforced']==r['trustedPolicy'] and r['pageErrors']==r['inputErrors']==r['externalRequests']==r['mediaRequests']==r['unavailable']==[] and [c['spec'] for c in r['cases']]==specs()
  for e in r['environmentRequests']:assert e['blocked'] is True and e['type']=='script' and e['url'].startswith(('http://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js','https://gc.kis.v2.scr.kaspersky-labs.com/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js'))
  differences=[];count=0
  for c in r['cases']:
   assert c['id']==c['spec']['id'] and c['error'] is None and c['planned']==c['completedPhases'];count+=len(c['observations'])
   for o in c['observations']:
    assert o['status']==('PASS' if same(o['actual'],o['expected']) else 'FAIL')
    if o['status']=='FAIL':differences.append([c['id'],o['phase'],o['property']])
   if r['source'] in ['parent','candidate']:
    wanted=observations(c['spec']);assert c['unsupported']==c['diagnostics']==[] and c['planned']==list(dict.fromkeys(p for p,k,v in wanted)) and len(c['observations'])==len(wanted)
    for o,(p,k,v) in zip(c['observations'],wanted):
     if k=='savedCaller':
      stamp=o['actual'].get('time');assert type(stamp)==int and int(datetime.fromisoformat(d['startedAt'].replace('Z','+00:00')).timestamp()*1000)<=stamp<=int(datetime.fromisoformat(d['finishedAt'].replace('Z','+00:00')).timestamp()*1000);v=dict(v,time=stamp)
     assert (o['phase'],o['property'])==(p,k) and same(o['actual'],v) and same(o['expected'],v),(c['id'],p,k,o,v)
    assert c['nativeEvents']==native(c['spec']) and c['transactions']==events(c['spec'])
   elif r['source']=='v1':assert len(c['unsupported'])==1 and c['unsupported'][0]['property']=='currentObservers'
   else:assert c['unsupported']==[]
  assert count==472;assert len(differences)==(50 if r['source']=='v1' else 34 if r['source']=='spec-baseline' else 0)
  result[r['source']+('/trusted' if r['trustedPolicy'] else '/compatible')]=dict(cases=16,observations=count,differences=differences)
 return result,modules
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();raw=a.raw.read_bytes();result,modules=corpus(json.loads(raw),a.candidate)
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json']
 for source in [PARENT,INHERIT]:assert subprocess.check_output(['git','diff','--name-only',source,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,parent=PARENT,productionBasis=RUNTIME,productionChanged=False,inheritedVerificationSource=INHERIT,results=result,currentCases=32,currentObservations=944,moduleIdentities=modules,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),scope='Independent literal wire/character/mark/ID/widget/focus/history/native-event model. Both current policies and immutable parent pass the same 16 cases. No production normalizer or fixture arithmetic is imported. Old mixed-mark ANY-selected removal behavior is retained; explicit apply/remove cases remain distinct.',limitations=['Legacy transaction/diagnostic subscriptions are absent; empty fixture arrays are not measured legacy event counts.'])
 a.output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if __name__=='__main__':main()
