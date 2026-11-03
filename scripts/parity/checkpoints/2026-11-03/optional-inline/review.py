"""Independent public optional-instance and native caret proof; no fixture/runtime imports."""
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
ROWS = ['CONTRACT_INLINE_OPTIONAL_UPDATE', 'CONTRACT_INLINE_OPTIONAL_TASK', 'CONTRACT_INLINE_OPTIONAL_IMMEDIATE',
        'CONTRACT_OPTIONAL_NOOP_REUSE', 'CONTRACT_OPTIONAL_RECREATE_FAILURE', 'CONTRACT_INLINE_SYNC_UPDATE_CONTROLS',
        'CONTRACT_NATIVE_RECONCILE_UPDATE_REQUIRED']

def E(value): return ('equal', value)
def A(): return ('assert', True)

def public_doc(label='Original', other='Other'):
    return [dict(id='a', type='paragraph', dataVersion=2, data=dict(text='A {{x}} / {{y}} Z'),
                 inline=dict(x=dict(type='static-badge', dataVersion=1, data=dict(label=label)),
                             y=dict(type='static-badge', dataVersion=1, data=dict(label='Sibling')))),
            dict(id='b', type='paragraph', dataVersion=2, data=dict(text=other))]

def public_model():
    result = {}
    result['a widget without update reflects changed data with a new scoped occurrence and one history action'] = [
        E(dict(label='Updated')), E('Updated'), A(), A(), A(), E(1), E(False), E(0), A(), E(public_doc()), E('Original'), E(False), A(), E(public_doc('Updated')), E('Updated')]
    result['no-op and unrelated edits retain a static widget occurrence and its pending task'] = [
        E(False), A(), A(), E(True), E('Task result'), A(), E(False)]
    for hook in ['replacement', 'update']:
        result[f'inline payload {hook} preserves unrelated author text and a backward range'] = [
            A(), E(dict(label='Updated')), E('Updated'), A(), A(), A(), A(), A(), E(public_doc()), A(), A(), E(public_doc('Updated')), A()]
    result['failed fallback acquisition restores accepted data and history without reviving the old scope'] = [
        A(), E(public_doc(other='Accepted sibling')), E('Original'), A(), A(), E(1), E(False), E(0), A(), E('Other'), E(False), E('Recovered')]
    result['a throwing update hook is not retried by creating the rejected new payload'] = [
        A(), E(public_doc()), E('Original'), A(), A(), E(False), A(), E('Accepted')]
    result['immediate editing.handle places its caret inside the exact new optional-update occurrence'] = [
        A(), A(), E('Updated'), A(), E([2, 2]), A(), E(public_doc()), E(False), A(), E(public_doc('Updated'))]
    result['a newer native selection supersedes the immediate replacement caret'] = [A(), A(), E(1), E('Updated')]
    result['missing immediate caret keeps the ordinary exterior logical completion'] = [A(), A(), A(), E(dict(label='Updated'))]
    result['an accepted optional inline task replaces its owner once and preserves one reversible action'] = [
        E(True), E(dict(label='Task result')), E('Task result'), A(), E([True, True, True]), E(1), E(False), E([0, 0]),
        E(True), E(public_doc()), E(False), E(True), E(public_doc('Task result')), E(['commit', 'undo', 'redo'])]
    tags = ['undefined', 'null', 'false', '0', '', 'NaN']
    for tag in tags + ['Error: optional creation failure']:
        result[f'optional replacement throw {tag} recovers accepted data and retires provisional scope'] = [
            E([True, True]), E(public_doc()), E('Original'), A(), E([True]), E(1), E([]), E(False), E(False), E([0, 0]),
            E('Recovered'), E(['commit']), E(True), E(public_doc())]
    for tag in tags + ['Error: optional update failure']:
        result[f'existing update throw {tag} never recreates the rejected payload'] = [
            E([True, True, 1]), E(public_doc()), E('Original'), A(), E([True, True]), E(1), E([]), E(False), A(), E('Accepted'), E(True), E(public_doc())]
    for shape in ['promise', 'thenable', 'throwing-then-getter']:
        counters = [0, 0, False] if shape == 'promise' else [1, 1, True] if shape == 'thenable' else [1, 0, False]
        result[f'existing update {shape} rejects synchronously without fallback or unhandled rejection'] = [
            E([True, True]), E(counters), E(public_doc()), E('Original'), A(), E(1), E(False), A(), E('Accepted'), E(True), E(public_doc())]
    result['native reconciliation opt-in without update rejects and cleans the started occurrence'] = [
        A(), E(['Original']), E(1), E([True]), E([{'$node': 1, 'name': 'SPAN', 'connected': False}]), E([False])]
    for readonly in [False, True]:
        result[f'native reconciliation with update remains a valid readable instance in mode {str(readonly).lower()}'] = [
            E(dict(label='Original')), E(readonly), E(str(not readonly).lower()), E(['Original', 'Sibling']), E([]), A(), E('Accepted'), E(True), E('Original')]
    assert len(result) == 30
    assert sum(map(len, result.values())) == 339
    return result



