from pathlib import Path
from collections import Counter
import gzip, hashlib, json, os, re, subprocess, sys, tempfile

root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
checkpoint=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent

# Published counterparts can have different commit metadata and parents.
# Restore the actual compared commits without changing repository objects,
# refs or index; a fresh clone only needs the published base and this archive.
git_environment=dict(os.environ)
for name in ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_COMMON_DIR']:
 git_environment.pop(name,None)
git_environment.update(GIT_OPTIONAL_LOCKS='0',GIT_NO_REPLACE_OBJECTS='1')
object_directory=subprocess.check_output(['git','rev-parse','--path-format=absolute','--git-path','objects'],cwd=root,env=git_environment,text=True).strip()
temporary=tempfile.TemporaryDirectory(prefix='person-parity-source-')
scratch=Path(temporary.name);(scratch/'objects').mkdir()
git_environment.update(GIT_INDEX_FILE=str(scratch/'index'),GIT_OBJECT_DIRECTORY=str(scratch/'objects'),GIT_ALTERNATE_OBJECT_DIRECTORIES=object_directory)
def git(*args,input=None):
 return subprocess.check_output(['git',*args],cwd=root,env=git_environment,input=input)
restored_sources=[]
for source in json.loads((checkpoint/'original-source-commits.json').read_text())['sources']:
 commit=source['rawCommit'].encode();patch=gzip.decompress((checkpoint/source['patch']).read_bytes())
 assert hashlib.sha1(b'commit '+str(len(commit)).encode()+b'\0'+commit).hexdigest()==source['sha']
 assert hashlib.sha256(patch).hexdigest()==source['patchSha256']
 git('read-tree',source['base'])
 git('apply','--cached','--binary','--whitespace=nowarn','-',input=patch)
 assert git('write-tree').decode().strip()==source['tree']
 assert git('hash-object','-w','-t','commit','--stdin',input=commit).decode().strip()==source['sha']
 restored_sources.append({'sha':source['sha'],'tree':source['tree']})

def load(name):
 p=checkpoint/name
 return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_text())
def sha(data): return hashlib.sha256(data).hexdigest()
def gitfile(ref,path): return git('show',ref+':'+path)
def equal(actual,expected,message):
 assert actual==expected, message+'\nactual: '+str(actual)[:500]+'\nexpected: '+str(expected)[:500]
def phases(case,legacy=False):
 if case['kind']!='readonly':
  return ['load','prepared','preceding-input','focus','target-range','target-input','undo-target','undo-first','redo-first','redo-target']+([] if legacy else ['invalid-key'])
 return ['load']+(['initial-readonly-profile-1','initial-readonly-profile-0','initial-readonly-profile-2','initial-editable'] if case['initialReadOnly'] else [])+['preceding-input','read-only','retired-readonly','readonly-profile-1','readonly-profile-0','readonly-profile-2','editable-return','retired-editable','continued-input','undo-continuation','undo-first','redo-first','redo-continuation']

# This inventory, author model and transition model are independent of the browser fixture.
cases=[]
for widgets in [False,True]:
 for start in [0,1]:
  for field in ['name','role','bio','url']:
   cases.append(dict(id=f"PERSON_HIDDEN_FOCUS/{'widgets' if widgets else 'literal'}/{start}/{field}",kind='focus',widgets=widgets,start=start,target=0 if start else 1,field=field,backward=start==1 and field!='url'))
for start in [0,1]:
 cases.append(dict(id=f'PERSON_HIDDEN_FOCUS/widgets/{start}/after-widget',kind='focus',widgets=True,start=start,target=0 if start else 1,field='role' if start else 'bio',backward=start==1,afterWidget=True))
for start in [0,1]:
 cases.append(dict(id=f'PERSON_HIDDEN_FOCUS/literal/{start}/numeric-url',kind='focus',widgets=False,start=start,target=0 if start else 1,field='url',backward=False,numericUrl=True))
for widgets in [False,True]:
 for initial in [False,True]:
  cases.append(dict(id=f"PERSON_READONLY_TABS/{'widgets' if widgets else 'literal'}/{'constructed-readonly' if initial else 'mode-transition'}",kind='readonly',widgets=widgets,initialReadOnly=initial,keyboard=False))
for initial in [False,True]:
 cases.append(dict(id=f"PERSON_READONLY_TABS/keyboard/{'constructed-readonly' if initial else 'mode-transition'}",kind='readonly',widgets=False,initialReadOnly=initial,keyboard=True))
for start in [0,1]:
 cases.append(dict(id=f'PERSON_PUBLIC_FOCUS_NATIVE_NAVIGATION/{start}',kind='public-navigation',widgets=False,start=start,target=0 if start else 1,field='name',backward=False))
