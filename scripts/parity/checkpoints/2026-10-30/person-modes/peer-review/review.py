#!/usr/bin/env python3
"""Independent literal-record and active-profile review of Person evidence."""
from pathlib import Path
import argparse,collections,copy,gzip,hashlib,json

PEOPLE=[('alpha','Alpha','Owner','First biography','#123456'),('bravo','Bravo','Editor','Second biography','#654321'),('charlie','Charlie','Writer','Third biography','#abcdef')]
TAGS={'name':'b','role':'i','bio':'mark'}

def original(spec):
    persons=[];sidecars={}
    for identifier,name,role,bio,color in PEOPLE:
        person={'id':identifier,'avatar':'','name':f'<b>{name}</b>','role':f'<i>{role}</i>','bio':f'<mark>{bio}</mark>','links':[{'id':identifier+'-site','type':'website','url':'https://example.com/'+identifier}]}
        if spec['widgets']:
            for field,kind,payload in [('name','mention',{'id':identifier,'name':name+' Person'}),('role','color',{'value':color}),('bio','mention',{'id':identifier+'-bio','name':'Author'})]:
                widget=identifier+field.capitalize();placeholder='{{'+widget+'}}'
                person[field]+=(' <i>'+placeholder+'</i> tail') if field=='name' else (' '+placeholder+' tail')
                sidecars[widget]={'type':kind,'dataVersion':1,'data':payload}
        persons.append(person)
    block={'id':'profiles','type':'person','dataVersion':2,'data':{'persons':persons}}
    if sidecars:block['inline']=sidecars
    return [{'id':'before','type':'paragraph','dataVersion':2,'data':{'text':'Before'}},block,{'id':'after','type':'paragraph','dataVersion':2,'data':{'text':'After'}}]

def append_bio(document,spec,index,character):
    value=document[1]['data']['persons'][index]['bio']
    document[1]['data']['persons'][index]['bio']=value+character if spec['widgets'] else value[:-7]+character+'</mark>'

def documents(spec):
    start=original(spec);prior=copy.deepcopy(start)
    append_bio(prior,spec,1 if spec['kind']=='readonly' else spec['start'],'A')
    final=copy.deepcopy(prior)
    if spec['kind']=='readonly':append_bio(final,spec,2,'X')
    else:
        row=final[1]['data']['persons'][spec['target']];field=spec['field']
        if field=='url':
            url=row['links'][0]['url'];at=22 if spec.get('numericUrl') else len(url);row['links'][0]['url']=url[:at]+'X'+url[at:]
        elif spec.get('afterWidget'):
            assert row[field].endswith(' tail');row[field]=row[field][:-5]+(' tXil' if spec['backward'] else ' taXil')
        else:
            literal=PEOPLE[spec['target']][{'name':1,'role':2,'bio':3}[field]]
            changed=(literal[0]+'X'+literal[2:]) if spec['backward'] else literal[:2]+'X'+literal[2:]
            opening='<'+TAGS[field]+'>';row[field]=opening+changed+row[field][len(opening)+len(literal):]
    return start,prior,final

