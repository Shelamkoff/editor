import assert from 'node:assert/strict'
import test from 'node:test'
import { NAVIGATION153, verifyNavigation153, verifyNavigationTimelines, verifyOriginalNavigation153 } from './navigation153-results.mjs'
import { verifyNavigationGreen } from './focused-browser-results.mjs'

const head = '0dd49e4c826e0d4c1f70cfd3746400d2c9a7391b'
const names = ['_self', '_blank', '_parent', '_top', 'articlePreview', 'existing-named',
  'control-click', 'shift-click', 'middle-click', 'relative', 'fragment-new-tab', 'fragment-control-click']
const surfaces = ['raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer', 'paragraph-editor', 'paragraph-renderer']
const kinds = ['bare-paragraph', 'sanitized-only', 'paragraph-editor', 'paragraph-renderer']
const batches = [
  { id: 'relative-forward', href: '#destination', kinds },
  { id: 'relative-reverse', href: '#destination', kinds: [...kinds].reverse() },
  { id: 'absolute-forward', href: 'http://127.0.0.1:5173/boundary-owner#destination', kinds },
  { id: 'absolute-reverse', href: 'http://127.0.0.1:5173/boundary-owner#destination', kinds: [...kinds].reverse() },
]
function fixture() {
  const actual = name => ({
    pages: [{ url: '/boundary-host', openerIsNull: true }, { url: '/boundary-owner#destination', openerIsNull: true }],
    requests: [{ url: '/boundary-destination?case=' + name, referer: '' }], errors: [], settled: true,
    policyEnforced: true, activations: [{ type: 'click', trusted: true, button: 0, ctrlKey: true }],
  })
  const row = (name, surface, controlKind, phase) => ({
    name, surface, phase, status: 'PASS', failure: null,
    control: { kind: controlKind, actual: actual(name) }, candidate: { kind: surface, actual: actual(name) },
  })
  const report = {
    success: true, head, browser: NAVIGATION153.browser, originalScope: 'full',
    originalExpectedRows: 72, originalCandidatePass: true, originalCaseNames: names,
    originalVariants: ['platform-control', ...surfaces],
    results: names.flatMap(name => surfaces.map(surface => row(name, surface, 'platform-control', 'original'))),
    causalExpectedRows: 12, causalControlsPass: true, controlBatches: structuredClone(batches),
    causalResults: batches.flatMap(batch => batch.kinds.filter(kind => kind !== 'bare-paragraph')
      .map(kind => row('fragment-control-click', kind, 'bare-paragraph', batch.id))),
    executedContexts: 100, phaseErrors: [], loggerErrors: [],
    sourceUnchanged: true, instrumentationUnchanged: true, playwrightRuntimeUnchanged: true,
    originalRunnerSha256: NAVIGATION153.originalRunnerSha256, noPermissionGrants: true,
    navigationOutcomeDeadlineMs: 5000, retries: 0,
    playwrightRuntime: { version: NAVIGATION153.playwright, moduleSha256: NAVIGATION153.playwrightModuleSha256 },
    artifacts: Object.fromEntries([...Array.from({ length: 100 }, (_, index) => [String(index + 1).padStart(3, '0') + '-case.timeline.json', 'a'.repeat(64)]), ['browser-target-timeline.json', 'a'.repeat(64)]]),
  }
  const runtime = {
    archiveSha256: NAVIGATION153.archiveSha256, integrity: NAVIGATION153.integrity,
    binarySha256: NAVIGATION153.binarySha256, browserVersion: 'Chromium ' + NAVIGATION153.browser,
    playwrightVersion: NAVIGATION153.playwright, playwrightModuleSha256: NAVIGATION153.playwrightModuleSha256,
  }
  const run = { exitCode: 0, signal: null, timedOut: false, spawnError: null, receivedSignal: null }
  return { run, report, runtime, head }
}
const verify = value => verifyNavigation153(value.run, value.report, value.runtime, value.head)

