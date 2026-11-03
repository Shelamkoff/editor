"""Manual public mode/recovery state model; imports no browser fixture or runtime."""
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
ROWS = ['CONTRACT_FAILED_MODE_DISPOSAL', 'CONTRACT_MODE_FALSY_RECOVERY',
        'CONTRACT_MODE_RECOVERY_CONTROLS', 'CONTRACT_MODE_RECOVERY_TERMINAL_DISPOSAL']


def E(value): return ('equal', value)
def A(): return ('assert', True)

def mode_doc(kind):
    if kind == 'block':
        return [dict(id=id, type='mode-block', dataVersion=1, data=dict(text=id)) for id in ['a', 'b']]
    return [dict(id='a', type='paragraph', dataVersion=2, data=dict(text='A{{first}}B{{second}}C'),
                 inline={id: dict(type='mode-probe', dataVersion=1, data=dict(label=id)) for id in ['first', 'second']})]

def model():
    result = {}
    replacement = [dict(id='live', type='paragraph', dataVersion=2, data=dict(text='Replacement'))]
    tags = ['undefined', 'null', 'false', '0', '', 'NaN', 'Error: inline rollback error']
    values = [{'$undefined': True}, None, False, 0, '', {'$number': 'NaN'}, {}]
    for kind in ['inline', 'block']:
        ids = ['first', 'second'] if kind == 'inline' else ['a', 'b']
        for readonly in [False, True]:
            for tag in tags:
                checks = [A(), E(readonly), E([readonly, readonly])]
                calls = E([[ids[0], not readonly], [ids[1], not readonly], [ids[1], readonly], [ids[0], readonly]])
                if kind == 'block': checks.append(calls)
                checks += [E(mode_doc(kind)), E([]), E(False), A(), E(1), A(), E(1)]
                if not readonly: checks += [A(), E(False), E(0 if kind == 'inline' else [0, 0])]
                checks += [E([not readonly, not readonly]), E([readonly, readonly])]
                result[f'{kind} mode {str(readonly).lower()}: rollback throw {tag} restores committed controls'] = checks
        for tag in tags:
            checks = [A(), E(False), E([False, False]), E([[ids[0], True], [ids[1], True], [ids[1], False], [ids[0], False]]),
                      E(2), A(), E(0), A(), E(0)]
            if kind == 'block': checks += [E(mode_doc(kind)), E(False)]
            result[f'{kind} forward throw {tag} with successful reversal does not replace instances'] = checks
        for tag, payload in zip(tags, values):
            checks = [A(), E([{'$undefined': True}, False, None, payload]), E([True] * 4), E(False), E(mode_doc(kind)), E(0),
                      A(), E(1), A(), E(1), A(), E(replacement), A(), A()]
            result[f'{kind} secondary restore throw {tag} preserves accepted model and permits public disposal'] = checks
    for kind in ['inline', 'block']:
        result[f'{kind} successful mode round trip preserves instances and history while retiring old tasks'] = [
            E(True), E([True, True]), E(False), E([False, False]), E(2), E([True, True]), A(), E(0), A(), E(0),
            A(), E(False), E([0, 0]), E(True), E(mode_doc(kind)), E(False), E([])]
    assert len(result) == 58
    assert sum(map(len, result.values())) == 762
    return result


