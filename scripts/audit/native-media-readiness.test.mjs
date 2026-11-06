import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const fixtureUrl = new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url)
const helperUrl = new URL('../../tests/browser/regressions/media-readiness.js', import.meta.url)

// Execute the maintained positive activation sequence, including its assertion
// and failure catch, with deterministic native delivery and a monotonic clock.
// The initial RED uses the actual old fixture; it has no readiness-helper import.
async function positiveSequence({ progressAt = 0, initialWait = 100, trustedInput = true } = {}) {
  const fixture = await readFile(fixtureUrl, 'utf8')
  const videoLoop = fixture.indexOf('for (const [name, type, editing] of surfaces) test(`${name}: scriptless content retains actual native video playback and retires it`')
  assert(videoLoop >= 0)
  const start = fixture.indexOf('      let trusted = false', videoLoop)
  const end = fixture.indexOf('    })\n    const reference = ', start)
  assert(start > videoLoop && end > start)
  const sequence = fixture.slice(start, end)
  const helpers = sequence.includes('waitForNativePlayback') ? await import(helperUrl) : {}
  const { appendFailureDiagnostic } = await import('../../tests/browser/regressions/failure-diagnostics.js')
  const harness = await readFile(new URL('../../tests/browser/regressions/harness.js', import.meta.url), 'utf8')
  const result = { textContent: '' }, document = { body: { dataset: {} }, querySelector: () => result,
    activeElement: { tagName: 'IFRAME' }, hasFocus: () => true, visibilityState: 'visible' }
  const window = new EventTarget()
  const api = runInNewContext(harness.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\n;({test, assert, run})', {
    window, document, URL, location: { href: 'http://localhost/readiness-control' }, setTimeout, clearTimeout,
  }, { filename: 'maintained-harness.js' })
  let clock = 0, listener, retired = false, focusCalls = 0, dispatchCalls = 0
  const waits = [], telemetry = []
  const rect = { toJSON: () => ({ x: 0, y: 0, width: 320, height: 180 }) }
  const video = { get paused() { return retired },
    get ownerDocument() { return child },
    get played() { return { length: clock >= progressAt ? 1 : 0, start: () => 0, end: () => 0.12 } },
    get currentTime() { return clock >= progressAt ? 0.12 : 0 }, duration: 0.2, readyState: 4,
    networkState: 1, ended: false, seeking: false, error: null, isConnected: true,
    focus() { focusCalls++; child.activeElement = video }, getBoundingClientRect: () => rect }
  const child = { defaultView: { addEventListener(type, callback) { assert.equal(type, 'keydown'); listener = callback } },
    activeElement: null, hasFocus: () => true, visibilityState: 'visible' }
  const frame = { contentDocument: child, isConnected: true, getBoundingClientRect: () => rect }
  const execute = runInNewContext('(async function() {\n' + sequence + '\n})', {
    ...helpers, appendFailureDiagnostic, assert: api.assert, name: 'Raw editor', frame, child, video, document,
    performance: { now: () => clock },
    async dispatchKey(...args) { assert.deepEqual(args, [' ', 'Space', 32]); dispatchCalls++;
      listener({ isTrusted: trustedInput, code: 'Space', target: video }); clock += 20 },
    async pause(ms) { waits.push(ms); clock += waits.length === 1 ? initialWait : ms },
    recordPlaybackReadiness(...record) { telemetry.push(record) },
    retire() { retired = true },
  }, { filename: 'maintained-positive-playback.js' })
  api.test('maintained positive playback', execute)
  await api.run()
  return { rows: JSON.parse(result.textContent), status: document.body.dataset.status,
    focusCalls, dispatchCalls, waits, telemetry, retired, clock }
}

test('maintained positive sequence accepts actual progress observed after the initial sample but before its deadline', async () => {
  const result = await positiveSequence({ progressAt: 270 })
  assert.equal(result.status, 'pass', JSON.stringify(result.rows))
  assert.equal(result.focusCalls, 1)
  assert.equal(result.dispatchCalls, 1)
  assert.equal(result.waits[0], 100)
  assert.equal(result.retired, true)
})

