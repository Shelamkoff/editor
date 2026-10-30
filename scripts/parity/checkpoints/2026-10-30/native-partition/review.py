#!/usr/bin/env python3
"""Recheck recorded page outcomes, registration inventory and immutable source patches.

This is an artifact audit. It does not execute native browser scenarios or turn a
registration-only inventory into a test result. The original failed run remains failed.
"""
from pathlib import Path
import collections, gzip, hashlib, json, os, re, subprocess, tempfile

HERE = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=HERE).decode().strip())
checks = 0

def check(condition, message):
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)

def read(path):
    payload = (HERE / path).read_bytes()
    return gzip.decompress(payload) if str(path).endswith('.gz') else payload

def data(path):
    return json.loads(read(path))

def sha(payload):
    return hashlib.sha256(payload).hexdigest()

def git(*args, input=None, env=None):
    return subprocess.check_output(['git', *args], cwd=REPO, input=input, env=env)

def source(ref, path, env=None):
    return git('show', ref + ':' + path, env=env)

index = data('artifact-hashes.json')
actual_paths = sorted(str(path.relative_to(HERE)) for path in HERE.rglob('*')
                      if path.is_file() and path.name != 'artifact-hashes.json'
                      and 'peer-review' not in path.relative_to(HERE).parts
                      and '__pycache__' not in path.relative_to(HERE).parts)
check(actual_paths == sorted(index['files']), 'Archive file inventory changed')
for path, expected in index['files'].items():
    payload = (HERE / path).read_bytes()
    check(len(payload) == expected['bytes'] and sha(payload) == expected['sha256'], path + ' stored bytes')
    if path.endswith('.gz'):
        decoded = gzip.decompress(payload)
        check(len(decoded) == expected['decodedBytes'] and sha(decoded) == expected['decodedSha256'], path + ' decoded bytes')

summary = data('summary.json')
pins = data('source/pins.json')
failed, base, intermediate, final = [pins[key] for key in ['failedSource', 'base', 'intermediate', 'candidate']]
check(summary['candidate'] == final and summary['base'] == base and summary['intermediate'] == intermediate, 'Summary source identities')
check(summary['shippingPageDeadlineMs'] == 120000, 'Shipping page budget')
check(git('rev-parse', '--show-object-format').decode().strip() == 'sha1', 'Git object format')
baseline_raw = read(f'source/commits/{failed}.raw.gz')
check(git('cat-file', 'commit', failed) == baseline_raw, 'Original failed source raw commit')
check(hashlib.sha1(b'commit ' + str(len(baseline_raw)).encode() + b'\0' + baseline_raw).hexdigest() == failed, 'Original commit object identity')

