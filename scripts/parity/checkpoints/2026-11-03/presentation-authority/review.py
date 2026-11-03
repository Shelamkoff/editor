"""Manual standalone recovery proof; imports neither browser fixtures nor runtime."""
import argparse
import gzip
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
BASELINE = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
INTEGRATION = 'f2070510d2bbe22b2d6244f273c890f070de16de'
INTEGRATION_MANIFEST_SHA256 = '38a9a5540d05ae594f6fae67fbe7c6d4f884ab1ab807c2084f9d3271e2a30f09'
INTEGRATION_BROWSER_SHA256 = 'c1099136e26366c55b413d0763f362d0b081dc5c526526aa20fd8caa2619f638'
ROWS = ['CONTRACT_PRESENTATION_BATCH_INDEPENDENCE', 'CONTRACT_PRESENTATION_LOCAL_RECOVERY_PRESERVATION']

def exact(left, right):
    options = dict(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return json.dumps(left, **options) == json.dumps(right, **options)

def digest(value): return hashlib.sha256(value).hexdigest()
def decode(path):
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == '.gz' else data

def git_blobs(queries):
    queries = sorted(set(queries))
    value = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(queries) + '\n').encode())
    result = {}; offset = 0
    for query in queries:
        end = value.index(b'\n', offset)
        header = value[offset:end].split()
        assert len(header) == 3 and header[1] == b'blob', query
        size = int(header[2]); offset = end + 1
        result[query] = value[offset:offset + size]; offset += size
        assert value[offset:offset + 1] == b'\n'; offset += 1
    assert offset == len(value)
    return result

"""Manual standalone presentation model; no fixture/runtime import."""
def E(value): return ('equal', value)

def records(partial=False):
    result = []
    for name in ['a', 'b']:
        inline = {name + '-' + side: dict(type='presentation-fixture-widget', dataVersion=1, data=dict(label=name + '-' + side))
                  for side in ['front', 'back', 'note']}
        inline[name + '-opaque'] = dict(type='unregistered-presentation-widget', dataVersion=9, data=dict(label='keep opaque'))
        if partial and name == 'a': inline['a-late'] = dict(type='presentation-fixture-widget', dataVersion=1, data=dict(label='a-late'))
        result.append(dict(id=name, type='presentation-fixture', dataVersion=1,
                           data=dict(name=name, front='Front {{' + name + '-front}}',
                                     back='Back {{' + name + '-back}}' + (' {{a-late}}' if partial and name == 'a' else '') + ' {{' + name + '-opaque}}',
                                     note='Note {{' + name + '-note}} tail'), inline=inline))
    return result

def state(failed, reports, partial=False):
    return dict(saved=records(partial), history=[False, False, 0], mode=False,
                a=dict(editable='false' if failed else 'true', empty=failed, known=not failed, opaque=not failed),
                b=dict(editable='true', known=True, opaque=True),
                siblings=[dict(same=True, connected=True, live=True, task=True)] * 2,
                diagnostics=[dict(contentFree=True, frozen=True)] * reports, capHit=False)

def public_model():
    cleanup = E([True] * 5)
    result = {'standalone public healthy batch preserves exact independent owners':
              [E(state(False, 0)), E([True, True]), E(2), E(state(False, 0)), cleanup]}
    for kind in ['decode', 'create']:
        for failures in [1, 2, 'persistent']:
            for delivery in ['observer', 'query']:
                count = 3 if failures == 'persistent' else failures
                checks = []
                for index in range(count):
                    checks += [E(state(True, index + 1)), E(index + 1), E(0), E(state(True, index + 1))]
                checks += [E(state(False, count)), E([True, True]), E(2), E(state(False, count)), cleanup]
                result[f'standalone public {kind} {failures} via {delivery} settles independently and retries explicitly'] = checks
    result['standalone public partial acquisition releases candidates before explicit recovery'] = [
        E(state(True, 1, True)), E([True, True, True, 1]), E(state(False, 1, True)), E([True, True, True, 1]), cleanup]
    for tag in ['undefined', 'null', 'false', '0', '', 'NaN']:
        result[f'standalone public descriptor throw {tag} reports once without discarding B'] = [
            E(0), E(1), E([True, True]), E(records()), E([False, False, 0]), E([[True] * 3] * 2), cleanup]
    assert len(result) == 20 and sum(map(len, result.values())) == 208
    return result

