import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'

const PAGE = 'native-html-content.html'
const FIXTURE = 'tests/browser/regressions/html-content-native.js'
const OBSERVED_BROWSER = '156.0.8078.79'
const surfaces = ['Raw editor', 'Raw renderer', 'Carousel editor', 'Carousel renderer']
const behaviors = [
  "short content retains only its surface's preview affordance",
  'trusted wheel cannot scroll short content into an artificial blank page',
  'application-owned body scrolling remains a usable native control',
  'retirement during a parent activation observer revokes navigation',
  'a live trusted link retains its requested parent destination',
  'a real trusted download preserves the application Blob and filename',
  'scriptless content retains actual native video playback and retires it',
]
export const POSITIVE_MEDIA_CASES = Object.freeze([
  'Raw editor: scriptless content retains actual native video playback and retires it',
  'Raw renderer: scriptless content retains actual native video playback and retires it',
  'Carousel editor: scriptless content retains actual native video playback and retires it',
  'Carousel renderer: scriptless content retains actual native video playback and retires it',
])
export const NEGATIVE_MEDIA_CASES = Object.freeze([
  'Native playback control: trusted Space on a different button reaches the playback deadline',
  'Native playback control: paused native video with played history reaches the playback deadline',
])
export const MEDIA_CASES = Object.freeze([
  ...behaviors.flatMap(behavior => surfaces.map(surface => `${surface}: ${behavior}`)),
  ...NEGATIVE_MEDIA_CASES,
])
const READINESS_CONTRACT = Object.freeze({ schemaVersion: 2, contract: 'native-playback-functional-v2',
  origin: 'dispatchKey-completion', timeoutMs: 3000, pollMs: 50 })
const READINESS_PHASES = [
  ...POSITIVE_MEDIA_CASES.map(name => ({ name, phase: 'positive', expectedOutcome: 'PLAYING' })),
  { name: NEGATIVE_MEDIA_CASES[0], phase: 'wrong-target', expectedOutcome: 'DEADLINE' },
  { name: NEGATIVE_MEDIA_CASES[1], phase: 'paused-history-preparation', expectedOutcome: 'PLAYING' },
  { name: NEGATIVE_MEDIA_CASES[1], phase: 'paused-history-rejection', expectedOutcome: 'DEADLINE' },
]

function verifyReadiness(telemetry, rows) {
  assert(telemetry, 'Missing persisted media readiness telemetry')
  for (const [key, value] of Object.entries(READINESS_CONTRACT)) assert.equal(telemetry[key], value, `Wrong readiness ${key}`)
  assert.equal(telemetry.initialDelayMs, 100)
  assert(Array.isArray(telemetry.records), 'Missing readiness records')
  assert.deepEqual(telemetry.records.map(({ name, phase, expectedOutcome }) => ({ name, phase, expectedOutcome })), READINESS_PHASES,
    'Expected exactly seven readiness phases for the six media cases')
  for (const record of telemetry.records) {
    const value = record.readiness
    assert(value, 'Missing readiness result')
    for (const [key, expected] of Object.entries(READINESS_CONTRACT)) assert.equal(value[key], expected, `Wrong result ${key}`)
    assert(['PLAYING', 'DEADLINE', 'OWNER_LOST', 'MEDIA_ERROR', 'OBSERVATION_ERROR', 'CLOCK_ERROR'].includes(value.outcome), 'Unknown readiness outcome')
    assert(Array.isArray(value.observations), 'Missing readiness observations')
    assert.deepEqual(value.initialObservation, value.observations[0] ?? null)
    assert.deepEqual(value.finalObservation, value.observations.at(-1) ?? null)
    assert.equal(value.firstObservedPositiveElapsedMs, value.observations.find(item => item.predicate)?.elapsedMs ?? null)
    let previous = 0
    for (const observation of value.observations) {
      const { state, elapsedMs, predicate, withinDeadline } = observation
      assert(Number.isFinite(elapsedMs) && elapsedMs >= previous, 'Invalid readiness elapsed time')
      previous = elapsedMs
      assert.equal(withinDeadline, elapsedMs < READINESS_CONTRACT.timeoutMs, 'Incorrect readiness cutoff')
      assert(Array.isArray(state?.played), 'Missing played ranges')
      assert.equal(predicate, state.trusted === true && state.paused === false && state.played.length > 0, 'Readiness predicate disagrees with captured state')
    }
    if (value.outcome === 'PLAYING' || value.outcome === 'DEADLINE') {
      assert(value.observations.length > 0, 'Missing terminal readiness sample')
      for (const { state } of value.observations) {
        assert(state.videoConnected === true && state.frameConnected === true && state.sameChildDocument === true && state.sameVideoDocument === true,
          'Lost media ownership is not playback or an expected deadline')
        assert.equal(state.mediaError, null, 'Media failure is not playback or an expected deadline')
      }
      for (const observation of value.observations.slice(0, -1)) assert(observation.withinDeadline && !observation.predicate, 'Readiness continued past a terminal observation')
      const final = value.finalObservation
      if (value.outcome === 'PLAYING') assert(final.predicate && final.withinDeadline, 'Playback was not observed before the strict deadline')
      else assert(!final.withinDeadline, 'Expected deadline did not reach its cutoff')
    }
    if (rows.find(row => row.name === record.name).status === 'PASS') {
      assert.equal(value.outcome, record.expectedOutcome, 'Passing case has a failed readiness outcome')
      if (record.phase === 'wrong-target' || record.phase === 'paused-history-rejection') {
        for (const { state } of value.observations) {
          assert(state.trusted === true && state.paused === true, 'Negative control lost its trusted, paused precondition')
          assert.equal(state.played.length > 0, record.phase === 'paused-history-rejection', 'Negative control has the wrong played history')
        }
      }
    }
  }
}