def native_doc(label='Original'):
    return [dict(id='a', type='paragraph', dataVersion=2, data=dict(text='A {{x}} / {{y}} Z'),
                 inline=dict(x=dict(type='static-badge', dataVersion=1, data=dict(label=label)),
                             y=dict(type='static-badge', dataVersion=1, data=dict(label='Sibling')))),
            dict(id='b', type='paragraph', dataVersion=2, data=dict(text='Other'))]

def native_model():
    result = {}
    before = E([dict(type='deleteContentBackward', trusted=True, prevented=True)])
    for with_update in [False, True]:
        mode = 'update' if with_update else 'replacement'
        result[f'trusted immediate {mode} preserves caret and keyboard history'] = [
            before, E([]), E(dict(label='Updated')), E('Updated'), E(with_update), E([not with_update, not with_update]),
            E(dict(anchor=True, focus=True, anchorOffset=2, focusOffset=2, collapsed=True)), E(native_doc()), E([False, True]),
            E(native_doc('Updated')), E([True, False]), E(['commit', 'undo', 'redo'])]
    result['trusted immediate missing caret retains exterior logical completion'] = [
        before, E([]), E(dict(label='Updated')), E('Updated'), E(dict(collapsed=True, insideWidget=False, insideField=True))]
    for kind in ['selection', 'mode', 'same-id-owner', 'rollback', 'destroy']:
        checks = [before, E([]), E(dict(label='Updated', caretAlreadyInside=False, oldConnected=False)),
                  E(dict(anchor=True, focus=True, anchorOffset=1, focusOffset=1, active=True))]
        if kind == 'destroy':
            checks += [E([dict(id='live', type='paragraph', dataVersion=2, data=dict(text='Successor'))]), A()]
        else:
            label = 'Superseding' if kind == 'same-id-owner' else 'Updated'
            checks += [E(dict(label=label)), E(label), E(False), E(kind == 'rollback')]
        result[f'trusted immediate {kind} supersedes the old queued caret'] = checks
    assert len(result) == 8
    assert sum(map(len, result.values())) == 67
    return result


def exact(left, right):
    return json.dumps(left, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) == json.dumps(right, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)

def digest(value): return hashlib.sha256(value).hexdigest()

