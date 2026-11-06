import assert from 'node:assert/strict'

export const NAVIGATION153 = Object.freeze({
  browser: '153.0.8010.0', playwright: '1.62.1',
  binarySha256: '53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0',
  archiveSha256: '20e5656fcdcf4118ede85edfb9d6bb9cc1bbb7ffb8b75622fffbcf36a835c3c0',
  integrity: 'sha512-jiGWqSvPMdu4+P9TilYqAR7yEGPEHINx+lCvE/NqNO/EHYzF/x1hUiI5T6ioVIt7dEy7n88byyT0vk+dnsgQwA==',
  playwrightModuleSha256: 'a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f',
  originalRunnerSha256: '9c9cd595c89f7697cf237602d51ccd51c0d38418c8ecefa42c304486eaab46cf',
})
const caseNames = ['_self', '_blank', '_parent', '_top', 'articlePreview', 'existing-named',
  'control-click', 'shift-click', 'middle-click', 'relative', 'fragment-new-tab', 'fragment-control-click']
const surfaces = ['raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer', 'paragraph-editor', 'paragraph-renderer']
const controlKinds = ['bare-paragraph', 'sanitized-only', 'paragraph-editor', 'paragraph-renderer']
const batches = ['relative-forward', 'relative-reverse', 'absolute-forward', 'absolute-reverse']

function verifyRow(row, name, surface, controlKind, phase) {
  assert.equal(row.name, name)
  assert.equal(row.surface, surface)
  assert.equal(row.phase, phase)
  assert.equal(row.status, 'PASS', 'A candidate navigation assertion failed')
  assert.equal(row.failure, null)
  assert.equal(row.control?.kind, controlKind)
  assert.equal(row.candidate?.kind, surface)
  const actual = row.control.actual
  assert.equal(actual.settled, true, 'The independent control did not settle')
  assert.equal(actual.policyEnforced, true, 'The independent control did not enforce Trusted Types')
  assert(actual.activations?.length > 0 && actual.activations.every(event => event.trusted === true),
    'The independent control did not receive trusted native input')
  const navigated = name.startsWith('fragment-')
    ? actual.pages?.some(page => page.url === '/boundary-owner#destination')
    : actual.requests?.some(request => request.url === '/boundary-destination?case=' + name)
  assert(navigated, 'The independent control did not reach its requested destination')
  assert.deepEqual(row.candidate.actual, actual, 'Candidate differs from independent native control')
}

