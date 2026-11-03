"""Manual public decoder recovery and opaque-extension model; imports no browser fixture or runtime."""
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
ROWS = ['CONTRACT_PROJECTION_REGISTERED_DECODE_FAILURE', 'CONTRACT_PROJECTION_UNKNOWN_INLINE_CONTROL']


def E(value): return ('equal', value)
def A(): return ('assert', True)

OWNER_NAMES = [
    'initial projection-only decoder failure cleans staged block and partial inline scopes',
    'render staging decoder failure preserves previous accepted document and scopes',
    'canonical apply decoder failure restores accepted record without history',
    'canonical apply and recovery decoder failures stop authoring with accepted data intact',
    'mode enable decoder failure restores coherent editable projection',
    'mode disable decoder failure restores coherent read-only projection',
    'mode projection and recovery decoder failures stop mutation authority',
]

def known_doc():
    return [dict(id=name, type='decode-owner', dataVersion=1, data=dict(name=name, text='{{' + name + '-safe}} {{' + name + '-fault}}'),
                 inline={name + '-' + part: dict(type='decode-owner-widget', dataVersion=1, data=dict(label=name + '-' + part)) for part in ['safe', 'fault']})
            for name in ['a', 'b']]

def opaque():
    return dict(name='future', nested={'__proto__': dict(value='opaque'), 'constructor': 'opaque', 'toString': 'opaque'}, values=[None, False, 0, 'text'])

def unknown_doc(id, changed=False):
    type = 'toString' if id == 'constructor' else 'future-extension'
    text = 'Before {{' + id + '}} / {{literal}} / {{toString}} after' + (' changed' if changed else '')
    return [dict(id='a', type='paragraph', dataVersion=2, data=dict(text=text), inline={id: dict(type=type, dataVersion=7, data=opaque())}),
            dict(id='b', type='paragraph', dataVersion=2, data=dict(text='Control {{known}}'),
                 inline=dict(known=dict(type='known-control', dataVersion=1, data=dict(label='Known'))))]

def model():
    result = {name: [A()] * count for name, count in zip(OWNER_NAMES, [3, 3, 5, 4, 5, 5, 4])}
    for tag in ['undefined', 'null', 'false', '0', '', 'NaN']:
        for count in [1, 2]:
            checks = [E([count, ['invalid-data'] * count, [True] * count, count == 2]), E(known_doc()), E([]), E(False)]
            checks += [E([True, False]), E(['a-safe', 'a-fault']), E(True), E(1), E(False)] if count == 1 else [
                E([True, 0]), E(True), E(True), E(0), E([True, True])]
            result[f'projection decoder throw {tag} with {count} failures preserves its cause and recovery owner'] = checks
    for shape in ['promise', 'thenable']:
        result[f'projection decoder returned {shape} rejects without literal fallback or unhandled rejection'] = [
            E([True, 'invalid-data']), E([0, 0, False] if shape == 'promise' else [1, 1, True]), E(known_doc()), E([]), E(False),
            E(['a-safe', 'a-fault']), E(True), E(1), E(False)]
    for id in ['future', '__proto__', 'constructor']:
        type = 'toString' if id == 'constructor' else 'future-extension'
        marker = dict(id=id, text='{{' + id + '}}', editable='false', markers=1, literalMarkers=0)
        result[f'unknown inline {id} preserves opaque data, inert identity and renderer output'] = [
            E(unknown_doc(id)), E([True, True, True]), E(marker), E(['known']), E(dict(type=type, dataVersion=7, data=opaque())), E(marker), E(True), E(unknown_doc(id)),
            E(True), E(unknown_doc(id, True)), E(unknown_doc(id, True)), E('false'), E(['known']), A(),
            E('Before {{' + id + '}} / {{literal}} / {{toString}} after changed'), E('Control Known'), E(['known']), E(unknown_doc(id, True)), E(opaque()), E(0)]
    assert len(result) == 24
    assert sum(map(len, result.values())) == 215
    return result

