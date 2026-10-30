#!/usr/bin/env python3
"""Independent fixed-state review; no production or browser-fixture imports."""
import argparse
import collections
import copy
import gzip
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

BASE = 'd67229c08f5fae7101cb2a252f2d56385224da08'
BEFORE = '01fb551a9542ddd94e6b5652f637193875b55888'
AFTER = '3a16cf9fe64046780d4573464387dd2eb864b80e'
GRID = [['<b>Alpha</b> {{mention}} {{swatch}} tail', '<i>Bravo</i> tail'],
        ['<s>Charlie</s> &amp; tail', '<b>Delta</b> {{otherMention}} {{otherSwatch}} fin']]
SUFFIX = ' {{mention}} {{swatch}} tailX'
BROKEN = {
    'start': ('<b><br>Alpha</b>'+SUFFIX, '<b><br>YAlpha</b>'+SUFFIX, 0, 0),
    'middle': ('<b>Al<br>pha</b>'+SUFFIX, '<b>Al<br>Ypha</b>'+SUFFIX, 2, 2),
    'mark-end': ('<b>Alpha<br></b>'+SUFFIX, '<b>Alpha<br>Y</b>'+SUFFIX, 5, 5),
    'forward-range': ('<b>A<br>a</b>'+SUFFIX, '<b>A<br>Ya</b>'+SUFFIX, 1, 4),
    'backward-range': ('<b>A<br>a</b>'+SUFFIX, '<b>A<br>Ya</b>'+SUFFIX, 4, 1),
    'before-widget': ('<b>Alpha</b> <br>{{mention}} {{swatch}} tailX', '<b>Alpha</b> <br>Y{{mention}} {{swatch}} tailX', 6, 6),
    'after-widget': ('<b>Alpha</b> {{mention}}<br> {{swatch}} tailX', '<b>Alpha</b> {{mention}}<br>Y {{swatch}} tailX', 7, 7),
}
INLINE = {
    'mention': {'type':'mention','dataVersion':1,'data':{'id':'ada','name':'Ada'}},
    'swatch': {'type':'color','dataVersion':1,'data':{'value':'#123456'}},
    'otherMention': {'type':'mention','dataVersion':1,'data':{'id':'grace','name':'Grace'}},
    'otherSwatch': {'type':'color','dataVersion':1,'data':{'value':'#654321'}},
}

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

def sha(value):
    return hashlib.sha256(value).hexdigest()

class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.result=[];self.stack=[self.result];self.feed(html)
    def handle_starttag(self, tag, attributes):
        entry={'tag':tag,'attributes':dict(attributes),'children':[]};self.stack[-1].append(entry)
        if tag!='br':self.stack.append(entry['children'])
    def handle_endtag(self, tag):
        self.stack.pop()
    def handle_data(self, data):
        if self.stack[-1] and isinstance(self.stack[-1][-1], str):self.stack[-1][-1]+=data
        else:self.stack[-1].append(data)

def specs():
    result=[]
    for headed, label in [(False,'body'),(True,'headed')]:
        prefix='TABLE_KEYBOARD/'+label+'/'
        result.append({'id':prefix+'navigation','headings':headed,'action':'navigation'})
        for variant in BROKEN:
            result.append({'id':prefix+'enter-'+variant,'headings':headed,'action':'enter','variant':variant})
        result.append({'id':prefix+'shift-enter-backward-range','headings':headed,'action':'enter','variant':'backward-range','shift':True})
    for suffix,action,headings in [('auxiliary-native','auxiliary',True),('missing-key','missing',False),('retired-key','retired',True)]:
        result.append({'id':'TABLE_KEYBOARD/ownership/'+suffix,'headings':headings,'action':action})
    return result

def phases(spec):
    if spec['action']=='navigation':
        return ['load','input','tab-1','tab-2','tab-3','tab-last','shift-tab-2','shift-tab-1','shift-tab-0','shift-tab-first','undo-input','redo-input']
    if spec['action']=='enter':
        return ['load','input','selection','enter','continuation','undo-continuation','undo-enter','undo-input','redo-input','redo-enter','redo-continuation']
    retired=spec['action']=='retired'
    return ['load','input']+(['remove-row'] if retired else [])+['control-focus','control-enter','control-input','control-undo']+(['undo-remove'] if retired else [])+['undo-input','redo-input']+(['redo-remove'] if retired else [])