def validate_public(row, equal):
    models = public_model()
    assert [value['name'] for value in row['cases']] == list(models)
    assert [value['name'] for value in row['traces']] == list(models)
    for trace, case in zip(row['traces'], row['cases']):
        assert trace['complete'] and trace['error'] is None and case['status'] == 'PASS', (trace['name'], case)
        checks = models[trace['name']]
        assert len(trace['observations']) == len(checks), (trace['name'], len(trace['observations']), len(checks))
        for index, (observation, (kind, expected)) in enumerate(zip(trace['observations'], checks)):
            assert observation['kind'] == 'equal'
            assert equal(observation['actual'], expected) and equal(observation['expected'], expected), (trace['name'], index, observation, expected)

"""Manual existing native presentation controls; expected data is specified here."""
def A(): return ('assert', True)
def E(value): return ('equal', value)

def public_native_doc(changed=False):
    return [dict(id='a', type='presentation-public', dataVersion=1,
                 data=dict(front='Front {{front}}', back='Back {{back}}', note='N日本ote {{note}} tail' if changed else 'Note {{note}} tail'),
                 inline={name: dict(type='presentation-public-widget', dataVersion=1, data=dict(label=name)) for name in ['front', 'back', 'note']})]

def native_model():
    result = {'public API: sibling presentation preserves genuine IME DOM, scopes and one native history unit': [
        A(), E(public_native_doc()), A(), A(), A(), E(public_native_doc()), A(), E(public_native_doc(True)),
        E([dict(origin='native-input', action='commit')]), A(), E(public_native_doc()), A()]}
    for name, label in [('a', 'same-block'), ('b', 'independent-block')]:
        after = records()
        after[0 if name == 'a' else 1]['data']['note'] = 'N日本ote {{' + name + '-note}} tail'
        checks = [A(), E(records()), A(), A(), A()]
        if name == 'a': checks.append(A())
        checks += [E(records()), A(), E(1), E(after), E([['native-input', 'commit']]), A(), E(1)]
        result[f'presentation failure preserves genuine {label} IME and its single native commit'] = checks
    for move in [False, True]:
        after = records(); after[0]['data']['note'] = 'NXote {{a-note}} tail'
        result['trusted pending text survives sibling failure' + (' and a harmless owned wrapper move' if move else '')] = [
            A(), A(), A(), E(records()), E(after), E([['native-input', 'commit']]), A()]
    for corruption in ['text', 'unsafe-attribute', 'forged-widget', 'synthetic-composition']:
        result[f'unowned {corruption} cannot borrow pending-native preservation'] = [A(), A(), E(records()), A()]
    for unsafe in [False, True]:
        before = records()
        if not unsafe: before[1]['data']['front'] += ' changed'
        result[('unsafe' if unsafe else 'stale') + ' genuine composition does not authorize preservation'] = [
            A(), A(), E(before), E(0 if unsafe else 1), E(not unsafe)]
    for fail in [False, True]:
        result['presentation ' + ('failure' if fail else 'switch') + ' preserves an exact backward same-block range'] = [A(), E(records()), A()]
    result['presentation failure preserves another editor exact selection and focus'] = [
        A(), E(records()), E([dict(id='foreign', type='paragraph', dataVersion=2, data=dict(text='Foreign selection'))]), A()]
    assert len(result) == 14 and sum(map(len, result.values())) == 87
    return result

def validate_native(row, equal):
    models = native_model()
    assert [item['name'] for item in row['cases']] == list(models)
    assert [item['name'] for item in row['traces']] == list(models)
    for trace, case in zip(row['traces'], row['cases']):
        assert trace['complete'] and trace['error'] is None and case['status'] == 'PASS', (trace['name'], case)
        checks = models[trace['name']]
        assert len(trace['observations']) == len(checks), (trace['name'], len(trace['observations']), len(checks))
        for index, (observation, (kind, expected)) in enumerate(zip(trace['observations'], checks)):
            assert observation['kind'] == kind and equal(observation['actual'], expected) and equal(observation['expected'], expected), (trace['name'], index, observation, expected)

