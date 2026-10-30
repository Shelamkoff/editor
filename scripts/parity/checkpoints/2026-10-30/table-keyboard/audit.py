#!/usr/bin/env python3
"""Offline Table proof audit using fixed author strings, not fixture helpers."""
from pathlib import Path
import argparse,collections,copy,gzip,hashlib,json,os,re,subprocess,tempfile
from html.parser import HTMLParser

BASE='d67229c08f5fae7101cb2a252f2d56385224da08'
CURRENT='3a16cf9fe64046780d4573464387dd2eb864b80e'
BEFORE='01fb551a9542ddd94e6b5652f637193875b55888'
GRID=[['<b>Alpha</b> {{mention}} {{swatch}} tail','<i>Bravo</i> tail'],['<s>Charlie</s> &amp; tail','<b>Delta</b> {{otherMention}} {{otherSwatch}} fin']]
SIDECARS={
 'mention':{'type':'mention','dataVersion':1,'data':{'id':'ada','name':'Ada'}},
 'swatch':{'type':'color','dataVersion':1,'data':{'value':'#123456'}},
 'otherMention':{'type':'mention','dataVersion':1,'data':{'id':'grace','name':'Grace'}},
 'otherSwatch':{'type':'color','dataVersion':1,'data':{'value':'#654321'}},
}
BREAKS={
 'start':'<b><br>Alpha</b> {{mention}} {{swatch}} tailX',
 'middle':'<b>Al<br>pha</b> {{mention}} {{swatch}} tailX',
 'mark-end':'<b>Alpha<br></b> {{mention}} {{swatch}} tailX',
 'forward-range':'<b>A<br>a</b> {{mention}} {{swatch}} tailX',
 'backward-range':'<b>A<br>a</b> {{mention}} {{swatch}} tailX',
 'before-widget':'<b>Alpha</b> <br>{{mention}} {{swatch}} tailX',
 'after-widget':'<b>Alpha</b> {{mention}}<br> {{swatch}} tailX',
}
OFFSETS={'start':(0,0),'middle':(2,2),'mark-end':(5,5),'forward-range':(1,4),'backward-range':(4,1),'before-widget':(6,6),'after-widget':(7,7)}
SHARED=[
 'shared Paragraph bold line-break before a plain suffix',
 'shared Paragraph nested marks line-break before a plain suffix',
 'shared caret plain break before bold',
 'shared caret plain break before nested marks',
 'shared caret ordinary bold to plain boundary',
 'shared caret ordinary bold to italic boundary',
 'shared caret terminal break with projection padding',
 'shared noncollapsed forward restore after break',
 'shared noncollapsed backward restore after break',
]

class Markup(HTMLParser):
 def __init__(self,html):
  super().__init__(convert_charrefs=True);self.root=[];self.stack=[self.root];self.feed(html);assert len(self.stack)==1
 def handle_starttag(self,tag,attrs):
  node={'tag':tag,'attributes':dict(attrs),'children':[]};self.stack[-1].append(node)
  if tag!='br':self.stack.append(node['children'])
 def handle_endtag(self,tag):self.stack.pop()
 def handle_data(self,text):
  if self.stack[-1] and isinstance(self.stack[-1][-1],str):self.stack[-1][-1]+=text
  else:self.stack[-1].append(text)

def inventory():
 result=[]
 for headings in [False,True]:
  prefix='TABLE_KEYBOARD/'+('headed' if headings else 'body')+'/'
  result.append({'id':prefix+'navigation','headings':headings,'action':'navigation'})
  for variant in BREAKS:result.append({'id':prefix+'enter-'+variant,'headings':headings,'action':'enter','variant':variant})
  result.append({'id':prefix+'shift-enter-backward-range','headings':headings,'action':'enter','variant':'backward-range','shift':True})
 for suffix,action,headings in [('auxiliary-native','auxiliary',True),('missing-key','missing',False),('retired-key','retired',True)]:
  result.append({'id':'TABLE_KEYBOARD/ownership/'+suffix,'headings':headings,'action':action})
 return result

def plans(spec):
 if spec['action']=='navigation':return ['load','input','tab-1','tab-2','tab-3','tab-last','shift-tab-2','shift-tab-1','shift-tab-0','shift-tab-first','undo-input','redo-input']
 if spec['action']=='enter':return ['load','input','selection','enter','continuation','undo-continuation','undo-enter','undo-input','redo-input','redo-enter','redo-continuation']
 return ['load','input']+(['remove-row'] if spec['action']=='retired' else [])+['control-focus','control-enter','control-input','control-undo']+(['undo-remove'] if spec['action']=='retired' else [])+['undo-input','redo-input']+(['redo-remove'] if spec['action']=='retired' else [])