def grid_at(spec, phase):
    grid=copy.deepcopy(GRID)
    if phase not in ['load','undo-input']:grid[0][0]+='X'
    if spec['action']=='enter':
        broken,continued,_,_=BROKEN[spec['variant']]
        if phase in ['enter','undo-continuation','redo-enter']:grid[0][0]=broken
        if phase in ['continuation','redo-continuation']:grid[0][0]=continued
    if spec['action']=='retired' and phase in ['remove-row','control-focus','control-enter','control-input','control-undo','redo-remove']:grid=grid[:1]
    return grid

def document(spec, phase):
    grid=grid_at(spec,phase)
    inline=INLINE if len(grid)==2 else {k:v for k,v in INLINE.items() if not k.startswith('other')}
    return [{'id':'table','type':'table','dataVersion':2,'data':{
        'withHeadings':spec['headings'],
        'rows':[{'id':'row-'+str(r),'cells':[{'id':f'cell-{r}-{c}','text':text} for c,text in enumerate(row)]} for r,row in enumerate(grid)]},
        'inline':copy.deepcopy(inline)}]

def selection(field, anchor, focus=None):
    focus=anchor if focus is None else focus
    return {'focused':field,'anchor':{'field':field,'offset':anchor},'focus':{'field':field,'offset':focus},'collapsed':anchor==focus}

def caret_at(spec, phase):
    if phase=='input' or phase=='redo-input':return selection(0,15)
    if phase=='undo-input':return selection(0,14)
    if spec['action']=='enter':
        _,_,anchor,focus=BROKEN[spec['variant']]
        if phase in ['selection','undo-enter']:return selection(0,anchor,focus)
        if phase in ['enter','undo-continuation','redo-enter']:return selection(0,min(anchor,focus)+1)
        if phase in ['continuation','redo-continuation']:return selection(0,min(anchor,focus)+2)
    if spec['action']=='navigation':
        if phase in ['tab-1','tab-2','tab-3']:return selection(int(phase[-1]),0)
        if phase in ['shift-tab-0','shift-tab-1','shift-tab-2']:
            index=int(phase[-1]);return selection(index,[15,10,14][index])
    return None

def history_at(spec,phase):
    if phase=='load':return {'canUndo':False,'canRedo':False}
    if phase=='undo-input':return {'canUndo':False,'canRedo':True}
    redo=phase in ['undo-continuation','undo-enter','undo-remove','redo-enter'] or (phase=='redo-input' and spec['action'] in ['enter','retired'])
    return {'canUndo':True,'canRedo':redo}

