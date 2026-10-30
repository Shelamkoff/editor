#!/usr/bin/env python3
"""Read-only evidence audit; no browser run, checkout mutation or verdict rewriting."""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
BASE = '69c8425e0081fde69cf5176ccb73d032720c15fc'
FIRST = '99157b4dbf450b3ad25639bd570b02995aa960c7'
FINAL = 'd483be745b0bc00f40a89b823a12f993f1ae21f8'
V1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
SPEC = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
FIXTURE = 'tests/browser/text-block-settings-parity-fixture.js'
RUNNER = 'scripts/parity/text-block-settings.mjs'
CHANGED = {FIXTURE, RUNNER, 'tests/browser/native-plugin-parity.js',
           'tests/browser/regressions/text-block-settings-native.js'}
TEXTS = ['<b>Alpha</b> {{mention}} {{swatch}} tail', '<i>Bravo &amp; tail</i>']


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_payload(path):
    return gzip.decompress((HERE / path).read_bytes())


def specifications():
    result = []
    for route in ['settings', 'inline', 'toolbox']:
        for level in range(2, 7):
            result.append(dict(id=f'HEADING_LEVEL/{route}/h{level}', type='heading',
                               route=route, level=level, initial=4 if level == 3 else 3,
                               target=level, backward=level % 2 == 1))
    for route in ['settings', 'inline']:
        result.append(dict(id=f'HEADING_LEVEL/{route}/no-op', type='heading',
                           route=route, level=3, initial=3, target=3, backward=True))
    for initial in ['unordered', 'ordered']:
        for target in ['unordered', 'ordered']:
            result.append(dict(id=f'LIST_STYLE/{initial}/{target}', type='list',
                               route='settings', initial=initial, target=target, backward=False))
    return result


def changes(case):
    return case['route'] == 'toolbox' or case['initial'] != case['target']


def phases(case):
    return (['load', 'input', 'control'] + (['undo-control'] if changes(case) else [])
            + ['undo-input', 'redo-input'] + (['redo-control'] if changes(case) else [])
            + ['retired-control'])


def widgets(legacy):
    version = {} if legacy else {'dataVersion': 1}
    return {'mention': {'type': 'mention', **version, 'data': {'id': 'ada', 'name': 'Ada'}},
            'swatch': {'type': 'color', **version, 'data': {'value': '#123456'}}}


def expected_state(case, phase, legacy, added_id=None):
    typed = phase not in ['load', 'undo-input']
    applied = phase in ['control', 'redo-control'] and changes(case)
    added = applied and case['route'] == 'toolbox'
    setting = case['target'] if applied and not added else case['initial']
    texts = TEXTS[:1 if case['type'] == 'heading' else 2]
    texts = [text + ('X' if typed and index == 0 else '') for index, text in enumerate(texts)]
    data = {'text': texts[0], 'level': setting} if case['type'] == 'heading' else {
        'style': setting, 'items': texts if legacy else
        [{'id': f'item-{index}', 'text': text} for index, text in enumerate(texts)]}
    version = {} if legacy else {'dataVersion': 2}
    blocks = [{'id': 'subject', 'type': case['type'], **version,
               'data': data, 'inline': widgets(legacy)}]
    if added:
        blocks.append({'id': added_id, 'type': 'heading', **version,
                       'data': {'text': '', 'level': case['level']}})
    markup = [[{'tag': 'b', 'attributes': {}, 'children': ['Alpha']},
               ' {{mention}} {{swatch}} tail' + ('X' if typed else '')]]
    if case['type'] == 'list':
        markup.append([{'tag': 'i', 'attributes': {}, 'children': ['Bravo & tail']}])
    return blocks, setting, markup, added