def phase_grid(spec,phase):
 grid=copy.deepcopy(GRID)
 if phase not in ['load','undo-input']:grid[0][0]+='X'
 if spec['action']=='enter' and phase in ['enter','continuation','undo-continuation','redo-enter','redo-continuation']:
  grid[0][0]=BREAKS[spec['variant']]
  if phase in ['continuation','redo-continuation']:grid[0][0]=grid[0][0].replace('<br>','<br>Y')
 if spec['action']=='retired' and phase in ['remove-row','control-focus','control-enter','control-input','control-undo','redo-remove']:grid=grid[:1]
 return grid

def records(spec,grid):
 sidecars={key:value for key,value in SIDECARS.items() if any('{{'+key+'}}' in text for row in grid for text in row)}
 return [{'id':'table','type':'table','dataVersion':2,'data':{'withHeadings':spec['headings'],'rows':[{'id':f'row-{r}','cells':[{'id':f'cell-{r}-{c}','text':text} for c,text in enumerate(row)]} for r,row in enumerate(grid)]},'inline':sidecars}]

def caret(field,anchor,focus=None):
 focus=anchor if focus is None else focus
 return {'focused':field,'anchor':{'field':field,'offset':anchor},'focus':{'field':field,'offset':focus},'collapsed':anchor==focus}

def phase_selection(spec,phase):
 # 14 UTF-16 authored units: Alpha, spaces, two atoms and the suffix.
 initial=14
 if phase=='input' or phase=='redo-input':return caret(0,initial+1)
 if phase=='undo-input':return caret(0,initial)
 if spec['action']=='enter':
  a,f=OFFSETS[spec['variant']]
  if phase in ['selection','undo-enter']:return caret(0,a,f)
  if phase in ['enter','undo-continuation','redo-enter']:return caret(0,min(a,f)+1)
  if phase in ['continuation','redo-continuation']:return caret(0,min(a,f)+2)
 if spec['action']=='navigation':
  if phase in ['tab-1','tab-2','tab-3']:return caret(int(phase[-1]),0)
  if phase in ['shift-tab-2','shift-tab-1','shift-tab-0']:return caret(int(phase[-1]),[15,10,14][int(phase[-1])])
 return None

def history_and_actions(spec,phase):
 if phase=='load':return {'canUndo':False,'canRedo':False},0
 if spec['action']=='enter':
  actions={'input':1,'selection':1,'enter':2,'continuation':3,'undo-continuation':4,'undo-enter':5,'undo-input':6,'redo-input':7,'redo-enter':8,'redo-continuation':9}[phase]
  undo=phase!='undo-input';redo=phase in ['undo-continuation','undo-enter','undo-input','redo-input','redo-enter']
 elif spec['action']=='navigation':
  actions=2 if phase=='undo-input' else 3 if phase=='redo-input' else 1;undo=phase!='undo-input';redo=phase=='undo-input'
 else:
  removed=spec['action']=='retired';actions=1
  if removed and phase in ['remove-row','control-focus','control-enter','control-input','control-undo']:actions=2
  if phase=='undo-remove':actions=3
  if phase=='undo-input':actions=4 if removed else 2
  if phase=='redo-input':actions=5 if removed else 3
  if phase=='redo-remove':actions=6
  undo=phase!='undo-input';redo=phase in ['undo-remove','undo-input'] or removed and phase=='redo-input'
 return {'canUndo':undo,'canRedo':redo},actions