def planned_inputs(name, phases):
    result = []
    for phase in phases:
        key, code, number, modifiers = dict(edit=('Backspace', 'Backspace', 8, 0), undo=('z', 'KeyZ', 90, 2), redo=('y', 'KeyY', 89, 2))[phase]
        for kind in ['rawKeyDown', 'keyUp']:
            result.append(dict(name=name, phase=phase, method='Input.dispatchKeyEvent', completed=True,
                               params=dict(type=kind, key=key, code=code, windowsVirtualKeyCode=number, nativeVirtualKeyCode=number, modifiers=modifiers)))
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--public-raw', type=Path, required=True)
    parser.add_argument('--native-raw', type=Path, required=True)
    parser.add_argument('--browser', type=Path, required=True)
    parser.add_argument('--native-log', type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    git = lambda *parts: subprocess.check_output(['git', *parts])
    checker_path = Path(__file__)
    canonical = 'scripts/parity/checkpoints/2026-11-03/optional-inline/'
    assert checker_path.read_bytes() == git('show', args.candidate + ':' + canonical + 'review.py')
    runner_path = 'scripts/parity/optional-inline.mjs'
    runner_bytes = Path(runner_path).read_bytes()
    assert runner_bytes == git('show', args.candidate + ':' + runner_path)
    wrapper = re.search(r'const harnessWrapper = String\.raw`(.*?)`\n', runner_bytes.decode(), re.S)
    assert wrapper
    runtime_paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'index.d.ts', 'types.d.ts', 'package.json', 'package-lock.json']
    assert git('diff', '--name-only', INTEGRATION, args.candidate, '--', *runtime_paths) == b''
    integration_bytes = gzip.decompress((checker_path.parent / 'integration-manifest.json.gz').read_bytes())
    assert digest(integration_bytes) == INTEGRATION_MANIFEST_SHA256
    integration = json.loads(integration_bytes)
    assert integration['outcome'] == 'passed' and integration['source']['head'] == INTEGRATION
    assert integration['source']['dirty'] is False and integration['sourceUnchanged'] is True
    assert len(integration['gates']) == 21
    assert all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True for gate in integration['gates'].values())
    decode = lambda path: gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    browser_bytes = decode(args.browser)
    browser_text = browser_bytes.decode()
    pages = re.findall(r'^[-a-z0-9]+\.(?:html|htm): ', browser_text, re.M)
    assert len(pages) == len(set(pages)) == 46
    public_cases = json.JSONDecoder().raw_decode(browser_text.split('optional-inline-update.html: ', 1)[1].lstrip())[0]
    native_bytes = decode(args.native_log)
    native_cases = json.loads(native_bytes.decode().splitlines()[-1])['native-optional-inline-update.html']
    all_models = dict(public=public_model(), native=native_model())
    for cases, models in [(public_cases, all_models['public']), (native_cases, all_models['native'])]:
        assert [case['name'] for case in cases] == list(models)
        assert all(case['status'] == 'PASS' for case in cases)
    legacy_control = dict(saved='Legacy control', visible='Legacy control', rootPresent=True, rootRemoved=True,
                          native=dict(beforeInput=[dict(type='deleteContentBackward', trusted=True, prevented=False)], saved='Leacy control', visible='Leacy control'))
    availability = dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                        reason='The v2 definition/instance optional-update and scoped-task ports are not emulated in v1; its native Paragraph editing control executes on the actual legacy API.')
    legacy_declarations = {}
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        found = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert found.returncode in [0, 1]
        legacy_declarations[key] = found.stdout.decode()
    assert legacy_declarations['legacyPublicTaskDeclarations'] == ''
    assert len(legacy_declarations['legacyTaskDeclarations'].splitlines()) == 6
    expected_sources = dict(v1=V1, **{'spec-baseline': BASELINE}, candidate=args.candidate)
    summaries, raw_hashes, modules, dependencies, versions = [], {}, set(), {}, {}
    visits = observations = 0
    for group, path in [('public', args.public_raw), ('native', args.native_raw)]:
        stored = path.read_bytes()
        raw_bytes = decode(path)
        raw = json.loads(raw_bytes)
        models = all_models[group]
        fixture_path = 'tests/browser/native-optional-inline-update.js' if group == 'native' else 'tests/browser/optional-inline-update.js'
        assert raw['group'] == group and raw['fixturePath'] == fixture_path
        assert raw['headBefore'] == raw['headAfter'] == args.candidate
        assert raw['fixtureSha256'] == digest(git('show', args.candidate + ':' + fixture_path)) == digest(Path(fixture_path).read_bytes())
        assert raw['runnerSha256'] == digest(runner_bytes)
        assert raw['harnessWrapperSha256'] == digest(wrapper.group(1).encode())
        assert raw['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
        assert raw['fixtureSource'] == dict(storage='git-objects', sha=args.candidate)
        assert raw['serverErrors'] == [] and raw['candidatePass'] is True
        assert {source['label']: source['sha'] for source in raw['sources']} == expected_sources
        for source in raw['sources']:
            assert source['tree'] == git('rev-parse', source['sha'] + '^{tree}').decode().strip()
            for module_path, expected in source['loaded'].items():
                assert not module_path.startswith('/') and '..' not in Path(module_path).parts
                assert digest(git('show', source['sha'] + ':' + module_path)) == expected
                if source['label'] == 'candidate': assert digest(git('show', INTEGRATION + ':' + module_path)) == expected
                modules.add((source['sha'], module_path)); visits += 1
        assert {fixture_path, 'tests/browser/optional-inline-fixture.js', 'tests/browser/regressions/harness.js', 'tests/browser/regressions/deepEqual.js'} <= set(raw['fixtureFiles'])
        for test_path, expected in raw['fixtureFiles'].items():
            assert digest(git('show', args.candidate + ':' + test_path)) == expected
        for dependency_path, expected in raw['dependencyFiles'].items():
            assert '..' not in Path(dependency_path).parts and not Path(dependency_path).is_absolute()
            assert digest((Path('node_modules') / dependency_path).read_bytes()) == expected
            assert dependencies.get(dependency_path, expected) == expected
            dependencies[dependency_path] = expected
        for name, expected in raw['dependencyVersions'].items():
            assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == expected
            assert versions.get(name, expected) == expected
            versions[name] = expected
        for key, expected in legacy_declarations.items(): assert raw[key] == expected
        assert [row['source'] for row in raw['results']] == ['v1', 'spec-baseline', 'candidate']
        legacy, baseline, candidate = raw['results']
        assert legacy['cases'] == legacy['traces'] == []
        assert exact(legacy['control'], legacy_control) and exact(legacy['availability'], availability)
        assert exact(legacy['nativeInputs'], planned_inputs('legacy native Paragraph', ['edit']))
        for row in raw['results']:
            assert row['pageErrors'] == []
            if row['source'] == 'v1': continue
            assert [case['name'] for case in row['cases']] == list(models)
            assert [trace['name'] for trace in row['traces']] == list(models)
            mismatches = 0
            for trace, case in zip(row['traces'], row['cases']):
                expected = models[trace['name']]
                if row['source'] == 'candidate':
                    assert trace['complete'] is True and trace['error'] is None and case['status'] == 'PASS'
                    assert len(trace['observations']) == len(expected), (group, trace['name'])
                for index, observation in enumerate(trace['observations']):
                    if index >= len(expected): mismatches += 1; continue
                    kind, value = expected[index]
                    match = observation['kind'] == kind and exact(observation['actual'], value) and exact(observation['expected'], value)
                    mismatches += not match
                    observations += 1
                    if row['source'] == 'candidate': assert match, (group, trace['name'], index, observation, value)
            summaries.append(dict(group=group, source=row['source'], cases=len(row['cases']), passed=sum(case['status'] == 'PASS' for case in row['cases']),
                                  observations=sum(len(trace['observations']) for trace in row['traces']), manualMismatches=mismatches))
        if group == 'public':
            assert candidate['nativeInputs'] == baseline['nativeInputs'] == []
            assert candidate['nativeCases'] == baseline['nativeCases'] == []
        else:
            native_plan = [item for name in models for item in planned_inputs(name, ['edit', 'undo', 'redo'] if 'keyboard history' in name else ['edit'])]
            assert len(native_plan) == 24 and exact(candidate['nativeInputs'], native_plan)
            # A historical failed case can stop before Undo/Redo; retain only
            # actually completed input and validate its ordered plan subsequence.
            position = 0
            for entry in baseline['nativeInputs']:
                while position < len(native_plan) and not exact(entry, native_plan[position]): position += 1
                assert position < len(native_plan)
                position += 1
            records = []
            for name in models:
                record = dict(name=name, beforeInput=[dict(type='deleteContentBackward', trusted=True, prevented=True)])
                if 'keyboard history' in name: record.update(final=native_doc('Updated'), actions=['commit', 'undo', 'redo'])
                elif 'missing caret' not in name: record['hook'] = dict(label='Updated', caretAlreadyInside=False, oldConnected=False)
                records.append(record)
            assert exact(candidate['nativeCases'], records)
        assert path.read_bytes() == stored
        raw_hashes[group] = digest(raw_bytes)
    report = dict(status='PASS', candidate=args.candidate, python=sys.version, scriptSha256=digest(checker_path.read_bytes()), rawSha256=raw_hashes,
                  integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_MANIFEST_SHA256, byteIdenticalRuntime=True,
                  ordinaryPages=len(pages), publicCases=len(public_cases), nativeCases=len(native_cases), manualCandidateChecks=406,
                  rawObservationsReviewed=observations, productionModulesVerified=len(modules), moduleGroupVisits=visits,
                  dependencyFilesVerified=len(dependencies), dependencyVersionsVerified=len(versions), nativeInputs=24, legacyNativeInputsPerGroup=2,
                  browserSha256=digest(browser_bytes), nativeLogSha256=digest(native_bytes), rows=ROWS, summaries=summaries,
                  scope='Independent manual data/history/scope and trusted-input/caret/replay model. Author verification, not a separate-agent review. Only seven named optional-instance rows are accepted.')
    assert sum(len(value) for models in all_models.values() for value in models.values()) == report['manualCandidateChecks']
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
    print(json.dumps(report))

if __name__ == '__main__': main()
