import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { MEDIA_CASES } from './native-media-diagnostic.mjs'
import { CONTEXT_COMMAND, MEDIA_CONTEXT_LABELS, ORDINARY_COMPLETE, buildPrefixRunner, classifyMediaContext, classifyOrdinaryOutput, loadPrefixCases, mediaContextOutcome, ordinaryCaseInventory } from './native-media-context-probe.mjs'

const root = new URL('../../', import.meta.url)
const ordinarySource = await readFile(new URL('tests/browser/run.mjs', root), 'utf8')
const ordinaryInventory = ordinaryCaseInventory(ordinarySource)
const inventory = { ...await loadPrefixCases(fileURLToPath(root)), ordinary: ordinaryInventory }
const ordinarySummary = { visits: 69, uniquePages: 65, explicitPassed: 2034 }
const complete = () => MEDIA_CONTEXT_LABELS.map(label => ({ label, complete: true, passed: true, cases: 28, failures: 0, ordinary: { ...ordinarySummary } }))

function ordinaryOutput() {
  return 'Browser environment: ' + JSON.stringify({ product: 'Chrome/156.0.8078.79', executable: '/test/chrome' }) + '\n'
    + ordinaryInventory.map(page => {
      let summary = []
      if (page === 'harness-contract.html') summary = { correct: true, want: ['FAIL', 'PASS'], outcomes: [{ status: 'FAIL' }, { status: 'PASS' }] }
      if (page === 'mode-recovery.html') summary = Array.from({ length: 2034 }, (_, index) => ({ name: 'assertion ' + index, status: 'PASS' }))
      if (page === 'poll-state-contracts.html') summary = { total: 1, passed: 1, results: [{ pass: true }] }
      return page + ': ' + (page === 'mention-session-race.html' ? 'mention pagination and realm ownership remain isolated' : JSON.stringify(summary))
    }).join('\n') + '\n'
}

function prefixReport() {
  const scenario = names => Object.fromEntries(names.map(name => [name, { blocks: [] }]))
  return { version: 1, order: ['introduction', 'native-text-input.html', 'native-attaches-downloads.html', 'native-html-content.html'], introduction: {
    enterScenario: scenario(['beforeBold', 'afterBold', 'afterUndo', 'afterRedo', 'afterRemoveBold', 'afterUndoRemoval']),
    toolboxScenario: scenario(['toolboxBeforeBold', 'toolboxAfterImmediateUndo', 'deleteLastImmediateUndo', 'deleteLastRedo', 'deleteLastUndoAgain', 'deleteMiddle', 'deleteMiddleUndo', 'inlineAfterDeleteUndo']),
    historyMatrix: { historyCases: ['native typing', 'structural Enter split', 'insert', 'move', 'convert', 'remove', 'clear', 'render', 'toolbar insert', 'keyboard undo/redo', 'read-only transition', 'pointer drag session', 'read-only host authority', 'direct/inverse transaction events'], publicEvents: ['transaction:committed', 'document:changed', 'history:changed'] },
  }, nativeTextInput: inventory.nativeTextInput.map(name => ({ name, status: 'PASS' })), nativeAttachesDownloads: inventory.nativeAttachesDownloads.map(name => ({ name, status: 'PASS' })) }
}

function completedRun(failure = false) {
  const rows = MEDIA_CASES.map(name => ({ name, status: 'PASS' }))
  if (failure) rows[24] = { ...rows[24], status: 'FAIL', error: 'Error: Native controls did not start actual playback\nPlayback state after failure: {"trusted":true,"paused":true,"played":[]}' }
  const prefix = prefixReport()
  return { exitCode: failure ? 1 : 0, signal: null, receivedSignal: null, timedOut: false, spawnError: null,
    stdout: ordinaryOutput() + ORDINARY_COMPLETE + '\n' + (failure ? '' : JSON.stringify({ 'native-html-content.html': rows }) + '\n') + JSON.stringify({ mediaPrefix: prefix }) + '\n',
    stderr: failure ? 'Error: History matrix failed: ' + JSON.stringify(rows) + '\n    at original runner' : '' }
}

test('a successful fourth context cannot replace the first original failure', () => {
  const attempts = complete()
  attempts[0].passed = false
  attempts[0].failures = 1
  assert.equal(mediaContextOutcome(attempts, true).pass, false)
})

test('three successful contexts cannot substitute for the planned four', () => {
  assert.throws(() => mediaContextOutcome(complete().slice(1), true))
})

test('all four complete matching-runtime contexts are collected without release acceptance', () => {
  const outcome = mediaContextOutcome(complete(), true)
  assert.equal(outcome.pass, true)
  assert.equal(outcome.passedAttemptCount, 4)
  assert.equal(outcome.releaseAccepted, false)
  assert.equal(mediaContextOutcome(complete(), false).pass, false)
})

test('incomplete and misordered attempts cannot be accepted', () => {
  const attempts = complete()
  attempts[1] = { label: MEDIA_CONTEXT_LABELS[1], complete: false, passed: false, physicalPrefix: 'NOT_RUN' }
  assert.equal(mediaContextOutcome(attempts, true).pass, false)
  assert.deepEqual(mediaContextOutcome(attempts, true).incompleteAttempts, [MEDIA_CONTEXT_LABELS[1]])
  assert.throws(() => mediaContextOutcome(complete().reverse(), true))
  const contradictory = complete(); contradictory[0].failures = 1
  assert.throws(() => mediaContextOutcome(contradictory, true))
})