def phase_oracle(case, phase, legacy):
    _, setting, markup, added = expected_state(case, phase, legacy)
    tag = f'H{setting}' if case['type'] == 'heading' else 'OL' if setting == 'ordered' else 'UL'
    undo = phase not in ['load', 'undo-input']
    redo = phase in ['undo-control', 'undo-input'] or phase == 'redo-input' and changes(case)
    counts = {'load': 0, 'input': 1, 'control': 2 if changes(case) else 1,
              'undo-control': 3, 'undo-input': 4 if changes(case) else 2,
              'redo-input': 5 if changes(case) else 3, 'redo-control': 6}
    initial_blocks, _, _, _ = expected_state(case, 'load', legacy)
    expected = {
        'canonicalTextAndMarks': markup, 'setting': setting, 'sidecars': widgets(legacy),
        'authorIdentity': ['subject', case['type']], 'documentLength': 2 if added else 1,
        'editorTag': tag, 'editorFields': markup, 'realWidgets': ['@Ada', '#123456'],
        'history': {'canUndo': undo, 'canRedo': redo},
        'callerInput': {'version': '1.0.5' if legacy else '2.0.0', 'blocks': initial_blocks},
        'providerCalls': 0, 'rendererTag': tag, 'rendererFields': markup,
    }
    if not legacy:
        expected['completedActions'] = counts[phase]
        if case['type'] == 'list':
            expected['itemIds'] = ['item-0', 'item-1']
    if added:
        expected.update(toolboxData={'type': 'heading', 'data': {'text': '', 'level': case['level']}},
                        toolboxUniqueId=True, toolboxTags=[f"H{case['level']}", f"H{case['level']}"])
    return expected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=HERE.parents[4])
    parser.add_argument('--dependency-root', type=Path)
    args = parser.parse_args()
    repo = args.repo.resolve()
    dependencies = (args.dependency_root or repo / 'node_modules').resolve()

    def git(*arguments):
        return subprocess.check_output(['git', *arguments], cwd=repo)

    manifest = json.loads((HERE / 'manifest.json').read_text())
    hashes = json.loads((HERE / 'artifact-hashes.json').read_text())['files']
    require(len(hashes) == 10, 'Unexpected gzip inventory')
    require({p.relative_to(HERE).as_posix() for p in HERE.rglob('*.gz')} ==
            {entry['path'] for entry in hashes}, 'Unrecorded gzip payload')
    for entry in hashes:
        encoded = (HERE / entry['path']).read_bytes()
        decoded = gzip.decompress(encoded)
        require(len(encoded) == entry['compressedBytes'] and sha256(encoded) == entry['compressedSha256'],
                f"Compressed payload changed: {entry['path']}")
        require(len(decoded) == entry['decodedBytes'] and sha256(decoded) == entry['decodedSha256'],
                f"Decoded payload changed: {entry['path']}")
    require(read_payload('final/differential.stderr.gz') == b'', 'Final stderr changed')
    require(read_payload('early/differential-99157b4d.stderr.gz') == b'', 'Early stderr changed')

    publication = json.loads(read_payload('sources/publication-progress.json.gz'))
    require(publication['base'] == BASE and publication['head'] == FINAL, 'Publication source mismatch')
    require(publication['publishedHead'] == manifest['publishedEquivalent'], 'Published head mismatch')
    source_trees, original_commits = {}, []
    for revision in manifest['sourceRevisions']:
        original, published = revision['original'], revision['published']
        raw = read_payload(revision['rawCommit'])
        object_sha = hashlib.sha1(b'commit ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        require(object_sha == original, 'Original raw commit object changed')
        header, message = raw.split(b'\n\n', 1)
        tree = next(line[5:].decode() for line in header.splitlines() if line.startswith(b'tree '))
        parents = [line[7:].decode() for line in header.splitlines() if line.startswith(b'parent ')]
        require(tree == revision['tree'] and parents == [revision['parentOriginal']], 'Original ancestry changed')
        published_raw = git('cat-file', 'commit', published)
        published_header, published_message = published_raw.split(b'\n\n', 1)
        require(published_message == message, 'Published message differs')
        require(b'tree ' + tree.encode() in published_header.splitlines(), 'Published tree differs')
        require([line[7:].decode() for line in published_header.splitlines() if line.startswith(b'parent ')]
                == [revision['parentPublished']], 'Published parent differs')
        mapped = next(item for item in publication['commits'] if item['local'] == original)
        require(mapped['rawCommit'].encode() == raw and mapped['published'] == published, 'Publication map differs')
        changed = set(git('diff', '--name-only', BASE, tree).decode().splitlines())
        require(changed == CHANGED, f'Unexpected production or fixture change: {changed}')
        patch = read_payload(revision['patchFromImplementationBase'])
        require(patch == git('diff', '--binary', '--full-index', BASE, tree), 'Full-index source patch differs')
        source_trees[original] = tree
        original_commits.append({'original': original, 'published': published, 'tree': tree,
                                 'rawCommitValid': True, 'patchMatches': True, 'productionChanged': False})
    require(set(source_trees) == {FIRST, FINAL}, 'Unexpected preserved source revisions')

    cases_by_id = {case['id']: case for case in specifications()}
    unavailable = [f'HEADING_LEVEL/toolbox/h{level}' for level in range(3, 7)]
    expected_totals = {
        'early': {'v1': (1674, 20, 0), 'spec-baseline': (2302, 185, 10), 'candidate': (2302, 0, 0)},
        'final': {'v1': (1691, 29, 0), 'spec-baseline': (2323, 185, 10), 'candidate': (2323, 0, 0)},
    }
    reports = {}
    for label, artifact, candidate_sha in [
        ('early', 'early/differential-99157b4d.json.gz', FIRST),
        ('final', 'final/differential.json.gz', FINAL),
    ]:
        document = json.loads(read_payload(artifact))
        require(document['headBefore'] == document['headAfter'] == candidate_sha, 'Source changed during comparison')
        require(document['filter'] == '' and document['serverErrors'] == [], 'Filtered or failed server run')
        require(document['completedAt'] > document['startedAt'], 'No completed raw run')
        require([(source['label'], source['sha']) for source in document['sources']] ==
                [('v1', V1), ('spec-baseline', SPEC), ('candidate', candidate_sha)], 'Source identities differ')
        for path, key in [(FIXTURE, 'fixtureSha256'), (RUNNER, 'runnerSha256')]:
            require(sha256(git('show', f'{source_trees[candidate_sha]}:{path}')) == document[key],
                    f'Committed {key} differs')
        source_files = 0
        for source in document['sources']:
            ref = source_trees.get(source['sha'], source['sha'])
            for path, digest in source['loaded'].items():
                require(sha256(git('show', f'{ref}:{path}')) == digest, f"Source mismatch: {source['label']}/{path}")
                source_files += 1
        require(source_files == 499, 'Unexpected source inventory')
        for path, digest in document['dependencyFiles'].items():
            require(sha256((dependencies / path).read_bytes()) == digest, f'Dependency mismatch: {path}')
        require(len(document['dependencyFiles']) == 64, 'Unexpected dependency inventory')
        for name, version in document['dependencyVersions'].items():
            require(json.loads((dependencies / name / 'package.json').read_text())['version'] == version,
                    f'Dependency version mismatch: {name}')

        results, observation_count, phase_count, fixed_checks = [], 0, 0, 0
        for result in document['results']:
            legacy = result['source'] == 'v1'
            require([case['id'] for case in result['cases']] == list(cases_by_id), 'Case inventory/order changed')
            recomputed_failures, nested_errors, actual_unavailable = [], [], []
            reconstructed_candidate_phases = 0
            for case in result['cases']:
                spec = cases_by_id[case['id']]
                if case.get('unsupported'):
                    require(legacy and case['id'] in unavailable, 'Unexpected unsupported capability')
                    require('single H2 toolbox entry' in case['unsupported'], 'Unsupported reason changed')
                    require(all(case[key] == [] for key in ['observations', 'phases', 'completedPhases', 'trusted'])
                            and case['error'] is None, 'Unsupported case was counted as executed')
                    actual_unavailable.append({'id': case['id'], 'reason': case['unsupported']})
                    continue
                require(case['error'] is None, 'Incomplete case')
                require(case['completedPhases'] == phases(spec), 'Phase completion differs')
                require([phase['phase'] for phase in case['phases']] == phases(spec)[:-1], 'Phase snapshots missing')
                observation_index = {}
                for observation in case['observations']:
                    key = (observation['phase'], observation['property'])
                    require(key not in observation_index, f'Duplicate observation: {case["id"]} {key}')
                    observation_index[key] = observation
                    status = 'PASS' if observation['actual'] == observation['expected'] else 'FAIL'
                    require(status == observation['status'], f'Stale verdict: {case["id"]} {key}')
                    if status == 'FAIL':
                        recomputed_failures.append({'id': case['id'], **observation})
                    observation_count += 1
                for snapshot in case['phases']:
                    phase = snapshot['phase']
                    for property_name, expected in phase_oracle(spec, phase, legacy).items():
                        observation = observation_index[(phase, property_name)]
                        require(observation['expected'] == expected,
                                f'Fixture oracle differs from fixed author input: {case["id"]} {phase}.{property_name}')
                        fixed_checks += 1
                    if result['source'] == 'candidate':
                        added_id = snapshot['blocks'][1]['id'] if len(snapshot['blocks']) == 2 else None
                        if added_id is not None:
                            require(isinstance(added_id, str) and added_id and added_id != 'subject', 'Invalid added ID')
                        expected_blocks, _, _, _ = expected_state(spec, phase, legacy, added_id)
                        require(snapshot['blocks'] == expected_blocks, 'Candidate fixed-document reconstruction differs')
                        reconstructed_candidate_phases += 1
                    phase_count += 1
                trusted = case['trusted']
                inputs = [event for event in trusted if event['type'] == 'input']
                clicks = [event for event in trusted if event['type'] == 'click']
                require(len(inputs) == 1 and inputs[0]['trusted'] is True
                        and inputs[0]['inputType'] == 'insertText', 'Native input missing')
                click_count = 3 if spec['route'] == 'toolbox' and not legacy else 2
                require(len(clicks) == click_count and all(event['trusted'] and event['intendedControl'] for event in clicks),
                        'Native control activation missing')
                for phase, offset in [('input', 15), ('undo-input', 14), ('redo-input', 15)]:
                    require(observation_index[(phase, 'nativeCaret')]['expected'] ==
                            {'focused': True, 'anchor': offset, 'focus': offset, 'collapsed': True},
                            'Input caret oracle changed')
                if spec['route'] == 'inline':
                    for phase in ['control'] + (['redo-control'] if changes(spec) else []):
                        require(observation_index[(phase, 'selectedRange')]['expected'] ==
                                {'focused': True, 'anchor': 4 if spec['backward'] else 1,
                                 'focus': 1 if spec['backward'] else 4, 'collapsed': False},
                                'Inline range oracle changed')
                if label == 'final':
                    for event in case.get('pageErrors', []):
                        nested_errors.append({'id': case['id'], **event})
            require(actual_unavailable == result['unsupportedCases'], 'Unsupported aggregate differs')
            require([item['id'] for item in actual_unavailable] == (unavailable if legacy else []), 'Unsupported cases differ')
            require(recomputed_failures == result['failures'], 'Failure aggregate differs')
            require(result['incompleteCases'] == [], 'Unexpected incomplete aggregate')
            obs = sum(len(case['observations']) for case in result['cases'])
            require((obs, len(recomputed_failures), len(result['errors'])) ==
                    expected_totals[label][result['source']], 'Raw result totals differ')
            if label == 'final':
                require(nested_errors == result['casePageErrors'], 'Per-case errors lost')
                require(collections.Counter(event['stack'] for event in nested_errors) ==
                        collections.Counter(result['errors']), 'Global and attributed errors are not the same events')
                require(all(event['phase'] == 'control' and
                            'Inline widget root left its projection boundary before hydration' in event['message']
                            for event in nested_errors), 'Unexpected error attribution')
                if legacy:
                    require(collections.Counter(f['property'] for f in recomputed_failures
                                                if f['phase'] == 'retired-control') ==
                            {'readOnlyUnchanged': 5, 'canonicalUnchanged': 5}, 'Retired v1 failures differ')
            results.append({'source': result['source'], 'executedCases': len(result['cases']) - len(actual_unavailable),
                            'unsupportedCases': len(actual_unavailable), 'observations': obs,
                            'failures': len(recomputed_failures), 'incompleteCases': 0,
                            'globalPageErrors': len(result['errors']),
                            'casePageErrors': len(nested_errors) if label == 'final' else None,
                            'candidatePhaseDocumentsReconstructed': reconstructed_candidate_phases})
        candidate = next(result for result in document['results'] if result['source'] == 'candidate')
        require(document['candidatePass'] is True and all(candidate[key] == [] for key in ['errors', 'failures', 'incompleteCases']),
                'Candidate did not pass')
        reports[label] = {'candidateSource': candidate_sha, 'observationsRecomputed': observation_count,
                          'verdictMismatches': 0, 'phaseSnapshotsChecked': phase_count,
                          'fixedOracleValuesChecked': fixed_checks,
                          'sourceFileHashesVerified': source_files, 'dependencyFileHashesVerified': 64,
                          'fixtureAndRunnerHashesVerified': True, 'candidatePass': True, 'results': results}

    native = read_payload('early/native-unversioned.log.gz').decode().splitlines()
    require(native[0] == 'Native native-plugin-parity.html: 21 passed', 'Early native summary differs')
    entries = json.loads(native[1])['native-plugin-parity.html']
    require([entry['name'] for entry in entries] == ['Text block settings parity ' + key for key in cases_by_id]
            and all(entry['status'] == 'PASS' for entry in entries), 'Early native case results differ')
    require(manifest['final']['actualShellExitCode'] is None, 'An unavailable final shell outcome was invented')
    require(manifest['earlyNative']['source'] is None, 'Unversioned native log was assigned a source pin')
    print(json.dumps({'auditPassed': True, 'gzipPayloadsVerified': len(hashes),
                      'sourceRevisions': original_commits, 'runs': reports,
                      'earlyNative': {'passed': 21, 'source': None, 'acceptanceEvidence': False},
                      'finalProcess': {'completedJson': True, 'candidatePass': True,
                                       'runnerExpectedExitCode': 1, 'actualShellExitCode': None},
                      'proposedAcceptance': ['BLOCK_HEADING_LEVELS', 'BLOCK_LIST_STYLES'],
                      'note': 'Audit success verifies evidence integrity and interpretation; historical FAIL/error results remain unchanged.'},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