objects = git('rev-parse', '--path-format=absolute', '--git-path', 'objects').decode().strip()
with tempfile.TemporaryDirectory(prefix='rector-native-partition-review-') as temporary:
    temporary = Path(temporary)
    object_dir = temporary / 'objects'
    object_dir.mkdir()
    env = dict(os.environ, GIT_INDEX_FILE=str(temporary / 'index'),
               GIT_OBJECT_DIRECTORY=str(object_dir), GIT_ALTERNATE_OBJECT_DIRECTORIES=objects)
    git('read-tree', failed + '^{tree}', env=env)
    previous = failed
    check(pins['orderedSourceChain'] == summary['sourceChain'], 'Ordered source chain')
    check(len(pins['commits']) == 6, 'Four runtime-equivalent base bridges and two harness commits')
    for record in pins['commits']:
        raw, patch = read(record['raw']), read(record['patch'])
        check(sha(raw) == record['rawSha256'] and sha(patch) == record['patchSha256'], 'Source raw and patch digest')
        lines = raw.splitlines()
        parents = [line[7:].decode() for line in lines if line.startswith(b'parent ')]
        trees = [line[5:].decode() for line in lines if line.startswith(b'tree ')]
        check(parents == [previous] and record['parent'] == previous, 'Raw source parent chain')
        check(trees == [record['tree']], 'Raw commit tree')
        git('apply', '--cached', '--binary', '-', input=patch, env=env)
        check(git('write-tree', env=env).decode().strip() == record['tree'], 'Full-index patch reconstructs exact tree')
        object_name = git('hash-object', '-w', '-t', 'commit', '--stdin', input=raw, env=env).decode().strip()
        check(object_name == record['commit'], 'Raw commit reconstructs exact SHA')
        previous = object_name
    check(previous == final, 'Source reconstruction reaches candidate')
    for ref, pin in pins['sourcePins'].items():
        check(git('rev-parse', ref + '^{tree}', env=env).decode().strip() == pin['tree'], 'Pinned source tree')
        for path, digest in pin['files'].items():
            check(sha(source(ref, path, env)) == digest, 'Pinned source file ' + path)

    capability_modules = {
        'block-settings': ['text-block-settings-native', 'columns-layout-native'],
        'code-source-language': ['code-source-language-native'],
        'person-modes': ['person-modes-native'],
        'table-keyboard': ['table-keyboard-native'],
    }
    original_plugin = source(base, 'tests/browser/native-plugin-parity.js', env)
    intermediate_plugin = original_plugin
    for capability in ['code-source-language', 'person-modes', 'table-keyboard']:
        for module in capability_modules[capability]:
            line = f"import './regressions/{module}.js'\n".encode()
            check(intermediate_plugin.count(line) == 1, 'Exactly one old capability import')
            intermediate_plugin = intermediate_plugin.replace(line, b'')
    check(source(intermediate, 'tests/browser/native-plugin-parity.js', env) == intermediate_plugin, 'First page partition only removes three imports')
    final_plugin = intermediate_plugin
    for module in capability_modules['block-settings']:
        line = f"import './regressions/{module}.js'\n".encode()
        check(final_plugin.count(line) == 1, 'Exactly one old settings import')
        final_plugin = final_plugin.replace(line, b'')
    check(source(final, 'tests/browser/native-plugin-parity.js', env) == final_plugin, 'Second page partition only removes two imports')

    original_runner = source(base, 'tests/browser/physical-history.mjs', env)
    check(original_runner == source(failed, 'tests/browser/physical-history.mjs', env), 'Failed and harness-base runners are identical')
    check(b'const deadline = Date.now() + 120_000' in original_runner, 'Original 120-second deadline')
    original_html = source(base, 'tests/browser/native-plugin-parity.html', env)
    normalize_html = lambda payload: re.sub(rb'<title>[^<]+</title>', b'<title>PAGE</title>', payload)
    final_runner = original_runner
    names = {'block-settings': 'nativeBlockSettings', 'code-source-language': 'nativeCodeSourceLanguage',
             'person-modes': 'nativePersonModes', 'table-keyboard': 'nativeTableKeyboard'}
    calls, fields = [], []
    for capability, modules in capability_modules.items():
        entry = ''.join(f"import './regressions/{module}.js'\n" for module in modules)
        entry += "import { run } from './regressions/harness.js'\n\nawait run()\n"
        check(source(final, 'tests/browser/native-' + capability + '.js', env) == entry.encode(), 'Exact capability entry ' + capability)
        html = source(final, 'tests/browser/native-' + capability + '.html', env)
        html = html.replace(f"await import('./native-{capability}.js')".encode(), b"await import('./native-plugin-parity.js')")
        check(normalize_html(html) == normalize_html(original_html), 'Same native driver, CSS and page shell ' + capability)
        variable = names[capability]
        calls.append(f"  const {variable} = await runNativePage(client, pageUrl, 'native-{capability}.html')\n".encode())
        fields.append(f'    {variable},\n'.encode())
        if capability != 'block-settings':
            for extension in ['html', 'js']:
                path = f'tests/browser/native-{capability}.{extension}'
                check(source(intermediate, path, env) == source(final, path, env), 'Retained capability page byte equivalence')
    call_anchor = b"  const nativePluginParity = await runNativePage(client, pageUrl, 'native-plugin-parity.html')\n"
    field_anchor = b'    nativePluginParity,\n'
    check(original_runner.count(call_anchor) == original_runner.count(field_anchor) == 1, 'Single full-run call and aggregate anchors')
    final_runner = original_runner.replace(call_anchor, call_anchor + b''.join(calls)).replace(field_anchor, field_anchor + b''.join(fields))
    check(final_runner == source(final, 'tests/browser/physical-history.mjs', env), 'Only four full-run calls and aggregate fields added; deadline, filters, errors and bridge unchanged')
    intermediate_runner = original_runner.replace(call_anchor, call_anchor + b''.join(calls[1:])).replace(field_anchor, field_anchor + b''.join(fields[1:]))
    check(intermediate_runner == source(intermediate, 'tests/browser/physical-history.mjs', env), 'Intermediate runner is exact three-call partition')

    expected_final_paths = sorted(['tests/browser/README.md', 'tests/browser/native-plugin-parity.js', 'tests/browser/physical-history.mjs']
                                  + [f'tests/browser/native-{capability}.{extension}' for capability in capability_modules for extension in ['html', 'js']])
    check(pins['baseToFinalChangedPaths'] == expected_final_paths, 'Exactly eleven changed paths from harness base')
    check(git('diff', '--name-only', base, final, env=env).decode().splitlines() == expected_final_paths, 'Actual final path scope')
    expected_second_paths = sorted(['tests/browser/README.md', 'tests/browser/native-plugin-parity.js', 'tests/browser/physical-history.mjs', 'tests/browser/native-block-settings.html', 'tests/browser/native-block-settings.js'])
    check(pins['intermediateToFinalChangedPaths'] == expected_second_paths, 'Exactly five second-partition paths')
    check(git('diff', '--name-only', intermediate, final, env=env).decode().splitlines() == expected_second_paths, 'Actual second change scope')
    for path in pins['failedToBaseChangedPaths']:
        check(path.startswith(('scripts/parity/checkpoints/', 'docs/')) or path in ['RECTOR_V2_IMPLEMENTATION_PROGRESS.md', 'RECTOR_V2_PROGRESS_2026-10-29.md'], 'Runtime-equivalent base bridge path')
    unchanged = data(pins['unchangedManifest'])
    check(len(unchanged) == pins['unchangedRuntimeAndFixtureFiles'] == summary['sourceEquivalence']['unchangedRuntimeAndFixtureFiles'] == 655, 'Unchanged production/fixture inventory count')
    check(len({row['path'] for row in unchanged}) == len(unchanged), 'No duplicate source paths')
    for row in unchanged:
        for ref in [failed, base, intermediate, final]:
            payload = source(ref, row['path'], env)
            check(sha(payload) == row['sha256'] and len(payload) == row['bytes'], 'Unchanged runtime or fixture ' + row['path'])

    inventories = {}
    recorded = {}
    for phase, ref, expected_runs in [('intermediate-four', intermediate, [('remaining', 366), ('code', 20), ('person', 28), ('table', 30)]),
                                      ('final-five', final, [('remaining', 333), ('settings', 33)])]:
        for job, expected_count in expected_runs + [('inventory', None)]:
            meta = data(f'{phase}/{job}.meta.json')
            stdout, stderr = read(f'{phase}/{job}.stdout.gz'), read(f'{phase}/{job}.stderr')
            check(meta['status'] == 'complete' and meta['actualExitCode'] == 0, 'Actual process exit ' + phase + '/' + job)
            check(meta['sourceUnchanged'] and meta['trackedCleanBefore'] and meta['trackedCleanAfter'], 'Tracked source immutable for execution')
            check(meta['headBefore'] == meta['headAfter'] == ref, 'Exact executed source')
            check(sha(stdout) == meta['stdoutSha256'] and sha(stderr) == meta['stderrSha256'] and not stderr, 'Raw stdout/stderr digests')
            check(meta['pageDeadlineMs'] == 120000, 'No acceptance deadline extension')
            for path, digest in meta['sourceSha256'].items():
                check(sha(source(ref, path, env)) == digest, 'Process-pinned source file')
            if phase == 'final-five':
                check(meta['gitStatusBefore'] == meta['gitStatusAfter'] == '?? node_modules\n', 'Explicit final untracked dependency status')
                check(meta['dependencyLinkState']['isSymlink'] and meta['dependencyLinkState']['path'] == 'node_modules', 'Dependency-only symlink')
            if job == 'inventory':
                inv = json.loads(stdout)
                check(meta['environment'] == {}, 'No inventory filter')
                check(inv['kind'] == 'registration-inventory-only' and inv['productionOrFixtureExecutionClaimed'] is False, 'Registration is not execution')
                check(inv['base'] == base and inv['candidate'] == ref and inv['sourceUnchanged'], 'Inventory source identities')
                probe_name = 'native_partition_inventory.mjs' if phase == 'intermediate-four' else 'native_partition_inventory_final.mjs'
                check(inv['runnerSha256'] == sha(read(phase + '/' + probe_name)), 'Exact inventory probe source')
                harness = source(base, 'tests/browser/regressions/harness.js', env)
                declaration = b'export async function run() {\n'
                observed = harness.replace(declaration, declaration + b'  window.__registrationInventory = cases.map(entry => entry.name)\n  document.body.dataset.status = "inventory-only"\n  return\n')
                check(inv['originalEntrySha256'] == sha(original_plugin), 'Original entry inventory bytes')
                check(inv['originalHarnessSha256'] == sha(harness) and inv['inventoryHarnessSha256'] == sha(observed), 'Inventory-only early return, all other harness bytes unchanged')
                inventories[phase] = inv
            else:
                payload = json.loads(stdout.decode().splitlines()[-1])
                check(len(payload) == 1, 'One native page result')
                page, rows = next(iter(payload.items()))
                check(meta['environment'] == {'EDITOR_NATIVE_PAGE': page}, 'Unfiltered native page execution')
                check(stdout.decode().splitlines()[0] == f'Native {page}: {expected_count} passed', 'Native completion banner')
                check(len(rows) == expected_count, 'Actual case count')
                for row in rows:
                    check(row['status'] == 'PASS' and bool(row['name']), 'Actual native case verdict')
                recorded[phase, job] = {'page': page, 'names': [row['name'] for row in rows], 'source': ref, 'meta': meta}

    original_names = inventories['final-five']['results'][0]['names']
    check(original_names == inventories['intermediate-four']['results'][0]['names'], 'Same original monolithic registration names')
    check(len(original_names) == len(set(original_names)) == 444, 'Original 444 unique names')
    for phase, counts in [('intermediate-four', [366, 20, 28, 30]), ('final-five', [333, 33, 20, 28, 30])]:
        inv = inventories[phase]
        check(inv['exactMultisetPreserved'] and inv['duplicateNames'] == [], 'Inventory multiset verdict')
        check(inv['originalCount'] == inv['partitionCount'] == 444, 'Inventory total')
        check([len(row['names']) for row in inv['results'][1:]] == counts, 'Declared partition counts')
        collected = []
        for registration in inv['results'][1:]:
            key = (phase, registration['label'])
            if key not in recorded:
                key = ('intermediate-four', registration['label'])
            execution = recorded[key]
            check(registration['errors'] == [], 'No registration errors')
            check(registration['page'] == execution['page'] and registration['names'] == execution['names'], 'Exact executed name/order inventory')
            collected.extend(execution['names'])
        check(collections.Counter(collected) == collections.Counter(original_names), 'Executed name multiset is original444')
        check(len(collected) == len(set(collected)) == 444, 'No dropped or duplicated executed scenario')

    for run in summary['intermediateFour'] + summary['finalExecutions']:
        execution = recorded[run['phase'], run['job']]
        check(run['names'] == execution['names'] and run['source'] == execution['source'] and run['page'] == execution['page'], 'Summary exact execution mapping')
        check(run['actualExitCode'] == 0 and run['passed'] == run['cases'] == len(execution['names']) and run['failed'] == 0, 'Summary outcome counts')
        check(run['processElapsedSeconds'] == execution['meta']['elapsedSeconds'], 'Summary complete-process duration')
    for row in summary['finalPageInventory']:
        matches = [value for value in recorded.values() if value['page'] == row['page'] and value['source'] == row['executedOn']]
        check(len(matches) == 1 and row['count'] == len(matches[0]['names']), 'Final inventory retains actual execution source')
    check(sum(row['count'] for row in summary['finalPageInventory']) == 444, 'Final five-page total')
    check(summary['sourceEquivalence']['retainedCases'] == 78, 'Only three unchanged pages reuse intermediate execution')

    original = data('original-timeout/manifest.json.gz')
    gate = original['gates']['native-browser']
    check(gate['outcome'] == 'failed' and gate['exitCode'] == 1 and gate['sourceUnchanged'], 'Original failed native gate preserved')
    check(gate['sourceBefore']['head'] == gate['sourceAfter']['head'] == failed, 'Failed source identity')
    check(sum(record['exitCode'] == 0 for record in original['gates'].values()) == 11, 'Original eleven unrelated passing gates remain separate')
    console = read('original-timeout/native-browser-console.log.gz').decode()
    check('Timed out waiting for history matrix' in console, 'Original timeout evidence')
    check(len(re.findall(r'^Native \S+: \d+ passed$', console, re.M)) == 25, 'Twenty-five printed passing prefix groups')
    check(b"nativePluginParity = await runNativePage" in original_runner.splitlines()[509], 'Original failing line identifies plugin page')
    check(summary['originalFailure']['actualExitCode'] == 1 and summary['originalFailure']['pageElapsedMs'] is None, 'No reinterpretation of full gate time as page time')