test('maintained positive sequence rejects a first positive sample at the strict deadline', async () => {
  const result = await positiveSequence({ initialWait: 3000 })
  assert.equal(result.status, 'fail')
  assert.equal(result.focusCalls, 1)
  assert.equal(result.dispatchCalls, 1)
  assert.equal(result.retired, false)
})

test('maintained positive sequence still requires actual played ranges', async () => {
  const result = await positiveSequence({ progressAt: Infinity })
  assert.equal(result.status, 'fail')
  assert.equal(result.dispatchCalls, 1)
})

test('maintained positive sequence still requires trusted input', async () => {
  const result = await positiveSequence({ trustedInput: false })
  assert.equal(result.status, 'fail')
  assert.equal(result.dispatchCalls, 1)
})

const state = (overrides = {}) => ({ trusted: true, paused: false, played: [], currentTime: 0,
  readyState: 4, mediaError: null, videoConnected: true, frameConnected: true,
  sameChildDocument: true, sameVideoDocument: true, ...overrides })

async function observation({ initial = 100, read = () => state(), wait: customWait, now: customNow } = {}) {
  const { waitForNativePlayback } = await import(helperUrl)
  let clock = initial, reads = 0
  const waits = []
  const control = { get clock() { return clock }, advance(ms) { clock += ms } }
  const result = await waitForNativePlayback({
    startedAt: 0, now: () => customNow ? customNow(control) : clock,
    readState: () => { reads++; return read(control) },
    wait: async ms => { waits.push(ms); if (customWait) await customWait(control, ms); else clock += ms },
  })
  return { result, waits, reads }
}

test('functional observation records the initial miss and first observed positive without adding an action', async () => {
  const { result, waits } = await observation({ read: ({ clock }) => state({ played: clock >= 250 ? [[0, 0.12]] : [] }) })
  assert.equal(result.outcome, 'PLAYING')
  assert.equal(result.origin, 'dispatchKey-completion')
  assert.equal(result.initialObservation.elapsedMs, 100)
  assert.equal(result.initialObservation.predicate, false)
  assert.equal(result.firstObservedPositiveElapsedMs, 250)
  assert.equal(result.finalObservation.elapsedMs, 250)
  assert.deepEqual(waits, [50, 50, 50])
})

test('positive state at the initial sample needs no further wait or diagnostic action', async () => {
  const { result, waits, reads } = await observation({ read: () => state({ played: [[0, 0.12]] }) })
  assert.equal(result.outcome, 'PLAYING')
  assert.equal(result.firstObservedPositiveElapsedMs, 100)
  assert.equal(reads, 1)
  assert.deepEqual(waits, [])
})

test('slow state reads are timed after observation and cannot pass across the strict deadline', async () => {
  const { result } = await observation({ initial: 2999, read: control => {
    control.advance(2)
    return state({ played: [[0, 0.12]] })
  } })
  assert.equal(result.outcome, 'DEADLINE')
  assert.equal(result.firstObservedPositiveElapsedMs, 3001)
  assert.equal(result.finalObservation.elapsedMs, 3001)
  assert.equal(result.finalObservation.withinDeadline, false)
  assert.equal(result.finalObservation.predicate, true)
})

test('a delayed poll cannot admit an observation at or beyond the deadline', async () => {
  const { result, waits } = await observation({ initial: 2990,
    read: ({ clock }) => state({ played: clock >= 3000 ? [[0, 0.12]] : [] }),
    wait: control => control.advance(30),
  })
  assert.deepEqual(waits, [10])
  assert.equal(result.outcome, 'DEADLINE')
  assert.equal(result.firstObservedPositiveElapsedMs, 3020)
})

test('ready or unpaused media alone, paused played history and missing trust each reach the deadline', async () => {
  for (const candidate of [state(), state({ paused: true, played: [[0, 0.12]] }), state({ trusted: false, played: [[0, 0.12]] })]) {
    const { result } = await observation({ read: () => candidate })
    assert.equal(result.outcome, 'DEADLINE')
    assert.equal(result.finalObservation.elapsedMs, 3000)
    assert.equal(result.firstObservedPositiveElapsedMs, null)
    assert.equal(result.finalObservation.predicate, false)
  }
})