case_index={case['id']:case for case in cases}
people=[('alpha','Alpha','Owner','First biography','#123456'),('bravo','Bravo','Editor','Second biography','#654321'),('charlie','Charlie','Writer','Third biography','#abcdef')]
def document(case,first=False,second=False):
 profiles=[]; inline={}
 for index,(identifier,name,role,bio,color) in enumerate(people):
  profile={'id':identifier,'avatar':'','name':'<b>'+name+'</b>','role':'<i>'+role+'</i>','bio':'<mark>'+bio+'</mark>','links':[{'id':identifier+'-site','type':'website','url':'https://example.com/'+identifier}]}
  if case['widgets']:
   profile['name']+=' <i>{{'+identifier+'Name}}</i> tail'
   profile['role']+=' {{'+identifier+'Role}} tail'
   profile['bio']+=' {{'+identifier+'Bio}} tail'
   inline[identifier+'Name']={'type':'mention','dataVersion':1,'data':{'id':identifier,'name':name+' Person'}}
   inline[identifier+'Role']={'type':'color','dataVersion':1,'data':{'value':color}}
   inline[identifier+'Bio']={'type':'mention','dataVersion':1,'data':{'id':identifier+'-bio','name':'Author'}}
  first_index=1 if case['kind']=='readonly' else case['start']
  if first and index==first_index:
   profile['bio']=profile['bio']+'A' if case['widgets'] else '<mark>'+bio+'A</mark>'
  if second and index==(2 if case['kind']=='readonly' else case['target']):
   if case['kind']=='readonly':
    profile['bio']=profile['bio']+'X' if case['widgets'] else '<mark>'+bio+'X</mark>'
   else:
    field=case['field']
    if field=='url':
     url='https://example.com/'+identifier; offset=22 if case.get('numericUrl') else len(url)
     profile['links'][0]['url']=url[:offset]+'X'+url[offset:]
    elif case.get('afterWidget'):
     profile[field]=profile[field][:-4]+('tXil' if case['backward'] else 'taXil')
    else:
     value={'name':name,'role':role,'bio':bio}[field]
     changed=value[:1]+'X'+value[2:] if case['backward'] else value[:2]+'X'+value[2:]
     opening={'name':'<b>','role':'<i>','bio':'<mark>'}[field]
     profile[field]=profile[field].replace(opening+value,opening+changed,1)
  profiles.append(profile)
 person={'id':'profiles','type':'person','dataVersion':2,'data':{'persons':profiles}}
 if case['widgets']: person['inline']=inline
 return [{'id':'before','type':'paragraph','dataVersion':2,'data':{'text':'Before'}},person,{'id':'after','type':'paragraph','dataVersion':2,'data':{'text':'After'}}]
def point(offset,focus=None):
 focus=offset if focus is None else focus
 return {'focused':True,'anchor':offset,'focus':focus,'collapsed':offset==focus}
def size(case,index,field):
 return len(people[index][{'name':1,'role':2,'bio':3}[field]])+(7 if case['widgets'] else 0)
def expected_state(case,phase):
 is_readonly=case['kind']=='readonly'
 original=phase in ['load','prepared','initial-editable','undo-first'] or phase.startswith('initial-readonly-')
 final=phase in ['target-input','redo-target','invalid-key','continued-input','redo-continuation']
 records=document(case,first=not original,second=final)
 count=0 if original and phase!='undo-first' else 1
 if phase in ['target-input','continued-input']: count=2
 if phase in ['undo-target','undo-continuation']: count=3
 if phase=='undo-first': count=4
 if phase=='redo-first': count=5
 if phase in ['redo-target','invalid-key','redo-continuation']: count=6
 history=[False,False] if count==0 or phase in ['read-only','retired-readonly'] or phase.startswith('readonly-profile-') else [True,False]
 if phase in ['undo-target','undo-continuation','redo-first']: history=[True,True]
 if phase=='undo-first': history=[False,True]
 if is_readonly:
  active=0 if phase=='load' else 2
  if 'profile-' in phase: active=int(phase[-1])
  elif phase in ['preceding-input','read-only','retired-readonly','undo-first','redo-first']: active=1
  selected=None
  if phase in ['preceding-input','continued-input','undo-continuation','undo-first','redo-first','redo-continuation']:
   selected=point(size(case,active,'bio')+(0 if phase in ['undo-continuation','undo-first'] else 1))
 else:
  active=0 if phase=='load' else case['start'] if phase in ['prepared','preceding-input','undo-first','redo-first'] else case['target']
  selected=None
  if phase in ['preceding-input','undo-first','redo-first']: selected=point(size(case,case['start'],'bio')+(0 if phase=='undo-first' else 1))
  elif phase not in ['load','prepared']:
   offset=size(case,case['target'],case['field'])-2 if case.get('afterWidget') else (22 if case.get('numericUrl') else 20+len(people[case['target']][0])) if case['field']=='url' else 2
   if phase in ['target-input','redo-target','invalid-key']: selected=point(offset+(0 if case['backward'] else 1))
   elif phase in ['target-range','undo-target']: selected=point(offset,offset-1 if case['backward'] else offset)
   else: selected=point(offset)
 return records,active,history,count,selected