def native_inputs():
    result = []
    def add(name, method, params): result.append(dict(name=name, method=method, params=params, completed=True))
    for name in native_model():
        ime = 'IME' in name or 'genuine composition' in name
        if ime:
            add(name, 'Input.dispatchKeyEvent', dict(type='rawKeyDown', key='Process', windowsVirtualKeyCode=229))
            add(name, 'Input.imeSetComposition', dict(text='に', selectionStart=1, selectionEnd=1))
            add(name, 'Input.dispatchKeyEvent', dict(type='keyUp', key='Process', windowsVirtualKeyCode=229))
            if 'genuine composition' not in name: add(name, 'Input.insertText', dict(text='日本'))
            add(name, 'Input.imeSetComposition', dict(text='', selectionStart=0, selectionEnd=0))
        elif name.startswith('trusted pending text'):
            add(name, 'Input.insertText', dict(text='X'))
    assert len(result) == 25
    return result

def validate_events(row):
    events = row['nativeEvents']
    assert all(item['name'] in native_model() for item in events)
    for name in native_model():
        current = [event for event in events if event['name'] == name]
        if 'IME' in name or 'genuine composition' in name:
            assert any(event['kind'] == 'compositionstart' and event['trusted'] is True for event in current), name
            for kind in ['beforeinput', 'input']:
                assert any(event['kind'] == kind and event['trusted'] is True and event['inputType'] == 'insertCompositionText' and event['composing'] is True for event in current), name
        elif name.startswith('trusted pending text'):
            for kind in ['beforeinput', 'input']:
                assert any(event['kind'] == kind and event['trusted'] is True and event['inputType'] == 'insertText' for event in current), name
        elif name.startswith('unowned synthetic-composition'):
            assert any(event['kind'] == 'compositionstart' and event['trusted'] is False for event in current)
            assert not any(event['trusted'] and event['kind'] in ['beforeinput', 'input'] for event in current)
    # Existing core cleanup can dispatch an untrusted compositionend. It is
    # retained as observed and never stands in for the trusted preedit above.

