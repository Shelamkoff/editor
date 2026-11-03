"""Literal author-data and service-style oracle for cross-field font-size reset."""
import argparse,copy,hashlib,json,subprocess
from html.parser import HTMLParser
from pathlib import Path
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8'
def same(a,b):return json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def specs():return [dict(id='/'.join([tag,'styled' if styled else 'plain',boundary,'backward' if back else 'forward']),tag=tag,styled=styled,boundary=boundary,backward=back) for tag in ['p','span'] for styled in [False,True] for boundary in ['Text','Element'] for back in [False,True]]
class Wire(HTMLParser):
 def __init__(self,html):
  super().__init__(convert_charrefs=True);self.stack=[dict(size=None,color=None)];self.units=[];self.feed(html);assert len(self.stack)==1
 def handle_starttag(self,tag,pairs):
  assert tag=='span';attrs=dict(pairs);assert set(attrs).issubset({'style'});state=dict(self.stack[-1])
  for raw in attrs.get('style','').split(';'):
   if not raw.strip():continue
   key,value=raw.split(':',1);key=key.strip();value=value.strip();assert key in ['font-size','color']
   if key=='font-size':state['size']=value
   else:state['color']='#800000' if value.replace(' ','').lower() in ['#800000','rgb(128,0,0)'] else value
  self.stack.append(state)
 def handle_endtag(self,tag):assert tag=='span' and len(self.stack)>1;self.stack.pop()
 def handle_data(self,value):
  for letter in value:self.units.append(dict(self.stack[-1],text=letter))
def canonical(value,before,legacy):
 assert len(value)==2
 for index,b in enumerate(value):
  assert set(b)==({'id','type','data'} if legacy else {'id','type','dataVersion','data'}) and b['id']==('b' if index else 'a') and b['type']=='span-text'
  if not legacy:assert b['dataVersion']==2
  assert set(b['data'])=={'text'}
  assert Wire(b['data']['text']).units==[dict(text=letter,size='24px' if before else None,color='#800000') for letter in ['Alpha','Bravo'][index]]
def expected(spec):
 styled=['36px' if spec['styled'] else '']*2
 first=dict(field=0,offset=0);last=dict(field=1,offset=5);selection=dict(anchor=last if spec['backward'] else first,focus=first if spec['backward'] else last,collapsed=False)
 before=[dict(text=word,sizes=['24px'],colors=['#800000']) for word in ['Alpha','Bravo']];after=[dict(text=word,sizes=[],colors=['#800000']) for word in ['Alpha','Bravo']]
 wanted={('load','authorMeaning'):before,('load','fieldStyles'):styled,('load','history'):[False,False],('selection','exactRange'):selection,
  ('reset','trustedOpen'):True,('reset','prefill'):'24',('reset','trustedAuxiliary'):True,('reset','auxiliaryFocus'):True,('reset','beforeResetHistory'):[False,False],('reset','trustedReset'):True,('reset','authorMeaning'):after,('reset','fieldStyles'):styled,('reset','history'):[True,False],('reset','selection'):selection,
  ('undo','available'):True,('undo','authorMeaning'):before,('undo','fieldStyles'):styled,('undo','history'):[False,True],('redo','available'):True,('redo','authorMeaning'):after,('redo','fieldStyles'):styled,('redo','history'):[True,False],('dispose','rootRemoved'):True}
 canons={('reset','beforeReset'):True,('undo','exactCanonical'):True,('redo','exactCanonical'):False}
 return wanted,canons