raw=load('comparison-final.json.gz'); metadata=load('comparison-final.meta.json'); native=load('native-final.meta.json')
equal(raw['filter'],'','Comparison unexpectedly filtered')
equal(raw['sourceUnchanged'],True,'Compared source changed')
equal(raw['headBefore'],raw['headAfter'],'Comparison HEAD changed')
equal(raw['serverErrors'],[],'Unexpected server error')
equal(metadata['actualExitCode'],1,'Historical failures must retain nonzero process status')
equal(native['actualExitCode'],0,'Native gate failed')
for item in [metadata,native]:
 equal(item['headBefore'],raw['headBefore'],'Execution source mismatch')
 equal(item['headAfter'],raw['headBefore'],'Source changed during execution')
 equal(item['trackedCleanBefore'],True,'Execution started dirty')
 equal(item['trackedCleanAfter'],True,'Execution finished dirty')
 for stream in ['stdout','stderr']:
  path=checkpoint/(item[stream+'File']+'.gz')
  equal(sha(gzip.decompress(path.read_bytes())),item[stream+'Sha256'],'Stream hash mismatch: '+str(path))
for key,path in [('runnerSha256','scripts/parity/person-modes.mjs'),('fixtureSha256','tests/browser/person-modes-parity-fixture.js')]:
 equal(sha(gitfile(raw['fixtureSource'],path)),raw[key],'Committed source hash mismatch: '+path)
 equal(raw[key],metadata[key],'Runner supervisor source mismatch')