def main():
    parser = argparse.ArgumentParser()
    for name in ['public-raw', 'native-raw', 'browser', 'native-log', 'output']: parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    args = parser.parse_args()
    canonical = 'scripts/parity/checkpoints/2026-11-03/presentation-authority/'
    runner = 'scripts/parity/presentation-authority.mjs'
    paths = dict(public=args.public_raw, native=args.native_raw)
    stored = {group: path.read_bytes() for group, path in paths.items()}
    raw_bytes = {group: decode(path) for group, path in paths.items()}
    raws = {group: json.loads(value) for group, value in raw_bytes.items()}
    models = dict(public=public_model(), native=native_model())
    # Check semantic claims before expensive provenance work. Negative controls
    # change the evidence, not either independent model or the source tree.
    for group, raw in raws.items():
        assert raw['headBefore'] == raw['headAfter'] == args.candidate
        current = raw['results'][2]
        (validate_public if group == 'public' else validate_native)(current, exact)
        if group == 'native':
            assert exact(current['nativeInputs'], native_inputs())
            validate_events(current)
        else: assert current['nativeInputs'] == current['nativeEvents'] == []

    queries = [args.candidate + ':' + runner, args.candidate + ':' + canonical + 'review.py']
    for raw in raws.values():
        queries.extend(args.candidate + ':' + path for path in raw['fixtureFiles'])
        for source in raw['sources']:
            queries.extend(source['sha'] + ':' + path for path in source['loaded'])
            if source['label'] == 'candidate': queries.extend(INTEGRATION + ':' + path for path in source['loaded'])
    blobs = git_blobs(queries)
    assert Path(__file__).read_bytes() == blobs[args.candidate + ':' + canonical + 'review.py']
    runner_bytes = Path(runner).read_bytes()
    assert runner_bytes == blobs[args.candidate + ':' + runner]
    wrapper = re.search(r'const harnessWrapper = String\.raw`(.*?)`\n', runner_bytes.decode(), re.S)
    assert wrapper
    runtime_paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts', 'package.json', 'package-lock.json']
    assert subprocess.check_output(['git', 'diff', '--name-only', INTEGRATION, args.candidate, '--', *runtime_paths]) == b''
    integration_bytes = decode(Path(__file__).parent / 'integration-manifest.json.gz')
    assert digest(integration_bytes) == INTEGRATION_MANIFEST_SHA256
    integration = json.loads(integration_bytes)
    assert integration['outcome'] == 'passed' and integration['source']['head'] == INTEGRATION
    assert integration['source']['dirty'] is False and integration['sourceUnchanged'] is True and len(integration['gates']) == 21
    assert all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True for gate in integration['gates'].values())
    environment_bytes = decode(Path(__file__).parent / 'integration-browser.log.gz')
    assert digest(environment_bytes) == INTEGRATION_BROWSER_SHA256
    environment = json.loads(environment_bytes.decode().splitlines()[0].split('Browser environment: ', 1)[1])
    browser_bytes = decode(args.browser); browser_text = browser_bytes.decode()
    browser_environment = json.loads(browser_text.splitlines()[0].split('Browser environment: ', 1)[1])
    assert all(browser_environment[key] == environment[key] for key in ['product', 'revision'])
    pages = re.findall(r'^[-a-z0-9]+\.(?:html|htm): ', browser_text, re.M)
    assert len(pages) == len(set(pages)) == 48
    public_cases = json.JSONDecoder().raw_decode(browser_text.split('presentation-authority.html: ', 1)[1].lstrip())[0]
    owner_cases = json.JSONDecoder().raw_decode(browser_text.split('presentation-recovery.html: ', 1)[1].lstrip())[0]
    assert len(owner_cases) == 63 and len({case['name'] for case in owner_cases}) == 63 and all(case['status'] == 'PASS' for case in owner_cases)
    integrated_owner_cases = json.JSONDecoder().raw_decode(environment_bytes.decode().split('presentation-recovery.html: ', 1)[1].lstrip())[0]
    assert [case['name'] for case in owner_cases] == [case['name'] for case in integrated_owner_cases]
    assert all(case['status'] == 'PASS' for case in integrated_owner_cases)
    assert subprocess.check_output(['git', 'diff', '--name-only', INTEGRATION, args.candidate, '--',
                                    'tests/browser/presentation-recovery.js', 'tests/browser/regressions/presentation*.js']) == b''
    native_bytes = decode(args.native_log)
    native_cases = json.loads(native_bytes.decode().splitlines()[-1])['native-presentation-recovery.html']
    for cases, model in [(public_cases, models['public']), (native_cases, models['native'])]:
        assert [case['name'] for case in cases] == list(model) and all(case['status'] == 'PASS' for case in cases)
    expected_sources = dict(v1=V1, **{'spec-baseline': BASELINE}, candidate=args.candidate)
    legacy_control = dict(saved='Legacy control', visible='Legacy control', rootPresent=True, rootRemoved=True,
                          native=dict(beforeInput=[dict(type='deleteContentBackward', trusted=True, prevented=False)], saved='Leacy control', visible='Leacy control'))
    availability = dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                        reason='The v2 definition/instance standalone-field and scoped-task ports are not emulated in v1; its native Paragraph editing control executes on the actual legacy API.')
    legacy_inputs = [dict(name='legacy native Paragraph', phase='edit', method='Input.dispatchKeyEvent', completed=True,
                         params=dict(type=kind, key='Backspace', code='Backspace', windowsVirtualKeyCode=8, nativeVirtualKeyCode=8, modifiers=0)) for kind in ['rawKeyDown', 'keyUp']]
    declarations = {}
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        found = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert found.returncode in [0, 1]; declarations[key] = found.stdout.decode()
    assert declarations['legacyPublicTaskDeclarations'] == '' and len(declarations['legacyTaskDeclarations'].splitlines()) == 6
    modules = set(); visits = observations = 0; dependencies = {}; versions = {}; summaries = []
    for group, raw in raws.items():
        fixture = 'tests/browser/native-presentation-recovery.js' if group == 'native' else 'tests/browser/presentation-authority.js'
        assert raw['group'] == group and raw['fixturePath'] == fixture and raw['transport'] == 'browser-json-string'
        assert raw['fixtureSource'] == dict(storage='git-objects', sha=args.candidate)
        assert raw['fixtureSha256'] == digest(blobs[args.candidate + ':' + fixture])
        assert raw['runnerSha256'] == digest(runner_bytes) and raw['harnessWrapperSha256'] == digest(wrapper.group(1).encode())
        assert raw['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
        assert raw['browser'] == environment['product'].split('/', 1)[1] and raw['node'] == integration['environment']['node']
        assert raw['serverErrors'] == [] and raw['candidatePass'] is True
        assert {source['label']: source['sha'] for source in raw['sources']} == expected_sources
        for source in raw['sources']:
            assert source['tree'] == subprocess.check_output(['git', 'rev-parse', source['sha'] + '^{tree}']).decode().strip()
            for path, expected in source['loaded'].items():
                assert not Path(path).is_absolute() and '..' not in Path(path).parts
                assert digest(blobs[source['sha'] + ':' + path]) == expected
                if source['label'] == 'candidate': assert digest(blobs[INTEGRATION + ':' + path]) == expected
                modules.add((source['sha'], path)); visits += 1
        assert {fixture, 'tests/browser/regressions/presentation-fixture.js', 'tests/browser/regressions/harness.js', 'tests/browser/regressions/deepEqual.js'} <= set(raw['fixtureFiles'])
        for path, expected in raw['fixtureFiles'].items(): assert digest(blobs[args.candidate + ':' + path]) == expected
        for path, expected in raw['dependencyFiles'].items():
            assert not Path(path).is_absolute() and '..' not in Path(path).parts
            assert digest((Path('node_modules') / path).read_bytes()) == expected
            assert dependencies.get(path, expected) == expected; dependencies[path] = expected
        for name, expected in raw['dependencyVersions'].items():
            assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == expected
            assert versions.get(name, expected) == expected; versions[name] = expected
        assert all(raw[key] == value for key, value in declarations.items())
        assert [row['source'] for row in raw['results']] == ['v1', 'spec-baseline', 'candidate']
        legacy = raw['results'][0]
        assert legacy['cases'] == legacy['traces'] == [] and exact(legacy['control'], legacy_control) and exact(legacy['availability'], availability)
        assert exact(legacy['nativeInputs'], legacy_inputs)
        if group == 'native':
            plan = native_inputs(); position = 0
            for item in raw['results'][1]['nativeInputs']:
                while position < len(plan) and not exact(item, plan[position]): position += 1
                assert position < len(plan)
                position += 1
        for row in raw['results'][1:]:
            assert row['pageErrors'] == [] and [case['name'] for case in row['cases']] == list(models[group])
            assert [trace['name'] for trace in row['traces']] == list(models[group])
            mismatches = 0
            for trace in row['traces']:
                checks = models[group][trace['name']]
                for index, observation in enumerate(trace['observations']):
                    observations += 1
                    if index >= len(checks): mismatches += 1; continue
                    kind, expected = checks[index]
                    mismatches += not (observation['kind'] == kind and exact(observation['actual'], expected) and exact(observation['expected'], expected))
            summaries.append(dict(group=group, source=row['source'], cases=len(row['cases']), passed=sum(case['status'] == 'PASS' for case in row['cases']),
                                  observations=sum(len(trace['observations']) for trace in row['traces']), manualMismatches=mismatches))
        assert legacy['pageErrors'] == [] and paths[group].read_bytes() == stored[group]
    report = dict(status='PASS', candidate=args.candidate, python=sys.version, scriptSha256=digest(Path(__file__).read_bytes()),
                  rawSha256={group: digest(value) for group, value in raw_bytes.items()}, integratedRuntime=INTEGRATION,
                  integrationManifestSha256=INTEGRATION_MANIFEST_SHA256, byteIdenticalRuntime=True, browser=raws['public']['browser'],
                  ordinaryPages=len(pages), existingOwnerControls=len(owner_cases), publicCases=20, nativeCases=14, manualCandidateChecks=295,
                  rawObservationsReviewed=observations, productionModulesVerified=len(modules), moduleGroupVisits=visits,
                  dependencyFilesVerified=len(dependencies), dependencyVersionsVerified=len(versions), nativeInputs=25, legacyNativeInputsPerGroup=2,
                  browserSha256=digest(browser_bytes), nativeLogSha256=digest(native_bytes), rows=ROWS, summaries=summaries,
                  scope='Independent manual standalone data/sidecars/diagnostics/history/owner/retry/cleanup and native input/IME/range model. Existing 63 owner controls retain their own explicit assertions. Author verification, not separate-agent review. Only two named standalone rows are accepted.')
    assert sum(len(checks) for model in models.values() for checks in model.values()) == report['manualCandidateChecks']
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
    print(json.dumps(report))

if __name__ == '__main__': main()