test('ordinary inventory retains the maintained 69 visits and four intentional repeat visits', () => {
  assert.equal(ordinaryInventory.length, 69)
  assert.equal(new Set(ordinaryInventory).size, 65)
  const outcome = classifyOrdinaryOutput(ordinaryOutput(), ordinaryInventory)
  for (const [key, value] of Object.entries(ordinarySummary)) assert.equal(outcome[key], value)
  assert.equal(outcome.rows[0].summary.correct, true)
})

test('ordinary false statuses, missing assertions and missing or duplicated visits are rejected', () => {
  const output = ordinaryOutput()
  assert.throws(() => classifyOrdinaryOutput(output.replace('"name":"assertion 0","status":"PASS"', '"name":"assertion 0","status":"FAIL"'), ordinaryInventory))
  assert.throws(() => classifyOrdinaryOutput(output.replace('{"name":"assertion 0","status":"PASS"},', ''), ordinaryInventory))
  assert.throws(() => classifyOrdinaryOutput(output.replace('mode-recovery.html:', 'other-page.html:'), ordinaryInventory))
  assert.throws(() => classifyOrdinaryOutput(output + 'mode-recovery.html: []\n', ordinaryInventory))
  assert.throws(() => classifyOrdinaryOutput(output.replace('"correct":true', '"correct":false'), ordinaryInventory))
})

test('the complete ordinary and physical prefix is required even when all 28 media cases pass', () => {
  assert.equal(classifyMediaContext(completedRun(), inventory).passed, true)
  const withoutOrdinary = completedRun(); withoutOrdinary.stdout = withoutOrdinary.stdout.split(ORDINARY_COMPLETE + '\n')[1]
  assert.throws(() => classifyMediaContext(withoutOrdinary, inventory))
  const withoutPrefix = completedRun(); withoutPrefix.stdout = withoutPrefix.stdout.split('{"mediaPrefix":')[0]
  assert.throws(() => classifyMediaContext(withoutPrefix, inventory))
  const duplicate = completedRun(); duplicate.stdout += ORDINARY_COMPLETE + '\n'
  assert.throws(() => classifyMediaContext(duplicate, inventory))
})

test('an original 100ms failure and its immediate state remain a failure', () => {
  const outcome = classifyMediaContext(completedRun(true), inventory)
  assert.equal(outcome.complete, true)
  assert.equal(outcome.passed, false)
  assert.equal(outcome.failures, 1)
  assert.match(outcome.rows[24].error, /Playback state after failure/)
  const falseGreen = completedRun(true); falseGreen.exitCode = 0
  assert.throws(() => classifyMediaContext(falseGreen, inventory))
})

test('abnormal execution can never become a completed successful context', () => {
  for (const [key, value] of [['signal', 'SIGTERM'], ['receivedSignal', 'SIGINT'], ['timedOut', true], ['spawnError', 'ENOENT'], ['exitCode', 2]]) {
    assert.throws(() => classifyMediaContext({ ...completedRun(), [key]: value }, inventory), key)
  }
})

test('a preceding missing or failed native case cannot pass with green media', () => {
  for (const key of ['nativeTextInput', 'nativeAttachesDownloads']) {
    for (const mutation of ['missing', 'failed']) {
      const run = completedRun(), prefix = prefixReport()
      if (mutation === 'missing') prefix[key].pop()
      else prefix[key][0].status = 'FAIL'
      run.stdout = run.stdout.slice(0, run.stdout.indexOf('{"mediaPrefix":')) + JSON.stringify({ mediaPrefix: prefix }) + '\n'
      assert.throws(() => classifyMediaContext(run, inventory))
    }
  }
})

test('the copied physical runner changes only the tail around HTML and preserves cleanup', async () => {
  const original = await readFile(new URL('tests/browser/physical-history.mjs', root), 'utf8')
  const cutoff = "  const nativeHtmlContent = await runNativePage(client, pageUrl, 'native-html-content.html')\n"
  const cleanup = '\n  }\n  }\n} finally {\n  client?.close()'
  const prefix = original.slice(0, original.indexOf(cutoff))
  const generated = buildPrefixRunner(original)
  assert.equal(generated.slice(0, prefix.length), prefix)
  assert.equal(generated.slice(generated.indexOf(cleanup)), original.slice(original.indexOf(cleanup)))
  assert.equal(generated.split(cutoff).length, 2)
  assert(!generated.includes('__mediaPrefixEvents'))
  assert(!generated.includes('native-inline-range-boundaries.html'))
  assert.throws(() => buildPrefixRunner(original + cutoff))
})

test('the shell retains ordinary success as a prerequisite without running physical after failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rector-context-command-test-'))
  try {
    await mkdir(join(directory, 'tests/browser'), { recursive: true })
    await writeFile(join(directory, 'tests/browser/physical-history.mjs'), "console.log('PHYSICAL_EXECUTED')\n")
    await writeFile(join(directory, 'tests/browser/run.mjs'), "console.log('ORDINARY_FAILED'); process.exitCode = 1\n")
    const failed = spawnSync('bash', ['-c', CONTEXT_COMMAND, 'context', process.execPath], { cwd: directory, encoding: 'utf8' })
    assert.equal(failed.status, 1)
    assert.equal(failed.stdout, 'ORDINARY_FAILED\n')
    await writeFile(join(directory, 'tests/browser/run.mjs'), "console.log('ORDINARY_PASSED')\n")
    const passed = spawnSync('bash', ['-c', CONTEXT_COMMAND, 'context', process.execPath], { cwd: directory, encoding: 'utf8' })
    assert.equal(passed.status, 0)
    assert.equal(passed.stdout, 'ORDINARY_PASSED\n' + ORDINARY_COMPLETE + '\nPHYSICAL_EXECUTED\n')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