source_summary=[]
for source,result in zip(raw['sources'],raw['results'],strict=True):
 equal(source['label'],result['source'],'Source ordering mismatch')
 expected_sha={'v1':'5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340','spec-baseline':'e981ff308000c1d92d7e820df95113c1e19bcee8','candidate':raw['headBefore']}[source['label']]
 equal(source['sha'],expected_sha,'Pinned source mismatch')
 equal(git('rev-parse',source['sha']+'^{tree}').decode().strip(),source['tree'],'Tree mismatch')
 for path,checksum in source['loaded'].items(): equal(sha(gitfile(source['sha'],path)),checksum,'Served module mismatch: '+source['label']+'/'+path)
 equal([entry['id'] for entry in result['cases']],[case['id'] for case in cases],'Case inventory mismatch')
 truthful=0; complete=[]; unsupported=[]; failures=[]
 for entry in result['cases']:
  case=case_index[entry['id']]; equal(entry['spec'],case,'Case specification mismatch')
  legacy=source['label']=='v1'
  missing=legacy and (case['kind']=='focus' or case['widgets'] or case.get('keyboard',False))
  if missing:
   assert entry.get('unsupported'), 'Missing legacy capability must be explicit'
   for key in ['observations','snapshots','trusted','plannedPhases','completedPhases','pageErrors','diagnostics']: equal(entry[key],[],'Unsupported capability was fabricated: '+key)
   equal(entry['error'],None,'Unsupported capability unexpectedly threw')
   unsupported.append(entry['id']); continue
  assert not entry.get('unsupported'), 'Executed capability was hidden as unsupported'
  expected_phases=phases(case,legacy)
  equal(entry['plannedPhases'],expected_phases[:len(entry['plannedPhases'])],'Planned phase ordering mismatch')
  equal(entry['completedPhases'],expected_phases[:len(entry['completedPhases'])],'Completed phase ordering mismatch')
  equal([snapshot['phase'] for snapshot in entry['snapshots']],entry['completedPhases'],'Snapshot inventory mismatch')
  if not entry['error'] and entry['completedPhases']==expected_phases: complete.append(entry['id'])
  for observation in entry['observations']:
   verdict='PASS' if observation.get('actual')==observation.get('expected') else 'FAIL'
   equal(observation['status'],verdict,'Stored verdict changed after capture')
   truthful+=1
   if verdict=='FAIL': failures.append({'id':entry['id'],**observation})
  if source['label']=='candidate':
   equal(entry['error'],None,'Candidate exception')
   equal(entry['pageErrors'],[],'Candidate page error')
   equal(entry['diagnostics'],[],'Candidate diagnostic')
   equal(entry['completedPhases'],expected_phases,'Candidate incomplete case')
   for snapshot in entry['snapshots']:
    phase=snapshot['phase']; records,active,history,count,selected=expected_state(case,phase)
    equal(snapshot['actual'],records,'Independent author records mismatch: '+entry['id']+'/'+phase)
    equal(snapshot['active'],active,'Independent active profile mismatch')
    equal(snapshot['history'],history,'Independent availability/history mismatch')
    equal(len(snapshot['transactions']),count,'Presentation added history')
    equal(snapshot['selection'],selected,'Independent selection mismatch: '+entry['id']+'/'+phase)
    canonical=[o for o in entry['observations'] if o['phase']==phase and o['property']=='canonicalRecords']
    equal(len(canonical),1,'Missing canonical observation')
    equal(canonical[0]['expected'],records,'Fixture author oracle diverges from independent records')
   for input_phase in ['preceding-input','continued-input' if case['kind']=='readonly' else 'target-input']:
    equal([event['trusted'] for event in entry['trusted'] if event['phase']==input_phase and event['kind']=='input'],[True],'Missing trusted author input: '+entry['id']+'/'+input_phase)
   if case['kind']=='focus':
    equal([o['actual'] for o in entry['observations'] if o['property']=='firstRequestAccepted'],[True],'First keyed focus not acknowledged')
   if case['kind']!='readonly':
    equal([o['actual'] for o in entry['observations'] if o['property']=='sameBlockCurrentEvents'],[[]],'Same-block reveal published current change')
    equal([o['actual'] for o in entry['observations'] if o['property']=='invalidHiddenKeyRejected'],[False],'Missing invalid-key control')
   else:
    for prefix in (['initial-readonly','readonly'] if case['initialReadOnly'] else ['readonly']):
     for index in [1,0,2]:
      phase=f'{prefix}-profile-{index}'
      for field in ['name','url']:
       equal([o['actual'] for o in entry['observations'] if o['phase']==phase and o['property']=='readonlyKeyAttempt:'+field],[[{'key':'Z','trusted':True}]],'Denied author attempt was not actually delivered')
      equal([o['actual'] for o in entry['observations'] if o['phase']==phase and o['property']=='readonlyInputEvents'],[[]],'Readonly attempt emitted input')
    equal([o['actual'] for o in entry['observations'] if o['property']=='decisiveRetiredControlsPresent'],[6],'Missing decisive retired control')
 equal(result['failures'],failures,'Aggregated raw failures differ')
 equal([entry['id'] for entry in result['unsupportedCases']],unsupported,'Unsupported count differs')
 expected_incomplete=[entry['id'] for entry in result['cases'] if entry['id'] not in complete+unsupported]
 equal([entry['id'] for entry in result['incompleteCases']],expected_incomplete,'Incomplete inventory differs')
 source_summary.append({'source':source['label'],'sha':source['sha'],'loadedModules':len(source['loaded']),'cases':len(cases),'completedCases':len(complete),'unsupportedCases':len(unsupported),'observations':truthful,'rawFailures':len(failures),'incompleteCases':len(expected_incomplete),'pageErrors':len(result['errors']),'casePageErrors':len(result['casePageErrors']),'diagnostics':len(result['caseDiagnostics']),'failedProperties':dict(Counter(o['property'] for o in failures))})
 if source['label']=='candidate':
  for key in ['failures','incompleteCases','errors','casePageErrors','caseDiagnostics']: equal(result[key],[],'Candidate gate failure: '+key)
for path,checksum in raw['dependencyFiles'].items(): equal(sha((root/'node_modules'/path).read_bytes()),checksum,'Dependency bytes mismatch')
native_bytes=gzip.decompress((checkpoint/'native-final.log.gz').read_bytes()).decode()
equal(native_bytes.splitlines()[0],'Native native-plugin-parity.html: 28 passed','Native count mismatch')
native_cases=json.loads(native_bytes.splitlines()[1])['native-plugin-parity.html']
equal(native_cases,[{'name':'Person mode parity '+case['id'],'status':'PASS'} for case in cases],'Native case inventory mismatch')
equal(raw['candidatePass'],True,'Candidate falsely failed')
summary={'audit':'PASS','fixtureSource':raw['fixtureSource'],'fixtureSha256':raw['fixtureSha256'],'runnerSha256':raw['runnerSha256'],'nativeCases':len(native_cases),'candidatePlannedPhases':sum(len(phases(case)) for case in cases),'truthfulStoredVerdicts':sum(item['observations'] for item in source_summary),'sources':source_summary,'dependencyFilesVerified':len(raw['dependencyFiles']),'actualComparisonExit':metadata['actualExitCode'],'actualNativeExit':native['actualExitCode'],'productionChanged':False,'limits':['Chrome 156/Linux; recorded three-profile author cases only.','v1 lacks keyed/numeric public focus and persistent Person widgets; those capabilities remain unsupported.','No renderer, avatar/provider, structural card reordering or full link-action acceptance is asserted.','Historical raw failures and incomplete executions remain failures; no classifier changes their status.']}
summary['restoredOriginalSources']=restored_sources
print(json.dumps(summary,indent=2))
