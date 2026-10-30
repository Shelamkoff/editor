#!/usr/bin/env python3
"""Offline peer audit of immutable source snapshots and actual process records."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
checks = 0

def check(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    data = (ROOT / path).read_bytes()
    return gzip.decompress(data) if str(path).endswith('.gz') else data

def data(path):
    return json.loads(read(path))

manifest = data('manifest.json')
for path, entry in manifest['files'].items():
    raw = (ROOT / path).read_bytes()
    check(len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], 'payload identity: ' + path)

sources = data('sources.json.gz')
base, intermediate, candidate = [sources[key] for key in ['original', 'intermediate', 'candidate']]
before, middle, after = [sources['files'][ref] for ref in [base, intermediate, candidate]]
runner = 'tests/browser/physical-history.mjs'
entry = 'tests/browser/native-plugin-parity.js'
shell = 'tests/browser/native-plugin-parity.html'
groups = [
    ('block-settings', 'nativeBlockSettings', ['text-block-settings', 'columns-layout'], 33),
    ('code-source-language', 'nativeCodeSourceLanguage', ['code-source-language'], 20),
    ('person-modes', 'nativePersonModes', ['person-modes'], 28),
    ('table-keyboard', 'nativeTableKeyboard', ['table-keyboard'], 30),
]
expected_paths = {runner, entry, 'tests/browser/README.md'} | {
    f'tests/browser/native-{name}.{ext}' for name, _, _, _ in groups for ext in ['html', 'js']
}
check(set(sources['changedPaths']) == expected_paths and len(sources['changedPaths']) == 11, 'exact shipping scope')
patch_paths = re.findall(r'^diff --git a/(\S+) b/\S+$', read('shipping-partition.patch.gz').decode(), re.M)
check(set(patch_paths) == expected_paths and len(patch_paths) == 11, 'complete shipping patch scope')
check(sources['baseToMetadataParentRuntimeDiff'] == '', '8e22 and metadata parent have identical runtime/tests')

for source, moved in [(middle, groups[1:]), (after, groups)]:
    expected_entry = before[entry]
    reduced_runner = source[runner]
    for name, variable, modules, _ in moved:
        for module in modules:
            line = f"import './regressions/{module}-native.js'\n"
            check(expected_entry.count(line) == 1, 'one original import: ' + module)
            expected_entry = expected_entry.replace(line, '')
        call = f"  const {variable} = await runNativePage(client, pageUrl, 'native-{name}.html')\n"
        field = f'    {variable},\n'
        check(reduced_runner.count(call) == reduced_runner.count(field) == 1, 'one awaited page and aggregate field: ' + name)
        reduced_runner = reduced_runner.replace(call, '').replace(field, '')
        expected_module = ''.join(f"import './regressions/{module}-native.js'\n" for module in modules)
        expected_module += "import { run } from './regressions/harness.js'\n\nawait run()\n"
        check(source[f'tests/browser/native-{name}.js'] == expected_module, 'unchanged module imports then run: ' + name)
        new_html = source[f'tests/browser/native-{name}.html'].replace(f'./native-{name}.js', './native-plugin-parity.js')
        normalize = lambda value: re.sub(r'<title>[^<]+</title>', '<title>PAGE</title>', value)
        check(normalize(new_html) == normalize(before[shell]), 'identical style/body/driver shell: ' + name)
    check(expected_entry == source[entry], 'entry differs only by whole-module extraction')
    check(reduced_runner == before[runner], 'runner differs only by awaited calls and aggregate fields')
    for path in set(before) - {runner, entry}:
        check(source[path] == before[path], 'unchanged fixture/driver/harness: ' + path)

check(before[runner].count('const deadline = Date.now() + 120_000') == 1, 'shipping 120-second page budget')
check('entry.name.includes(filter)' in before['tests/browser/regressions/harness.js'], 'unchanged literal substring filter')
check('Array.isArray(results) && results.length > 0' in before[runner], 'unmatched filter cannot silently pass')
check("if (result.status === 'fail') throw new Error" in before[runner], 'page failure propagates')
check('if (nativeInputError) throw nativeInputError' in before[runner], 'native input failure propagates')

original = data('original/manifest.json.gz')
check(original['outcome'] == 'failed' and original['sourceUnchanged'], 'original full run remains FAILED')
check(original['source']['head'] == base and original['sourceAfter']['head'] == base, 'original exact source')
check(len(original['gates']) == 12, 'original twelve gates retained')
check(sum(gate['outcome'] == 'passed' for gate in original['gates'].values()) == 11, 'original eleven passes retained')
native = original['gates']['native-browser']
check(native['outcome'] == 'failed' and native['exitCode'] == 1, 'original native exit one retained')
check('Timed out waiting for history matrix' in read('original/native-browser.log').decode(), 'original failure is page deadline')
check("runNativePage(client, pageUrl, 'native-plugin-parity.html')" in before[runner].splitlines()[509], 'original failing frame identifies plugin page')

input_record = data('diagnostic/input.json')
process = data('diagnostic/process.json')
overlay = read('diagnostic/deadline-overlay.patch.gz')
check(input_record['base'] == base and input_record['tree'] == sources['trees'][base], 'diagnostic base identity')
check(sha(overlay) == input_record['overlaySha256'], 'exact diagnostic overlay hash')
check(overlay.decode().count('\n-  const deadline = Date.now() + 120_000\n') == 1, 'overlay removes only original deadline')
check(overlay.decode().count('\n+  const deadline = Date.now() + 360_000\n') == 1, 'overlay adds only diagnostic deadline')
change_lines = [line for line in overlay.decode().splitlines() if line[:1] in ['+', '-'] and not line.startswith(('+++', '---'))]
check(len(change_lines) == 2, 'one-line diagnostic change')
check(sha(before[runner].encode()) == input_record['originalRunnerSha256'], 'original runner payload')
diagnostic_runner = before[runner].replace('const deadline = Date.now() + 120_000', 'const deadline = Date.now() + 360_000')
check(sha(diagnostic_runner.encode()) == input_record['diagnosticRunnerSha256'], 'diagnostic has no other source overlay')
check(process['actualExitCode'] == 0 and process['signal'] is None and process['outcome'] == 'PASS', 'diagnostic actual process exit zero')
check(process['filter'] is None and process['environment']['EDITOR_NATIVE_PAGE'] == 'native-plugin-parity.html', 'unfiltered original monolith')
check(process['sourceBefore'] == process['sourceAfter'] and process['sourceAndDiagnosticOverlayUnchanged'], 'source and overlay unchanged during diagnostic')
check(process['sourceBefore']['trackedChanges'] == [runner], 'only runner deadline was overlaid')
check(process['sourceBefore']['head'] == base, 'diagnostic exact tested source')
check(sha(read('diagnostic/stdout.log.gz')) == process['files']['monolithic.stdout.log']['sha256'], 'diagnostic raw stdout hash')
check(read('diagnostic/stderr.log') == b'', 'diagnostic stderr empty')

def parse_results(stdout, expected_page):
    records = [json.loads(line) for line in stdout.splitlines() if line.startswith('{')]
    check(len(records) == 1 and set(records[0]) == {expected_page}, 'one complete page result: ' + expected_page)
    results = records[0][expected_page]
    check(results and all(result['status'] == 'PASS' for result in results), 'all actual cases pass: ' + expected_page)
    return [result['name'] for result in results]

monolithic = parse_results(read('diagnostic/stdout.log.gz').decode(), 'native-plugin-parity.html')
check(len(monolithic) == len(set(monolithic)) == 444, '444 distinct monolithic actual cases')
check(process['cases'] == process['passed'] == 444 and process['failed'] == [], 'diagnostic summary agrees with raw results')
clock = data('diagnostic/navigation-clock.json')
observer = data('diagnostic/observer-invocation.json')
check(observer['actualExitCode'] == 0 and observer['trackedSourceRestored'], 'external passive observer completed; overlay restored')
check(sha(read('diagnostic/navigation-clock.mjs')) == observer['observerSha256'], 'passive observer code identity')
check(observer['restoredOriginalRunnerSha256'] == input_record['originalRunnerSha256'], 'restored runner hash')
completion = next(item for item in process['stdoutEvents'] if 'text' in item)
page_ms = completion['receivedEpochMs'] - clock['timeOrigin']
check(abs(page_ms - process['pageNavigationToCompletionMs']) < 0.001, 'page timing computed from recorded clocks')
check(page_ms > 120000 and process['elapsedMs'] > page_ms, 'monolith finishes beyond shipping page capacity')
check(clock['status'] == 'running' and 0 < clock['pageElapsedMs'] < page_ms, 'clock read during same page execution')

middle_raw = data('intermediate-evidence.json.gz')['files']
final_raw = data('final-evidence.json.gz')['files']

def check_process(raw, job, head, expected_count=None, expected_page=None):
    record = json.loads(raw[job + '.meta.json'])
    check(record['status'] == 'complete' and record['actualExitCode'] == 0, 'complete actual exit zero: ' + job)
    check(record['sourceUnchanged'] and record['trackedCleanBefore'] and record['trackedCleanAfter'], 'clean immutable source: ' + job)
    check(record['headBefore'] == record['headAfter'] == head, 'actual tested head: ' + job)
    check(record['pageDeadlineMs'] == 120000, 'shipping page deadline retained: ' + job)
    for path, digest in record['sourceSha256'].items():
        check(path in sources['files'][head] and sha(sources['files'][head][path].encode()) == digest,
              'recorded process source hash: ' + job + '/' + path)
    for stream in ['stdout', 'stderr']:
        check(sha(raw[job + '.' + stream].encode()) == record[stream + 'Sha256'], 'actual raw stream hash: ' + job + '/' + stream)
    check(raw[job + '.stderr'] == '', 'no process stderr: ' + job)
    if expected_page:
        names = parse_results(raw[job + '.stdout'], expected_page)
        check(len(names) == expected_count, 'actual expected case count: ' + job)
        return names, record
    return json.loads(raw[job + '.stdout']), record

inventories = []
for raw, head in [(middle_raw, intermediate), (final_raw, candidate)]:
    inventory, _ = check_process(raw, 'inventory', head)
    check(inventory['kind'] == 'registration-inventory-only' and not inventory['productionOrFixtureExecutionClaimed'], 'registration is not presented as case execution')
    check(inventory['candidate'] == head and inventory['sourceUnchanged'], 'inventory exact candidate')
    check(inventory['originalEntrySha256'] == sha(before[entry].encode()), 'inventory original entry identity')
    check(inventory['originalHarnessSha256'] == sha(before['tests/browser/regressions/harness.js'].encode()), 'inventory original harness identity')
    inventory_script = 'native_partition_inventory.mjs' if head == intermediate else 'native_partition_inventory_final.mjs'
    check(sha(raw[inventory_script].encode()) == inventory['runnerSha256'], 'registration observer code identity')
    check(inventory['originalCount'] == inventory['partitionCount'] == 444 and inventory['duplicateNames'] == [], 'registration count and duplicates')
    registered = {group['label']: group['names'] for group in inventory['results']}
    check(all(group['errors'] == [] for group in inventory['results']), 'no registration page errors')
    check(registered['original'] == monolithic, 'original registration order equals actual monolithic order')
    union = sum((names for label, names in registered.items() if label != 'original'), [])
    check(Counter(registered['original']) == Counter(monolithic) == Counter(union), 'registration exact multiset agrees with original real execution')
    inventories.append(registered)

actual_middle = []
for job, page, count in [('remaining', 'native-plugin-parity.html', 366), ('code', 'native-code-source-language.html', 20), ('person', 'native-person-modes.html', 28), ('table', 'native-table-keyboard.html', 30)]:
    names, _ = check_process(middle_raw, job, intermediate, count, page)
    check(names == inventories[0][job], 'registration order equals actual intermediate order: ' + job)
    actual_middle += names
check(Counter(actual_middle) == Counter(monolithic), 'intermediate actual 366+20+28+30 preserves all original cases')

actual_final = []
timings = []
for job, page, count, raw, head in [
    ('remaining', 'native-plugin-parity.html', 333, final_raw, candidate),
    ('settings', 'native-block-settings.html', 33, final_raw, candidate),
    ('code', 'native-code-source-language.html', 20, middle_raw, intermediate),
    ('person', 'native-person-modes.html', 28, middle_raw, intermediate),
    ('table', 'native-table-keyboard.html', 30, middle_raw, intermediate),
]:
    names, record = check_process(raw, job, head, count, page)
    check(names == inventories[1][job], 'final registration equals actual execution order: ' + job)
    actual_final += names
    timings.append({'page': page, 'count': count, 'executedSource': head, 'processSeconds': record['elapsedSeconds']})
    if head == intermediate:
        for suffix in ['.html', '.js']:
            path = 'tests/browser/' + page.removesuffix('.html') + suffix
            check(middle[path] == after[path], 'reused focused page bytes unchanged: ' + path)
check(Counter(actual_final) == Counter(monolithic) and len(actual_final) == len(set(actual_final)) == 444, 'final five-page exact execution multiset, no omissions or duplicates')

print(json.dumps({'outcome': 'PASS', 'checks': checks, 'candidate': candidate, 'originalRunStill': 'FAILED',
                  'monolithicCases': 444, 'monolithicPageMs': page_ms, 'monolithicProcessMs': process['elapsedMs'],
                  'finalPageCounts': [333, 33, 20, 28, 30], 'finalCaseMultisetEqualsOriginal': True,
                  'shippingPageDeadlineMs': 120000, 'focusedPageTimings': timings,
                  'scope': 'Source, immutable focused results, and one diagnostic original monolithic run; full native gate remains root-owned'}, indent=2))
