import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { appendFailureDiagnostic } from '../../tests/browser/regressions/failure-diagnostics.js'
import { MEDIA_CASES, POSITIVE_MEDIA_CASES, NEGATIVE_MEDIA_CASES, classifyMediaPage, mediaOutcome, instrumentMediaFixture, installPlaybackDiagnostics } from './native-media-diagnostic.mjs'

const rows = () => MEDIA_CASES.map(name => ({ name, status: 'PASS' }))
const command = (cases = rows(), overrides = {}) => ({ exitCode: 0, signal: null, receivedSignal: null,
  timedOut: false, spawnError: null, stdout: JSON.stringify({ 'native-html-content.html': cases }), stderr: '', ...overrides })
const contract = { schemaVersion: 2, contract: 'native-playback-functional-v2', origin: 'dispatchKey-completion', timeoutMs: 3000, pollMs: 50 }
const state = (overrides = {}) => ({ trusted: true, paused: false, played: [[0, 0.1]], currentTime: 0.1,
  readyState: 4, mediaError: null, videoConnected: true, frameConnected: true, sameChildDocument: true, sameVideoDocument: true, ...overrides })
const observation = (elapsedMs, value) => ({ elapsedMs, predicate: value.trusted && !value.paused && value.played.length > 0,
  withinDeadline: elapsedMs < 3000, state: value })
function playback(outcome = 'PLAYING', value = state()) {
  const observations = outcome === 'PLAYING'
    ? [observation(100, state({ played: [] })), observation(150, value)]
    : [observation(100, value), observation(3000, value)]
  return { ...contract, outcome, observations, initialObservation: observations[0], finalObservation: observations.at(-1),
    firstObservedPositiveElapsedMs: observations.find(item => item.predicate)?.elapsedMs ?? null }
}
function telemetry() {
  return { ...contract, initialDelayMs: 100, records: [
    ...POSITIVE_MEDIA_CASES.map(name => ({ name, phase: 'positive', expectedOutcome: 'PLAYING', readiness: playback() })),
    { name: NEGATIVE_MEDIA_CASES[0], phase: 'wrong-target', expectedOutcome: 'DEADLINE', readiness: playback('DEADLINE', state({ paused: true, played: [] })) },
    { name: NEGATIVE_MEDIA_CASES[1], phase: 'paused-history-preparation', expectedOutcome: 'PLAYING', readiness: playback() },
    { name: NEGATIVE_MEDIA_CASES[1], phase: 'paused-history-rejection', expectedOutcome: 'DEADLINE', readiness: playback('DEADLINE', state({ paused: true })) },
  ] }
}

test('functional acceptance requires complete readiness phases and rejects late or invalid negative evidence', () => {
  assert.throws(() => classifyMediaPage(command()), /readiness/i)
  assert.equal(classifyMediaPage(command(), false, telemetry()).passed, true)
  for (const mutate of [
    value => { value.records.pop() },
    value => { value.records[4].phase = 'positive' },
    value => { value.contract = 'native-playback-fixed-100ms' },
    value => {
      const result = value.records[0].readiness
      result.finalObservation.elapsedMs = 3000; result.finalObservation.withinDeadline = false
      result.firstObservedPositiveElapsedMs = 3000
    },
    value => { value.records[0].readiness.finalObservation.state.sameVideoDocument = false },
    value => { value.records[4].readiness.outcome = 'OWNER_LOST' },
    value => { value.records[4].readiness.outcome = 'OBSERVATION_ERROR' },
    value => { value.records[4].readiness.finalObservation.state.trusted = false },
    value => { value.records[6].readiness.finalObservation.state.played = [] },
  ]) {
    const value = telemetry(); mutate(value)
    assert.throws(() => classifyMediaPage(command(), false, value))
  }
})

test('media classification requires the original 28 cases and both named native negative controls', () => {
  assert.throws(() => classifyMediaPage(command(rows().slice(0, 28))), /Expected all 30/)
  assert.equal(MEDIA_CASES.length, 30)
  assert.deepEqual(MEDIA_CASES.slice(28), [
    'Native playback control: trusted Space on a different button reaches the playback deadline',
    'Native playback control: paused native video with played history reaches the playback deadline',
  ])
  assert.equal(classifyMediaPage(command(), false, telemetry()).passed, true)
  for (const cases of [rows().slice(1), [...rows().slice(1), rows()[1]], rows().map((row, index) => index ? row : { ...row, status: 'SKIP' })]) {
    assert.throws(() => classifyMediaPage(command(cases)))
  }
})

