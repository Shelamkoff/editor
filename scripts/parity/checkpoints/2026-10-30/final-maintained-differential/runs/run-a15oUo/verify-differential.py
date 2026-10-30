#!/usr/bin/env python3
"""Sequence maintained comparisons without modifying their raw verdicts."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from functools import lru_cache
import gzip
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

WORKSPACE = Path('/workspace/scratch/61a2ad7355f4')
REFERENCE_SHAS = {
    'v1': '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340',
    'spec-baseline': 'e981ff308000c1d92d7e820df95113c1e19bcee8',
    'pre-fix': 'b09c0079c5f2ebbbc68264b4892ce5f8bb8ae63c',
}
CHECKPOINTS = Path('scripts/parity/checkpoints/2026-10-30')
# Exact prior raw reports; these are read as data, never executed.
GATES = [
    ('common-parity', 'block-roundtrip.mjs', 65, 'continuation-61a-integration/runs/run-fDStBT/common-parity.log.gz'),
    ('gallery-parity', 'gallery-caption-order.mjs', 6, 'continuation-61a-integration/runs/run-fDStBT/gallery-parity.log.gz'),
    ('gallery-classifier-controls', 'verify-gallery-caption-order-classifiers.mjs', None, None),
    ('presentation-values', 'presentation-values.mjs', 11, None),
    ('public-focus', 'public-focus.mjs', 7, 'public-focus/integrated/result.json.gz'),
    ('formatting-ownership', 'formatting-host-ownership.mjs', 10, 'formatting-host-ownership/differential-final.json.gz'),
    ('link-ownership', 'link-owned-formatting.mjs', 13, 'link-atomic-ownership/three-source-final.json.gz'),
    ('gallery-viewer', 'gallery-viewer-captions.mjs', 2, 'gallery-renderer-lifecycle-and-viewer/viewer-three-source.json.gz'),
    ('code-languages', 'code-language-highlighting.mjs', 3, 'code-language-highlighting/differential.json.gz'),
    ('text-block-settings', 'text-block-settings.mjs', 21, None),
    ('table-settings', 'table-settings-parity.mjs', 14, 'table-settings/settings-final-differential.json.gz'),
    ('columns-layout', 'columns-layout-parity.mjs', 12, 'columns-layouts/layouts-final-differential.json.gz'),
    ('tool-actions', 'tool-actions.mjs', 48, 'tool-actions/final-differential.json.gz'),
    ('raw-source', 'raw-source-preview.mjs', 21, 'raw-source-preview/raw/final.json.gz'),
    ('embed-preview', 'verify-embed-preview-timeout.mjs', 2, None),
]
SUPPORT_MODULES = {
    'embed-preview-timeout.mjs', 'embed-preview-timeout-verification.mjs',
    'embed-preview-timeout-verification.test.mjs',
    'person-roundtrip-classifiers.mjs', 'carousel-roundtrip-classifiers.mjs',
    'gallery-roundtrip-classifiers.mjs', 'gallery-caption-order-classifiers.mjs',
    'link-poll-roundtrip-classifiers.mjs',
}


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    # Sort object keys only. Do not alter strings, arrays, payloads or verdicts.
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.PIPE)


@lru_cache(maxsize=None)
def source_digest(root, sha, relative):
    return digest(git(root, 'show', f'{sha}:{relative}'))


def load_report(path):
    raw = path.read_bytes()
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    return json.loads(raw), digest(raw)


def environment(root, sha):
    env = os.environ.copy()
    # Keep unrelated inherited test selection from narrowing this corpus.
    for name in list(env):
        if name.startswith('EDITOR_'):
            del env[name]
    explicit = {
        'EDITOR_CHROME_PATH': str(WORKSPACE / 'tools/chrome-156/chrome-linux64/chrome'),
        'EDITOR_PLAYWRIGHT_PATH': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
        'EDITOR_DEPENDENCIES_ROOT': str(root / 'node_modules'),
        'EDITOR_CANDIDATE_ROOT': str(root), 'EDITOR_CANDIDATE_SHA': sha,
        'EDITOR_V1_ROOT': str(WORKSPACE / 'references/v1'),
        'EDITOR_SPEC_BASELINE_ROOT': str(WORKSPACE / 'references/spec-baseline'),
        **{name: '' for name in [
            'EDITOR_ROUNDTRIP_FILTER', 'EDITOR_GALLERY_FILTER', 'EDITOR_PRESENTATION_FILTER',
            'EDITOR_TEXT_BLOCK_SETTINGS_FILTER', 'EDITOR_TABLE_SETTINGS_FILTER',
            'EDITOR_COLUMNS_LAYOUT_FILTER', 'EDITOR_RAW_FILTER',
        ]},
    }
    env.update(explicit)
    return env, explicit


def preflight(root, sha):
    assert git(root, 'rev-parse', 'HEAD').decode().strip() == sha
    assert not git(root, 'status', '--porcelain').strip(), 'Candidate source is not clean'
    assert (root / 'node_modules').is_dir() and not (root / 'node_modules').is_symlink()
    for label in ['v1', 'spec-baseline']:
        ref = WORKSPACE / 'references' / label
        assert git(ref, 'rev-parse', 'HEAD').decode().strip() == REFERENCE_SHAS[label]
        assert not git(ref, 'status', '--porcelain').strip(), f'Dirty {label} reference'
    for value in REFERENCE_SHAS.values():
        git(root, 'cat-file', '-e', value + '^{commit}')
    installed = json.loads((root / 'node_modules/.package-lock.json').read_text())
    carousel = installed['packages']['node_modules/@shelamkoff/carousel']
    assert carousel['resolved'].endswith('#f7f6485886a1d77f9213d9079eb70000efeff499'), carousel
    active = {path.name for path in (root / 'scripts/parity').glob('*.mjs')}
    expected = {script for _, script, _, _ in GATES} | SUPPORT_MODULES
    assert active == expected, f'Uninventoried executable files: {active ^ expected}'
    paths = list((root / 'scripts/parity').glob('*.mjs'))
    paths += list((root / 'tests/browser').glob('*fixture*.js'))
    paths += [root / 'tests/browser/gallery-viewer-captions.js', root / 'scripts/verification-results.mjs']
    hashes = {}
    for path in sorted(set(paths)):
        relative = path.relative_to(root).as_posix()
        value = digest(path.read_bytes())
        assert value == source_digest(str(root), sha, relative), f'Changed source: {relative}'
        hashes[relative] = value
    witnesses = {}
    for name, _, _, witness in GATES:
        if witness:
            path = root / CHECKPOINTS / witness
            report, raw_hash = load_report(path)
            labels = {entry['label']: entry['sha'] for entry in report['sources']}
            identity_differences = []
            for label, value in labels.items():
                if label == 'candidate':
                    continue
                if REFERENCE_SHAS[label] != value:
                    # Preserve changed historical source identity. Matching
                    # loaded bytes is evidence, not an automatic exception.
                    loaded = next(entry['loaded'] for entry in report['sources'] if entry['label'] == label)
                    mismatches = [relative for relative, recorded in loaded.items()
                                  if source_digest(str(root), REFERENCE_SHAS[label], relative) != recorded]
                    identity_differences.append({'label': label, 'archivedSha': value,
                                                 'currentPinnedSha': REFERENCE_SHAS[label],
                                                 'archivedLoadedModules': len(loaded), 'loadedByteMismatches': mismatches})
            witnesses[name] = {'path': str(CHECKPOINTS / witness), 'compressedSha256': digest(path.read_bytes()),
                               'rawSha256': raw_hash, 'headBefore': report['headBefore'],
                               'referenceIdentityDifferences': identity_differences}
    env, explicit = environment(root, sha)
    for name in ['EDITOR_CHROME_PATH', 'EDITOR_PLAYWRIGHT_PATH']:
        assert Path(explicit[name]).is_file(), f'Missing {name}'
    return {'checkedAt': now(), 'candidateSha': sha, 'referenceShas': REFERENCE_SHAS,
            'sourceHashes': hashes, 'witnesses': witnesses, 'environment': explicit,
            'packageLockSha256': digest((root / 'package-lock.json').read_bytes()),
            'installedLockSha256': digest((root / 'node_modules/.package-lock.json').read_bytes()),
            'carousel': carousel, 'supervisorSha256': digest(Path(__file__).read_bytes())}


def cases_by_source(report):
    grouped = defaultdict(list)
    for row in report['results']:
        if 'cases' in row:
            grouped[row['source']].extend(row['cases'])
        else:
            grouped[row['source']].append(row)
    return dict(grouped)


def case_id(case):
    return case.get('id', case.get('language', case.get('realm', case.get('kind'))))


def failure_signatures(report, references_only=False):
    found = []
    shas = {entry['label']: entry['sha'] for entry in report['sources']}
    for source, cases in cases_by_source(report).items():
        if references_only and source == 'candidate':
            continue
        for case in cases:
            failed = case.get('failures')
            if failed is None:
                failed = [item for item in case.get('observations', []) if item.get('status') != 'PASS']
            for item in failed:
                # Include explicit field-presence bits so missing is not null.
                found.append({'source': source, 'sourceSha': shas[source], 'case': case_id(case),
                              **{key: item[key] for key in ['phase', 'property', 'name', 'status', 'actual', 'expected'] if key in item}})
    return found


def completeness(case):
    problems = {}
    for key in ['error', 'errors', 'pageErrors', 'incomplete', 'incompletePhases']:
        if case.get(key):
            problems[key] = case[key]
    if case.get('complete') is False:
        problems['complete'] = False
    planned = case.get('plannedPhases', case.get('planned'))
    if isinstance(planned, list) and case.get('completedPhases') != planned:
        problems['planned'] = planned
        problems['completed'] = case.get('completedPhases')
    return problems


def inspect_report(root, sha, name, script, count, witness, report):
    verification_errors = []
    def require(condition, message):
        if not condition:
            verification_errors.append(message)
    require(report.get('headBefore') == sha, 'Candidate headBefore mismatch')
    if 'headAfter' in report:
        require(report['headAfter'] == sha, 'Candidate headAfter mismatch')
    for key in ['sourceUnchanged', 'sourceIdentityVerified']:
        if key in report:
            require(report[key] is True, f'{key} is not true')
    expected_labels = ['v1', 'spec-baseline'] + (['pre-fix'] if name == 'code-languages' else []) + ['candidate']
    require([entry['label'] for entry in report['sources']] == expected_labels, 'Wrong source set or order')
    for source in report['sources']:
        expected_sha = sha if source['label'] == 'candidate' else REFERENCE_SHAS.get(source['label'])
        require(source['sha'] == expected_sha, f'Wrong source revision: {source["label"]}')
        require(bool(source.get('loaded')), f'No loaded modules: {source["label"]}')
        for relative, value in source.get('loaded', {}).items():
            require(value == source_digest(str(root), source['sha'], relative), f'Loaded bytes mismatch: {source["label"]}/{relative}')
    for relative, value in report.get('dependencyFiles', {}).items():
        require(value == digest((root / 'node_modules' / relative).read_bytes()), f'Dependency bytes mismatch: {relative}')
    raw_script = 'embed-preview-timeout.mjs' if name == 'embed-preview' else script
    require(report.get('runnerSha256', report.get('sourceSha256')) == digest((root / 'scripts/parity' / raw_script).read_bytes()), 'Runner hash mismatch')
    # Runners with an external fixture record its committed digest.
    if report.get('fixtureSha256'):
        fixtures = [p for p in (root / 'tests/browser').glob('*.js') if digest(p.read_bytes()) == report['fixtureSha256']]
        require(bool(fixtures), 'Fixture hash does not match a current committed browser fixture')
        for path in fixtures:
            require(report['fixtureSha256'] == source_digest(str(root), sha, path.relative_to(root).as_posix()), 'Fixture differs from Git object')
    for key in ['filter', 'requestedFilter']:
        if key in report:
            require(report[key] == '', f'Filtered run: {key}')
    grouped = cases_by_source(report)
    require(list(grouped) == expected_labels, 'Missing or reordered result source')
    source_summary = {}
    for label in expected_labels:
        cases = grouped.get(label, [])
        expected_count = 1 if name == 'public-focus' and label == 'v1' else count
        require(len(cases) == expected_count, f'{label}: expected {expected_count} cases, got {len(cases)}')
        require(len({case_id(c) for c in cases}) == len(cases), f'{label}: duplicate case IDs')
        incomplete = [{'id': case_id(c), **completeness(c)} for c in cases if completeness(c)]
        raw_failures = [f for f in failure_signatures(report) if f['source'] == label]
        rows = [row for row in report['results'] if row['source'] == label]
        runtime_errors = {key: [value for row in rows for value in row.get(key, [])]
                          for key in ['errors', 'pageErrors', 'inputErrors', 'casePageErrors', 'unexpectedErrors', 'unexpectedPageErrors']}
        classified = sum(len(c.get('classifiedDifferences', [])) for c in cases)
        unsupported = [{'id': case_id(c), 'detail': c['unsupported']} for c in cases if c.get('unsupported')]
        unsupported.extend({'id': case_id(c), 'detail': c['referenceCapability']} for c in cases if c.get('referenceCapability', {}).get('supported') is False)
        unsupported.extend(value for row in rows for value in row.get('unsupported', []) if isinstance(row.get('unsupported'), list))
        source_summary[label] = {'cases': len(cases), 'observations': sum(len(c.get('observations', [])) for c in cases),
                                 'rawFailureCount': len(raw_failures), 'incompleteCases': incomplete,
                                 'unsupportedCapabilities': unsupported, 'runtimeErrors': runtime_errors,
                                 'maintainedClassifiedFailures': classified,
                                 'unexpectedFailures': sum(len(c.get('unexpectedFailures', [])) for c in cases)}
    failures = failure_signatures(report, references_only=True)
    signature_status = {'status': 'no-archived-witness; reference observations require review', 'observedFailureCount': len(failures)}
    if witness:
        previous, previous_hash = load_report(root / CHECKPOINTS / witness)
        old = Counter(map(canonical, failure_signatures(previous, references_only=True)))
        current = Counter(map(canonical, failures))
        signature_status = {
            'status': 'exact-archived-failure-payload-match' if old == current else 'different-reference-observations; review-open',
            'witness': str(CHECKPOINTS / witness), 'witnessRawSha256': previous_hash,
            'observedFailureCount': sum(current.values()), 'archivedFailureCount': sum(old.values()),
            'matchedFailureCount': sum((old & current).values()),
            'newOrChanged': [json.loads(value) for value in (current - old).elements()],
            'missingOrChanged': [json.loads(value) for value in (old - current).elements()],
            'runnerBytesMatchArchived': report.get('runnerSha256', report.get('sourceSha256')) == previous.get('runnerSha256', previous.get('sourceSha256')),
            'fixtureBytesMatchArchived': report.get('fixtureSha256') == previous.get('fixtureSha256'),
        }
    current = source_summary['candidate']
    candidate_zero = current['rawFailureCount'] == 0 and not current['incompleteCases'] and not current['unsupportedCapabilities'] and not any(current['runtimeErrors'].values())
    require(report.get('candidatePass', candidate_zero) is candidate_zero, 'candidatePass contradicts observations')
    return {'sourceIdentityVerified': not verification_errors, 'verificationErrors': verification_errors,
            'serverErrors': report.get('serverErrors', []), 'candidateZeroFailuresAndComplete': candidate_zero,
            'sources': source_summary, 'referenceFailureSignatures': signature_status,
            'allRawFailures': failure_signatures(report),
            'topLevelLimitations': {key: report[key] for key in ['incompleteCases', 'notApplicableCases', 'unsupportedReferenceCases'] if key in report}}


def prepare(root, sha):
    proof = preflight(root, sha)
    env, _ = environment(root, sha)
    directory = Path(subprocess.check_output(['node', 'scripts/verification-results.mjs', 'init', *[gate[0] for gate in GATES]], cwd=root, env=env, text=True).strip())
    save(directory / 'preflight.json', proof)
    save(directory / 'supervisor-config.json', {'root': str(root), 'sha': sha, 'preparedAt': now(), 'gates': GATES,
          'policy': 'Raw command exit codes and C11 outcomes are never rewritten. Exact reference signatures are secondary observations.'})
    (directory / 'INVENTORY.md').write_bytes(Path(__file__).with_name('INVENTORY.md').read_bytes())
    (directory / 'verify-differential.py').write_bytes(Path(__file__).read_bytes())
    print(directory, flush=True)


def execute(root, sha, directory):
    proof = json.loads((directory / 'preflight.json').read_text())
    assert proof['supervisorSha256'] == digest(Path(__file__).read_bytes()), 'Supervisor changed after preparation'
    fresh = preflight(root, sha)
    for key in ['candidateSha', 'referenceShas', 'sourceHashes', 'witnesses', 'environment', 'packageLockSha256', 'installedLockSha256']:
        assert proof[key] == fresh[key], f'Preflight drift: {key}'
    env, _ = environment(root, sha)
    env['EDITOR_RESULTS_DIR'] = str(directory)
    summary = {'startedAt': now(), 'candidateSha': sha, 'gates': []}
    save(directory / 'supervisor-summary.json', summary)
    for name, script, count, witness in GATES:
        command = ['node', 'scripts/parity/' + script]
        if count is None:
            command.append(str(directory / 'gallery-parity.json'))
        print(json.dumps({'event': 'gate-start', 'name': name, 'time': now()}), flush=True)
        with (directory / f'{name}.wrapper.log').open('wb') as stream:
            process = subprocess.Popen(['node', 'scripts/verification-results.mjs', 'run', name, '--', *command],
                                       cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
            try:
                code = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                process.send_signal(signal.SIGTERM)
                code = process.wait(timeout=30)
        manifest = json.loads((directory / 'manifest.json').read_text())
        gate = manifest['gates'][name]
        result = {'name': name, 'command': command, 'wrapperExitCode': code, 'rawExitCode': gate['exitCode'],
                  'c11Outcome': gate['outcome'], 'elapsedMs': gate.get('elapsedMs'), 'sourceUnchanged': gate.get('sourceUnchanged')}
        try:
            raw, raw_hash = load_report(directory / f'{name}.log')
            result['logSha256'] = raw_hash
            if count is None:
                result['validatorResult'] = raw
            else:
                if name == 'embed-preview':
                    result['strictVerifierResult'] = raw
                    assert raw['candidateSha'] == sha and raw['rawExitCode'] == 1
                    report, child_hash = load_report(directory / 'preview-timeout-raw.json')
                    assert child_hash == raw['rawSha256']
                else:
                    report = raw
                result['comparison'] = inspect_report(root, sha, name, script, count, witness, report)
                if name == 'gallery-parity':
                    # Exact bytes; the offline validator reads the same raw report.
                    (directory / 'gallery-parity.json').write_bytes((directory / f'{name}.log').read_bytes())
            save(directory / f'{name}.analysis.json', result)
        except Exception as error:
            result['analysisError'] = f'{type(error).__name__}: {error}'
            save(directory / f'{name}.analysis.json', result)
        summary['gates'].append(result)
        save(directory / 'supervisor-summary.json', summary)
        comparison = result.get('comparison', {})
        print(json.dumps({'event': 'gate-finish', 'name': name, 'time': now(), 'exit': code,
                          'candidateZeroFailuresAndComplete': comparison.get('candidateZeroFailuresAndComplete'),
                          'referenceStatus': comparison.get('referenceFailureSignatures', {}).get('status'),
                          'analysisError': result.get('analysisError')}), flush=True)
        if not gate.get('sourceUnchanged'):
            summary['stoppedReason'] = 'Source changed or gate did not complete'
            break
    with (directory / 'finish.log').open('wb') as stream:
        finish = subprocess.run(['node', 'scripts/verification-results.mjs', 'finish'], cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
    manifest = json.loads((directory / 'manifest.json').read_text())
    summary.update({'finishedAt': now(), 'finishExitCode': finish.returncode, 'c11Outcome': manifest['outcome'],
                    'sourceUnchanged': manifest['sourceUnchanged']})
    save(directory / 'supervisor-summary.json', summary)
    print(json.dumps({'event': 'finished', 'directory': str(directory), 'c11Outcome': manifest['outcome'],
                      'sourceUnchanged': manifest['sourceUnchanged']}), flush=True)
    return finish.returncode


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'run'])
    parser.add_argument('root', type=Path)
    parser.add_argument('sha')
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--lane-a-authorized', action='store_true')
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(args.root.resolve(), args.sha)
    else:
        assert args.directory and args.lane_a_authorized, 'Execution requires the explicitly released browser lane A'
        sys.exit(execute(args.root.resolve(), args.sha, args.directory.resolve()))
