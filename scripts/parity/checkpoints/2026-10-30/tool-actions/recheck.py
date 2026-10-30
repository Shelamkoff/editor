#!/usr/bin/env python3
"""Recompute raw verdicts, case coverage, immutable source hashes and patches.

This audit does not invent semantic expectations from observed editor output.
The fixed authored oracles live in the reviewed fixture; this script checks
their raw equality results and provenance independently of the JS verdict flag.
"""
import argparse
from collections import Counter
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    checkpoint = Path(__file__).resolve().parent
    repo = args.repo.resolve()
    env = os.environ.copy()
    for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']:
        env.pop(key, None)
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_NO_REPLACE_OBJECTS='1')

    def git(*parts, input=None, environment=None):
        return subprocess.check_output(['git', '-C', str(repo), *parts], input=input, env=environment or env)

    raw = (checkpoint / 'final-differential.json.gz').read_bytes()
    data = json.loads(gzip.decompress(raw))
    manifest = read_json(checkpoint / 'manifest.json')
    assert data['headBefore'] == data['headAfter'] == manifest['source']
    assert data['candidatePass'] is True and data['serverErrors'] == []
    expected_ids = []
    for tool in ['clearFormatting', 'caseTransform']:
        for variant in (['mixed', 'upper'] if tool == 'caseTransform' else ['mixed']):
            for shape in ['single', 'cross', 'fields']:
                for boundary in ['Text', 'Element']:
                    for direction in ['forward', 'backward']:
                        expected_ids.append('/'.join([tool, variant, shape, boundary, direction]))
        for kind in ['text', 'atomic']:
            for direction in ['forward', 'backward']:
                expected_ids.append('/'.join([tool, 'noop', kind, direction]))
        for lifetime in ['read-only', 'destroy']:
            expected_ids.append('/'.join([tool, 'lifetime', lifetime]))
    assert len(expected_ids) == 48
    rows, verdict_count = [], 0
    for row in data['results']:
        assert [case['id'] for case in row['cases']] == expected_ids
        assert row['pageErrors'] == row['inputErrors'] == []
        failures, incomplete, unsupported = [], [], Counter()
        count = 0
        for case in row['cases']:
            assert case['diagnostics'] == []
            planned = ['load', 'input', 'selection', 'apply', 'undo-action', 'undo-input', 'redo-input', 'redo-action', 'dispose']
            if case['spec'].get('noop'):
                planned = ['load', 'input', 'prepare-redo', 'selection', 'apply', 'redo-input', 'undo-input', 'dispose']
            if case['spec'].get('lifetime'):
                planned = ['load', 'inactive-ui', 'live-action', 'undo', 'redo', 'dispose']
            assert case['planned'] == planned
            if case['completedPhases'] != planned:
                incomplete.append(case['id'])
                assert row['source'] == 'v1' and case['spec'].get('noop') == 'atomic'
                assert case['completedPhases'] == planned[:4]
                assert 'Named public toolbar action is not visible' in case['error']
            else:
                assert case['error'] is None
            unsupported.update(value['property'] for value in case['unsupported'])
            for observation in case['observations']:
                assert 'actual' in observation and 'expected' in observation
                verdict = 'PASS' if observation['actual'] == observation['expected'] else 'FAIL'
                assert observation['status'] == verdict
                count += 1
                if verdict == 'FAIL':
                    failures.append({'id': case['id'], 'phase': observation['phase'], 'property': observation['property']})
                if observation['property'] in ['fixedInputMeaning', 'independentPrecedingEdit', 'exactInitialEndpoints', 'fixedWidgetPayload']:
                    assert verdict == 'PASS', 'An invalid source fixture cannot prove tool parity'
            if row['source'] == 'candidate':
                assert all(value.get('trusted') is True for value in case['trusted'])
                expected_actions = ['commit', 'commit', 'undo', 'undo', 'redo', 'redo']
                if case['spec'].get('noop'):
                    expected_actions = ['commit', 'undo', 'redo', 'undo']
                if case['spec'].get('lifetime'):
                    expected_actions = ['commit', 'undo', 'redo']
                assert [event['action'] for event in case['transactions']] == expected_actions
        if row['source'] == 'candidate':
            assert not failures and not incomplete and not unsupported
        verdict_count += count
        rows.append({'source': row['source'], 'cases': len(row['cases']), 'observations': count,
                     'rawFails': len(failures), 'complete': len(row['cases']) - len(incomplete),
                     'incomplete': incomplete, 'unsupported': dict(unsupported), 'failures': failures})
    assert [row['source'] for row in rows] == ['v1', 'spec-baseline', 'candidate']
    assert [row['rawFails'] for row in rows] == [278, 258, 0]
    assert [row['observations'] for row in rows] == [1786, 2072, 2072]
    source_hash_count = 0
    for source in data['sources']:
        assert git('rev-parse', source['sha'] + '^{tree}').decode().strip() == source['tree']
        for path, expected in source['loaded'].items():
            assert digest(git('show', source['sha'] + ':' + path)) == expected, path
            source_hash_count += 1
    for path, expected in data['dependencyFiles'].items():
        assert digest((repo / 'node_modules' / path).read_bytes()) == expected, path
    for name, version in data['dependencyVersions'].items():
        assert read_json(repo / 'node_modules' / name / 'package.json')['version'] == version
    assert digest(git('show', manifest['source'] + ':scripts/parity/tool-actions.mjs')) == data['runnerSha256']
    assert digest(git('show', manifest['source'] + ':tests/browser/tool-actions-parity-fixture.js')) == data['fixtureSha256']
    assert digest(git('show', manifest['source'] + ':package-lock.json')) == data['packageLockSha256']
    assert git('diff', '--name-only', manifest['base'], manifest['source'], '--',
               'core', 'inline-tools', 'inline-plugins', 'plugins', 'shared', 'renderer') == b''
    restored = []
    for source in manifest['preservedSources']:
        commit = source['rawCommit'].encode('utf-8')
        assert hashlib.sha1(b'commit ' + str(len(commit)).encode() + b'\0' + commit).hexdigest() == source['sha']
        assert git('cat-file', 'commit', source['sha']) == commit
        patch = gzip.decompress((checkpoint / source['patch']).read_bytes())
        assert digest(patch) == source['patchSha256']
        with tempfile.TemporaryDirectory(prefix='tool-actions-replay-') as temporary:
            objects = Path(temporary) / 'objects'; objects.mkdir()
            replay_env = dict(env, GIT_INDEX_FILE=str(Path(temporary) / 'index'), GIT_OBJECT_DIRECTORY=str(objects),
                              GIT_ALTERNATE_OBJECT_DIRECTORIES=git('rev-parse', '--path-format=absolute', '--git-path', 'objects').decode().strip())
            git('read-tree', manifest['base'], environment=replay_env)
            git('apply', '--cached', '--binary', '--whitespace=nowarn', '-', input=patch, environment=replay_env)
            tree = git('write-tree', environment=replay_env).decode().strip()
            assert tree == source['tree']
            restored.append({'source': source['sha'], 'tree': tree})
    native = gzip.decompress((checkpoint / 'native-final.log.gz').read_bytes()).decode()
    records = json.loads(native.splitlines()[-1])['native-tools.html']
    assert [record['name'] for record in records] == ['tool action ' + name for name in expected_ids]
    assert all(record['status'] == 'PASS' for record in records)
    result = {'status': 'PASS', 'source': manifest['source'], 'rawSha256': digest(gzip.decompress(raw)),
              'verdictsRecomputed': verdict_count, 'rows': rows, 'sourceModuleHashes': source_hash_count,
              'dependencyFileHashes': len(data['dependencyFiles']), 'dependencyVersions': len(data['dependencyVersions']),
              'exactSourcePatchesRestored': restored, 'nativeCases': len(records),
              'scriptSha256': digest(Path(__file__).read_bytes()),
              'scope': 'Case IDs, phases, recorded equality verdicts, histories, trusted inputs, module/dependency hashes and exact source reconstruction. Semantic oracle review is a separate peer review.'}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key not in ['rows', 'scope']}))


if __name__ == '__main__':
    main()
