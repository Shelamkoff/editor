#!/usr/bin/env python3
"""Run the existing C11 gates on one explicit frozen checkout; no gate changes."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import time

GATES = [
    ('typecheck', ['npm', 'run', 'typecheck'], None),
    ('package', ['npm', 'run', 'test:package'], None),
    ('unit', ['npm', 'test'], 'package'),
    ('docs-contract', ['npm', 'run', 'test:docs'], 'package'),
    ('docs-browser', ['npm', 'run', 'docs:check'], 'package'),
    ('ordinary', ['node', 'tests/browser/run.mjs'], 'package'),
    ('native', ['node', 'tests/browser/physical-history.mjs'], 'package'),
    ('heap', ['node', 'tests/browser/heap-gate.mjs'], 'package'),
]

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def emit(**data):
    print(json.dumps({'at': stamp(), **data}), flush=True)

def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def summarize(root, directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    result = {'source': manifest['source'], 'sourceUnchanged': manifest.get('sourceUnchanged'),
              'c11Outcome': manifest['outcome'], 'gates': {}, 'evidenceErrors': []}
    for name, gate in manifest['gates'].items():
        result['gates'][name] = {key: gate.get(key) for key in
            ['outcome', 'command', 'startedAt', 'finishedAt', 'elapsedMs', 'exitCode', 'signal', 'sourceUnchanged']}
        log = directory / (name + '.log')
        if log.exists(): result['gates'][name]['logSha256'] = digest(log)
    def text(name): return (directory / (name + '.log')).read_text(errors='replace')
    def passed(name): return manifest['gates'].get(name, {}).get('outcome') == 'passed'
    decoder = json.JSONDecoder()
    try:
        if passed('unit'):
            log = text('unit')
            result['unit'] = {key: int(re.search(r'(?:#|ℹ) ' + key + r' (\d+)', log).group(1))
                              for key in ['tests', 'pass', 'fail', 'skipped']}
            names = re.findall(r"test\('([^']+)'", (root / 'shared/declarationParity.test.js').read_text())
            missing = [name for name in names if name not in log]
            if missing: raise ValueError('Generated declaration consumer tests absent from npm test: ' + repr(missing))
            result['generatedConsumerTestsIncludedInUnit'] = names
        if passed('ordinary'):
            source = (root / 'tests/browser/run.mjs').read_text()
            labels = re.findall(r"'([^']+)'", re.search(r'const labels = (\[[^\n]+\])', source).group(1))
            labels += re.findall(r"labels\.push\('([^']+)'\)", source)
            log = text('ordinary'); pages = {}
            for label in labels:
                matches = list(re.finditer(r'^' + re.escape(label) + r': ', log, re.M))
                if len(matches) != 1: raise ValueError('Missing or duplicate ordinary page: ' + label)
                value = decoder.raw_decode(log[matches[0].end():])[0]
                if isinstance(value, list):
                    failures = [entry for entry in value if entry.get('status') != 'PASS']
                    if failures: raise ValueError('Ordinary case failure in ' + label)
                    pages[label] = {'cases': len(value), 'passed': len(value)}
                else: pages[label] = {'summary': value, 'countedAsCaseArray': False}
            result['ordinary'] = {'pageCount': len(pages), 'pages': pages}
        if passed('native'):
            source = (root / 'tests/browser/physical-history.mjs').read_text()
            expected = re.findall(r'^    (native[A-Z]\w*),$', source, re.M)
            log = text('native')
            finals = [json.loads(line) for line in log.splitlines() if line.startswith('{"enterScenario":')]
            if len(finals) != 1: raise ValueError('Unfiltered native final object is absent or duplicated')
            value = finals[0]
            if not expected or set(value) != set(expected) | {'enterScenario', 'toolboxScenario', 'historyMatrix'}:
                raise ValueError('Native final keys do not match this frozen runner')
            suites = {}
            for name in expected:
                rows = value[name]
                if not isinstance(rows, list) or not rows or any(row.get('status') != 'PASS' for row in rows):
                    raise ValueError('Incomplete or failing native suite: ' + name)
                suites[name] = {'cases': len(rows), 'passed': len(rows)}
            scenarios = {}
            for name in ['enterScenario', 'toolboxScenario', 'historyMatrix']:
                if not value[name]: raise ValueError('Empty initial native scenario: ' + name)
                scenarios[name] = value[name]
            result['native'] = {'suiteCount': len(suites), 'arrayCases': sum(v['cases'] for v in suites.values()),
                                'suites': suites, 'initialScenarioResults': scenarios,
                                'initialScenariosAreNotAddedToArrayCaseTotal': True}
        if passed('heap'):
            values = [json.loads(line) for line in text('heap').splitlines() if line.startswith('{"sentinels":')]
            if len(values) != 1 or values[0].get('retained') != 0 or 'historyEviction' not in values[0]:
                raise ValueError('The current heap proof did not emit its complete result')
            result['heap'] = values[0]
    except (ValueError, AttributeError, KeyError, TypeError) as error:
        result['evidenceErrors'].append(str(error))
    result['accepted'] = manifest['outcome'] == 'passed' and manifest.get('sourceUnchanged') is True and not result['evidenceErrors']
    (directory / 'integrated-summary.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

def run_gate(command, root, env, name):
    child = subprocess.Popen(command, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    previous = {}
    def interrupt(number, _frame):
        # Signal this C11 owner only; its existing tested handler owns descendants.
        if child.poll() is None: child.send_signal(number)
    for number in [signal.SIGINT, signal.SIGTERM]:
        previous[number] = signal.signal(number, interrupt)
    selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
    start = time.monotonic(); heartbeat = start; pending = b''; tail = b''
    try:
        while selector.get_map():
            for key, _ in selector.select(timeout=1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk: selector.unregister(key.fileobj); continue
                tail = (tail + chunk)[-10000:]; pending += chunk
                while b'\n' in pending:
                    raw, pending = pending.split(b'\n', 1)
                    line = raw.decode(errors='replace')
                    if line.startswith('Native native-') or re.match(r'^[a-z][a-z0-9-]+\.html?: ', line):
                        emit(gate=name, progress=line[:180], elapsedSeconds=round(time.monotonic()-start, 1))
            if time.monotonic() - heartbeat >= 45:
                emit(gate=name, running=True, elapsedSeconds=round(time.monotonic()-start, 1)); heartbeat=time.monotonic()
        code = child.wait()
        emit(gate=name, exitCode=code, elapsedSeconds=round(time.monotonic()-start, 1))
        if code: emit(gate=name, errorTail=tail.decode(errors='replace'))
        return code
    finally:
        selector.close()
        for number, handler in previous.items(): signal.signal(number, handler)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--chrome', type=Path, required=True)
    parser.add_argument('--docs-only-continuation', type=Path, help='Continue only the four remaining gates after the recorded two-line RU documentation repair.')
    parser.add_argument('--execute', action='store_true', help='Without this flag, only print the plan; never start a browser.')
    args = parser.parse_args(); root=args.root.resolve(); chrome=args.chrome.resolve()
    if git(root,'rev-parse','HEAD') != args.expected_head: parser.error('The checkout is not at the expected immutable head')
    if git(root,'status','--porcelain'): parser.error('The verification checkout must be clean, including nonignored untracked files')
    if not chrome.is_file(): parser.error('Chrome executable does not exist')
    source = {'head':args.expected_head,'tree':git(root,'rev-parse','HEAD^{tree}'),'lockSha256':digest(root/'package-lock.json')}
    gates=GATES
    continuation=None
    if args.docs_only_continuation:
        previous_path=args.docs_only_continuation.resolve()/'manifest.json'
        previous=json.loads(previous_path.read_text())
        if previous.get('sourceUnchanged') is not True: parser.error('Previous source identity was not preserved')
        for name in ['typecheck','package','unit','docs-contract']:
            if previous['gates'][name]['outcome']!='passed' or previous['gates'][name].get('sourceUnchanged') is not True:
                parser.error('The previous required gate did not pass unchanged: '+name)
        if previous['gates']['docs-browser']['outcome']!='failed': parser.error('Expected the recorded docs-browser failure')
        for name in ['ordinary','native','heap']:
            if previous['gates'][name]['outcome']!='not-run': parser.error('This continuation cannot repeat an attempted gate: '+name)
        old=previous['source']['head']
        if git(root,'diff','--name-only',old,args.expected_head)!='docs/ru/guide/extensions.md':
            parser.error('Only the agreed Russian documentation file may differ')
        if git(root,'diff','--numstat',old,args.expected_head)!='2\t2\tdocs/ru/guide/extensions.md':
            parser.error('Expected exactly two repaired prose lines')
        continuation={'manifest':str(previous_path),'sha256':digest(previous_path),'source':previous['source'],
                      'preservedPassedGates':['typecheck','package','unit','docs-contract'],
                      'docsOnlyDiff':git(root,'diff',old,args.expected_head),'runtimeUnchanged':True}
        gates=[(name,command,None) for name,command,_ in GATES if name in ['docs-browser','ordinary','native','heap']]
    plan = {'root':str(root),'source':source,'chrome':str(chrome),'gates':gates,'continuation':continuation,
            'duplicatesAvoided':['Package includes build','npm test includes generated declaration consumers','test:docs includes source/locales smoke'],
            'selection':'No page/filter/root/Vite override; one unfiltered ordinary/native/heap execution',
            'orchestratorSha256':digest(__file__)}
    if not args.execute: print(json.dumps(plan,indent=2)); return 0
    env = {k:v for k,v in os.environ.items() if not k.startswith('EDITOR_') and k not in ['GITHUB_ENV','GITHUB_OUTPUT']}
    env['EDITOR_CHROME_PATH'] = str(chrome)
    output = subprocess.check_output(['node','scripts/verification-results.mjs','init',*[name for name,_,_ in gates]],cwd=root,env=env,text=True)
    directory = Path(output.strip().splitlines()[-1]); env['EDITOR_RESULTS_DIR']=str(directory)
    (directory/'orchestration-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    emit(directory=str(directory),source=source,chrome=str(chrome))
    code=0
    try:
        for name, command, prerequisite in gates:
            emit(gate=name,command=command,started=True)
            args=['node','scripts/verification-results.mjs','run',name]
            if prerequisite: args += ['--require',prerequisite]
            code=run_gate(args+['--']+command,root,env,name)
            if code: break
    finally:
        finish=subprocess.run(['node','scripts/verification-results.mjs','finish'],cwd=root,env=env)
        summary=summarize(root,directory)
        emit(directory=str(directory),accepted=summary['accepted'],c11Outcome=summary['c11Outcome'],evidenceErrors=summary['evidenceErrors'])
    return code or finish.returncode or (0 if summary['accepted'] else 1)

if __name__ == '__main__':
    sys.exit(main())
