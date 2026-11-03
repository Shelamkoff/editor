"""Independent literal template layout and native settings/history state machine."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
V1='5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340';BASELINE='e981ff308000c1d92d7e820df95113c1e19bcee8';RED='aa3da3322fb4ec8ebbe34082043cf43201fc808a';GREEN='38119ff357e9933e4e79bb11b170c264e0e628ef'
TEMPLATES=['horizontal','compact','large-top','minimal','twitter','notion','split'];PHASES=['load','choose','replay','remount','dispose'];PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII='
def sha(b):return hashlib.sha256(b).hexdigest()
def same(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def specs():return[dict(id=t+'/'+('reader' if ro else 'editor'),template=t,readOnly=ro) for t in TEMPLATES for ro in [False,True]]
def document(template,old=False,seed=False):return[dict(id='link',type='linkPreview',**({} if old else dict(dataVersion=1)),data=dict(url='https://example.test/article',title='Seed title' if seed else '<b>Card title</b>',description='Description with <i>literal text</i>',image=PIXEL,favicon=PIXEL,domain='example.test',template=template)),dict(id='b',type='paragraph',**({} if old else dict(dataVersion=2)),data=dict(text='<i>Neighbor</i>'))]
def view(t,seed=False):
 image=t not in ['minimal','notion'];title='Seed title' if seed else '<b>Card title</b>'
 return dict(template=t,tag='A',href='https://example.test/article',target='_blank',rel=['noopener','noreferrer'],title=title,description='Description with <i>literal text</i>',domain='example.test',literalMarkup=True,layout=dict(display='flex',direction='column' if t in ['large-top','twitter'] else 'row',imageVisible=image,imageWidth='none' if not image else '200px' if t=='horizontal' else '48px' if t=='compact' else 'half' if t=='split' else 'full',imageHeight=181 if t=='twitter' else 180 if t=='large-top' else None,minHeight='140px' if t=='split' else '0px',borderLeft='3px' if t=='minimal' else '1px',domainOrder='-1' if t=='twitter' else '0',domainTransform='uppercase' if t=='twitter' else 'none',descriptionVisible=t!='notion',largeFaviconVisible=t=='notion',smallFaviconVisible=t!='notion'),imageAlt=title if image else None)
def values(s,profile='current',normative=False):
 old=profile=='legacy';broken=not normative and profile in ['baseline','red'] and not s['readOnly'] and s['template'] in TEMPLATES[:4];ro=s['readOnly'];target=s['template'];first=target if ro else 'notion';changed=not ro and target!='notion';result=[]
 def add(phase,**items):result.extend((phase,k,v) for k,v in items.items())
 def snapshot(phase,t,history,seed=False):
  editor=view(t,seed);output=view(t,seed)
  if profile=='baseline' and not normative and editor['layout']['imageVisible']:editor['imageAlt']=''
  add(phase,canonical=document(t,old,seed),editorView=editor,outputView=output,history=history,neighborRetained=True)
 snapshot('load',first,[False,False] if ro else [False,True]);add('load',templateInventory=[] if old and ro else [dict(labelled=True,active=t==first) for t in TEMPLATES])
 history=[False,False] if ro else [True,False] if changed else [False,True];observed_history=[False,True] if broken else history
 snapshot('choose','notion' if broken else target,observed_history)
 native=[] if ro else [dict(kind='settings',trusted=True,onControl=True)]+([] if broken else [dict(kind='template',trusted=True,onControl=True)])
 add('choose',nativeEvents=native,activeTemplate=-1 if old and ro else 5 if broken else TEMPLATES.index(target),actionsHidden=ro)
 if not ro:add('choose',modeClosedPanel=not(not normative and profile in ['baseline','red'] and not broken),modeHistory=observed_history)
 if changed:
  add('replay',undoAvailable=not broken);snapshot('undo','notion',[False,True]);add('replay',redoAvailable=True);snapshot('redo','notion' if broken else target,[True,False],broken)
 else:add('replay',seedRedoAvailable=True,seedCanonical=document(target,old,True),seedUndoAvailable=True);snapshot('restored',target,[False,True])
 add('remount',retiredRootRemoved=True);snapshot('remount','notion' if broken else target,[False,False],broken);add('remount',readOnly=ro);add('dispose',rootRemoved=True)
 return result
def verify(case,profile='current'):
 s=case['spec'];assert case['id']==s['id'] and case['planned']==case['completedPhases']==PHASES and case['error'] is None and case['diagnostics']==[]
 assert len(case['unsupported'])==(1 if profile=='legacy' else 0)
 if profile=='legacy':assert case['unsupported'][0]['property']=='currentTemplateTransactionFacts'
 expected=values(s,profile,True);actual=values(s,profile);assert len(case['observations'])==len(expected)==len(actual);differences=[]
 for o,(phase,key,value),(_,_,observed) in zip(case['observations'],expected,actual):
  status='PASS' if same(value,observed) else 'FAIL';assert (o['phase'],o['property'])==(phase,key) and same(o['expected'],value) and same(o['actual'],observed) and o['status']==status,(s['id'],phase,key,o,observed,value)
  if status=='FAIL':differences.append(dict(id=s['id'],phase=phase,property=key))
 broken=profile in ['baseline','red'] and not s['readOnly'] and s['template'] in TEMPLATES[:4];native=[] if s['readOnly'] else [dict(kind='settings',trusted=True,onControl=True)]+([] if broken else [dict(kind='template',trusted=True,onControl=True)]);assert case['nativeEvents']==native
 actions=[] if profile=='legacy' else [dict(action='redo',origin='history',name='document.render')] if broken else [dict(action=a,origin='plugin' if a=='commit' else 'history',name='block.update') for a in ['commit','undo','redo']] if not s['readOnly'] and s['template']!='notion' else [dict(action=a,origin='history',name='document.render') for a in ['redo','undo']]
 assert case['transactions']==actions,(s['id'],case['transactions'],actions)
 return len(expected),differences

def main():
 p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--red',type=Path,required=True);p.add_argument('--normal',type=Path,required=True);p.add_argument('--trusted',type=Path,required=True);p.add_argument('--candidate',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=a.raw.read_bytes();red=a.red.read_bytes();d=json.loads(raw);r=json.loads(red);root='scripts/parity/checkpoints/2026-11-03/extension-tasks/review.py';helper_bytes=subprocess.check_output(['git','show','0aa9e27eb7899089f45b62eec0f11b8fd9d1f805:'+root]);assert Path(root).read_bytes().replace(b'\r\n',b'\n')==helper_bytes
 helper={'__name__':'accepted_identity_helper'};exec(compile(helper_bytes,'accepted-identity-helper','exec'),helper);modules=helper['identity'](d,a.candidate,'scripts/parity/link-preview-templates.mjs','tests/browser/link-preview-templates-fixture.js')
 summaries={}
 for corpus,label in [(d,'final'),(r,'red')]:
  assert corpus['filter']=='' and corpus['group']=='link-preview-templates' and corpus['platform']=='win32 x64'
  assert [row['source'] for row in corpus['results']]==['v1','spec-baseline','candidate']
  rows={}
  for row in corpus['results']:
   assert row['pageErrors']==row['inputErrors']==[] and [c['spec'] for c in row['cases']]==specs();profile='legacy' if row['source']=='v1' else 'baseline' if row['source']=='spec-baseline' else 'red' if label=='red' else 'current';verified=[verify(case,profile) for case in row['cases']];rows[row['source']]=dict(cases=len(verified),observations=sum(n for n,_ in verified),differences=[f for _,failures in verified for f in failures]);assert rows[row['source']]['observations']==458 and len(rows[row['source']]['differences'])==dict(legacy=0,baseline=85,red=59,current=0)[profile]
  summaries[label]=rows
 assert r['headBefore']==r['headAfter']==RED and r['candidatePass'] is False and r['serverErrors']==[] and {s['label']:s['sha'] for s in r['sources']}==dict(v1=V1,**{'spec-baseline':BASELINE,'candidate':RED})
 queries=[s['sha']+':'+path for s in r['sources'] for path in s['loaded']]+[RED+':'+path for path in ['scripts/parity/link-preview-templates.mjs','tests/browser/link-preview-templates-fixture.js']];blobs=helper['git_blobs'](queries)
 for source in r['sources']:
  assert source['tree']==subprocess.check_output(['git','rev-parse',source['sha']+'^{tree}']).decode().strip()
  for path,h in source['loaded'].items():assert sha(blobs[source['sha']+':'+path])==h
 assert r['runnerSha256']==sha(blobs[RED+':scripts/parity/link-preview-templates.mjs']) and r['fixtureSha256']==sha(blobs[RED+':tests/browser/link-preview-templates-fixture.js']) and r['packageLockSha256']==d['packageLockSha256'] and r['dependencyVersions']==d['dependencyVersions'] and r['dependencyFiles']==d['dependencyFiles'] and r['node']==d['node'] and r['browser']==d['browser']
 normal=a.normal.read_bytes();trusted=a.trusted.read_bytes();assert b'Native native-link-preview-templates.html: 14 passed' in normal and b'Native native-link-preview-templates-trusted.html: 15 passed' in trusted
 for page,text,policy in [('native-link-preview-templates.html',normal,False),('native-link-preview-templates-trusted.html',trusted,True)]:
  summary=next(json.loads(line)[page] for line in text.decode().splitlines() if line.startswith('{"'+page+'":'))
  assert [case['name'] for case in summary]==(['LinkPreview Trusted Types policy rejects untrusted HTML'] if policy else [])+['LinkPreview templates '+s['id'] for s in specs()] and all(case['status']=='PASS' for case in summary)
 own=['scripts/parity/checkpoints/2026-11-03/link-preview-templates/review.py','scripts/parity/checkpoints/2026-11-03/link-preview-templates/controls.mjs','tests/browser/native-link-preview-templates.js','tests/browser/native-link-preview-templates.html','tests/browser/native-link-preview-templates-trusted.html','tests/browser/physical-history.mjs'];blobs=helper['git_blobs']([a.candidate+':'+path for path in own])
 for path in own:assert Path(path).read_bytes().replace(b'\r\n',b'\n')==blobs[a.candidate+':'+path]
 runtime=['core','shared','plugins','plugin-kit','inline-tools','inline-plugins','renderer','preset','locale','index.js','index.d.ts','types.d.ts','package.json','package-lock.json'];assert subprocess.check_output(['git','diff','--name-only',GREEN,a.candidate,'--',*runtime])==b''
 report=dict(status='PASS',candidate=a.candidate,results=summaries,currentCases=14,currentObservations=458,nativeCases=14,trustedCases=15,rawSha256=sha(raw),redSha256=sha(red),reviewerSha256=sha(Path(__file__).read_bytes()),identityHelperSha256=sha(helper_bytes),moduleIdentities=modules,redModuleIdentities=sum(len(s['loaded']) for s in r['sources']),nativeNormalSha256=sha(normal),nativeTrustedSha256=sha(trusted),runtimeBasis=GREEN)
 a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
