"""Manual public task/read state model; imports no browser fixture or runtime."""
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
TEXT = 'Before{{ref}}After'
INTEGRATION = 'f2070510d2bbe22b2d6244f273c890f070de16de'
INTEGRATION_MANIFEST_SHA256 = '38a9a5540d05ae594f6fae67fbe7c6d4f884ab1ab807c2084f9d3271e2a30f09'
ROWS = ['CONTRACT_RETIRED_TASK_OPTIONS', 'CONTRACT_ACTIVE_TASK_OPTIONS', 'CONTRACT_INLINE_OPTION_CAPTURE',
        'CONTRACT_TASK_SETTLEMENT', 'CONTRACT_TASK_SUCCESS_RETIRES_OWNER', 'CONTRACT_READ_GUARDED_INLINE_DECODE',
        'CONTRACT_READ_REVOKED_INLINE_DECODE', 'CONTRACT_READ_PRESERVED_MODES_AND_DATA', 'CONTRACT_FAILED_PUBLIC_DISPOSAL']

def doc(count=0, label='Accepted', center=False):
    block = dict(id='a', type='scope-block', dataVersion=1, data=dict(text=TEXT, count=count),
                 inline=dict(ref=dict(type='scope-inline', dataVersion=1, data=dict(label=label))))
    if center:
        block['tunes'] = dict(textAlign='center')
    return [block]

def E(value): return ('equal', value)
def A(): return ('assert', True)

def model():
    result = {}
    def put(name, values):
        assert name not in result
        result[name] = values
    put('a task captures its declared option once before authoring and preserves one undo gesture',
        [A()] * 5 + [E(False), E(0), E(True), E([1, 0, 1]), E(1), E(True), E(doc()), E(False), E(True), E(1)])
    put('a valid canonical no-op completes its task without history or publication',
        [E(True), E(False), E(doc()), E(False), E([]), A()])
    put('failed option capture retries, but cancellation during capture never invokes the producer',
        [A(), A(), A(), E(True), E(1), E(False), E(1), A(), E(False)])
    put('inline options cannot reenter authoring and remain one reversible action',
        [A(), A(), A(), E({'$undefined': True}), E([1, 0, 1]), E('Accepted!'), E(['Accepted!']), E(True), E(doc()), E(['Accepted']), E(False)])
    for boundary in ['onDecode', 'onValue']:
        put(f'inline {boundary} returns data but cannot write or destroy its owning editor',
            [A()] * 5 + [E(dict(label='Accepted')), A(), E([1, 1, 0]), E(doc()), E(False), E(dict(label='Accepted'))])
    put('retired inline input stays inert after Undo creates a same-ID successor',
        [A(), E(True), E([0, 0]), E('New occurrence')])
    put('a successful remount may abort its old task signal without changing its true result',
        [E(True), A(), A(), E(1), E(False), E(True), E(doc()), E(False)])
    for kind in ['block', 'inline']:
        value = 2 if kind == 'block' else 'Sibling result'
        accepted = doc(2) if kind == 'block' else doc(label=value)
        put(f'{kind} result cancellation leaves its document untouched and other tasks and editors live',
            [A(), A(), E([1, 1]), E(doc()), E(False), E([]), A(), E(False), A(),
             E('Independent result capture'), E(True), E('A'), E(True), E(value), E(True), E(doc()),
             E(False), E(True), E(accepted), E(['commit', 'undo', 'redo'])])
    put('a healthy returned getter preserves scoped and host author composition in one history entry',
        [E(True), E([1, 1]), E(dict(text=TEXT, count=3)), E(dict(textAlign='center')),
         E(True), E(doc()), E(False), E(True), E(doc(3, center=True))])
    put('public destruction after terminal transaction failure releases the holder exactly once',
        [A(), A(), E(doc()), A(), E(0), A(), A(), E(1), A()])
    for retirement in ['cancelled', 'consumed', 'mode-revoked']:
        values = [E(True)] if retirement == 'consumed' else []
        values += [E(False), E([0, 0]), E(doc()), E(False), E(retirement != 'consumed'),
                   E(True), E(1), E(True), E(doc())]
        put(f'retired task {retirement} reads no options or producer and leaves its owner usable', values)
    for tag in ['undefined', 'null', 'false', '0', '', 'NaN']:
        put(f'option capture throw {tag} preserves exact failure and a retryable task',
            [E([True, True, 1, 0, False]), E(doc()), E(False), E(True), E(1), E(1), E(True), E(doc())])
        put(f'entered producer throw {tag} consumes only its task and preserves exact failure',
            [E([True, True, 1, True]), E(False), E([0, 1]), E(doc()), E(False), E([]), E(True), E(1), E(['commit'])])
    put('task option capture preserves foreign native focus and selection, with a later live focus control',
        [E([True, True, 3]), A(), E(True), E([True, 3]), E(True), E(True), E(True), E(1)])
    for variant in ['remount', 'in-place', 'no-op']:
        remount = variant == 'remount'
        value = 1 if remount else 2
        put(f'accepted {variant} task settles independently from a second pending task',
            [E(True), E([remount, remount]), E(not remount), E([0, 0] if remount else [1, 1]),
             E(value), E(True), E(3), E(True), E(value), E(doc())])
    put('the exact revoked inline reader aborts before decode while its same-ID successor remains readable',
        [E(True), E(['AbortError', 0, 0, True]), E(dict(label='Accepted')), E([1, 1, False])])
    put('decoded reads survive normal, read-only and staged construction without blocking later host commands',
        [E(dict(label='Decoded read')), E([1, 1]), A(), E(dict(label='Decoded read')), E([1, 1]), A(), E(doc()), E(False), E(True),
         E([dict(decoded=dict(label='Decoded read'), frozen=True, connected=False, live=True, initial='Accepted', decodes=1, reads=1)]),
         E(1), E(True), E(doc())])
    put('a canonical task no-op preserves an existing redo branch and cannot be recommitted',
        [E(True), E(True), E(True), E(True), A(), E(False), E([0, 0]), E([False, True]),
         E(doc()), E(['commit', 'undo']), E(True), E(1), E(True), E(doc()), E(['commit', 'undo', 'redo', 'undo'])])
    assert len(result) == 34
    assert sum(map(len, result.values())) == 333
    return result

def exact(left, right):
    options = dict(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return json.dumps(left, **options) == json.dumps(right, **options)

def digest(value): return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, default=Path('tests/browser/scoped-authority.js'))
    parser.add_argument('--runner', type=Path, default=Path('scripts/parity/task-authority.mjs'))
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
    assert exact(legacy['control'], dict(saved='Legacy control', visible='Legacy control', rootPresent=True, rootRemoved=True))
    assert exact(legacy['availability'], dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                 reason='The public instance-scoped DataTask/schema-context contract is v2-only; legacy plugin-private tasks are not substituted for it.'))
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        declarations = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert declarations.returncode in [0, 1]
        assert declarations.stdout.decode() == raw[key]
    assert raw['legacyPublicTaskDeclarations'] == ''
    assert len(raw['legacyTaskDeclarations'].splitlines()) == 6
    browser_bytes = args.browser.read_bytes()
    browser_text = (gzip.decompress(browser_bytes) if args.browser.suffix == '.gz' else browser_bytes).decode()
    plain_cases = json.loads(browser_text.split('scoped-authority.html: ', 1)[1])
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
                  scope='Independent manual canonical-state/callback/signal/history/read model. Author verification, not a separate-agent review. Only the nine named current contract rows are covered.')
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__': main()
