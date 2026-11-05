"""Review final execution completeness/identity; scenario oracles retain their own checkpoints."""
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

CANDIDATE = 'e88992ee55b17e635be38a7ef715c076f6a8ac64'
GIT_CACHE = {}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def equal(left, right):
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(equal(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(equal(a, b) for a, b in zip(left, right))
    return left == right


def git_bytes(sha, path):
    key = (sha, path)
    if key not in GIT_CACHE:
        GIT_CACHE[key] = subprocess.check_output(['git', 'show', sha + ':' + path])
    return GIT_CACHE[key]


def records(value, totals):
    if isinstance(value, list):
        for child in value:
            records(child, totals)
    elif isinstance(value, dict):
        if 'actual' in value and 'expected' in value:
            assert equal(value['actual'], value['expected']), str(value)[:300]
            if 'status' in value:
                assert value['status'] == 'PASS'
            totals['observations'] += 1
            return
        if value.get('status') in ('PASS', 'FAIL', 'TIMEOUT', 'SKIP'):
            assert value['status'] == 'PASS', str(value)[:300]
            totals['verdicts'] += 1
        if 'planned' in value and 'completedPhases' in value:
            assert value['planned'] == value['completedPhases'], value.get('id')
            totals['completedBodies'] += 1
        if 'observations' in value and 'error' in value:
            assert value['error'] is None, str(value)[:300]
            assert not value.get('unsupported'), str(value.get('unsupported'))[:300]
        for key in ('pageErrors', 'inputErrors', 'unavailable', 'serverErrors'):
            if key in value:
                assert not value[key], str(value[key])[:300]
        if 'complete' in value:
            assert value['complete'] is True
        for key, child in value.items():
            if key not in ('spec', 'specification', 'transactions', 'diagnostics'):
                records(child, totals)


def resource_effects(report):
    rows = report['results']
    surfaces = {'native', 'native-cssom', 'raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer'}
    assert len(rows) == 24 and {r['surface'] for r in rows} == surfaces
    assert len({(r['profile'], r['cssMode'], r['surface']) for r in rows}) == 24
    network_kinds = {'application-css', 'font', 'inline-css', 'media', 'policy-default', 'poster', 'private', 'relative', 'srcset'}
    for row in rows:
        assert not row.get('error') and not row['errors']
        for phase, size in [('observation', {'width': 100, 'height': 80}), ('resized', {'width': 120, 'height': 90})]:
            observation = row[phase]
            for key in ['font', 'animationPresent', 'animationPreserved', 'animationAdvances', 'sourceUnchanged']:
                assert observation[key] is True
            assert observation['viewport'] == size
            assert observation['media'] == {'width': 16, 'height': 16}
            assert observation['faces'] == [{'family': 'ResourceProof', 'status': 'loaded'}]
            assert observation['forbidden'] == 0
            assert observation['referrerPolicy'] == 'no-referrer'
            assert observation['untrustedReferrerPolicy'] is None
            assert len(observation['image']) == 4 and all(i['width'] == 1 for i in observation['image'])
        control = next(r for r in rows if r['profile'] == row['profile'] and r['cssMode'] == row['cssMode'] and r['surface'] == 'native')
        for phase in ['observation', 'resized']:
            actual = {k: v for k, v in row[phase].items() if k != 'sameFaces'}
            expected = {k: v for k, v in control[phase].items() if k != 'sameFaces'}
            assert equal(actual, expected)
        if not row['resized']['sameFaces']:
            cssom = next(r for r in rows if r['profile'] == row['profile'] and r['cssMode'] == row['cssMode'] and r['surface'] == 'native-cssom')
            assert cssom['resized']['sameFaces'] is False
        assert row['observation']['sameFaces'] is True
        assert {r['kind'] for r in row['network']} == network_kinds
        assert equal(row['network'], control['network'])
        for request in row['network']:
            assert request['cookie'] == ('' if row['profile'] == 'cross-origin' and request['kind'] == 'font' else 'task_owner=owned-resource')
            assert request['referer'] == ('' if request['kind'] == 'private' else report['origin'] + ('/' if row['profile'] == 'cross-origin' else '/resource-owner'))


def corpus(file, report, check_git=True):
    assert report['candidatePass'] is True, file
    assert report.get('headBefore', report.get('head')) == CANDIDATE, file
    assert report.get('headAfter', CANDIDATE) == CANDIDATE, file
    assert report.get('sourceUnchanged', True) is True, file
    assert not report.get('filter'), file
    for key in ('errors', 'failures', 'serverErrors'):
        assert not report.get(key), (file, key)
    totals = dict(observations=0, verdicts=0, completedBodies=0, moduleRecords=0)
    if check_git:
        runner = git_bytes(CANDIDATE, 'scripts/parity/' + file)
        if 'runnerSha256' in report:
            assert report['runnerSha256'] == digest(runner), file
        if 'fixtureSha256' in report:
            if 'fixturePath' in report:
                paths = [report['fixturePath'].encode()]
                assert b"'" + paths[0] + b"'" in runner, file
            else:
                paths = re.findall(rb"fixturePath\s*=\s*['\"]([^'\"]+)['\"]", runner)
                if not paths:
                    literals = set(re.findall(rb'tests/browser/[A-Za-z0-9_./-]+\.js', runner))
                    paths = [path for path in literals if digest(git_bytes(CANDIDATE, path.decode())) == report['fixtureSha256']]
            assert len(paths) == 1, (file, paths)
            assert report['fixtureSha256'] == digest(git_bytes(CANDIDATE, paths[0].decode())), file
        if 'packageLockSha256' in report:
            assert report['packageLockSha256'] == digest(git_bytes(CANDIDATE, 'package-lock.json'))
        for path, expected in report.get('fixtureFiles', {}).items():
            assert digest(git_bytes(CANDIDATE, path.lstrip('/'))) == expected
        for path, expected in report.get('sourceHashes', {}).items():
            data = Path(path).read_bytes() if path.startswith('node_modules/') else git_bytes(CANDIDATE, path)
            assert digest(data) == expected, (file, path)
        for path, expected in report.get('productionSource', {}).get('modules', {}).items():
            assert digest(git_bytes(CANDIDATE, path)) == expected, (file, path)
        dependencies = report.get('dependencyFiles', report.get('dependencies', {}).get('files', {}))
        for path, expected in dependencies.items():
            target = Path(path) if path.startswith('node_modules/') else Path('node_modules') / path
            assert digest(target.read_bytes()) == expected, (file, path)
        versions = report.get('dependencyVersions', report.get('dependencies', {}).get('versions', {}))
        for name, version in versions.items():
            assert json.loads((Path('node_modules') / name / 'package.json').read_text())['version'] == version
    if 'sources' in report:
        candidates = [s for s in report['sources'] if s['label'] == 'candidate']
        assert len(candidates) == 1 and candidates[0].get('sha', candidates[0].get('object')) == CANDIDATE
        for source in report['sources']:
            graph = source.get('loaded', source.get('served', source.get('files', {})))
            assert graph, (file, source['label'])
            for path, expected in graph.items():
                totals['moduleRecords'] += 1
                if check_git:
                    assert digest(git_bytes(source.get('sha', source.get('object')), path)) == expected, (file, source['label'], path)
    rows = report['results']
    selected = [r for r in rows if r.get('source') == 'candidate'] if any('source' in r for r in rows) else rows
    assert selected, file
    policies = [r['trustedPolicy'] for r in selected if 'trustedPolicy' in r]
    if policies:
        assert policies == [False, True], (file, policies)
        assert [c.get('id', c.get('name')) for c in selected[0]['cases']] == [c.get('id', c.get('name')) for c in selected[1]['cases']]
    for row in selected:
        if 'trustedPolicy' in row:
            assert row.get('policyEnforced', row.get('trustedPolicy')) == row['trustedPolicy']
        if 'cases' in row:
            assert row['cases'], file
            ids = [c.get('id', c.get('name')) for c in row['cases']]
            assert len(ids) == len(set(ids)), file
        records(row, totals)
        if file in ('html-content-navigation.mjs', 'html-targets.mjs'):
            assert equal(row['candidate']['actual'], row['control']['actual'])
            assert row['control']['actual']['settled'] is True
            assert row['control']['actual']['activations']
            assert all(e['trusted'] is True for e in row['control']['actual']['activations'])
    if file == 'html-resource-effects.mjs':
        resource_effects(report)
        totals['verdicts'] += 24
    assert totals['observations'] or totals['verdicts'], file
    return totals


def native_results(path, page):
    text = path.read_text()
    prefix = 'Native ' + page + ': '
    match = re.search(r'^' + re.escape(prefix) + r'(\d+) passed$', text, re.M)
    assert match, str(path)
    line = next(line for line in text.splitlines() if line.startswith('{"' + page + '":'))
    rows = json.loads(line)[page]
    assert len(rows) == int(match[1]) and rows
    assert all(r['status'] == 'PASS' for r in rows)
    duplicates = {name: count for name, count in Counter(r['name'] for r in rows).items() if count > 1}
    # Two distinct fixtures (empty text / middle of "abcd") share this label.
    expected_duplicates = {'physical typing preserves the caret after inline-pattern paste: "#ff0000 tail"': 2} if page == 'native-text-input.html' else {}
    assert duplicates == expected_duplicates, (page, duplicates)
    return rows


def historical_differences(value):
    if isinstance(value, list):
        return sum(historical_differences(child) for child in value)
    if not isinstance(value, dict):
        return 0
    if 'actual' in value and 'expected' in value:
        return int(value.get('status') == 'FAIL')
    count = int(value.get('status') == 'FAIL')
    if value.get('error') and any(key in value for key in ('observations', 'cases', 'surface', 'name', 'id')):
        count += 1
    for key in ('unsupported', 'unavailable', 'pageErrors', 'inputErrors'):
        if value.get(key):
            count += len(value[key])
    return count + sum(historical_differences(v) for k, v in value.items()
                       if k not in ('spec', 'specification', 'actual', 'expected', 'transactions', 'diagnostics'))


def review(directory):
    directory = Path(directory)
    integration = json.loads((directory / 'integration-manifest.json').read_text())
    assert integration['outcome'] == 'passed' and integration['sourceUnchanged'] is True
    assert integration['source'] == integration['sourceAfter']
    assert integration['source']['head'] == CANDIDATE and integration['source']['dirty'] is False
    assert integration['source']['patchSha256'] == digest(b'')
    assert set(integration['gates']) == {'typecheck', 'node', 'build', 'package', 'browser', 'heap', 'docs', 'types', 'site', 'bundle'}
    assert all(gate['outcome'] == 'passed' and gate['exitCode'] == 0 for gate in integration['gates'].values())
    native = json.loads((directory / 'native/manifest.json').read_text())
    corpora = json.loads((directory / 'corpora/manifest.json').read_text())
    followups = json.loads((directory / 'followups/manifest.json').read_text())
    assert native['finishedAt'] and corpora['finishedAt'] and followups['finishedAt']
    for manifest, key, expected_count in [(native, 'pages', 159), (corpora, 'files', 100)]:
        assert manifest['source'] == manifest['sourceAfter'] == CANDIDATE
        assert len(manifest[key]) == len(set(manifest[key])) == expected_count
        assert sorted(manifest[key]) == sorted(r['page' if key == 'pages' else 'file'] for r in manifest['results'])
    current_driver = Path('tests/browser/physical-history.mjs').read_bytes()
    assert set(re.findall(rb'native-[a-z0-9-]+\.html', current_driver)) == {p.encode() for p in native['pages']}
    production_paths = ['core', 'shared', 'plugin-kit', 'plugins', 'inline-plugins', 'inline-tools',
                        'preset', 'renderer', 'locale', 'package.json', 'package-lock.json', 'scripts/build.mjs']
    assert subprocess.run(['git', 'diff', '--quiet', CANDIDATE, 'HEAD', '--', *production_paths]).returncode == 0
    rounds = [('followups', followups)]
    second_path = directory / 'followups-second/manifest.json'
    if second_path.exists():
        rounds.append(('followups-second', json.loads(second_path.read_text())))
    replacements = {}
    for folder, round_result in rounds:
        assert round_result['candidate'] == CANDIDATE and round_result['finishedAt']
        assert sorted(round_result['pages']) == sorted(r['page'] for r in round_result['results'])
        for result in round_result['results']:
            assert result['page'] in native['pages']
            replacements[result['page']] = (folder, result)
    native_cases = 0
    for initial in native['results']:
        page = initial['page']
        folder, result = replacements.get(page, ('native', initial))
        assert result['passed'] and result['code'] == 0 and not result.get('timedOut')
        rows = native_results(directory / folder / (page + '.log'), page)
        native_cases += len(rows)
        if page in replacements:
            original = (directory / 'native' / (page + '.log')).read_text()
            start, end = original.find('[\n'), original.rfind('\n]')
            if start >= 0 and end > start:
                old_rows = json.loads(original[start:end + 2])
                assert [r['name'] for r in rows] == [r['name'] for r in old_rows]
    corpus_followups_path = directory / 'corpus-followups/manifest.json'
    corpus_followups = json.loads(corpus_followups_path.read_text()) if corpus_followups_path.exists() else {'results': []}
    replacements = {r['file']: r for r in corpus_followups['results']}
    totals = dict(observations=0, verdicts=0, completedBodies=0, moduleRecords=0)
    reviewed, historical_exits = [], []
    for initial in corpora['results']:
        file = initial['file']
        result = replacements.get(file, initial)
        assert result['candidatePass'] and not result['timedOut'] and not result['parseError'], file
        folder = 'corpus-followups' if file in replacements else 'corpora'
        report_path = directory / folder / (file + '.json')
        report = json.loads(report_path.read_text())
        counts = corpus(file, report)
        for key, value in counts.items():
            totals[key] += value
        if result['code'] != 0:
            assert result['code'] == 1 and 'sources' in report, file
            historical = [r for r in report['results'] if r.get('source') not in (None, 'candidate')]
            differences = historical_differences(historical)
            assert differences > 0, (file, 'Nonzero exit without attributable historical failure/unavailability')
            historical_exits.append(dict(file=file, rawHistoricalDifferences=differences))
        reviewed.append(dict(file=file, reportSha256=digest(report_path.read_bytes()), **counts))
    color_root = directory / 'color-supplement'
    color = json.loads((color_root / 'comparison.json').read_text())
    color_totals = corpus('color-input-supplement', color, False)
    assert color_totals['completedBodies'] == 12 and color_totals['observations'] == 518
    assert color['fixtureSha256'] == digest((color_root / 'fixture.js').read_bytes())
    assert color['runnerSha256'] == digest((color_root / 'runner.mjs').read_bytes())
    for source in color['sources']:
        for path, expected in source['loaded'].items():
            assert digest(git_bytes(source['sha'], path)) == expected
    return dict(candidate=CANDIDATE, nativePages=159, nativeCases=native_cases,
                corpusCount=100, **totals, historicalComparisonExitOne=historical_exits,
                nativeFollowups=[dict(round=folder, **r) for folder, d in rounds for r in d['results']],
                corpusFollowups=corpus_followups['results'], colorSupplement=color_totals, corpora=reviewed)


if __name__ == '__main__':
    print(json.dumps(review(sys.argv[1]), indent=2))