def expected_legacy():
    result = []
    for id in ['future', '__proto__', 'constructor']:
        text = 'Legacy {{' + id + '}} / {{literal}} / {{toString}}'
        result.append(dict(id=id, type='toString' if id == 'constructor' else 'future-extension',
                           saved=dict(id='unknown', type='paragraph', data=dict(text=text)), visible=text, rendered=text,
                           error=None, rendererError=None, dataPreserved=False, visiblePreserved=True, outputPreserved=True, inert=False, status='FAIL'))
    return result

def verify_owners(rows, equal):
    assert [row['name'] for row in rows] == OWNER_NAMES
    for index, row in enumerate(rows):
        terminal = index in [3, 6]
        assert 'captureFailure' not in row
        assert equal(row['cleanup'], dict(rootGone=True, blocksRetired=True, widgetsRetired=True, once=True, allCreatedDisposed=True))
        assert row['errorName'] == ('AggregateError' if terminal else 'ProjectionDecodeProbeError')
        assert row['error']['original'] is (not terminal)
        assert row['schemaReason'] == (None if terminal else 'invalid-data')
        assert row['error'].get('issue') == (None if terminal else dict(reason='invalid-data'))
        assert equal(row['causes'], [dict(name='ProjectionDecodeProbeError', original=True, reason='invalid-data')] * 2 if terminal else None)
        assert equal(row['finalSaved'], None if index == 0 else known_doc())
        calls = row['calls']
        ingestion = next(i for i, entry in enumerate(calls) if entry['kind'] == 'decode' and entry['label'] == 'a-fault' and entry['phase'] == 'ingestion')
        arm = next(i for i, entry in enumerate(calls) if entry['kind'] in ['armCreate', 'armUpdate', 'armMode'])
        failures = [i for i, entry in enumerate(calls) if entry['kind'] == 'decode' and entry['label'] == 'a-fault' and entry['phase'] == 'projection' and entry['remaining'] > 0]
        assert len(failures) == (2 if terminal else 1)
        assert ingestion < arm < failures[0]
        if index == 0:
            assert row['partialWidgets'] == 1 and row['blockScopesRetired'] is True and row['widgetScopesRetired'] is True and row['mountedBlocks'] == 0
            continue
        assert equal(row['stable'], dict(data=True, noHistory=True))
        assert row['originalFailures'] == (2 if terminal else 1)
        assert row['readOnly'] is (index == 5)
        if terminal:
            assert row['mutationDenied'] is True and row['producerCalls'] == 0
        elif index == 1:
            assert row['oldAAborted'] is row['oldBAborted'] is row['oldBlockAborted'] is False
            assert row['candidatesRetired'] is True
        else:
            assert row['oldAAborted'] is True and row['oldBlockAborted'] is True and row['newAConnected'] is True and row['restoring'] is True
            assert equal(row['freshTask'], dict(admitted=True, calls=1))
            if index == 2: assert row['oldBAborted'] is False

def verify_extras(rows, equal):
    names = [name for name in model() if name.startswith('projection decoder throw ')]
    assert [row['name'] for row in rows] == names
    for index, row in enumerate(rows):
        count = 1 if index % 2 == 0 else 2
        assert row['failures'] == count and row['classified'] == ['invalid-data'] * count and row['exactCauses'] == [True] * count
        assert row['aggregate'] is (count == 2)
        assert equal(row['saved'], known_doc()) and row['events'] == []
        if count == 1: assert row['aRetired'] is True and row['bRetired'] is False


