"""Independent completeness/source review of the fresh complete library run."""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tarfile
from collections import Counter
from pathlib import Path

base = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('common', base / 'common.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
source = common.CANDIDATE
repo, directory = map(lambda p: Path(p).resolve(), sys.argv[1:3])
os.chdir(repo)


def read(path):
    return json.loads(Path(path).read_text())


def require(value, message):
    assert value, message


def node_summary(path):
    text = path.read_text()
    counts = {}
    for name in ['tests', 'pass', 'fail', 'skipped', 'cancelled', 'todo']:
        match = re.search(r'^(?:ℹ|#) ' + name + r' (\d+)$', text, re.M)
        require(match, str(path) + ':' + name)
        counts[name] = int(match[1])
    require(counts['tests'] == counts['pass'] == 2257, str(path))
    require(counts['fail'] == counts['skipped'] == counts['cancelled'] == counts['todo'] == 0, str(path))
    return counts


integration_path = Path((directory / 'integration-directory.txt').read_text().strip())
integration = read(integration_path / 'manifest.json')
require(integration['outcome'] == 'failed' and integration['finishedAt'] and integration['sourceUnchanged'], 'Original integration/source record')
require(integration['source'] == integration['sourceAfter'], 'Integration source changed')
require(integration['source']['head'] == source and not integration['source']['dirty'], 'Integration source')
gates = {'typecheck', 'node', 'build', 'package', 'types', 'docs', 'site', 'bundle', 'browser', 'intro', 'heap'}
gates.update(version + '-' + kind for version in ('v20-19-0', 'v22-23-4') for kind in ('types', 'runtime-types', 'node'))
require(set(integration['gates']) == gates and len(gates) == 17, 'Integration inventory')
require(all(g['outcome'] == 'passed' and g['exitCode'] == 0 for name, g in integration['gates'].items() if name != 'browser'), 'Failed non-browser gate')
require(integration['gates']['browser']['outcome'] == 'failed' and integration['gates']['browser']['exitCode'] == 1, 'Original browser timeout lost')
followup_path = Path((directory / 'browser-followup-directory.txt').read_text().strip())
followup = read(followup_path / 'manifest.json')
require(followup['outcome'] == 'passed' and followup['sourceUnchanged'] and followup['source'] == followup['sourceAfter'] == integration['source'], 'Complete unchanged-source browser follow-up')
require(set(followup['gates']) == {'browser'} and followup['gates']['browser']['outcome'] == 'passed' and followup['gates']['browser']['exitCode'] == 0, 'Complete browser follow-up gate')
require(followup['gates']['browser']['command'][1:] == ['tests/browser/run.mjs'], 'Complete browser follow-up command')
require(integration['gates']['browser']['command'][1:] == ['tests/browser/run.mjs'], 'Ordinary command')
require(integration['gates']['intro']['command'][1:] == ['tests/browser/physical-history.mjs', '--intro-only'], 'Physical introduction command')
engines = {'v24.22.1': node_summary(integration_path / 'node.log')}
for version in ('v20.19.0', 'v22.23.4'):
    engines[version] = node_summary(integration_path / (version.replace('.', '-') + '-node.log'))

browser_log = (followup_path / 'browser.log').read_text()
runner = common.git_bytes(source, 'tests/browser/run.mjs').decode()
labels_text = runner[runner.index('const labels ='):runner.index('const pages =')]
expected_labels = re.findall(r"'([\w-]+\.html?)'", labels_text)
visited_labels = re.findall(r'^([\w-]+\.html?): ', browser_log, re.M)
require(visited_labels == expected_labels, 'Ordinary registry/order')
require(len(expected_labels) == 69 and len(set(expected_labels)) == 65, 'Ordinary count')
intro = read(integration_path / 'intro.log')
require(set(intro) == {'enterScenario', 'toolboxScenario', 'historyMatrix'}, 'Physical introduction inventory')
require(len(intro['enterScenario']) == 6 and len(intro['toolboxScenario']) == 8, 'Physical checkpoints')
require(len(intro['historyMatrix']['historyCases']) == 14, 'History introduction cases')
heap = json.loads(next(line for line in (integration_path / 'heap.log').read_text().splitlines() if line.startswith('{"sentinels":')))
require(heap['sentinels'] == 23 and heap['retained'] == 0, 'Heap sentinels')
require(heap['historyEviction']['retainedControlReleased'] is True and heap['historyEviction']['replay'], 'History heap controls')

phase = read(directory / 'phase-manifest.json')
require(phase['source'] == source and phase['finishedAt'], 'Final phase incomplete')
require([s['name'] for s in phase['steps']] == ['native', 'block-roundtrip', 'html-native-layers', 'canonical-work', 'structural', 'corpora'], 'Final phase inventory')
require(all(s['sourceUnchanged'] and s['sourceAfter'] == source for s in phase['steps']), 'Final phase source')
require(all(s['code'] == 0 for s in phase['steps'] if s['name'] not in ('native', 'corpora')), 'Final unaffected comparative phase exit codes')
require(phase['steps'][0]['code'] in (0, 1), 'Original native exit code')
fixture_followups = read(directory / 'fixture-followups/manifest.json')
fixture_source = fixture_followups['source']
require(fixture_source == '8c97508830a3985b11155bc21fff8b9ccbeb59a3', 'Image fixture source')
require(fixture_followups['baseSource'] == source and fixture_followups['sourceAfter'] == fixture_source and fixture_followups['sourceUnchanged'] and fixture_followups['finishedAt'], 'Fixture follow-up source/completion')
fixture_changes = set(subprocess.check_output(['git', 'diff', '--name-only', source, fixture_source], text=True).splitlines())
require(fixture_changes == {'RECTOR_V2_LIBRARY_RECHECK_2026-11-05.md', 'tests/browser/image-functional-fixture.js'} == set(fixture_followups['changed']), 'Fixture follow-up changes production or other oracles')
require({(r['kind'], r['file']) for r in fixture_followups['results']} == {('corpus', 'image-functional.mjs'), ('native', 'native-image-functional.html'), ('native', 'native-image-functional-trusted.html')}, 'Fixture full follow-up inventory')
require(all(r['passed'] and r['code'] == 0 and not r['parseError'] for r in fixture_followups['results']), 'Fixture full follow-ups failed')
native = read(directory / 'native/manifest.json')
require(native['source'] == native['sourceAfter'] == source and native['sourceUnchanged'] and native['finishedAt'], 'Native source/completion')
require(native['driverSha256'] == common.digest(common.git_bytes(source, 'tests/browser/physical-history.mjs')), 'Native driver identity')
inventory = {p.name for p in (repo / 'tests/browser').glob('native-*.html')}
require(len(inventory) == len(native['results']) == len(native['pages']) == 159, 'Native count')
require(inventory == set(native['pages']) == {r['page'] for r in native['results']}, 'Native registry')
followups = read(directory / 'native-followups/manifest.json')
require(followups['source'] == followups['sourceAfter'] == source and followups['sourceUnchanged'] and followups['finishedAt'], 'Native follow-up source/completion')
failed_pages = {r['page'] for r in native['results'] if not r['passed']}
require(failed_pages == set(followups['pages']) == {r['page'] for r in followups['results']}, 'Native follow-up inventory')
replacements = {r['page']: r for r in followups['results']}
fixture_native = {r['file']: dict(r, page=r['file']) for r in fixture_followups['results'] if r['kind'] == 'native'}
native_cases = 0
for original in native['results']:
    if original['page'] in fixture_native:
        folder, result = 'fixture-followups', fixture_native[original['page']]
        require(original['cases'] == result['cases'], 'Updated fixture native case inventory')
    else:
        folder, result = ('native-followups', replacements[original['page']]) if original['page'] in replacements else ('native', original)
    page = result['page']
    require(result['passed'] and result['code'] == 0 and not result['parseError'] and not result.get('timedOut'), page)
    log = (directory / folder / (page + '.log')).read_text()
    rows = json.loads(next(line for line in log.splitlines() if line.startswith('{"' + page + '":')))[page]
    require(rows and len(rows) == result['cases'] and all(r['status'] == 'PASS' for r in rows), page)

    if page in replacements or page in fixture_native:
        initial_log = (directory / 'native' / (page + '.log')).read_text()
        old_line = next((line for line in initial_log.splitlines() if line.startswith('{"' + page + '":')), None)
        marker = initial_log.find('Error: History matrix failed: ')
        start = initial_log.find('[\n', marker) if marker >= 0 else -1
        end = initial_log.find('\n]\n', start) if start >= 0 else -1
        if old_line:
            old_rows = json.loads(old_line)[page]
            require([r['name'] for r in old_rows] == [r['name'] for r in rows], page + ': changed full-page bodies')
        elif start >= 0 and end > start:
            old_rows = json.loads(initial_log[start:end + 2])
            require([r['name'] for r in old_rows] == [r['name'] for r in rows], page + ': changed full-page bodies')

    duplicates = {n: c for n, c in Counter(r['name'] for r in rows).items() if c > 1}
    expected = {'physical typing preserves the caret after inline-pattern paste: "#ff0000 tail"': 2} if page == 'native-text-input.html' else {}
    require(duplicates == expected, (page, duplicates))
    native_cases += len(rows)
require(native_cases == 6009, 'Complete native body count including full-page follow-ups')

roundtrip = read(directory / 'block-roundtrip.log')
require(roundtrip['headBefore'] == roundtrip['headAfter'] == source and roundtrip['sourceUnchanged'] and roundtrip['sourceIdentityVerified'], 'Roundtrip source')
require(not roundtrip['requestedFilter'] and not roundtrip['serverErrors'], 'Roundtrip full execution')
current = next(r for r in roundtrip['results'] if r['source'] == 'candidate')
require(len(current['cases']) == len(roundtrip['selectedCaseIds']) == 65, 'Common roundtrip count')
require([c['id'] for c in current['cases']] == roundtrip['selectedCaseIds'], 'Common roundtrip registry')
require(not current['errors'] and not current['pageErrors'], 'Common current errors')
roundtrip_totals = dict(observations=0, verdicts=0, completedBodies=0, moduleRecords=0)
for case in current['cases']:
    require(not case.get('error') and not case['failures'] and not case['unexpectedFailures'], case['id'])
    common.records(case, roundtrip_totals)
require(not [r for r in roundtrip['incompleteCases'] if r['source'] == 'candidate'], 'Incomplete common current bodies')
require(roundtrip_totals['observations'] == 11446, 'Common roundtrip literal inventory differs')
for key, path in {'sourceSha256': 'scripts/parity/block-roundtrip.mjs', 'fixtureSha256': 'tests/browser/block-roundtrip-fixture.js',
                  'classifierSha256': 'scripts/parity/link-poll-roundtrip-classifiers.mjs', 'galleryClassifierSha256': 'scripts/parity/gallery-roundtrip-classifiers.mjs',
                  'personClassifierSha256': 'scripts/parity/person-roundtrip-classifiers.mjs', 'carouselClassifierSha256': 'scripts/parity/carousel-roundtrip-classifiers.mjs',
                  'carouselMediaSha256': 'tests/browser/carousel-roundtrip-16x16.webm'}.items():
    require(roundtrip[key] == common.digest(common.git_bytes(source, path)), 'Roundtrip fixture/runner: ' + path)

layers = read(directory / 'html-native-layers.log')
require(layers['head'] == layers['productionSource']['sha'] == source and layers['sourceUnchanged'] and not layers['kindFilter'], 'HTML layers source/scope')
require(len(layers['results']) == 65 and len({(r['kind'], r['surface']) for r in layers['results']}) == 65, 'HTML layer inventory')
require(all(not r.get('error') and not r['errors'] and r['sourceUnchanged'] for r in layers['results']), 'HTML layer failures')
for path, expected in layers['productionSource']['modules'].items():
    require(common.digest(common.git_bytes(source, path)) == expected, 'HTML module: ' + path)
for path, expected in layers['sourceHashes'].items():
    data = Path(path).read_bytes() if path.startswith('node_modules/') else common.git_bytes(source, path)
    require(common.digest(data) == expected, 'HTML source: ' + path)

canonical = read(directory / 'canonical-work.json')
require(canonical['sourceUnchanged'] and len(canonical['rows']) == 10 and canonical['sources'][1]['head'] == source, 'Canonical work scope')
require(canonical['runnerSha256'] == common.digest(common.git_bytes(source, 'benchmarks/canonical-read-work.mjs')), 'Canonical runner')
for variant in canonical['sources']:
    for path, expected in variant['hashes'].items():
        require(common.digest(common.git_bytes(variant['head'], path)) == expected, 'Canonical source: ' + path)
for row in canonical['rows']:
    for variant in ('baseline', 'candidate'):
        require(row[variant]['observerControl']['jsonRecordVisits'] > 0 and row[variant]['observerControl']['tablePayloadVisits'] > 0, 'Canonical live control')
    require(row['avoidedJsonRecordVisits'] == row['baseline']['jsonRecordVisits'] - row['candidate']['jsonRecordVisits'] > 0, 'Canonical JSON reduction')
    require(row['avoidedTablePayloadVisits'] == row['baseline']['tablePayloadVisits'] - row['candidate']['tablePayloadVisits'] > 0, 'Canonical payload reduction')

corpora = read(directory / 'corpora/manifest.json')
require(corpora['source'] == corpora['sourceAfter'] == source and corpora['finishedAt'], 'Corpora source/completion')
require(len(corpora['files']) == len(corpora['results']) == 100, 'Corpora count')

with tarfile.open(repo / 'scripts/parity/checkpoints/2026-11-05/audit-completion/execution.tar.gz') as archive:
    previous_inventory = json.load(archive.extractfile('corpora/manifest.json'))['files']
require(set(corpora['files']) == set(previous_inventory), 'Full maintained corpus registry differs')

require(sorted(corpora['files']) == sorted(r['file'] for r in corpora['results']), 'Corpora registry')
failed_corpora = {r['file'] for r in corpora['results'] if not r['candidatePass'] or r['parseError'] or r['timedOut']}
require(failed_corpora == {'image-functional.mjs'} and phase['steps'][-1]['code'] == 1, 'Original Image sampling failure inventory')
totals = dict(observations=0, verdicts=0, completedBodies=0, moduleRecords=0)
reports, historical_exits = [], []
for original in corpora['results']:
    fixture_replacement = original['file'] == 'image-functional.mjs'
    result = next(r for r in fixture_followups['results'] if r['kind'] == 'corpus') if fixture_replacement else original
    file = result['file']
    require(result.get('candidatePass', result.get('passed')) and not result['parseError'] and not result.get('timedOut'), file)
    path = directory / ('fixture-followups' if fixture_replacement else 'corpora') / (file + '.json')
    report = read(path)
    if fixture_replacement:
        old_report = read(directory / 'corpora' / (file + '.json'))
        old_current = [r for r in old_report['results'] if r.get('source') == 'candidate']
        new_current = [r for r in report['results'] if r.get('source') == 'candidate']
        require(len(old_current) == len(new_current) == 2, 'Image full policy inventory')
        for old_policy, new_policy in zip(old_current, new_current):
            require(old_policy['trustedPolicy'] == new_policy['trustedPolicy'], 'Image policy order')
            require([c['id'] for c in old_policy['cases']] == [c['id'] for c in new_policy['cases']], 'Image full case inventory')
            for old_case, new_case in zip(old_policy['cases'], new_policy['cases']):
                require(common.equal(old_case['spec'], new_case['spec']), 'Image input changed')
                require(common.equal([[o['phase'], o['property'], o['expected']] for o in old_case['observations']], [[o['phase'], o['property'], o['expected']] for o in new_case['observations']]), 'Image literal oracle changed')
    common.use_candidate(fixture_source if fixture_replacement else source)
    try:
        counts = common.corpus(file, report)
    finally:
        common.use_candidate(source)
    for key, value in counts.items():
        totals[key] += value
    if result['code'] != 0:
        require(result['code'] == 1 and 'sources' in report, file)
        historical = [r for r in report['results'] if r.get('source') not in (None, 'candidate')]
        differences = common.historical_differences(historical)
        require(differences > 0, file + ': unattributed nonzero exit')
        historical_exits.append(dict(file=file, rawHistoricalDifferences=differences))
    reports.append(dict(file=file, reportSha256=common.digest(path.read_bytes()), **counts))
require(totals == dict(observations=132609, verdicts=501, completedBodies=3648, moduleRecords=38248), 'Full fixed comparative inventory/totals differ')
print(json.dumps(dict(source=source, fixtureSource=fixture_source, fixtureOnlyDiff=sorted(fixture_changes), corpusFollowups=sorted(failed_corpora), reviewerSha256=common.digest(Path(__file__).read_bytes()), integration=str(integration_path), originalIntegrationOutcome=integration['outcome'], browserFollowup=str(followup_path), gates=len(gates), engines=engines,
                     ordinaryExecutions=69, ordinaryDistinctPages=65, physicalIntroduction=True,
                     nativePages=159, nativeCases=native_cases, nativeFollowups=sorted(replacements), fixtureNativeFollowups=sorted(fixture_native), originalNativeExitCode=phase['steps'][0]['code'], heapSentinels=heap['sentinels'], heapRetained=heap['retained'],
                     commonRoundtripCases=65, commonRoundtripObservations=roundtrip_totals['observations'], htmlLayerCases=65, canonicalWorkPairs=10,
                     corpusCount=100, historicalComparisonExitOne=historical_exits, **totals, corpora=reports), indent=2))