test('completed original assertion failures remain failures even if a later diagnostic passes', () => {
  const cases = rows(); cases[24] = { ...cases[24], status: 'FAIL', error: 'Error: Native controls did not start actual playback' }
  const original = classifyMediaPage(command(cases, { exitCode: 1, stdout: '', stderr: 'Error: History matrix failed: ' + JSON.stringify(cases) + '\n at runner' }), false, telemetry())
  assert.equal(original.complete, true)
  assert.equal(original.passed, false)
  assert.equal(mediaOutcome(original, { complete: true, passed: true }, true).pass, false)
  assert.equal(mediaOutcome({ complete: true, passed: true }, original, true).pass, false)
})

test('media protocol never accepts incomplete, interrupted, duplicate or wrong-runtime execution', () => {
  assert.throws(() => classifyMediaPage(command(rows(), { exitCode: null, signal: 'SIGTERM' })))
  assert.throws(() => classifyMediaPage(command(rows(), { timedOut: true })))
  assert.throws(() => classifyMediaPage(command(rows(), { stdout: command().stdout + '\n' + command().stdout })))
  assert.throws(() => classifyMediaPage(command(rows(), { exitCode: 1, stdout: '' })))
  assert.equal(mediaOutcome({ complete: true, passed: true }, { complete: true, passed: true }, false).pass, false)
})

test('later diagnostic playback cannot override the functional verdict or instrument negative controls', () => {
  const cases = rows(), value = telemetry()
  for (const name of POSITIVE_MEDIA_CASES) cases.find(row => row.name === name).mediaDiagnostic = {
    schemaVersion: 2, contract: contract.contract, clockOrigin: 'probe-mounted',
    functionalVerdict: { passed: true, readinessOutcome: 'PLAYING', error: null },
    readiness: value.records.find(record => record.name === name).readiness,
    snapshots: [{ phase: 'functional-verdict' }, { phase: 'post-verdict-300ms' }], events: [],
  }
  assert.equal(classifyMediaPage(command(cases), true, value).passed, true)
  cases[24].mediaDiagnostic.functionalVerdict.passed = false
  cases[24].mediaDiagnostic.snapshots[1].played = [[0, 0.2]]
  assert.throws(() => classifyMediaPage(command(cases), true, value), /functional verdict/)
  cases[24].mediaDiagnostic.functionalVerdict.passed = true
  cases[28].mediaDiagnostic = cases[24].mediaDiagnostic
  assert.throws(() => classifyMediaPage(command(cases), true, value), /four positive/)
})