function leadingArray(text) {
  assert(text.startsWith('['), 'Native failure lacks its completed case array')
  let depth = 0, quoted = false, escaped = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '[') depth++
    else if (char === ']' && --depth === 0) return JSON.parse(text.slice(0, index + 1))
  }
  throw new Error('Truncated native case report')
}

export function classifyMediaPage(run, instrumented = false, telemetry) {
  assert(!run.signal && !run.receivedSignal && !run.timedOut && !run.spawnError, 'Native execution was unavailable or interrupted')
  assert(run.exitCode === 0 || run.exitCode === 1, 'Unexpected native process exit')
  let rows
  if (run.exitCode === 0) {
    const reports = run.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line)).filter(value => Object.hasOwn(value, PAGE))
    assert.equal(reports.length, 1, 'Expected one completed native page report')
    rows = reports[0][PAGE]
  } else {
    const marker = 'Error: History matrix failed: '
    const parts = run.stderr.split(marker)
    assert.equal(parts.length, 2, 'Expected one completed assertion failure report')
    rows = leadingArray(parts[1])
  }
  assert(Array.isArray(rows))
  assert.deepEqual(rows.map(row => row.name), MEDIA_CASES, 'Expected all 30 cases: the original 28 followed by both native negative controls')
  assert(rows.every(row => row.status === 'PASS' || row.status === 'FAIL'), 'Skipped or unknown native case status')
  const failures = rows.filter(row => row.status === 'FAIL')
  assert.equal(run.exitCode, failures.length ? 1 : 0, 'Native exit disagrees with case assertions')
  verifyReadiness(telemetry, rows)
  if (instrumented) for (const row of rows) {
    if (!POSITIVE_MEDIA_CASES.includes(row.name)) {
      assert(!Object.hasOwn(row, 'mediaDiagnostic'), 'Only the four positive media cases may be instrumented')
      continue
    }
    const evidence = row.mediaDiagnostic, readiness = telemetry.records.find(record => record.name === row.name).readiness
    assert.equal(evidence?.schemaVersion, 2, 'Missing functional diagnostic version')
    assert.equal(evidence.contract, READINESS_CONTRACT.contract)
    assert.equal(evidence.clockOrigin, 'probe-mounted')
    assert.equal(typeof evidence.functionalVerdict?.passed, 'boolean', 'Missing functional verdict')
    assert.equal(evidence.functionalVerdict.readinessOutcome, readiness.outcome)
    assert.deepEqual(evidence.readiness, readiness, 'Diagnostic changed the functional readiness result')
    assert(evidence.snapshots.some(snapshot => snapshot.phase === 'functional-verdict'), 'Missing functional verdict observation')
    assert(evidence.snapshots.some(snapshot => snapshot.phase === 'post-verdict-300ms'), 'Missing bounded later observation')
    if (row.status === 'PASS') assert(evidence.functionalVerdict.passed, 'Later playback cannot override a failed functional verdict')
  }
  return { ...READINESS_CONTRACT, complete: true, passed: failures.length === 0, cases: rows.length,
    readinessPhases: telemetry.records.length, failures: failures.length, rows }
}