test('owner loss and media errors remain distinct failures rather than expected negative deadlines', async () => {
  for (const key of ['videoConnected', 'frameConnected', 'sameChildDocument']) {
    const { result } = await observation({ initial: 3000, read: () => state({ [key]: false }) })
    assert.equal(result.outcome, 'OWNER_LOST')
  }
  const { result } = await observation({ initial: 3000, read: () => state({ mediaError: { code: 3, message: 'decode failed' } }) })
  assert.equal(result.outcome, 'MEDIA_ERROR')
})

test('the actual state reader rejects a connected video adopted into a different live document', async () => {
  const { playbackState } = await import(helperUrl)
  const child = {}, differentDocument = {}
  const frame = { isConnected: true, contentDocument: child }
  const video = { paused: false, isConnected: true, ownerDocument: differentDocument,
    played: { length: 1, start: () => 0, end: () => 0.12 }, currentTime: 0.12, readyState: 4, error: null }
  const { result } = await observation({ read: () => playbackState(frame, child, video, true) })
  assert.equal(result.outcome, 'OWNER_LOST')
  assert.equal(result.finalObservation.state.videoConnected, true)
  assert.equal(result.finalObservation.state.frameConnected, true)
  assert.equal(result.finalObservation.state.sameChildDocument, true)
  assert.equal(result.finalObservation.state.sameVideoDocument, false)
})

test('getter, wait and clock errors cannot be accepted as expected-negative timeouts', async () => {
  const failure = new Error('read unavailable')
  const readFailure = await observation({ read: () => { throw failure } })
  assert.equal(readFailure.result.outcome, 'OBSERVATION_ERROR')
  assert.equal(readFailure.result.error, failure.stack)
  assert.equal(readFailure.result.initialObservation, null)
  const waitFailure = await observation({ wait: () => { throw failure } })
  assert.equal(waitFailure.result.outcome, 'OBSERVATION_ERROR')
  assert.equal(waitFailure.result.finalObservation.elapsedMs, 100)
  const badClock = await observation({ now: () => NaN })
  assert.equal(badClock.result.outcome, 'CLOCK_ERROR')
  const backwardsClock = await observation({ wait: control => control.advance(-1) })
  assert.equal(backwardsClock.result.outcome, 'CLOCK_ERROR')
})

test('the maintained native runner persists readiness before both PASS and assertion FAIL', async () => {
  const runner = await readFile(new URL('../../tests/browser/physical-history.mjs', import.meta.url), 'utf8')
  const start = runner.indexOf('async function waitForHistoryMatrix(client) {')
  const end = runner.indexOf('\nasync function click(', start)
  assert(start >= 0 && end > start)
  const telemetry = { schemaVersion: 2, contract: 'native-playback-functional-v2', records: [{ phase: 'positive' }] }
  for (const status of ['pass', 'fail']) {
    const writes = []
    const waitForHistoryMatrix = runInNewContext(runner.slice(start, end) + '\n;waitForHistoryMatrix', {
      Date, process: { env: { EDITOR_RESULTS_DIR: '/results' } },
      evaluate: async (_client, expression) => {
        assert.match(expression, /mediaReadiness: window\.__mediaReadiness/)
        return { status, summary: 'completed case report', progress: null, mediaReadiness: telemetry }
      },
      join: (...segments) => segments.join('/'),
      writeFile: async (path, content, options) => { writes.push({ path, content, options }) },
      waitForNativeInput: async () => {}, delay: async () => { throw new Error('Unexpected extra terminal poll') },
    })
    if (status === 'pass') assert.equal(await waitForHistoryMatrix({}), 'completed case report')
    else await assert.rejects(waitForHistoryMatrix({}), /History matrix failed: completed case report/)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].path, '/results/media-readiness.json')
    assert.deepEqual(JSON.parse(writes[0].content), telemetry)
    assert.equal(writes[0].options.flag, 'wx')
  }
})