test('diagnostic overlay preserves the original playback assertions and all registered cases', async () => {
  const source = await readFile(new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url), 'utf8')
  const result = instrumentMediaFixture(source)
  for (const line of source.split('\n').filter(line => /assert\(|equal\(|await pause\(100\)|await dispatchKey\(' ', 'Space', 32\)/.test(line))) {
    assert.ok(result.includes(line.trim()), line)
  }
  assert.equal((result.match(/for \(const \[name, type, editing\] of surfaces\) test\(/g) ?? []).length, 7)
  assert.doesNotMatch(result, /\.play\(|\.click\(|test-filter/)
  assert.throws(() => instrumentMediaFixture(source.replace('await pause(100)', 'await pause(101)')), /anchor/)
  assert.equal(result.slice(result.indexOf("test('Native playback control:")), source.slice(source.indexOf("test('Native playback control:")),
    'The two appended native controls must remain uninstrumented')
})

test('maintained fixture registers exactly 30 cases without executing a callback', async () => {
  const source = await readFile(new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url), 'utf8')
  for (const fixture of [source, instrumentMediaFixture(source)]) {
    const names = []
    await runInNewContext('(async () => {\n' + fixture.replace(/^import .*$/gm, '') + '\n})()', {
      window: {}, test: (name, callback) => { assert.equal(typeof callback, 'function'); names.push(name) },
      run: async () => {},
    })
    assert.deepEqual(names, MEDIA_CASES)
    assert.equal(new Set(names).size, 30)
  }
})

test('read-only probe preserves key cancellation and the versioned functional verdict', async () => {
  const listeners = new Map(), window = {}
  const target = { addEventListener(type, fn, capture) { listeners.set(`${type}:${capture}`, fn) }, removeEventListener() {} }
  const video = { nodeName: 'VIDEO', id: 'video', readyState: 2, networkState: 1, paused: true,
    ended: false, seeking: false, currentTime: 0, duration: 1, played: { length: 0 }, buffered: { length: 0 },
    error: null, currentSrc: 'blob:owned', muted: true, controls: true, isConnected: true,
    addEventListener() {}, removeEventListener() {} }
  const frame = { nodeName: 'IFRAME', id: 'frame', isConnected: true, ownerDocument: { activeElement: null } }
  const child = { activeElement: video, hasFocus: () => true, readyState: 'complete', visibilityState: 'visible', defaultView: target }
  frame.contentDocument = child
  video.ownerDocument = child
  const create = runInNewContext(`(${installPlaybackDiagnostics.toString()})()`, { window, performance, structuredClone, queueMicrotask })
  const probe = create('case', frame, child, video)
  const event = { type: 'keydown', isTrusted: true, defaultPrevented: false, key: ' ', code: 'Space', target: video, timeStamp: 1 }
  listeners.get('keydown:true')(event)
  event.defaultPrevented = true
  probe.sample('dispatch-return')
  await Promise.resolve()
  const readiness = playback('DEADLINE', state({ played: [] }))
  probe.verdict(false, readiness, 'Original functional deadline')
  video.paused = false
  video.played = { length: 1, start: () => 0, end: () => 0.2 }
  probe.sample('post-verdict-300ms')
  window.__auditResults = [{ name: 'case', status: 'FAIL' }]
  const evidence = window.__auditResults[0].mediaDiagnostic
  assert.equal(evidence.schemaVersion, 2)
  assert.equal(evidence.contract, 'native-playback-functional-v2')
  assert.equal(evidence.clockOrigin, 'probe-mounted')
  assert.deepEqual(evidence.functionalVerdict, { passed: false, readinessOutcome: 'DEADLINE', error: 'Original functional deadline' })
  assert.deepEqual(evidence.readiness, readiness)
  assert.equal(evidence.snapshots.at(-1).played.length, 1)
  assert.equal(evidence.events[0].defaultPrevented, false)
  const final = evidence.snapshots.find(snapshot => snapshot.phase === 'post-dispatch-microtask')
  assert.equal(final.keys[0].defaultPrevented, true)
  assert.equal(final.frameConnected, true)
  assert.equal(final.videoConnected, true)
  assert.equal(final.sameChildDocument, true)
  assert.equal(final.sameVideoDocument, true)
  assert.equal(final.childHasFocus, true)
  assert.equal(final.childActive.tag, 'VIDEO')
  assert.equal(final.visibility, 'visible')
  probe.dispose()
})

// Exercise the maintained fixture's verdict catch and the maintained harness's
// serializer. This is a diagnostic transport control, not a browser playback test.
async function runFailureDiagnosticControl({ passed = false, collectionFails = false, instrumented = false } = {}) {
  const harness = await readFile(new URL('../../tests/browser/regressions/harness.js', import.meta.url), 'utf8')
  const originalFixture = await readFile(new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url), 'utf8')
  const fixture = instrumented ? instrumentMediaFixture(originalFixture) : originalFixture
  const result = { textContent: '' }, document = { body: { dataset: {} }, querySelector: selector => {
    assert.equal(selector, '#result'); return result
  } }
  const window = new EventTarget()
  const api = runInNewContext(harness.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\n;({test, assert, run})', {
    window, document, URL, location: { href: 'http://localhost/diagnostic-transport' }, setTimeout, clearTimeout,
  }, { filename: 'maintained-harness.js' })
  const start = "      try {\n        assert(readiness.outcome === 'PLAYING' && trusted && !video.paused && video.played.length > 0, 'Native controls did not start actual playback')"
  const end = "      retire(); await pause(50)\n      assert(video.paused, 'Retired child content kept playing its native media')"
  assert.equal(fixture.split(start).length, 2)
  assert.equal(fixture.split(end).length, 2)
  const verdictCode = fixture.slice(fixture.indexOf(start), fixture.indexOf(end))
  let originalError, originalStack, diagnosticReads = 0
  const cause = new Error('retained original cause')
  const rect = { toJSON: () => ({ x: 0, y: 0, width: 320, height: 180 }) }
  const video = { paused: !passed, played: { length: passed ? 1 : 0, start: () => 0, end: () => 0.12 },
    get currentTime() { diagnosticReads++; return 0 }, duration: 0.2, readyState: 4,
    networkState: 1, ended: false, seeking: false, error: null, isConnected: true,
    getBoundingClientRect() { diagnosticReads++; if (collectionFails) throw new Error('geometry observation unavailable'); return rect } }
  const child = { activeElement: { tagName: 'VIDEO' }, hasFocus() { diagnosticReads++; return true }, visibilityState: 'visible' }
  const frame = { contentDocument: child, isConnected: true, getBoundingClientRect: () => rect }
  const parentDocument = { activeElement: { tagName: 'IFRAME' }, hasFocus: () => true, visibilityState: 'visible' }
  const postVerdictWaits = [], probeVerdicts = [], probeSamples = []
  const executeVerdict = runInNewContext('(async function() {\n' + verdictCode + '\n})', {
    trusted: true, video, child, frame, document: parentDocument, appendFailureDiagnostic,
    readiness: playback(passed ? 'PLAYING' : 'DEADLINE', state({ played: passed ? [[0, 0.1]] : [] })),
    pause: async ms => { postVerdictWaits.push(ms); video.paused = false; video.played.length = 1 },
    probe: { verdict: (...args) => probeVerdicts.push(args), sample: phase => probeSamples.push(phase) },
    assert(value, message) {
      try { api.assert(value, message) } catch (error) {
        originalError = error; error.cause = cause
        originalStack = error.stack // Deliberately materialize the original stack before the fixture catches it.
        throw error
      }
    },
  }, { filename: 'maintained-media-verdict.js' })
  let caught
  api.test('diagnostic transport control', async () => {
    try { await executeVerdict() } catch (error) { caught = error; throw error }
  })
  await api.run()
  return { rows: JSON.parse(result.textContent), status: document.body.dataset.status,
    originalError, originalStack, cause, caught, diagnosticReads, postVerdictWaits, probeVerdicts, probeSamples }
}

test('cached assertion stack delivers post-failure JSON through the actual harness serializer', async () => {
  const result = await runFailureDiagnosticControl()
  assert.equal(result.status, 'fail')
  assert.equal(result.rows[0].status, 'FAIL')
  assert.equal(result.caught, result.originalError)
  assert.equal(result.caught.cause, result.cause)
  assert(result.rows[0].error.startsWith(result.originalStack + '\n'))
  assert.equal(result.rows[0].error, result.originalError.stack)
  const marker = '\nPlayback state after failure: '
  assert.equal(result.rows[0].error.split(marker).length, 2)
  const state = JSON.parse(result.rows[0].error.split(marker)[1])
  assert.equal(state.trusted, true)
  assert.equal(state.paused, true)
  assert.deepEqual(state.played, [])
  assert(result.diagnosticReads > 0)
})

test('failure-state collection errors preserve the original Error and survive the same serializer', async () => {
  const result = await runFailureDiagnosticControl({ collectionFails: true })
  assert.equal(result.rows[0].status, 'FAIL')
  assert.equal(result.caught, result.originalError)
  assert.equal(result.caught.cause, result.cause)
  assert(result.rows[0].error.startsWith(result.originalStack + '\n'))
  assert.equal(result.rows[0].error, result.originalError.stack)
  assert.match(result.rows[0].error, /Playback state collection failed: Error: geometry observation unavailable/)
  assert.doesNotMatch(result.rows[0].error, /Playback state after failure:/)
})

test('successful functional verdict performs no extended failure-diagnostic reads', async () => {
  const result = await runFailureDiagnosticControl({ passed: true, collectionFails: true })
  assert.equal(result.status, 'pass')
  assert.deepEqual(result.rows, [{ name: 'diagnostic transport control', status: 'PASS' }])
  assert.equal(result.originalError, undefined)
  assert.equal(result.diagnosticReads, 0)
})

test('instrumented fixture retains the same failed Error and immediate state after later playback', async () => {
  const result = await runFailureDiagnosticControl({ instrumented: true })
  assert.equal(result.status, 'fail')
  assert.equal(result.caught, result.originalError)
  assert.equal(result.caught.cause, result.cause)
  assert(result.rows[0].error.startsWith(result.originalStack + '\n'))
  const state = JSON.parse(result.rows[0].error.split('\nPlayback state after failure: ')[1])
  assert.equal(state.paused, true)
  assert.deepEqual(state.played, [])
  assert.deepEqual(result.postVerdictWaits, [300])
  assert.equal(result.probeVerdicts.length, 1)
  assert.equal(result.probeVerdicts[0][0], false)
  assert.equal(result.probeVerdicts[0][1].outcome, 'DEADLINE')
  assert.deepEqual(result.probeSamples, ['post-verdict-300ms'])
})
