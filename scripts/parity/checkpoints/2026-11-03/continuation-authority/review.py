"""Manual public continuation/history model; imports no browser fixture or runtime."""
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
ROWS = ['CONTRACT_BLOCK_INLINE_CONTINUATION', 'CONTRACT_ASYNC_OBSERVER_ADMISSION', 'CONTRACT_DEFERRED_DIAGNOSTIC']


BEFORE = 'https://before.example'
AFTER = 'https://after.example'
FINAL = 'https://final.example'

def E(value): return ('equal', value)
def A(): return ('assert', True)

def doc(kind='block', url=BEFORE, title='', other='Bravo'):
    return [dict(id='a', type='continuation-block', dataVersion=1,
                 data=dict(text='{{ref}}', url=url if kind == 'block' else BEFORE, title=title if kind == 'block' else ''),
                 inline=dict(ref=dict(type='continuation-inline', dataVersion=1,
                                      data=dict(url=url if kind == 'inline' else BEFORE, title=title if kind == 'inline' else '')))),
            dict(id='b', type='paragraph', dataVersion=2, data=dict(text=other))]

def model():
    result = {}
    for kind in ['block', 'inline']:
        for variant in ['eligible', 'host-predecessor', 'intervening-host', 'changed-hint-field', 'wrong-hint-field', 'eligible-after-query-noop']:
            if kind == 'inline' and variant == 'host-predecessor':
                result['inline host patch rejection preserves its live task and independent history'] = [
                    A(), E(doc()), E(False), A(), E(True), E([AFTER, 'Metadata']), E(True), E([AFTER, '']), E(True), E(True), E(doc()), E(False)]
                continue
            merged = kind == 'block' and variant in ['eligible', 'eligible-after-query-noop']
            final_url = FINAL if variant == 'changed-hint-field' else AFTER
            other = 'Intervening' if variant == 'intervening-host' else 'Bravo'
            checks = [E([AFTER, ''])] if variant == 'eligible-after-query-noop' else []
            prior_origin = 'external' if variant == 'host-predecessor' else 'plugin'
            prior_name = 'block.update' if kind == 'block' or variant == 'host-predecessor' else 'inline-widget.update'
            name = 'block.update' if kind == 'block' else 'inline-widget.update'
            events = [['commit', prior_origin, prior_name]]
            if variant == 'intervening-host': events.append(['commit', 'external', 'block.update'])
            events.append(['commit', 'plugin', name])
            checks += [E(True), E([final_url, 'Metadata']), E(final_url + '|Metadata'), E(events), E(True),
                       E(doc() if merged else doc(kind, AFTER, other=other)), E(not merged)]
            if not merged:
                if variant == 'intervening-host': checks += [E(True), E(doc(kind, AFTER))]
                checks += [E(True), E(doc()), E(False)]
            checks += [E(doc(kind, final_url, 'Metadata', other)), E(False)]
            result[f'{kind} completion history {variant} preserves data and qualified grouping'] = checks
    for life in ['live', 'mode-retired', 'destroyed']:
        destroyed = life == 'destroyed'
        checks = [E([0, 0, 1]), E(['commit'])]
        if life != 'live': checks += [E(False)]
        checks += [E([0, 0 if destroyed else 1, 2 if destroyed else 1]), E([0, 0]), E(life != 'live'),
                   E(['commit'] if destroyed else ['commit', 'commit'])]
        checks += [E('Independent successor')] if destroyed else [E(['Trigger', 'From observer']), E(True), E(['Trigger', 'Bravo']), E(True), E(['', 'Bravo'])]
        result[f'publication continuation {life} admits only later live host commands'] = checks
    diagnostic = [dict(code='command.failed', operation='block.update', errorName='DeferredProbeError',
                       keys=['code', 'errorName', 'operation', 'timestamp'], frozen=True, finiteTimestamp=True)]
    for life in ['live', 'mode-retired', 'destroyed']:
        destroyed = life == 'destroyed'
        checks = [A(), E([2, 0, 0, 0]), E([]), E(True), E([2, 0, 1, 0 if destroyed else 1, 3 if destroyed else 2]),
                  E(False), E([0, 0]), E(diagnostic), E([] if destroyed else ['commit'])]
        if not destroyed: checks += [E('From diagnostic'), E(True), E('Bravo'), E(False)]
        result[f'diagnostic continuation {life} guards metadata and admits only later live host commands'] = checks
    for kind in ['publication', 'diagnostic']:
        for tag in ['Error: late observer error', 'false']:
            result[f'{kind} late rejection {tag} leaves the accepted action intact'] = [E(1), E(doc(title='Accepted')), E(True), E(True), E('')]
    assert len(result) == 22
    assert sum(map(len, result.values())) == 230
    return result


def exact(left, right):
    options = dict(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return json.dumps(left, **options) == json.dumps(right, **options)

def digest(value): return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, default=Path('tests/browser/continuation-authority.js'))
    parser.add_argument('--runner', type=Path, default=Path('scripts/parity/continuation-authority.mjs'))
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
        diagnostic=dict(deliveries=1, synchronous=True, code='save.slow', updates=1, frozen=True, finiteDuration=True,
                        saved='Legacy deferred diagnostic', visible='Legacy deferred diagnostic'), rootRemoved=True))
    assert exact(legacy['availability'], dict(currentOnly=True, createEditor='function', createParagraphPlugin='undefined', legacyParagraph='function',
                 reason="The instance task/history and protected publication contracts use v2 contexts; v1's native diagnostic callback and later public render execute separately without task emulation."))
    for key, roots in [('legacyTaskDeclarations', ['core', 'plugins', 'plugin-kit']), ('legacyPublicTaskDeclarations', ['core', 'plugin-kit'])]:
        declarations = subprocess.run(['git', 'grep', '-n', '-F', 'beginTask', V1, '--', *roots], capture_output=True)
        assert declarations.returncode in [0, 1]
        assert declarations.stdout.decode() == raw[key]
    assert raw['legacyPublicTaskDeclarations'] == ''
    assert len(raw['legacyTaskDeclarations'].splitlines()) == 6
    browser_bytes = args.browser.read_bytes()
    browser_text = (gzip.decompress(browser_bytes) if args.browser.suffix == '.gz' else browser_bytes).decode()
    browser_pages = re.findall(r'^[-a-z0-9]+\.(?:html|htm): ', browser_text, re.M)
    assert len(browser_pages) == len(set(browser_pages)) == 46
    assert 'scoped-authority.html: ' in browser_text and 'mode-recovery.html: ' in browser_text
    plain_cases = json.loads(browser_text.split('continuation-authority.html: ', 1)[1])
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
                  byteIdenticalRuntime=True, unobservedBrowserPages=len(browser_pages), unobservedBrowserCases=len(plain_cases), browserSha256=digest(browser_bytes), rows=ROWS,
                  manualCases=len(models), manualCandidateChecks=sum(map(len, models.values())), rawObservationsReviewed=reviewed,
                  productionModulesVerified=modules, dependencyFilesVerified=len(raw['dependencyFiles']), summaries=summaries,
                  scope='Independent manual canonical/history, callback-phase, signal and deferred-diagnostic model. Author verification, not a separate-agent review. Only the three named continuation/history rows are covered.')
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__': main()