def exact(left, right):
    options = dict(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return json.dumps(left, **options) == json.dumps(right, **options)

def digest(value): return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, default=Path('tests/browser/decode-authority.js'))
    parser.add_argument('--runner', type=Path, default=Path('scripts/parity/decode-authority.mjs'))
    parser.add_argument('--browser', type=Path, required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    stored = args.raw.read_bytes()
    raw_bytes = gzip.decompress(stored) if args.raw.suffix == '.gz' else stored
    raw = json.loads(raw_bytes)
    git = lambda *parts: subprocess.check_output(['git', *parts])
    assert raw['headBefore'] == raw['headAfter'] == args.candidate
    assert raw['fixturePath'] == 'tests/browser/decode-authority.js' and raw['transport'] == 'browser-json-string'
    assert Path(__file__).read_bytes() == git('show', args.candidate + ':scripts/parity/checkpoints/2026-11-03/decode-authority/review.py')
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
    parent_browser_bytes = gzip.decompress((Path(__file__).parent / 'integration-browser.log.gz').read_bytes())
    assert digest(parent_browser_bytes) == INTEGRATION_BROWSER_SHA256
    parent_environment = json.loads(parent_browser_bytes.decode().splitlines()[0].split('Browser environment: ', 1)[1])
    assert raw['browser'] == parent_environment['product'].split('/', 1)[1]
    assert raw['node'] == integration['environment']['node']
    models = model()
    legacy, baseline, candidate = raw['results']
    assert [row['source'] for row in raw['results']] == ['v1', 'spec-baseline', 'candidate']
    assert legacy['cases'] == legacy['traces'] == []
    assert exact(legacy['legacyUnknownCases'], expected_legacy())
    assert exact(legacy['control'], dict(saved='Legacy control', visible='Legacy control', rootPresent=True, rootRemoved=True))
    assert exact(legacy['availability'], dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                 reason='Versioned schema/instance recovery uses v2 definition ports; v1 unknown-inline import/save/DOM/renderer controls execute directly on legacy APIs, without emulation.'))
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        declarations = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert declarations.returncode in [0, 1]
        assert declarations.stdout.decode() == raw[key]
    assert raw['legacyPublicTaskDeclarations'] == ''
    assert len(raw['legacyTaskDeclarations'].splitlines()) == 6
    browser_bytes = args.browser.read_bytes()
    browser_text = (gzip.decompress(browser_bytes) if args.browser.suffix == '.gz' else browser_bytes).decode()
    browser_pages = re.findall(r'^[-a-z0-9]+\.(?:html|htm): ', browser_text, re.M)
    assert len(browser_pages) == len(set(browser_pages)) == 47
    observed_environment = json.loads(browser_text.splitlines()[0].split('Browser environment: ', 1)[1])
    assert observed_environment['product'] == parent_environment['product'] and observed_environment['revision'] == parent_environment['revision']
    plain_cases = json.loads(browser_text.split('decode-authority.html: ', 1)[1])
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
        if row['source'] == 'candidate':
            verify_owners(row['ownerObservations'], exact)
            verify_extras(row['extraObservations'], exact)
        summaries.append(dict(source=row['source'], cases=len(row['cases']), passed=sum(case['status'] == 'PASS' for case in row['cases']),
                              observations=sum(len(trace['observations']) for trace in row['traces']), manualMismatches=len(mismatches)))
    assert args.raw.read_bytes() == stored
    report = dict(status='PASS', candidate=args.candidate, rawSha256=digest(raw_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  python=sys.version, integratedRuntime=INTEGRATION, integrationManifestSha256=INTEGRATION_MANIFEST_SHA256,
                  browser=raw['browser'], integratedBrowser=parent_environment['product'], byteIdenticalRuntime=True, ordinaryPages=len(browser_pages), unobservedBrowserCases=len(plain_cases), browserSha256=digest(browser_bytes), rows=ROWS,
                  legacyUnknownFailures=3, ownerRecords=7, primitiveCauseRecords=12, manualCases=len(models), manualCandidateChecks=sum(map(len, models.values())), rawObservationsReviewed=reviewed,
                  productionModulesVerified=modules, dependencyFilesVerified=len(raw['dependencyFiles']), summaries=summaries,
                  scope='Independent manual data/schema/cause/cleanup and opaque JSON/marker/renderer model; classification uses the existing read-only issue lookup, with no runtime mutation or normalization oracle. Author verification, not a separate-agent review. Only the two named registered-decoder and unknown-inline rows are covered.')
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__': main()
