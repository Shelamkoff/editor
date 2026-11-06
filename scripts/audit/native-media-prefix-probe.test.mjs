import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { MEDIA_CASES, mediaOutcome } from './native-media-diagnostic.mjs'
import { classifyMediaPrefix, buildPrefixRunner, instrumentPrefixMediaFixture, prefixPlaybackDiagnosticSource, loadPrefixCases } from './native-media-prefix-probe.mjs'

const inventory = {
  nativeTextInput: Array.from({ length: 52 }, (_, i) => `input-${i}`),
  nativeAttachesDownloads: Array.from({ length: 13 }, (_, i) => `download-${i}`),
}
const rows = names => names.map(name => ({ name, status: 'PASS' }))
const prefix = () => ({ version: 1, order: ['introduction', 'native-text-input.html', 'native-attaches-downloads.html', 'native-html-content.html'],
  introduction: {
    enterScenario: Object.fromEntries(['beforeBold', 'afterBold', 'afterUndo', 'afterRedo', 'afterRemoveBold', 'afterUndoRemoval'].map(key => [key, { blocks: [] }])),
    toolboxScenario: Object.fromEntries(['toolboxBeforeBold', 'toolboxAfterImmediateUndo', 'deleteLastImmediateUndo', 'deleteLastRedo', 'deleteLastUndoAgain', 'deleteMiddle', 'deleteMiddleUndo', 'inlineAfterDeleteUndo'].map(key => [key, { blocks: [] }])),
    historyMatrix: { historyCases: ['native typing', 'structural Enter split', 'insert', 'move', 'convert', 'remove', 'clear', 'render', 'toolbar insert', 'keyboard undo/redo', 'read-only transition', 'pointer drag session', 'read-only host authority', 'direct/inverse transaction events'],
      publicEvents: ['transaction:committed', 'document:changed', 'history:changed'] },
  }, nativeTextInput: rows(inventory.nativeTextInput), nativeAttachesDownloads: rows(inventory.nativeAttachesDownloads),
  downloads: [], frames: [],
})
const command = (receipt = prefix(), overrides = {}) => ({ exitCode: 0, signal: null, receivedSignal: null,
  timedOut: false, spawnError: null, stderr: '',
  stdout: (receipt ? JSON.stringify({ mediaPrefix: receipt }) + '\n' : '')
    + JSON.stringify({ 'native-html-content.html': rows(MEDIA_CASES) }), ...overrides })

test('a standalone passing 28-case media page cannot prove the original physical prefix ran', () => {
  assert.throws(() => classifyMediaPrefix(command(null), inventory), /prefix/i)
})

test('a complete physical prefix and the complete original media page are accepted together', () => {
  assert.equal(classifyMediaPrefix(command(), inventory).passed, true)
})

test('missing or duplicated prefix cases and duplicate prefix reports are rejected', () => {
  for (const kind of ['missing', 'duplicate', 'failed']) {
    const receipt = prefix()
    if (kind === 'missing') receipt.nativeTextInput.pop()
    if (kind === 'duplicate') receipt.nativeAttachesDownloads[1] = receipt.nativeAttachesDownloads[0]
    if (kind === 'failed') receipt.nativeTextInput[0].status = 'FAIL'
    assert.throws(() => classifyMediaPrefix(command(receipt), inventory))
  }
  assert.throws(() => classifyMediaPrefix(command(prefix(), {
    stdout: JSON.stringify({ mediaPrefix: prefix() }) + '\n' + command().stdout,
  }), inventory))
})

test('an original media failure stays a failure after the complete physical prefix', () => {
  const cases = rows(MEDIA_CASES)
  cases[24].status = 'FAIL'; cases[24].error = 'Native controls did not start actual playback'
  const result = classifyMediaPrefix(command(prefix(), { exitCode: 1,
    stdout: JSON.stringify({ mediaPrefix: prefix() }), stderr: 'Error: History matrix failed: ' + JSON.stringify(cases) }), inventory)
  assert.equal(result.complete, true)
  assert.equal(result.passed, false)
  assert.equal(mediaOutcome(result, { complete: true, passed: true }, true).pass, false)
  for (const interruption of [{ receivedSignal: 'SIGTERM' }, { timedOut: true }, { spawnError: 'missing browser' }]) {
    assert.throws(() => classifyMediaPrefix(command(prefix(), interruption), inventory))
  }
})

test('prefix case registration retains the complete current inventory without running callbacks', async () => {
  const actual = await loadPrefixCases(fileURLToPath(new URL('../..', import.meta.url)))
  assert.equal(actual.nativeTextInput.length, 52)
  assert.equal(actual.nativeAttachesDownloads.length, 13)
  assert.equal(actual.nativeTextInput.filter(name => name === 'physical typing preserves the caret after inline-pattern paste: "#ff0000 tail"').length, 2)
  assert.equal(actual.nativeAttachesDownloads.at(-1), 'ZIP abort releases a native pending stream with rejected cleanup')
})