export function mediaOutcome(functional, diagnostic, sameRuntime) {
  return { pass: sameRuntime && functional?.complete === true && diagnostic?.complete === true && functional.passed === true && diagnostic.passed === true,
    collectionComplete: functional?.complete === true && diagnostic?.complete === true,
    functionalPassed: functional?.passed === true, instrumentedPassed: diagnostic?.passed === true,
    sameRuntime, releaseAccepted: false }
}

// Serialized into the test-only overlay. This records state and events, without
// issuing a native action, calling play(), or changing media/selection state.
export function installPlaybackDiagnostics() {
  const records = new Map()
  let published
  Object.defineProperty(window, '__auditResults', { configurable: true, enumerable: true,
    get: () => published,
    set: rows => {
      published = rows
      for (const row of rows) if (records.has(row.name)) row.mediaDiagnostic = structuredClone(records.get(row.name))
    },
  })
  return (name, frame, child, video) => {
    const started = performance.now()
    const record = { schemaVersion: 2, contract: 'native-playback-functional-v2', clockOrigin: 'probe-mounted',
      name, functionalVerdict: null, readiness: null, snapshots: [], events: [], droppedEvents: 0 }
    const keys = new Map()
    records.set(name, record)
    const node = value => value ? { tag: value.nodeName, id: value.id ?? null } : null
    const ranges = value => Array.from({ length: value.length }, (_, index) => [value.start(index), value.end(index)])
    const state = () => ({ elapsedMs: performance.now() - started, readyState: video.readyState, networkState: video.networkState,
      paused: video.paused, ended: video.ended, seeking: video.seeking, currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : String(video.duration), played: ranges(video.played), buffered: ranges(video.buffered),
      error: video.error ? { code: video.error.code, message: String(video.error.message ?? '') } : null,
      currentSrc: video.currentSrc, muted: video.muted, controls: video.controls,
      frameConnected: frame.isConnected, videoConnected: video.isConnected,
      sameChildDocument: frame.contentDocument === child, sameVideoDocument: video.ownerDocument === child, frameInert: Boolean(frame.inert),
      parentActive: node(frame.ownerDocument.activeElement), childActive: node(child.activeElement),
      childHasFocus: child.hasFocus(), documentReadyState: child.readyState, visibility: child.visibilityState,
      keys: Array.from(keys.values(), event => ({ type: event.type, key: event.key, code: event.code,
        trusted: event.isTrusted, defaultPrevented: event.defaultPrevented, target: node(event.target) })) })
    const sample = (phase, extra = {}) => {
      record.snapshots.push({ phase, ...state(), ...extra })
      // This microtask is queued only after the existing native dispatch promise
      // returns; event objects now expose cancellation after all dispatch listeners.
      if (phase === 'dispatch-return') queueMicrotask(() => sample('post-dispatch-microtask'))
    }
    const listeners = []
    const listen = (target, type, capture, channel) => {
      const listener = event => {
        if (type === 'keydown' || type === 'keyup') keys.set(type, event)
        if (record.events.length >= 128) { record.droppedEvents++; return }
        record.events.push({ channel, type, trusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
          key: event.key ?? null, code: event.code ?? null, eventTarget: node(event.target),
          eventTimeStamp: event.timeStamp, ...state() })
      }
      target.addEventListener(type, listener, capture)
      listeners.push(() => target.removeEventListener(type, listener, capture))
    }
    for (const type of ['keydown', 'keyup', 'focus', 'blur', 'focusin', 'focusout']) {
      listen(child.defaultView, type, true, 'child-capture')
      listen(child.defaultView, type, false, 'child-bubble')
    }
    for (const type of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'waiting', 'pause', 'stalled', 'suspend', 'error', 'timeupdate', 'ended']) {
      listen(video, type, true, 'media')
    }
    sample('mounted')
    return { sample,
      beforeKey: () => sample('before-key', { frameRect: frame.getBoundingClientRect().toJSON(), videoRect: video.getBoundingClientRect().toJSON() }),
      verdict: (passed, readiness, error = null) => {
        record.functionalVerdict = { passed, readinessOutcome: readiness.outcome, error }
        record.readiness = structuredClone(readiness)
        sample('functional-verdict', { passed })
      },
      dispose: () => { for (const remove of listeners) remove() },
    }
  }
}

