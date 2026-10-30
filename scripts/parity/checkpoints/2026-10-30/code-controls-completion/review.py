"""Recalculate recorded verdicts and verify immutable source/dependency bytes.

This verifies the archived evidence; it does not rerun a browser or turn an
unexecuted platform into a pass. Run from any directory with Python 3 and Git.
"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

checkpoint = Path(__file__).resolve().parent
repo = checkpoint.parents[4]
manifest = json.loads((checkpoint / 'manifest.json').read_text())


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def unpack(path):
    value = path.read_bytes()
    return gzip.decompress(value) if path.suffix == '.gz' else value


def git(*args, env=None, input=None):
    return subprocess.check_output(['git', *args], cwd=repo, env=env, input=input)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


source_trees = {}
for label, identity in manifest['sources'].items():
    patch = unpack(checkpoint / identity['patch'])
    assert sha256(patch) == identity['patchSha256'], label
    with tempfile.TemporaryDirectory(prefix='code-proof-index-') as temporary:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(temporary) / 'index'))
        git('read-tree', identity['base'], env=env)
        git('apply', '--cached', '--binary', '-', env=env, input=patch)
        tree = git('write-tree', env=env).decode().strip()
        assert tree == identity['tree'], (label, tree, identity['tree'])
        source_trees[identity['commit']] = tree

comparison_reviews = []
source_hashes = dependency_hashes = bundle_hashes = verdicts = 0
dependency_root = Path(os.environ.get('EDITOR_DEPENDENCIES_ROOT', repo / 'node_modules'))
for comparison in manifest['comparisons']:
    data = json.loads(unpack(checkpoint / comparison['evidence']))
    assert data['headBefore'] == data['headAfter']
    candidate_tree = source_trees.get(data['headBefore'], data['headBefore'])
    assert data['runnerSha256'] == sha256(git('show', f'{candidate_tree}:scripts/parity/code-controls.mjs'))
    assert data['fixtureSha256'] == sha256(git('show', f'{candidate_tree}:tests/browser/code-controls-parity-fixture.js'))
    if 'rendererFixtureSha256' in data:
        assert data['rendererFixtureSha256'] == sha256(git('show', f'{candidate_tree}:tests/browser/code-renderer-parity-fixture.js'))
    for source in data['sources']:
        tree = source_trees.get(source['sha'], source['sha'])
        for path, expected in source['loaded'].items():
            assert sha256(git('show', f'{tree}:{path}')) == expected, (comparison['name'], source['label'], path)
            source_hashes += 1
    for path, expected in data['dependencyFiles'].items():
        assert sha256((dependency_root / path).read_bytes()) == expected, path
        dependency_hashes += 1
    for path, expected in data['highlighterInputs'].items():
        assert sha256((dependency_root / path).read_bytes()) == expected, path
        bundle_hashes += 1
    result_counts = {}
    mismatches = []
    for result in data['results']:
        failures = []
        for observation in result['observations']:
            # Old development captures omitted undefined values during JSON
            # encoding. New fixtures tag them explicitly and snapshot values.
            actual = observation.get('actual', {'undefinedValue': True})
            wanted = observation.get('expected', {'undefinedValue': True})
            expected = 'PASS' if canonical(actual) == canonical(wanted) else 'FAIL'
            if observation['status'] != expected:
                mismatches.append({'source': result['source'], 'case': result['name'],
                    'phase': observation['phase'], 'property': observation['property'],
                    'recorded': observation['status'], 'recalculated': expected})
            if expected == 'FAIL':
                failures.append(observation)
            verdicts += 1
        if comparison.get('expectedVerdictMismatches', 0) == 0:
            assert failures == result['failures'], (comparison['name'], result['name'])
        assert result['incomplete'] == ('dispose' not in result['completedPhases'])
        counts = result_counts.setdefault(result['source'], {'cases': 0, 'observations': 0, 'rawFailures': 0, 'errors': 0})
        counts['cases'] += 1
        counts['observations'] += len(result['observations'])
        counts['rawFailures'] += len(failures)
        counts['errors'] += bool(result['error'] or result['errors'] or result['incomplete'])
    candidates = [result for result in data['results'] if result['source'] == 'candidate']
    candidate_pass = len(candidates) == len(data['selectedCases']) and all(
        not (result['error'] or result['errors'] or result['failures'] or result['incomplete'])
        for result in candidates
    )
    assert data['candidatePass'] == candidate_pass
    assert len(mismatches) == comparison.get('expectedVerdictMismatches', 0), (comparison['name'], mismatches)
    if mismatches:
        assert comparison.get('acceptedForParity') is False
    if comparison['name'] == 'reviewed-final':
        assert candidate_pass and not data['serverErrors']
        assert result_counts == manifest['finalCounts']
        assert len(candidates) == 28
    comparison_reviews.append({'name': comparison['name'], 'candidatePass': candidate_pass,
        'counts': result_counts, 'recordedVerdictMismatches': mismatches,
        'acceptedForParity': comparison.get('acceptedForParity', False)})

artifact_count = 0
hash_file = checkpoint / 'artifact-hashes.json'
if hash_file.exists():
    for artifact in json.loads(hash_file.read_text()):
        path = checkpoint / artifact['path']
        assert sha256(path.read_bytes()) == artifact['sha256'], artifact['path']
        if 'decodedSha256' in artifact:
            assert sha256(unpack(path)) == artifact['decodedSha256'], artifact['path']
        artifact_count += 1

print(json.dumps({
    'status': 'PASS', 'sourceTreesReconstructed': len(manifest['sources']),
    'verdictsRecalculated': verdicts, 'sourceHashRecordsVerified': source_hashes,
    'servedDependencyHashRecordsVerified': dependency_hashes,
    'highlighterInputHashRecordsVerified': bundle_hashes, 'archiveHashesVerified': artifact_count,
    'comparisons': comparison_reviews,
    'scope': 'Recorded verdict consistency and immutable bytes; this is not independent browser execution.',
}, indent=2))