dependency = data('dependency-state.json')
check(dependency['isSymlink'] and dependency['trackedClean'] and dependency['gitStatus'] == '?? node_modules\n', 'Explicit worktree dependency limitation')
check(dependency['head'] == final, 'Dependency observation source')
check(summary['causalDiagnostic']['source'] == failed and summary['causalDiagnostic']['diagnosticOnlyPageDeadlineMs'] == 360000, 'Diagnostic deadline is separate from shipping')
check(summary['causalDiagnostic']['pageNavigationToCompletionMs'] > 120000, 'Measured monolithic page exceeds shipping budget')
check(summary['causalDiagnostic']['actualExitCode'] == 0 and summary['causalDiagnostic']['passed'] == 444, 'Diagnostic result remains scoped')

print(json.dumps({'outcome': 'PASS', 'checks': checks, 'candidate': final, 'base': base,
                  'sourceCommitsReconstructed': len(pins['commits']),
                  'unchangedRuntimeAndFixtureFiles': len(unchanged),
                  'intermediateNativeCases': 444, 'finalNewNativeCases': 366,
                  'finalPageCases': [333, 33, 20, 28, 30], 'finalUnionCases': 444,
                  'retainedEquivalentSourceCases': 78, 'duplicateNames': [],
                  'actualProcessExits': {'originalFailedNativeGate': 1, 'intermediateFour': [0, 0, 0, 0], 'finalChangedPages': [0, 0], 'registrationOnlyProbes': [0, 0]},
                  'shippingPageDeadlineMs': 120000, 'browserScenariosExecutedByThisAudit': 0,
                  'diagnosticEvidenceOwner': 'peer-review', 'fullNativeSuiteResultClaimed': False}, indent=2))