export function instrumentMediaFixture(source) {
  const replace = (anchor, replacement) => {
    assert.equal(source.split(anchor).length, 2, 'Diagnostic fixture anchor changed or is ambiguous')
    source = source.replace(anchor, replacement)
  }
  replace('const surfaces = ', `const __createPlaybackProbe = (${installPlaybackDiagnostics.toString()})();\n\nconst surfaces = `)
  const decode = "      while (video.readyState < 2) {\n        assert(performance.now() < deadline && !video.error, 'Native video did not decode')"
  replace(decode, "      const probe = __createPlaybackProbe(`${name}: scriptless content retains actual native video playback and retires it`, frame, child, video)\n      try {\n" + decode)
  replace("      video.focus()\n      await dispatchKey(' ', 'Space', 32)\n      const playbackStartedAt = performance.now()\n      await pause(100)",
    "      probe.sample('before-focus')\n      video.focus()\n      probe.beforeKey()\n      await dispatchKey(' ', 'Space', 32)\n      const playbackStartedAt = performance.now()\n      probe.sample('dispatch-return')\n      await pause(100)")
  const assertion = "        assert(readiness.outcome === 'PLAYING' && trusted && !video.paused && video.played.length > 0, 'Native controls did not start actual playback')"
  replace(assertion, assertion + "\n        probe.verdict(true, readiness)")
  replace("      } catch (error) {\n        // Capture extended failure context only after the functional verdict.",
    "      } catch (error) {\n        probe.verdict(false, readiness, String(error.stack ?? error))\n        // Capture extended failure context only after the functional verdict.")
  replace("        throw error\n      }\n      retire(); await pause(50)",
    "        throw error\n      } finally {\n        await pause(300)\n        probe.sample('post-verdict-300ms')\n      }\n      retire(); await pause(50)")
  const retired = "      assert(video.paused, 'Retired child content kept playing its native media')"
  replace(retired, retired + "\n      probe.sample('after-retirement')\n      } finally { probe.dispose() }")
  return source
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  assert(process.env.EDITOR_RESULTS_DIR && process.env.EDITOR_CHROME_PATH, 'Set a fresh EDITOR_RESULTS_DIR and the runner browser path')
  const output = resolve(process.env.EDITOR_RESULTS_DIR, 'native-media')
  await mkdir(output, { recursive: true })
  const report = { kind: 'Native media functional contract and bounded diagnostic', ...READINESS_CONTRACT,
    startedAt: new Date().toISOString(), retries: 0,
    plannedOrder: ['functional-30', 'instrumented-30'], initialPlaybackDelayMs: 100, postVerdictObservationMs: 300,
    expectedCases: MEDIA_CASES, expectedReadinessPhases: READINESS_PHASES,
    observedFailureBrowser: OBSERVED_BROWSER, pass: false, releaseAccepted: false,
    qualification: 'Version 2 checks the bounded functional contract, not the historical fixed-100ms verdict. Standalone pages exclude the preceding full-run history. Instrumentation can perturb timing; later observations never replace the functional verdict. No historical playback cause is established.' }
  await writeJson(join(output, 'plan.json'), report)
  let temporary, checkout
  const environment = { ...process.env, EDITOR_NATIVE_PAGE: PAGE }
  for (const key of ['EDITOR_NATIVE_FILTER', 'EDITOR_BROWSER_PAGE', 'EDITOR_BROWSER_ROOT']) delete environment[key]
  try {
    const before = await sourceIdentity(root)
    assert.equal(before.diffSha256, sha256(''), 'Require a committed candidate')
    assert.equal(git(root, 'ls-files', '--others', '--exclude-standard').toString().trim(), '')
    report.sourceBefore = before
    const executable = await realpath(process.env.EDITOR_CHROME_PATH)
    const version = await recordCommand(output, 'browser-version', [process.env.EDITOR_CHROME_PATH, '--version'], { cwd: root, timeoutMs: 30_000 })
    assert(!version.receivedSignal && !version.signal && !version.timedOut && !version.spawnError, 'Browser version probe was unavailable or interrupted')
    assert.equal(version.exitCode, 0)
    report.runtime = { executable: process.env.EDITOR_CHROME_PATH, resolvedExecutable: executable,
      version: version.stdout.trim(), matchesObserved: version.stdout.includes(OBSERVED_BROWSER),
      executableSha256: await hashFile(executable), node: process.version }
    try { report.runtime.installedChromeBinarySha256 = await hashFile(join(dirname(executable), 'chrome')) } catch { /* A non-wrapper executable is already hashed above. */ }
    await writeJson(join(output, 'runtime.json'), report.runtime)
    const attempt = async (label, cwd, instrumented) => {
      const directory = join(output, label)
      const run = await recordCommand(directory, 'run', [process.execPath, 'tests/browser/physical-history.mjs'],
        { cwd, env: { ...environment, EDITOR_RESULTS_DIR: directory } })
      let outcome
      try {
        const readinessText = await readFile(join(directory, 'media-readiness.json'), 'utf8')
        outcome = classifyMediaPage(run, instrumented, JSON.parse(readinessText))
        outcome.readinessSha256 = sha256(readinessText)
        const browser = JSON.parse(await readFile(join(directory, 'physical-browser-environment.json'), 'utf8'))
        outcome.browser = browser
        assert.equal(browser.executable, process.env.EDITOR_CHROME_PATH)
        assert.equal(browser.browser, `Chrome/${OBSERVED_BROWSER}`, 'Different browser environment from the original failure')
      } catch (error) { outcome = { complete: false, passed: false, error: String(error.stack ?? error) } }
      await writeJson(join(directory, 'classification.json'), outcome)
      if (run.receivedSignal) throw new Error('Interrupted media diagnostic: ' + run.receivedSignal)
      return outcome
    }
    report.functional = await attempt('functional-30', root, false)
    assert.deepEqual(await sourceIdentity(root), before)
    temporary = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-media-diagnostic-'))
    checkout = join(temporary, 'checkout')
    git(root, 'worktree', 'add', '--detach', checkout, before.head)
    const originalFixture = await readFile(join(root, FIXTURE), 'utf8')
    const instrumentedFixture = instrumentMediaFixture(originalFixture)
    await writeFile(join(checkout, FIXTURE), instrumentedFixture)
    await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir')
    assert.equal(git(checkout, 'diff', '--name-only', 'HEAD').toString().trim(), FIXTURE)
    const overlay = await sourceIdentity(checkout)
    for (const [path, hash] of Object.entries(before.files)) assert.equal(overlay.files[path], path === FIXTURE ? sha256(instrumentedFixture) : hash)
    await writeFile(join(output, 'fixture-overlay.diff'), git(checkout, 'diff', '--binary', 'HEAD'), { flag: 'wx' })
    await writeFile(join(output, 'instrumented-fixture.js'), instrumentedFixture, { flag: 'wx' })
    report.overlay = { onlyChangedPath: FIXTURE, originalSha256: sha256(originalFixture), instrumentedSha256: sha256(instrumentedFixture) }
    report.diagnostic = await attempt('instrumented-30', checkout, true)
    assert.deepEqual(await sourceIdentity(checkout), overlay)
    report.sourceAfter = await sourceIdentity(root)
    assert.deepEqual(report.sourceAfter, before)
    report.sourceUnchanged = true
    Object.assign(report, mediaOutcome(report.functional, report.diagnostic, report.runtime.matchesObserved))
    assert.equal(await hashFile(executable), report.runtime.executableSha256)
  } catch (error) { report.pass = false; report.error = String(error.stack ?? error) }
  finally {
    if (checkout) {
      try { git(root, 'worktree', 'remove', '--force', checkout) }
      catch (error) { report.pass = false; report.cleanupError = String(error.stack ?? error) }
    }
    if (temporary && !report.cleanupError) await rm(temporary, { recursive: true, force: true })
    report.finishedAt = new Date().toISOString()
    await writeJson(join(output, 'result.json'), report)
  }
  console.log(JSON.stringify({ pass: report.pass, collectionComplete: report.collectionComplete ?? false,
    functionalPassed: report.functional?.passed ?? false, instrumentedPassed: report.diagnostic?.passed ?? false, output }))
  if (!report.pass) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