def main():
    args=argparse.ArgumentParser();args.add_argument('checkpoint',type=Path);args.add_argument('output',type=Path);opts=args.parse_args()
    payload=gzip.decompress((opts.checkpoint/'comparison-final.json.gz').read_bytes());raw=json.loads(payload);checks=0
    def exact(actual,expected,context):
        nonlocal checks
        assert actual==expected,(context,str(actual)[:600],str(expected)[:600]);checks+=1
    summaries=[]
    for row in raw['results']:
        fail=0
        for case in row['cases']:
            for ob in case['observations']:
                verdict='PASS' if ob['actual']==ob['expected'] else 'FAIL';exact(ob['status'],verdict,(row['source'],case['id'],ob['phase'],ob['property']));fail+=verdict=='FAIL'
        summaries.append({'source':row['source'],'recorded':len(row['cases']),'observations':sum(len(c['observations']) for c in row['cases']),'failures':fail,'unsupported':len(row['unsupportedCases']),'incomplete':len(row['incompleteCases']),'pageErrorEvents':len(row['errors']),'casePageErrorRecords':len(row['casePageErrors']),'diagnostics':len(row['caseDiagnostics'])})
    candidate=next(r for r in raw['results'] if r['source']=='candidate');exact(len(candidate['cases']),28,'inventory')
    exact(collections.Counter(c['spec']['kind'] for c in candidate['cases']),collections.Counter(focus=20,readonly=6,**{'public-navigation':2}),'kind inventory')
    snapshots=0
    for case in candidate['cases']:
        spec=case['spec'];lookup={(o['phase'],o['property']):o['actual'] for o in case['observations']};initial,prior,final=documents(spec)
        exact(case['error'],None,(case['id'],'complete'));exact(case['completedPhases'],case['plannedPhases'],(case['id'],'phase completion'))
        if spec['kind']=='focus':exact(lookup['focus','firstRequestAccepted'],True,(case['id'],'first acknowledgement'))
        for snap in case['snapshots']:
            snapshots+=1;phase=snap['phase']
            is_initial=phase in ['load','prepared','initial-editable','undo-first'] or phase.startswith('initial-readonly-')
            is_final=phase in ['target-input','redo-target','invalid-key','continued-input','redo-continuation']
            exact(snap['actual'],initial if is_initial else final if is_final else prior,(case['id'],phase,'literal full document'))
            if spec['kind']=='readonly':
                active=0 if phase=='load' else 1 if phase in ['preceding-input','read-only','retired-readonly','undo-first','redo-first'] else int(phase[-1]) if 'profile-' in phase else 2
            else:active=0 if phase=='load' else spec['start'] if phase in ['prepared','preceding-input','undo-first','redo-first'] else spec['target']
            exact(snap['active'],active,(case['id'],phase,'active profile'))
            history=[False,False] if phase in ['load','prepared','initial-editable','read-only','retired-readonly'] or 'readonly-profile-' in phase else [False,True] if phase=='undo-first' else [True,True] if phase in ['undo-target','undo-continuation','redo-first'] else [True,False]
            exact(snap['history'],history,(case['id'],phase,'history'))
        if spec['kind']=='readonly':
            for prefix in ['readonly']+(['initial-readonly'] if spec['initialReadOnly'] else []):
                for index in [1,0,2]:
                    phase=prefix+'-profile-'+str(index)
                    exact(lookup[phase,'readonlyInputEvents'],[],(case['id'],phase,'no author input'))
                    exact(lookup[phase,'readonlyRichFields'],[False,False,False],(case['id'],phase,'rich locks'))
                    exact(lookup[phase,'readonlyUrl'],True,(case['id'],phase,'url lock'))
            exact(lookup['editable-return','activeProfile'],2,(case['id'],'noninitial active context retained'))
            for phase in ['retired-readonly','retired-editable']:exact(lookup[phase,'retiredControlsDetached'],[False]*6,(case['id'],phase,'old controls detached'))
        else:
            target=spec['target'];field=spec['field']
            offset=22 if spec.get('numericUrl') else len('https://example.com/'+PEOPLE[target][0]) if field=='url' else len(PEOPLE[target][{'name':1,'role':2,'bio':3}[field]])+5 if spec.get('afterWidget') else 2
            exact(lookup['focus','selection'],{'focused':True,'anchor':offset,'focus':offset,'collapsed':True},(case['id'],'first exact caret'))
            for phase in ['target-range','undo-target']:
                exact(lookup[phase,'selection'],{'focused':True,'anchor':offset,'focus':offset-1 if spec['backward'] else offset,'collapsed':not spec['backward']},(case['id'],phase,'range replay'))
    exact(raw['candidatePass'],True,'candidate pass');exact(raw['sourceUnchanged'],True,'source unchanged');exact(raw['serverErrors'],[],'server channel')
    report={'status':'PASS','reviewer':'root (independent of Person fixture author)','source':raw['headBefore'],'rawSha256':hashlib.sha256(payload).hexdigest(),'checks':checks,'candidateSnapshotsVerified':snapshots,'scope':['BLOCK_PERSON_HIDDEN_FOCUS','BLOCK_PERSON_READONLY_TABS'],'sources':summaries,'limits':['Recorded Chrome only','Legacy missing APIs remain unsupported; no simulated keyed-focus parity','Does not accept Person cards/avatar/links feature rows']}
    opts.output.parent.mkdir(parents=True,exist_ok=True);opts.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
