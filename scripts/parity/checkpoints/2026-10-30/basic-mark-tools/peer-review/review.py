#!/usr/bin/env python3
"""Independent review of recorded public mark actions; imports no fixture code."""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path

STYLE = 'style(color:rgb(128, 0, 0))'
LINK = 'a[["href","/kept"],["rel","noopener noreferrer"]]'

def units(tokens):
    result = []
    for token in tokens:
        values = token['text'] if token['kind'] == 'text' else [token['text']]
        result.extend((token['kind'], char, tuple(sorted(token['marks']))) for char in values)
    return result

def fixed_fields(spec, typed=False):
    target = {'bold':'b', 'italic':'i', 'strikethrough':'s'}[spec['tool']]
    edge = 'i' if target == 'b' else 'b'
    middle = 'i' if target == 's' else 's'
    first, last = [], []
    def text(out, word, *marks):
        out.extend(('text', char, tuple(sorted(set(marks)))) for char in word)
    def widgets(out):
        out.append(('widget','{{swatch}}',()))
        text(out,' ')
        out.append(('widget','{{mention}}',()))
    if spec.get('lifetime'):
        text(first,'Abc',edge,target); text(first,' '); widgets(first); text(first,' Tail')
        return [first]
    text(first,('X' if typed else '')+'un')
    if spec.get('noop'):
        widgets(first); text(first,' rest'); return [first]
    existing = [target] if spec['variant'] != 'apply' else []
    text(first,'Alpha',edge,*existing)
    if spec['variant'] == 'nested':
        text(first,' '); widgets(first); text(first,' rest'); return [first]
    text(first,' Plain '); text(first,'MiXeD & tail',middle,STYLE,*existing)
    first.append(('break','\n',()))
    text(first,'Link',edge,LINK,*existing); text(first,' '); widgets(first)
    text(last,'Bravo',edge,*existing); text(last,' rest')
    if spec['shape'] == 'single':
        text(first,' '); first.extend(last); return [first]
    return [first,last]

def changed_fields(spec):
    fields = fixed_fields(spec,typed=not spec.get('lifetime') and not spec.get('noop'))
    target = {'bold':'b', 'italic':'i', 'strikethrough':'s'}[spec['tool']]
    if spec.get('noop'): return fields
    if spec.get('lifetime'): start,end = 0,3
    elif spec['variant'] == 'nested':
        start,end = (3,8) if spec['boundary']=='Element' else (5,6)
    else:
        start=3 if spec['boundary']=='Element' else 5
        end=sum(map(len,fields))-len(' rest')-(0 if spec['boundary']=='Element' else 2)
    position = 0
    for field in fields:
        for index,(kind,char,marks) in enumerate(field):
            if start <= position < end and kind=='text':
                marks=set(marks)
                if spec.get('variant')=='apply': marks.add(target)
                else: marks.discard(target)
                field[index]=(kind,char,tuple(sorted(marks)))
            position+=1
    return fields

def main():
    parser=argparse.ArgumentParser();parser.add_argument('checkpoint',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();payload=gzip.decompress((args.checkpoint/'final-differential.json.gz').read_bytes());raw=json.loads(payload)
    checks=0
    def same(actual,expected,context):
        nonlocal checks
        assert actual==expected,(context,actual,expected)
        checks+=1
    summaries=[]
    for row in raw['results']:
        failures=0
        for case in row['cases']:
            for value in case['observations']:
                equal=value['actual']==value['expected']
                same(value['status'],'PASS' if equal else 'FAIL',(row['source'],case['id'],value['phase'],value['property']))
                failures+=not equal
        summaries.append({'source':row['source'],'cases':len(row['cases']),'observations':sum(len(c['observations']) for c in row['cases']),'failures':failures,'incomplete':sum(bool(c['error']) for c in row['cases'])})
    current=next(r for r in raw['results'] if r['source']=='candidate')
    same(len(current['cases']),96,'candidate case inventory')
    same(collections.Counter(c['spec']['tool'] for c in current['cases']),collections.Counter(bold=32,italic=32,strikethrough=32),'tool inventory')
    for case in current['cases']:
        spec=case['spec']; same(case['error'],None,(case['id'],'complete'));same(case['completedPhases'],case['planned'],(case['id'],'phase order'))
        same(case['unsupported'],[],(case['id'],'unsupported'));same(case['diagnostics'],[],(case['id'],'diagnostics'))
        lookup={(o['phase'],o['property']):o['actual'] for o in case['observations']}
        initial=fixed_fields(spec); changed=changed_fields(spec)
        def expect_meaning(phase,property,expected):
            observed=lookup[phase,property]
            if spec.get('lifetime'):observed=[observed]
            same([units(f) for f in observed],expected,(case['id'],phase,property))
        expect_meaning('load','fixedInputMeaning',initial)
        expect_meaning('load','visibleTextAndMarks',initial)
        if spec.get('lifetime'):
            for phase,property in [('live-action','liveCapabilityStillWorks'),('live-action','visibleTextAndMarks'),('redo','visibleTextAndMarks')]:expect_meaning(phase,property,changed)
            expect_meaning('undo','visibleTextAndMarks',initial)
            same(lookup['inactive-ui','oldProducerSilent'],0,(case['id'],'old callback'))
            same(lookup['live-action','oneCompletedAction'],['commit'],(case['id'],'live action'))
        else:
            typed=fixed_fields(spec,True);expect_meaning('input','independentPrecedingEdit',typed)
            expect_meaning('apply','intendedTextAndMarks',changed);expect_meaning('apply','visibleTextAndMarks',changed)
            same(lookup['apply','liveWidgetIdentity'],True,(case['id'],'widget identity'))
            same(lookup['apply','producerCalls'],1,(case['id'],'single producer'))
            for phase,expected in [('undo-input',initial),('redo-input',typed)]:expect_meaning(phase,'visibleTextAndMarks',expected)
            if not spec.get('noop'):
                expect_meaning('undo-action','visibleTextAndMarks',typed);expect_meaning('redo-action','visibleTextAndMarks',changed)
                same(lookup['redo-action','exactCompletedActions'],['commit','commit','undo','undo','redo','redo'],(case['id'],'independent history'))
            else:same(lookup['apply','history'],{'canUndo':False,'canRedo':True},(case['id'],'redo preserved'))
    same(raw['candidatePass'],True,'candidate summary');same(raw['serverErrors'],[],'server errors')
    report={'status':'PASS','reviewer':'root (independent of basic-tools author)','candidate':next(s['sha'] for s in raw['sources'] if s['label']=='candidate'),'rawSha256':hashlib.sha256(payload).hexdigest(),'checks':checks,'sources':summaries,'scope':['TOOL_BOLD_ACTION','TOOL_ITALIC_ACTION','TOOL_STRIKETHROUGH_ACTION'],'limits':['Recorded Chrome only','Selections installed through DOM; no physical drag claim','Other inline widget features remain outside scope']}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
