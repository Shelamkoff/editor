import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { appendFailureDiagnostic } from '../../tests/browser/regressions/failure-diagnostics.js'
import { MEDIA_CASES, classifyMediaPage, mediaOutcome, instrumentMediaFixture, installPlaybackDiagnostics } from './native-media-diagnostic.mjs'

const rows = () => MEDIA_CASES.map(name => ({ name, status: 'PASS' }))
const command = (cases = rows(), overrides = {}) => ({ exitCode: 0, signal: null, receivedSignal: null,
  timedOut: false, spawnError: null, stdout: JSON.stringify({ 'native-html-content.html': cases }), stderr: '', ...overrides })

test('media classification requires all 28 original case IDs, with no duplicates or skips', () => {
  assert.equal(MEDIA_CASES.length, 28)
  assert.equal(classifyMediaPage(command()).passed, true)
  for (const cases of [rows().slice(1), [...rows().slice(1), rows()[1]], rows().map((row, index) => index ? row : { ...row, status: 'SKIP' })]) {
    assert.throws(() => classifyMediaPage(command(cases)))
  }
})

test('completed original assertion failures remain failures even if a later diagnostic passes', () => {
  const cases = rows(); cases[24] = { ...cases[24], status: 'FAIL', error: 'Error: Native controls did not start actual playback' }
  const original = classifyMediaPage(command(cases, { exitCode: 1, stdout: '', stderr: 'Error: History matrix failed: ' + JSON.stringify(cases) + '\n at runner' }))
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

test('later played ranges cannot override the original 100ms diagnostic verdict', () => {
  const cases = rows()
  for (const row of cases.slice(24)) row.mediaDiagnostic = {
    originalVerdict: { passed: true }, snapshots: [{ phase: 'original-100ms' }, { phase: 'post-verdict-300ms' }], events: [],
  }
  assert.equal(classifyMediaPage(command(cases), true).passed, true)
  cases[24].mediaDiagnostic.originalVerdict.passed = false
  cases[24].mediaDiagnostic.snapshots[1].played = [[0, 0.2]]
  assert.throws(() => classifyMediaPage(command(cases), true), /100ms/)
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
})

test('read-only probe preserves capture and post-dispatch key cancellation evidence', async () => {
  const listeners = new Map(), window = {}
  const target = { addEventListener(type, fn, capture) { listeners.set(`${type}:${capture}`, fn) }, removeEventListener() {} }
  const video = { nodeName: 'VIDEO', id: 'video', readyState: 2, networkState: 1, paused: true,
    ended: false, seeking: false, currentTime: 0, duration: 1, played: { length: 0 }, buffered: { length: 0 },
    error: null, currentSrc: 'blob:owned', muted: true, controls: true, isConnected: true,
    addEventListener() {}, removeEventListener() {} }
  const frame = { nodeName: 'IFRAME', id: 'frame', isConnected: true, ownerDocument: { activeElement: null } }
  const child = { activeElement: video, hasFocus: () => true, readyState: 'complete', visibilityState: 'visible', defaultView: target }
  frame.contentDocument = child
  const create = runInNewContext(`(${installPlaybackDiagnostics.toString()})()`, { window, performance, structuredClone, queueMicrotask })
  const probe = create('case', frame, child, video)
  const event = { type: 'keydown', isTrusted: true, defaultPrevented: false, key: ' ', code: 'Space', target: video, timeStamp: 1 }
  listeners.get('keydown:true')(event)
  event.defaultPrevented = true
  probe.sample('dispatch-return')
  await Promise.resolve()
  window.__auditResults = [{ name: 'case', status: 'FAIL' }]
  const evidence = window.__auditResults[0].mediaDiagnostic
  assert.equal(evidence.events[0].defaultPrevented, false)
  const final = evidence.snapshots.find(snapshot => snapshot.phase === 'post-dispatch-microtask')
  assert.equal(final.keys[0].defaultPrevented, true)
  assert.equal(final.frameConnected, true)
  assert.equal(final.videoConnected, true)
  assert.equal(final.sameChildDocument, true)
  assert.equal(final.childHasFocus, true)
  assert.equal(final.childActive.tag, 'VIDEO')
  assert.equal(final.visibility, 'visible')
  probe.dispose()
})

// Exercise the maintained fixture's verdict catch and the maintained harness's
// serializer. This is a diagnostic transport control, not a browser playback test.
async function runFailureDiagnosticControl({ passed = false, collectionFails = false } = {}) {
  const harness = await readFile(new URL('../../tests/browser/regressions/harness.js', import.meta.url), 'utf8')
  const fixture = await readFile(new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url), 'utf8')
  const result = { textContent: '' }, document = { body: { dataset: {} }, querySelector: selector => {
    assert.equal(selector, '#result'); return result
  } }
  const window = new EventTarget()
  const api = runInNewContext(harness.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\n;({test, assert, run})', {
    window, document, URL, location: { href: 'http://localhost/diagnostic-transport' }, setTimeout, clearTimeout,
  }, { filename: 'maintained-harness.js' })
  const start = "      try {\n        assert(trusted && !video.paused && video.played.length > 0, 'Native controls did not start actual playback')"
  const end = '      retire(); await pause(50)'
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
  const executeVerdict = runInNewContext('(function() {\n' + verdictCode + '\n})', {
    trusted: true, video, child, frame, document: parentDocument, appendFailureDiagnostic,
    assert(value, message) {
      try { api.assert(value, message) } catch (error) {
        originalError = error; error.cause = cause
        originalStack = error.stack // Deliberately materialize the original stack before the fixture catches it.
        throw error
      }
    },
  }, { filename: 'maintained-media-verdict.js' })
  let caught
  api.test('diagnostic transport control', () => {
    try { executeVerdict() } catch (error) { caught = error; throw error }
  })
  await api.run()
  return { rows: JSON.parse(result.textContent), status: document.body.dataset.status,
    originalError, originalStack, cause, caught, diagnosticReads }
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

test('successful original media verdict performs no diagnostic state reads', async () => {
  const result = await runFailureDiagnosticControl({ passed: true, collectionFails: true })
  assert.equal(result.status, 'pass')
  assert.deepEqual(result.rows, [{ name: 'diagnostic transport control', status: 'PASS' }])
  assert.equal(result.originalError, undefined)
  assert.equal(result.diagnosticReads, 0)
})