def parse_native(data):
 text=data.decode()
 if 'Error: History matrix failed: ' in text:return json.JSONDecoder().raw_decode(text.split('Error: History matrix failed: ',1)[1])[0]
 return json.loads(text.split('\n',1)[1])['native-plugin-parity.html']

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,required=True);parser.add_argument('--output',type=Path);args=parser.parse_args()
 checkpoint=Path(__file__).resolve().parent;checks=0
 def equal(actual,expected,context):
  nonlocal checks
  assert actual==expected,(context,str(actual)[:900],str(expected)[:900]);checks+=1
 def digest(payload):return hashlib.sha256(payload).hexdigest()
 def read(path):
  data=(checkpoint/path).read_bytes();return gzip.decompress(data) if path.endswith('.gz') else data
 def load(path):return json.loads(read(path))
 manifest=load('manifest.json');equal(manifest['base'],BASE,'base')
 env=os.environ.copy()
 for name in ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_COMMON_DIR']:env.pop(name,None)
 env.update(GIT_OPTIONAL_LOCKS='0',GIT_NO_REPLACE_OBJECTS='1')
 def git(*parts,input=None):return subprocess.check_output(['git','-C',str(args.repo),*parts],env=env,input=input)
 with tempfile.TemporaryDirectory(prefix='table-keyboard-audit-') as directory:
  temp=Path(directory);objects=temp/'objects';objects.mkdir()
  existing=git('rev-parse','--path-format=absolute','--git-path','objects').decode().strip()
  env.update(GIT_INDEX_FILE=str(temp/'index'),GIT_OBJECT_DIRECTORY=str(objects),GIT_ALTERNATE_OBJECT_DIRECTORIES=existing)
  for record in manifest['preservedSources']:
   raw=record['rawCommit'].encode();equal(hashlib.sha1(b'commit '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),record['sha'],'raw commit')
   patch=read(record['patch']);equal(digest(patch),record['patchSha256'],'source patch')
   git('read-tree',BASE);git('apply','--cached','--binary','--whitespace=nowarn','-',input=patch)
   equal(git('write-tree').decode().strip(),record['tree'],'restored tree')
   equal(git('hash-object','-w','-t','commit','--stdin',input=raw).decode().strip(),record['sha'],'restored commit')
  raw=load('final/comparison.json.gz');equal(digest(read('final/comparison.json.gz')),manifest['rawSha256'],'raw hash')
  equal(raw['headBefore'],CURRENT,'source');equal(raw['headAfter'],CURRENT,'unchanged HEAD');equal(raw['candidatePass'],True,'candidate pass');equal(raw['filter'],'','full corpus');equal(raw['serverErrors'],[],'server errors')
  for key,path in [('runnerSha256','scripts/parity/table-keyboard-parity.mjs'),('fixtureSha256','tests/browser/table-keyboard-parity-fixture.js')]:equal(digest(git('show',CURRENT+':'+path)),raw[key],key)
  expected=inventory();summaries=[];verdicts=0;source_files=0;candidate_phases=0;oracle_checks=0
  for source,result in zip(raw['sources'],raw['results'],strict=True):
   equal(result['source'],source['label'],'source order');equal(git('rev-parse',source['sha']+'^{tree}').decode().strip(),source['tree'],'source tree')
   for path,checksum in source['loaded'].items():equal(digest(git('show',source['sha']+':'+path)),checksum,'module '+path);source_files+=1
   equal([c['specification'] for c in result['cases']],expected,'case inventory')
   failures=[];executed=0;unsupported=0
   for case,spec in zip(result['cases'],expected,strict=True):
    equal(case['plannedPhases'],plans(spec),'planned phases')
    missing=source['label']=='v1' and spec['action'] in ['missing','retired']
    if missing:
     assert case['unsupported'];equal(case['observations'],[],'no fabricated unsupported observations');equal(case['completedPhases'],[],'no fabricated unsupported phases');unsupported+=1
    else:
     equal(case['unsupported'],None,'executed surface');equal(case['error'],None,'complete execution');equal(case['completedPhases'],plans(spec),'phase completion');executed+=1
    equal(case['pageErrors'],[],'case page errors');equal(case['diagnostics'],[],'diagnostics')
    for observation in case['observations']:
     verdict='PASS' if observation['actual']==observation['expected'] else 'FAIL';equal(observation['status'],verdict,'truthful verdict');verdicts+=1
     if verdict=='FAIL':failures.append({'id':case['id'],**observation})
    if source['label']!='candidate':continue
    lookup={(o['phase'],o['property']):o['actual'] for o in case['observations']}
    equal([p['phase'] for p in case['phases']],plans(spec),'phase snapshots')
    for phase in case['phases']:
     candidate_phases+=1;name=phase['phase'];grid=phase_grid(spec,name);count_before=checks
     equal(phase['blocks'],records(spec,grid),'fixed records '+case['id']+'/'+name)
     cells=[[Markup(text).root for text in row] for row in grid]
     equal(lookup[name,'canonicalCells'],cells,'canonical meanings')
     surface=[[{'tag':'TH' if spec['headings'] and r==0 else 'TD','markup':Markup(text).root} for text in row] for r,row in enumerate(grid)]
     equal(lookup[name,'editorCells'],surface,'editor projection');equal(lookup[name,'rendererCells'],surface,'renderer projection')
     state,actions=history_and_actions(spec,name);equal(lookup[name,'history'],state,'history');equal(lookup[name,'completedActions'],actions,'one action per operation')
     selection=phase_selection(spec,name)
     if selection is not None:equal(phase['selection'],selection,'independent caret/range')
     if name in ['tab-last','shift-tab-first']:equal(phase['selection']['focused'],-1,'native boundary Tab')
     oracle_checks+=checks-count_before
    if spec['action'] in ['auxiliary','missing','retired']:
     for name,value in [('control-enter','Ou\nide'),('control-input','Ou\nYide')]:equal(lookup[name,'nativeControlText'],value,'native foreign control');oracle_checks+=1
    if spec['action']=='enter':equal(lookup['gestures','continuationBeforeInput'],True,'trusted continuation');oracle_checks+=1
   equal(result['failures'],failures,'complete failure summary');equal(result['errors'],[],'page error channel');equal(result['incompleteCases'],[],'no incomplete execution')
   summaries.append({'source':source['label'],'executed':executed,'unsupported':unsupported,'observations':sum(len(c['observations']) for c in result['cases']),'failures':len(failures)})
  equal([s['failures'] for s in summaries],[159,216,12,0],'source failure counts')
  before=next(r for r in raw['results'] if r['source']=='pre-fix')
  equal(collections.Counter((f['id'],f['phase'],f['property']) for f in before['failures']),collections.Counter((f'TABLE_KEYBOARD/{heading}/enter-mark-end',phase,property) for heading in ['body','headed'] for phase in ['continuation','redo-continuation'] for property in ['canonicalCells','editorCells','rendererCells']),'exact RED case/phase/property set')
  for job in ['native','terminal','unit','typecheck','comparison']:
   meta=load('final/'+job+'.meta.json.gz');equal(meta['actualExitCode'],1 if job=='comparison' else 0,'actual process outcome');equal(meta['sourceUnchanged'],True,'unchanged process source');equal(meta['headBefore'],CURRENT,'process source')
   for stream in ['stdout','stderr']:equal(digest(read('final/'+meta[stream+'File']+'.gz')),meta[stream+'Sha256'],'process stream hash')
  native=parse_native(read('final/native.log.gz'));equal([case['name'] for case in native],['Table keyboard parity '+name for name in SHARED]+['Table keyboard parity '+spec['id'] for spec in expected],'native case names');equal([case['status'] for case in native],['PASS']*30,'native pass')
  terminal=parse_native(read('final/terminal.log.gz'));equal(len(terminal),1,'terminal count');equal(terminal[0]['status'],'PASS','terminal native path')
  unit=read('final/unit.log.gz').decode();assert 'ℹ tests 24\n' in unit and 'ℹ pass 24\n' in unit and 'ℹ fail 0\n' in unit
  shared=load('final/pre-fix-shared.meta.json.gz');equal(shared['actualExitCode'],1,'pre-fix shared outcome');equal(shared['productionSource'],BEFORE,'pre-fix source');equal(shared['fixtureSource'],CURRENT,'same final native fixture')
  equal(digest(read('final/pre-fix-shared-controls.patch.gz')),shared['testPatchSha256'],'pre-fix overlay patch')
  shared_results=parse_native(read('final/pre-fix-shared.stderr.gz'));equal([r['name'] for r in shared_results],['Table keyboard parity '+name for name in SHARED],'pre-fix shared inventory');equal([r['status'] for r in shared_results],['FAIL']*4+['PASS']*5,'preserved unaffected boundary controls')
  dependency_files=0
  for path,checksum in raw['dependencyFiles'].items():equal(digest((args.repo/'node_modules'/path).read_bytes()),checksum,'dependency bytes');dependency_files+=1
  for name,version in raw['dependencyVersions'].items():equal(json.loads((args.repo/'node_modules'/name/'package.json').read_text())['version'],version,'dependency version')
  if (checkpoint/'artifact-hashes.json').exists():
   for entry in load('artifact-hashes.json')['files']:
    payload=(checkpoint/entry['path']).read_bytes();equal(len(payload),entry['bytes'],'artifact size');equal(digest(payload),entry['sha256'],'artifact hash')
    if entry['path'].endswith('.gz'):equal(digest(gzip.decompress(payload)),entry['decodedSha256'],'decoded hash')
  report={'status':'PASS','candidate':CURRENT,'rawSha256':manifest['rawSha256'],'rawVerdictsRecomputed':verdicts,'candidatePhases':candidate_phases,'fixedOracleChecks':oracle_checks,'sourceModuleHashesVerified':source_files,'dependencyFilesVerified':dependency_files,'restoredSourceCommits':len(manifest['preservedSources']),'nativeCases':30,'oldTerminalCases':1,'guardUnitCases':24,'preFixSharedCases':{'FAIL':4,'PASS':5},'sources':summaries,'note':'Author-side offline audit. Separate peer review is not claimed by this script.'}
  if args.output:args.output.write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2))

if __name__=='__main__':main()