test('accepts one complete full72 plus12 causal report with100contexts and exact historical binary', () => {
  assert.deepEqual(verify(fixture()), {
    outcome: 'CURRENT_SOURCE_DIAGNOSTIC_PASS', originalComparisons: 72, causalComparisons: 12,
    contexts: 100, browser: NAVIGATION153.browser,
    limitation: 'A current-source instrumented PASS does not establish the cause of the archived e8/Chromium153 failure.',
  })
})
test('accepts original case labels containing underscores and mixed case in timeline names', () => {
  const value = fixture()
  value.report.artifacts['001-original-_self-platform-control.timeline.json'] = value.report.artifacts['001-case.timeline.json']
  value.report.artifacts['002-original-articlePreview-raw-editor.timeline.json'] = value.report.artifacts['002-case.timeline.json']
  delete value.report.artifacts['001-case.timeline.json']
  delete value.report.artifacts['002-case.timeline.json']
  assert.equal(verify(value).contexts, 100)
})
test('rejects process launch errors, nonzero exits, timeouts and interrupted successful exits', () => {
  for (const change of [{ exitCode: 1 }, { timedOut: true }, { signal: 'SIGTERM' }, { receivedSignal: 'SIGINT' }, { spawnError: 'ENOENT' }]) {
    const value = fixture(); Object.assign(value.run, change)
    assert.throws(() => verify(value))
  }
})
test('rejects omitted, duplicated or failed original comparisons even when summary says success', () => {
  for (const mutate of [r => r.results.pop(), r => { r.results[71] = structuredClone(r.results[70]) },
    r => { r.results[71].status = 'FAIL' }, r => { r.results[71].candidate.actual.pages.pop() }]) {
    const value = fixture(); mutate(value.report)
    assert.throws(() => verify(value))
  }
})
test('rejects incomplete or reordered causal controls and wrong total context count', () => {
  for (const mutate of [r => r.causalResults.pop(), r => r.causalResults.reverse(),
    r => { r.controlBatches[1].kinds = [...kinds] }, r => { r.executedContexts = 99 }]) {
    const value = fixture(); mutate(value.report)
    assert.throws(() => verify(value))
  }
})
test('rejects matching candidates when the independent control did not settle or activate natively', () => {
  for (const change of [{ settled: false }, { policyEnforced: false }, { activations: [{ trusted: false }] }, { pages: [], requests: [] }]) {
    const value = fixture()
    Object.assign(value.report.results[71].control.actual, change)
    Object.assign(value.report.results[71].candidate.actual, change)
    assert.throws(() => verify(value))
  }
})
test('rejects changed source, changed deadline, extra retries and setup/logger errors', () => {
  for (const change of [{ head: 'f'.repeat(40) }, { originalScope: 'focused' }, { sourceUnchanged: false },
    { instrumentationUnchanged: false }, { playwrightRuntimeUnchanged: false }, { navigationOutcomeDeadlineMs: 6000 },
    { retries: 1 }, { noPermissionGrants: false }, { phaseErrors: [{ phase: 'setup' }] }, { loggerErrors: ['observer error'] }]) {
    const value = fixture(); Object.assign(value.report, change)
    assert.throws(() => verify(value))
  }
})
test('rejects another153 build or another Playwright package even if report browser version matches', () => {
  for (const change of [{ binarySha256: 'b'.repeat(64) }, { archiveSha256: 'b'.repeat(64) }, { integrity: 'sha512-other' },
    { browserVersion: 'Chromium 153.0.8010.36' }, { playwrightVersion: '1.63.0' }, { playwrightModuleSha256: 'b'.repeat(64) }]) {
    const value = fixture(); Object.assign(value.runtime, change)
    assert.throws(() => verify(value))
  }
})
test('rejects missing, extra, unsafe or malformed timeline evidence', () => {
  for (const mutate of [r => { delete r.artifacts['browser-target-timeline.json'] },
    r => { r.artifacts['extra.timeline.json'] = 'a'.repeat(64) },
    r => { r.artifacts['../escape.json'] = r.artifacts['001-case.timeline.json']; delete r.artifacts['001-case.timeline.json'] },
    r => { r.artifacts['001-case.timeline.json'] = 'short' }]) {
    const value = fixture(); mutate(value.report)
    assert.throws(() => verify(value))
  }
})


test('requires all100 independent outcome-cutoff observations without late promotion or duplicates', () => {
  const fresh = () => Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1), events: [
    { event: 'outcome-poll-finished', settled: true, deadline: 123456789 },
  ] }))
  assert.deepEqual(verifyNavigationTimelines(fresh()), { total: 100, settledAtOriginalCutoff: 100 })
  for (const mutate of [rows => rows.pop(), rows => { rows[99].id = rows[98].id },
    rows => { rows[99].events[0].settled = false }, rows => { rows[99].events = [] },
    rows => { rows[99].events.push({ ...rows[99].events[0] }) }, rows => { rows[99].events[0].deadline = null }]) {
    const rows = fresh(); mutate(rows)
    assert.throws(() => verifyNavigationTimelines(rows))
  }
})

function originalFixture() {
  const value = fixture()
  value.report.candidatePass = true
  value.run.stdout = JSON.stringify(value.report)
  return value
}
test('original-only153 reuses all72 maintained comparisons without rewriting raw browser data', () => {
  const value = originalFixture(), before = structuredClone(value)
  const result = verifyOriginalNavigation153(value.run, value.runtime, value.head)
  assert.equal(result.outcome, 'CURRENT_SOURCE_UNINSTRUMENTED_PASS')
  assert.equal(result.total, 72); assert.equal(result.browser, '153.0.8010.0')
  assert.deepEqual(value, before)
})
test('the default151 gate rejects153 and an explicit153 gate rejects151', () => {
  const value = originalFixture()
  assert.throws(() => verifyNavigationGreen(value.run, value.head))
  value.report.browser = '151.0.7922.34'
  value.run.stdout = JSON.stringify(value.report)
  assert.equal(verifyNavigationGreen(value.run, value.head).total, 72)
  assert.throws(() => verifyNavigationGreen(value.run, value.head, NAVIGATION153.browser))
})
test('original-only153 rejects incomplete, duplicate, failed and unequal comparisons', () => {
  for (const mutate of [r => r.results.pop(), r => { r.results[71] = structuredClone(r.results[70]) },
    r => { r.results[71].status = 'FAIL' }, r => { r.results[71].candidate.actual.pages.pop() },
    r => { r.candidatePass = false }, r => { r.head = 'f'.repeat(40) }, r => { r.sourceUnchanged = false }]) {
    const value = originalFixture(); mutate(value.report); value.run.stdout = JSON.stringify(value.report)
    assert.throws(() => verifyOriginalNavigation153(value.run, value.runtime, value.head))
  }
})
test('original-only153 rejects interrupted execution and unverified binary provenance', () => {
  for (const change of [{ exitCode: 1 }, { timedOut: true }, { receivedSignal: 'SIGTERM' }]) {
    const value = originalFixture(); Object.assign(value.run, change)
    assert.throws(() => verifyOriginalNavigation153(value.run, value.runtime, value.head))
  }
  const value = originalFixture(); value.runtime.binarySha256 = 'f'.repeat(64)
  assert.throws(() => verifyOriginalNavigation153(value.run, value.runtime, value.head))
})