def exact(left, right):
    options = dict(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return json.dumps(left, **options) == json.dumps(right, **options)

def digest(value): return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, default=Path('tests/browser/mode-recovery.js'))
    parser.add_argument('--runner', type=Path, default=Path('scripts/parity/mode-recovery.mjs'))
    parser.add_argument('--browser', type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    stored = args.raw.read_bytes()
    raw_bytes = gzip.decompress(stored) if args.raw.suffix == '.gz' else stored
    raw = json.loads(raw_bytes)
    git = lambda *parts: subprocess.check_output(['git', *parts])
    assert raw['headBefore'] == raw['headAfter'] == args.candidate
    assert raw['fixtureSha256'] == digest(args.fixture.read_bytes())
    assert raw['runnerSha256'] == digest(args.runner.read_bytes())
    assert raw['fixtureSha256'] == digest(git('show', args.candidate + ':' + args.fixture.as_posix()))
    assert raw['runnerSha256'] == digest(git('show', args.candidate + ':' + args.runner.as_posix()))
    assert raw['fixtureSource'] == dict(storage='git-objects', sha=args.candidate)
    wrapper = re.search(r'const harnessWrapper = String\.raw`(.*?)`\n', args.runner.read_text(encoding='utf-8'), re.S)
    assert wrapper and digest(wrapper.group(1).encode()) == raw['harnessWrapperSha256']
    assert raw['packageLockSha256'] == digest(Path('package-lock.json').read_bytes())
    assert raw['serverErrors'] == [] and raw['candidatePass'] is True
    expected_sources = dict(v1=V1, **{'spec-baseline': BASELINE}, candidate=args.candidate)
    assert {source['label']: source['sha'] for source in raw['sources']} == expected_sources
    modules = 0
    for source in raw['sources']:
        assert source['tree'] == git('rev-parse', source['sha'] + '^{tree}').decode().strip()
        for path, expected in source['loaded'].items():
            assert not path.startswith('/') and '..' not in Path(path).parts
            assert digest(git('show', source['sha'] + ':' + path)) == expected
            if source['label'] == 'candidate':
                assert digest(git('show', INTEGRATION + ':' + path)) == expected, ('Changed integrated runtime', path)
            modules += 1
    for path, expected in raw['fixtureFiles'].items():
        value = git('show', args.candidate + ':' + path)
        assert digest(value) == expected
    paths = ['core', 'shared', 'plugins', 'plugin-kit', 'inline-tools', 'inline-plugins', 'renderer', 'preset', 'locale', 'index.js', 'package.json', 'package-lock.json']
    assert git('diff', '--name-only', INTEGRATION, args.candidate, '--', *paths) == b''
    integration_bytes = gzip.decompress((Path(__file__).parent / 'integration-manifest.json.gz').read_bytes())
    assert digest(integration_bytes) == INTEGRATION_MANIFEST_SHA256
    integration = json.loads(integration_bytes)
    assert integration['outcome'] == 'passed' and integration['source']['head'] == INTEGRATION
    assert integration['source']['dirty'] is False and integration['sourceUnchanged'] is True
    assert len(integration['gates']) == 21
    assert all(gate['outcome'] == 'passed' and gate['sourceUnchanged'] is True for gate in integration['gates'].values())
    for path, expected in raw['dependencyFiles'].items():
        assert '..' not in Path(path).parts and not Path(path).is_absolute()
        assert digest((Path('node_modules') / path).read_bytes()) == expected
    for name, expected in raw['dependencyVersions'].items():
        assert json.loads((Path('node_modules') / name / 'package.json').read_bytes())['version'] == expected
    models = model()
    legacy, baseline, candidate = raw['results']
    assert [row['source'] for row in raw['results']] == ['v1', 'spec-baseline', 'candidate']
    assert legacy['cases'] == legacy['traces'] == []
    assert exact(legacy['control'], dict(saved='Legacy control', visible='Legacy control', rootPresent=True,
        modes=[dict(readOnly=False, editable=True, text='Legacy control'), dict(readOnly=True, editable=False, text='Legacy control'),
               dict(readOnly=False, editable=True, text='Legacy control')], remounted=[True, True], rootRemoved=True))
    assert exact(legacy['availability'], dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                 publicSetReadOnly='function', legacyInstanceModeHook='undefined',
                 reason='v1 exposes public mode transitions by document reconstruction, without the v2 instance-hook/scope recovery contract; ordinary mode control is executed, not declared absent.'))
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        declarations = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert declarations.returncode in [0, 1]
        assert declarations.stdout.decode() == raw[key]
    assert raw['legacyPublicTaskDeclarations'] == ''
    assert len(raw['legacyTaskDeclarations'].splitlines()) == 6
    browser_bytes = args.browser.read_bytes()
    browser_text = (gzip.decompress(browser_bytes) if args.browser.suffix == '.gz' else browser_bytes).decode()
    plain_cases = json.loads(browser_text.split('mode-recovery.html: ', 1)[1])
    assert [case['name'] for case in plain_cases] == list(models)
    assert all(case['status'] == 'PASS' for case in plain_cases)
    reviewed = 0
    summaries = []
    for row in raw['results']:
        assert row['pageErrors'] == []
        if row['source'] == 'v1': continue
        assert [case['name'] for case in row['cases']] == list(models)
        assert [trace['name'] for trace in row['traces']] == list(models)
        mismatches = []
        for trace, result in zip(row['traces'], row['cases']):
            expected = models[trace['name']]
            if row['source'] == 'candidate':
                assert trace['complete'] is True and trace['error'] is None
                assert result['status'] == 'PASS'
                assert len(trace['observations']) == len(expected), (trace['name'], len(trace['observations']), len(expected))
            for index, observation in enumerate(trace['observations']):
                if index >= len(expected):
                    mismatches.append([trace['name'], index, 'unexpected observation'])
                    continue
                kind, value = expected[index]
                match = observation['kind'] == kind and exact(observation['actual'], value) and exact(observation['expected'], value)
                if not match: mismatches.append([trace['name'], index, kind, observation])
                reviewed += 1
                if row['source'] == 'candidate': assert match, (trace['name'], index, observation, value)
        summaries.append(dict(source=row['source'], cases=len(row['cases']), passed=sum(case['status'] == 'PASS' for case in row['cases']),
                              observations=sum(len(trace['observations']) for trace in row['traces']), manualMismatches=len(mismatches)))
    assert args.raw.read_bytes() == stored
    report = dict(status='PASS', candidate=args.candidate, rawSha256=digest(raw_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  python=sys.version, integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_MANIFEST_SHA256,
                  byteIdenticalRuntime=True, unobservedBrowserCases=len(plain_cases), browserSha256=digest(browser_bytes), rows=ROWS,
                  manualCases=len(models), manualCandidateChecks=sum(map(len, models.values())), rawObservationsReviewed=reviewed,
                  productionModulesVerified=modules, dependencyFilesVerified=len(raw['dependencyFiles']), summaries=summaries,
                  scope='Independent manual public/native mode, failure identity, scope, history and disposal model. Author verification, not a separate-agent review. Only the four named current mode/recovery rows are covered.')
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__': main()