test('bounded runner keeps all preceding native actions and its original cleanup', async () => {
  const source = await readFile(new URL('../../tests/browser/physical-history.mjs', import.meta.url), 'utf8')
  const runner = buildPrefixRunner(source)
  const start = "  await click(client, '.oe-block [contenteditable=true]')"
  const cutoff = "  const nativeHtmlContent = await runNativePage(client, pageUrl, 'native-html-content.html')\n"
  assert(runner.includes(source.slice(source.indexOf(start), source.indexOf(cutoff))))
  assert(runner.endsWith(source.slice(source.indexOf('\n  }\n  }\n} finally {\n  client?.close()'))))
  assert.equal((runner.match(/native-html-content\.html'\)/g) ?? []).length, 1)
  assert.doesNotMatch(runner, /native-inline-content-styles\.html|native-clipboard\.html/)
  assert.equal((runner.match(/await client\.send\(/g) ?? []).length,
    (source.slice(0, source.indexOf(cutoff)).match(/await client\.send\(/g) ?? []).length)
  const fixture = await readFile(new URL('../../tests/browser/regressions/html-content-native.js', import.meta.url), 'utf8')
  const overlay = instrumentPrefixMediaFixture(fixture)
  for (const line of fixture.split('\n').filter(line => /assert\(|equal\(|await pause\(100\)|video.focus\(|await dispatchKey\(' ', 'Space', 32\)/.test(line))) {
    assert(overlay.includes(line.trim()), line)
  }
  assert.equal((overlay.match(/for \(const \[name, type, editing\] of surfaces\) test\(/g) ?? []).length, 7)
  assert.doesNotMatch(overlay, /\.play\(|\.click\(|test-filter/)
  const directory = await mkdtemp(join(tmpdir(), 'rector-media-prefix-syntax-'))
  try {
    for (const [file, contents] of [['runner.mjs', runner], ['fixture.mjs', overlay]]) {
      const path = join(directory, file); await writeFile(path, contents)
      execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('prefix observations capture parent focus and final native key cancellation without acting', async () => {
  const listeners = new Map(), window = {}
  let geometryReads = 0
  const rectangle = () => { geometryReads++; return { toJSON: () => ({ x: 10, y: 2000, width: 300, height: 150 }) } }
  const target = label => ({ performance: { timeOrigin: 42 },
    addEventListener(type, fn, capture) { listeners.set(`${label}:${type}:${capture}`, fn) }, removeEventListener() {} })
  const parentWindow = target('parent'), childWindow = target('child')
  const video = { nodeName: 'VIDEO', id: 'video', readyState: 4, networkState: 1, paused: true,
    ended: false, seeking: false, currentTime: 0, duration: 1, played: { length: 0 }, buffered: { length: 0 },
    error: null, currentSrc: 'blob:owned', muted: true, controls: true, isConnected: true, getBoundingClientRect: rectangle,
    addEventListener() {}, removeEventListener() {} }
  const frame = { nodeName: 'IFRAME', id: 'frame', isConnected: true, getBoundingClientRect: rectangle,
    ownerDocument: { activeElement: null, defaultView: parentWindow, hasFocus: () => false, visibilityState: 'hidden', hidden: true } }
  const child = { activeElement: video, defaultView: childWindow, hasFocus: () => false, readyState: 'complete', visibilityState: 'hidden', hidden: true }
  frame.contentDocument = child
  const create = runInNewContext(`(${prefixPlaybackDiagnosticSource()})()`, { window, performance, structuredClone, queueMicrotask })
  const probe = create('case', frame, child, video)
  probe.beforeKey()
  assert.equal(geometryReads, 0, 'No geometry read may occur before Space')
  const event = { type: 'keydown', isTrusted: true, defaultPrevented: false, key: ' ', code: 'Space', target: frame, timeStamp: 1 }
  listeners.get('parent:keydown:true')(event)
  event.defaultPrevented = true
  probe.sample('dispatch-return')
  await Promise.resolve()
  probe.verdict(false, 'original playback failure')
  assert.equal(geometryReads, 2)
  probe.sample('post-verdict-300ms')
  assert.equal(geometryReads, 4)
  window.__auditResults = [{ name: 'case', status: 'FAIL' }]
  const evidence = window.__auditResults[0].mediaDiagnostic
  assert.equal(evidence.events[0].channel, 'parent-capture')
  assert.equal(evidence.events[0].defaultPrevented, false)
  const final = evidence.snapshots.find(snapshot => snapshot.phase === 'post-dispatch-microtask')
  assert.equal(final.keys[0].defaultPrevented, true)
  assert.equal(final.keys[0].target.tag, 'IFRAME')
  assert.equal(final.parentHasFocus, false)
  assert.equal(final.childHasFocus, false)
  assert.equal(final.parentVisibility, 'hidden')
  assert.equal(final.visibility, 'hidden')
  assert.equal(final.parentHidden, true)
  assert.equal(final.childHidden, true)
  assert.equal(evidence.snapshots.find(snapshot => snapshot.phase === 'original-100ms').frameRect.y, 2000)
  assert(Number.isFinite(final.epochMs))
  assert.equal(final.childTimeOrigin, 42)
  assert.equal(final.frameConnected, true)
  assert.equal(final.sameChildDocument, true)
  probe.dispose()
})