def actions_at(spec,phase):
    if spec['action']=='enter':
        return {'load':0,'input':1,'selection':1,'enter':2,'continuation':3,'undo-continuation':4,'undo-enter':5,'undo-input':6,'redo-input':7,'redo-enter':8,'redo-continuation':9}[phase]
    if phase=='load':return 0
    if spec['action']=='retired':
        return {'input':1,'remove-row':2,'control-focus':2,'control-enter':2,'control-input':2,'control-undo':2,'undo-remove':3,'undo-input':4,'redo-input':5,'redo-remove':6}[phase]
    return 2 if phase=='undo-input' else 3 if phase=='redo-input' else 1

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,required=True);parser.add_argument('--raw',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    checkpoint=Path(__file__).resolve().parent
    data=args.raw.read_bytes();data=gzip.decompress(data) if args.raw.suffix=='.gz' else data;raw=json.loads(data)
    checks=0
    def equal(actual,expected,context):
        nonlocal checks
        assert canonical(actual)==canonical(expected),(context,str(actual)[:400],str(expected)[:400]);checks+=1
    env=os.environ.copy()
    for name in ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_COMMON_DIR']:env.pop(name,None)
    env.update(GIT_OPTIONAL_LOCKS='0',GIT_NO_REPLACE_OBJECTS='1')
    def git(*parts,input=None):return subprocess.check_output(['git','-C',str(args.repo),*parts],env=env,input=input)
    with tempfile.TemporaryDirectory(prefix='table-peer-proof-') as scratch:
        objects=Path(scratch)/'objects';objects.mkdir();original_objects=git('rev-parse','--path-format=absolute','--git-path','objects').decode().strip()
        env.update(GIT_INDEX_FILE=str(Path(scratch)/'index'),GIT_OBJECT_DIRECTORY=str(objects),GIT_ALTERNATE_OBJECT_DIRECTORIES=original_objects)
        source_records=json.loads((checkpoint/'sources.json').read_text())
        for record in source_records['restorableSources']:
            commit=record['rawCommit'].encode();equal(hashlib.sha1(b'commit '+str(len(commit)).encode()+b'\0'+commit).hexdigest(),record['sha'],'original commit hash')
            patch=gzip.decompress((checkpoint/record['patch']).read_bytes());equal(sha(patch),record['patchSha256'],'patch digest')
            git('read-tree',BASE);git('apply','--cached','--binary','--whitespace=nowarn','-',input=patch)
            equal(git('write-tree').decode().strip(),record['tree'],'restored source tree')
            equal(git('hash-object','-w','-t','commit','--stdin',input=commit).decode().strip(),record['sha'],'restored commit')
        equal(raw['headBefore'],AFTER,'fixture source');equal(raw['headAfter'],AFTER,'unchanged head');equal(raw['filter'],'','complete filter');equal(raw['serverErrors'],[],'server channel')
        equal(sha(git('show',AFTER+':tests/browser/table-keyboard-parity-fixture.js')),raw['fixtureSha256'],'fixture bytes')
        equal(sha(git('show',AFTER+':scripts/parity/table-keyboard-parity.mjs')),raw['runnerSha256'],'runner bytes')
        equal(raw['candidatePass'],True,'candidate result')
        equal([(item['label'],item['sha']) for item in raw['sources']],
              [('v1','5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'),
               ('spec-baseline','e981ff308000c1d92d7e820df95113c1e19bcee8'),
               ('pre-fix',BEFORE),('candidate',AFTER)],'four immutable source identities')
        unit=json.loads((checkpoint/'core-unit.meta.json').read_text())
        equal(unit['source'],AFTER,'unit source');equal(unit['actualExitCode'],0,'actual unit exit');equal(unit['sourceUnchanged'],True,'unit source unchanged')
        stdout=gzip.decompress((checkpoint/'core-unit.stdout.gz').read_bytes())
        stderr=gzip.decompress((checkpoint/'core-unit.stderr.gz').read_bytes())
        equal(sha(stdout),unit['stdoutSha256'],'unit stdout hash');equal(sha(stderr),unit['stderrSha256'],'unit stderr hash')
        equal(re.findall(r'^\u2139 tests (\d+)$',stdout.decode(),re.M),['81'],'real unit case inventory')
        equal(re.findall(r'^\u2139 pass (\d+)$',stdout.decode(),re.M),['81'],'real unit pass inventory')
        equal(stderr.decode(),'','unit stderr')
        inventory=specs();summaries=[];served=0;verdicts=0;states=0;oracle=0
        for source,row in zip(raw['sources'],raw['results'],strict=True):
            equal(source['label'],row['source'],'source order');equal(git('rev-parse',source['sha']+'^{tree}').decode().strip(),source['tree'],'source tree')
            for path,digest in source['loaded'].items():equal(sha(git('show',source['sha']+':'+path)),digest,(source['label'],path));served+=1
            equal([c['specification'] for c in row['cases']],inventory,'literal case inventory')
            equal(row['errors'],[],(row['source'],'page errors'))
            failures=[]
            for case in row['cases']:
                spec=case['specification'];equal(case['plannedPhases'],phases(spec),(case['id'],'planned phases'))
                unsupported=source['label']=='v1' and spec['action'] in ['missing','retired']
                if unsupported:
                    assert case['unsupported'];equal(case['completedPhases'],[],(case['id'],'unsupported not executed'));continue
                equal(case['unsupported'],None,(case['id'],'supported execution'));equal(case['error'],None,(case['id'],'error'))
                equal(case['completedPhases'],phases(spec),(case['id'],'completed phases'));equal(case['pageErrors'],[],(case['id'],'case page errors'));equal(case['diagnostics'],[],(case['id'],'diagnostics'))
                for observation in case['observations']:
                    verdict='PASS' if canonical(observation['actual'])==canonical(observation['expected']) else 'FAIL'
                    equal(observation['status'],verdict,(row['source'],case['id'],observation['phase'],observation['property']));verdicts+=1
                    if verdict=='FAIL':failures.append({'id':case['id'],**observation})
                if source['label']!='candidate':continue
                lookup={(o['phase'],o['property']):o for o in case['observations']}
                for snapshot in case['phases']:
                    phase=snapshot['phase'];grid=grid_at(spec,phase);expected=document(spec,phase)
                    equal(snapshot['blocks'],expected,(case['id'],phase,'independent fixed document'));states+=1
                    shapes=[[Tree(text).result for text in row] for row in grid]
                    visual=[[{'tag':'TH' if spec['headings'] and r==0 else 'TD','markup':Tree(text).result} for text in row] for r,row in enumerate(grid)]
                    for key,value in [('canonicalCells',shapes),('editorCells',visual),('rendererCells',visual),('history',history_at(spec,phase))]:
                        equal(lookup[phase,key]['actual'],value,(case['id'],phase,key));equal(lookup[phase,key]['expected'],value,(case['id'],phase,key,'fixture oracle'));oracle+=2
                    count=actions_at(spec,phase)
                    equal(len(snapshot['transactions']),count,(case['id'],phase,'independent transaction count'))
                    equal(lookup[phase,'completedActions']['actual'],count,(case['id'],phase,'reported transaction count'));oracle+=2
                    caret=caret_at(spec,phase)
                    if caret is not None:equal(snapshot['selection'],caret,(case['id'],phase,'independent caret'));oracle+=1
                assert case['trusted'] and all(event['trusted'] for event in case['trusted'])
                if spec['action']=='enter':
                    equal(lookup['gestures','continuationBeforeInput']['actual'],True,(case['id'],'native continuation'))
                if spec['action'] in ['missing','retired']:equal(lookup['control-focus','rejectedField']['actual'],False,(case['id'],'invalid field request'))
                if spec['action']=='navigation':
                    for phase in ['tab-last','shift-tab-first']:equal(lookup[phase,'doesNotWrapToAnotherCell']['actual'],-1,(case['id'],phase,'native boundary focus'))
            equal(row['failures'],failures,(row['source'],'raw failures retained'))
            summaries.append({'source':source['label'],'recordedCases':len(row['cases']),'executedCases':len(row['cases'])-len(row['unsupportedCases']),'observations':sum(len(c['observations']) for c in row['cases']),'failures':len(failures),'unsupported':len(row['unsupportedCases']),'incomplete':len(row['incompleteCases'])})
        pre=next(row for row in raw['results'] if row['source']=='pre-fix')
        expected_red=collections.Counter((f'TABLE_KEYBOARD/{headed}/enter-mark-end',phase,property) for headed in ['body','headed'] for phase in ['continuation','redo-continuation'] for property in ['canonicalCells','editorCells','rendererCells'])
        observed_red=collections.Counter((f['id'],f['phase'],f['property']) for f in pre['failures'])
        equal(sorted(observed_red.items()),sorted(expected_red.items()),'exact RED cause inventory')
        report={'status':'PASS','reviewer':'independent table_core_peer','candidate':AFTER,'preFix':BEFORE,'rawSha256':sha(data),'checks':checks,'verdictsRecomputed':verdicts,'candidatePhaseDocumentsRebuilt':states,'additionalFixedOracleChecks':oracle,'servedSourceFilesVerified':served,'realUnitCases':81,'sources':summaries,'findings':[],'scope':['BLOCK_TABLE_KEYBOARD','shared authored-BR typing repair'],'limits':['Chrome 156/Linux runtime only','No full Paragraph editing/split-merge acceptance','Broad integration gates owned by root; this review does not claim they ran','Unit initial sandbox file-only output is excluded from scenario coverage']}
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