def verify(case,label,mode):
 spec=case['spec'];legacy=label=='v1';incomplete=label=='spec-baseline' and spec['boundary']=='Element';broken=label!='candidate' or mode=='red'
 assert case['id']==spec['id'] and case['diagnostics']==[] and [u['property'] for u in case['unsupported']]==(['currentTransactionPort'] if legacy else [])
 assert case['planned']==['load','selection','reset','undo','redo','dispose']
 wanted,canons=expected(spec)
 if incomplete:
  assert case['completedPhases']==['load','selection'] and case['phase']=='reset' and case['error'].split('\n')[0]=='Error: Font-size control is hidden'
  wanted={key:value for key,value in wanted.items() if key[0] in ['load','selection'] or key in [('reset','trustedOpen'),('reset','prefill')]};canons={}
 else:assert case['error'] is None and case['completedPhases']==case['planned']
 actual=copy.deepcopy(wanted)
 if incomplete:actual[('reset','prefill')]='16'
 if not incomplete and legacy:actual[('reset','selection')]=dict(anchor=dict(field=0,offset=0),focus=dict(field=1,offset=0),collapsed=False)
 if broken and spec['styled'] and spec['tag']=='span' and not incomplete:
  for phase in (['reset'] if legacy else ['reset','undo','redo']):actual[(phase,'fieldStyles')]=['','']
 observed={(o['phase'],o['property']):o for o in case['observations']};assert len(observed)==len(case['observations']) and set(observed)==set(wanted)|set(canons)
 for key,value in wanted.items():
  o=observed[key];assert same(o['expected'],value),(spec,key,'expected',o,value);assert same(o['actual'],actual[key]),(spec,key,'actual',o,actual[key]);assert o['status']==('PASS' if same(actual[key],value) else 'FAIL')
 for key,before in canons.items():
  o=observed[key];canonical(o['expected'],before,legacy);canonical(o['actual'],before,legacy);assert same(o['actual'],o['expected']) and o['status']=='PASS'
 events=[] if legacy or incomplete else [dict(action=a,origin='user' if a=='commit' else 'history',name='inline.fontSize') for a in ['commit','undo','redo']]
 assert case['transactions']==events
 return dict(observations=len(observed),failures=sum(not same(value,actual[key]) for key,value in wanted.items()),complete=not incomplete)
def git_blobs(queries):
 queries=sorted(set(queries));out=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(queries)+'\n').encode());pos=0;blobs={}
 for q in queries:
  end=out.index(b'\n',pos);header=out[pos:end].split();assert len(header)==3 and header[1]==b'blob',q
  size=int(header[2]);pos=end+1;blobs[q]=out[pos:pos+size];pos+=size;assert out[pos:pos+1]==b'\n';pos+=1
 assert pos==len(out);return blobs
def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--mode',choices=['red','green'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=a.raw.read_bytes();d=json.loads(raw);assert d['headBefore']==d['headAfter']==a.candidate and d['candidatePass'] is (a.mode=='green') and d['group']=='fontsize-reset-boundary' and d['filter']=='' and d['serverErrors']==[]
 assert {s['label']:s['sha'] for s in d['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':a.candidate})
 totals={}
 for row in d['results']:
  assert row['pageErrors']==row['inputErrors']==[] and [c['spec'] for c in row['cases']]==specs()
  results=[verify(c,row['source'],a.mode) for c in row['cases']];total={key:sum(r[key] for r in results) for key in ['observations','failures','complete']};totals[row['source']]=total
  assert total==({'observations':416,'failures':20,'complete':16} if row['source']=='v1' else {'observations':256,'failures':14,'complete':8} if row['source']=='spec-baseline' else {'observations':416,'failures':12 if a.mode=='red' else 0,'complete':16})
 own=['scripts/parity/fontsize-reset-boundary.mjs','tests/browser/fontsize-reset-boundary-fixture.js']
 blobs=git_blobs([s['sha']+':'+path for s in d['sources'] for path in s['loaded']]+[a.candidate+':'+path for path in own])
 for source in d['sources']:
  assert source['tree']==subprocess.check_output(['git','rev-parse',source['sha']+'^{tree}']).decode().strip()
  for path,h in source['loaded'].items():assert sha(blobs[source['sha']+':'+path])==h
 for path in own:assert Path(path).read_bytes()==blobs[a.candidate+':'+path]
 assert d['runnerSha256']==sha(blobs[a.candidate+':'+own[0]]) and d['fixtureSha256']==sha(blobs[a.candidate+':'+own[1]])
 for path,h in d['dependencyFiles'].items():assert sha((Path('node_modules')/path).read_bytes())==h
 for name,version in d['dependencyVersions'].items():assert json.loads((Path('node_modules')/name/'package.json').read_bytes())['version']==version
 assert d['packageLockSha256']==sha(Path('package-lock.json').read_bytes()) and d['node']=='v24.22.2' and d['browser']=='156.0.8078.80' and d['platform']=='win32 x64'
 report=dict(status='PASS',mode=a.mode,candidate=a.candidate,candidatePass=a.mode=='green',casesPerSource=16,totals=totals,positiveCurrentCases=12 if a.mode=='red' else 16,rawSha256=sha(raw),reviewerSha256=sha(Path(__file__).read_bytes()),moduleIdentities=sum(len(s['loaded']) for s in d['sources']))
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