/** Validate only a completed current-source diagnostic; this never replaces the archived verdict. */
export function verifyNavigation153(run, report, runtime, head) {
  assert.equal(run.exitCode, 0, 'Diagnostic child did not exit successfully')
  assert(!run.signal && !run.timedOut && !run.spawnError && !run.receivedSignal,
    'Interrupted, timed-out or unlaunched commands are not product evidence')
  assert(/^[a-f0-9]{40}$/.test(head), 'Expected source SHA is required')
  assert.equal(report.head, head)
  assert.equal(report.success, true)
  assert.equal(report.browser, NAVIGATION153.browser)
  assert.equal(report.originalScope, 'full')
  assert.equal(report.originalExpectedRows, 72)
  assert.equal(report.originalCandidatePass, true)
  assert.deepEqual(report.originalCaseNames, caseNames)
  assert.deepEqual(report.originalVariants, ['platform-control', ...surfaces])
  assert.equal(report.results?.length, 72)
  let index = 0
  for (const name of caseNames) for (const surface of surfaces)
    verifyRow(report.results[index++], name, surface, 'platform-control', 'original')

  assert.equal(report.causalExpectedRows, 12)
  assert.equal(report.causalControlsPass, true)
  assert.equal(report.causalResults?.length, 12)
  assert.equal(report.controlBatches?.length, 4)
  index = 0
  let absoluteHref
  for (const [position, id] of batches.entries()) {
    const batch = report.controlBatches[position]
    const kinds = id.endsWith('-reverse') ? [...controlKinds].reverse() : controlKinds
    assert.equal(batch.id, id)
    assert.deepEqual(batch.kinds, kinds)
    if (id.startsWith('relative-')) assert.equal(batch.href, '#destination')
    else {
      assert(/^http:\/\/127\.0\.0\.1:\d+\/boundary-owner#destination$/.test(batch.href))
      absoluteHref ??= batch.href
      assert.equal(batch.href, absoluteHref)
    }
    for (const kind of kinds.filter(value => value !== 'bare-paragraph'))
      verifyRow(report.causalResults[index++], 'fragment-control-click', kind, 'bare-paragraph', id)
  }
  assert.equal(report.executedContexts, 100, 'Full diagnostic needs84 original plus16 causal contexts')
  assert.deepEqual(report.phaseErrors, [])
  assert.deepEqual(report.loggerErrors, [])
  for (const field of ['sourceUnchanged', 'instrumentationUnchanged', 'playwrightRuntimeUnchanged', 'noPermissionGrants'])
    assert.equal(report[field], true, field)
  assert.equal(report.originalRunnerSha256, NAVIGATION153.originalRunnerSha256)
  assert.equal(report.navigationOutcomeDeadlineMs, 5000)
  assert.equal(report.retries, 0)
  assert.equal(report.playwrightRuntime?.version, NAVIGATION153.playwright)
  assert.equal(report.playwrightRuntime?.moduleSha256, NAVIGATION153.playwrightModuleSha256)
  assert.equal(runtime.archiveSha256, NAVIGATION153.archiveSha256)
  assert.equal(runtime.integrity, NAVIGATION153.integrity)
  assert.equal(runtime.binarySha256, NAVIGATION153.binarySha256)
  assert.equal(runtime.browserVersion, 'Chromium ' + NAVIGATION153.browser)
  assert.equal(runtime.playwrightVersion, NAVIGATION153.playwright)
  assert.equal(runtime.playwrightModuleSha256, NAVIGATION153.playwrightModuleSha256)

  const artifacts = Object.entries(report.artifacts ?? {})
  assert.equal(artifacts.length, 101, 'Diagnostic must retain100 case timelines and browser target timeline')
  assert(Object.hasOwn(report.artifacts, 'browser-target-timeline.json'))
  const ordinals = []
  for (const [name, hash] of artifacts) {
    assert(/^[a-f0-9]{64}$/.test(hash), 'Malformed timeline digest')
    if (name === 'browser-target-timeline.json') continue
    const match = /^(\d{3})-[A-Za-z0-9_-]+\.timeline\.json$/.exec(name)
    assert(match, 'Unsafe or unrecognized timeline name')
    ordinals.push(Number(match[1]))
  }
  assert.deepEqual(ordinals.sort((a, b) => a - b), Array.from({ length: 100 }, (_, n) => n + 1))
  return { outcome: 'CURRENT_SOURCE_DIAGNOSTIC_PASS', originalComparisons: 72, causalComparisons: 12,
    contexts: 100, browser: NAVIGATION153.browser,
    limitation: 'A current-source instrumented PASS does not establish the cause of the archived e8/Chromium153 failure.' }
}

export function verifyNavigationTimelines(timelines) {
  assert.equal(timelines.length, 100)
  assert.equal(new Set(timelines.map(trace => trace.id)).size, 100, 'Repeated context timeline')
  for (const trace of timelines) {
    const cutoff = trace.events.filter(event => event.event === 'outcome-poll-finished')
    assert.equal(cutoff.length, 1, 'Missing or repeated original outcome cutoff')
    assert.equal(cutoff[0].settled, true, 'Late navigation does not replace the original cutoff verdict')
    assert(Number.isSafeInteger(cutoff[0].deadline) && cutoff[0].deadline > 0, 'Missing outcome deadline')
  }
  return { total: 100, settledAtOriginalCutoff: 100 }
}
