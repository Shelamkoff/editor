import test from 'node:test'
import assert from 'node:assert/strict'
import { STANDARD_CLIPBOARD_CASES, FULL_CLIPBOARD_CASES, COMMIT_FOCUS_CASES, FONT_SIZE_RETAINED_CASES,
  verifyClipboardRed, verifyFontSizeRetainedRed, verifyNativeGreen, verifyNavigationGreen } from './focused-browser-results.mjs'

const rows = names => names.map(name => ({ name, status: 'PASS' }))
const completed = (extra = {}) => ({ exitCode: 0, signal: null, timedOut: false, spawnError: null,
  receivedSignal: null, stdout: '', stderr: '', ...extra })
const green = (records = rows(FULL_CLIPBOARD_CASES)) => completed({ stdout: JSON.stringify({ 'native-clipboard.html': records }) + '\n' })
function red() {
  const records = rows(STANDARD_CLIPBOARD_CASES)
  for (const suffix of ['line breaks', 'mention label']) {
    Object.assign(records.find(row => row.name === `external standard clipboard copy preserves ${suffix}`),
      { status: 'FAIL', error: 'Error: Standard text/plain changed the selected visible text\nexpected "[literal]", got "\\"quoted\\""' })
  }
  return { records, run: completed({ exitCode: 1, stderr: 'source location\nError: History matrix failed: ' + JSON.stringify(records, null, 2) + '\n    at waitForHistoryMatrix' }) }
}

test('complete native clipboard GREEN includes all maintained cases', () => {
  assert.equal(verifyNativeGreen(green(), 'native-clipboard.html', FULL_CLIPBOARD_CASES).total, 67)
})

test('zero-exit native report cannot pass with no, missing, duplicated or skipped cases', () => {
  for (const records of [[], rows(FULL_CLIPBOARD_CASES).slice(0, 49), rows(FULL_CLIPBOARD_CASES).slice(0, 53), rows(FULL_CLIPBOARD_CASES).slice(0, 61), rows(FULL_CLIPBOARD_CASES).slice(0, 63), rows(FULL_CLIPBOARD_CASES).slice(1), [...rows(FULL_CLIPBOARD_CASES).slice(1), rows(FULL_CLIPBOARD_CASES)[1]],
    rows(FULL_CLIPBOARD_CASES).map((row, index) => index ? row : { ...row, status: 'SKIP' })]) {
    assert.throws(() => verifyNativeGreen(green(records), 'native-clipboard.html', FULL_CLIPBOARD_CASES))
  }
})

test('complete browser focus GREEN includes all 49 commit-observer cases', () => {
  const run = completed({ stdout: JSON.stringify({ 'native-core-behavior.html': rows(COMMIT_FOCUS_CASES) }) })
  assert.equal(verifyNativeGreen(run, 'native-core-behavior.html', COMMIT_FOCUS_CASES).total, 49)
  assert(COMMIT_FOCUS_CASES.every(name => name.includes('commit-observer focus')),
    'Focused native filter must select every maintained focus case')
})

test('browser focus GREEN rejects partial, duplicated, renamed, skipped or failed cases', () => {
  const full = rows(COMMIT_FOCUS_CASES)
  const beforeMentionPositive = full.filter(row =>
    row.name !== 'Native Mention Backspace preserves ordinary caret and query without a commit-observer focus handoff')
  for (const records of [[], full.slice(0, 16), full.slice(0, 17),
    full.slice(0, 22).filter(row => !row.name.startsWith('Native Slash ')),
    full.slice(0, 21), full.slice(0, 22), full.slice(0, 23), full.slice(0, 24), full.slice(0, 41),
    beforeMentionPositive.slice(0, 42), full.slice(0, 47), full.slice(0, 48), beforeMentionPositive,
    [...full.slice(1), full[1]],
    full.map((row, index) => index ? row : { ...row, name: 'Unexpected focus case' }),
    full.map((row, index) => index ? row : { ...row, status: 'SKIP' }),
    full.map((row, index) => index ? row : { ...row, status: 'FAIL' })]) {
    const run = completed({ stdout: JSON.stringify({ 'native-core-behavior.html': records }) })
    assert.throws(() => verifyNativeGreen(run, 'native-core-behavior.html', COMMIT_FOCUS_CASES))
  }
})

test('completed expected RED requires known F01 semantic assertions, including breaks and labels', () => {
  const { run } = red()
  const result = verifyClipboardRed(run)
  assert.equal(result.outcome, 'EXPECTED_PRODUCT_FAILURE')
  assert.equal(result.total, 24)
  assert.equal(result.failed, 2)
})

test('RED rejects launch errors, timeout, interruption, arbitrary nonzero exit and missing report', () => {
  const { run } = red()
  for (const change of [{ exitCode: 2 }, { exitCode: 0 }, { signal: 'SIGTERM' }, { timedOut: true },
    { spawnError: 'EACCES' }, { receivedSignal: 'SIGTERM' }, { stderr: 'socket() Operation not permitted' }]) {
    assert.throws(() => verifyClipboardRed({ ...run, ...change }))
  }
})

test('RED rejects fixture exceptions, truncated arrays and incomplete execution', () => {
  const { records, run } = red()
  records[0].error = 'TypeError: field.ownerDocument.createRange is not a function'
  assert.throws(() => verifyClipboardRed({ ...run, stderr: 'Error: History matrix failed: ' + JSON.stringify(records) }))
  assert.throws(() => verifyClipboardRed({ ...run, stderr: run.stderr.slice(0, run.stderr.lastIndexOf(']')) }))
  assert.throws(() => verifyClipboardRed({ ...run, stderr: 'Error: History matrix failed: ' + JSON.stringify(records.slice(1)) }))
})

test('F01 RED rejects multiple completed native reports in one process receipt', () => {
  const { run } = red()
  assert.throws(() => verifyClipboardRed({ ...run, stderr: run.stderr + '\n' + run.stderr }))
})

test('GREEN rejects a failed assertion even when a process reports exit zero', () => {
  const records = rows(FULL_CLIPBOARD_CASES)
  records[0].status = 'FAIL'
  assert.throws(() => verifyNativeGreen(green(records), 'native-clipboard.html', FULL_CLIPBOARD_CASES))
})

test('retained FontSize coverage requires both public native actions', () => {
  const run = completed({ stdout: JSON.stringify({ 'native-tools.html': rows(FONT_SIZE_RETAINED_CASES) }) })
  assert.equal(verifyNativeGreen(run, 'native-tools.html', FONT_SIZE_RETAINED_CASES).total, 2)
})

function fontSizeRed(records = FONT_SIZE_RETAINED_CASES.map(name => ({ name, status: 'FAIL',
  error: 'Error: The retained control mutated the successor document\nexpected original content, got a font-size span' }))) {
  return completed({ exitCode: 1, stderr: 'Error: History matrix failed: ' + JSON.stringify(records) + '\n    at waitForHistoryMatrix' })
}

test('retained FontSize RED requires both completed stale-control mutation assertions', () => {
  const result = verifyFontSizeRetainedRed(fontSizeRed())
  assert.equal(result.outcome, 'EXPECTED_PRODUCT_FAILURE')
  assert.equal(result.total, 2)
  assert.equal(result.failed, 2)
})

test('retained FontSize RED rejects setup/delivery failures and any incomplete or passing case', () => {
  const records = JSON.parse(fontSizeRed().stderr.slice('Error: History matrix failed: '.length).split('\n')[0])
  for (const changed of [[], records.slice(1), [records[0], records[0]],
    records.map((row, index) => index ? row : { ...row, status: 'PASS' }),
    records.map((row, index) => index ? row : { ...row, status: 'SKIP' }),
    records.map((row, index) => index ? row : { ...row, error: 'Error: The retained control did not receive its trusted native event' }),
    records.map((row, index) => index ? row : { ...row, error: 'Error: The intended FontSize input did not receive focus before native Enter' }),
    records.map((row, index) => index ? row : { ...row, error: 'TypeError: Cannot read properties of null' })]) {
    assert.throws(() => verifyFontSizeRetainedRed(fontSizeRed(changed)))
  }
})

test('retained FontSize RED rejects invalid process completion and truncated receipts', () => {
  const run = fontSizeRed()
  for (const changed of [{ exitCode: 0 }, { exitCode: 2 }, { signal: 'SIGTERM' }, { timedOut: true },
    { spawnError: 'EACCES' }, { receivedSignal: 'SIGTERM' }, { stderr: 'socket() Operation not permitted' },
    { stderr: run.stderr.slice(0, run.stderr.lastIndexOf(']')) }]) {
    assert.throws(() => verifyFontSizeRetainedRed({ ...run, ...changed }))
  }
})

test('retained FontSize RED rejects multiple completed native reports in one process receipt', () => {
  const run = fontSizeRed()
  assert.throws(() => verifyFontSizeRetainedRed({ ...run, stderr: run.stderr + '\n' + run.stderr }))
})

function navigation() {
  const names = ['_self', '_blank', '_parent', '_top', 'articlePreview', 'existing-named', 'control-click', 'shift-click', 'middle-click', 'relative', 'fragment-new-tab', 'fragment-control-click']
  const surfaces = ['raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer', 'paragraph-editor', 'paragraph-renderer']
  return { head: 'fixed-commit', browser: '151.0.7922.34', sourceUnchanged: true, candidatePass: true,
    results: names.flatMap(name => surfaces.map(surface => ({ name, surface, status: 'PASS',
      control: { kind: 'platform-control', actual: { settled: true, policyEnforced: true, activations: [{ trusted: true }], pages: ['/expected'] } },
      candidate: { kind: surface, actual: { settled: true, policyEnforced: true, activations: [{ trusted: true }], pages: ['/expected'] } },
    }))) }
}

test('navigation accepts only the complete unchanged ordered72 paired-runtime result', () => {
  const result = navigation()
  assert.equal(verifyNavigationGreen(completed({ stdout: JSON.stringify(result) }), result.head).total, 72)
  for (const changed of [{ ...result, browser: '153.0.0.0' }, { ...result, head: 'different' },
    { ...result, sourceUnchanged: false }, { ...result, candidatePass: false }, { ...result, results: result.results.slice(1) },
    { ...result, results: [...result.results.slice(1), result.results[1]] }]) {
    assert.throws(() => verifyNavigationGreen(completed({ stdout: JSON.stringify(changed) }), result.head))
  }
})

test('a navigation PASS label cannot hide missing settlement, synthetic input or control divergence', () => {
  for (const mutate of [row => { row.control.actual.settled = false },
    row => { row.control.actual.activations[0].trusted = false },
    row => { row.candidate.actual.pages = ['/unexpected'] }]) {
    const result = navigation()
    mutate(result.results[0])
    assert.throws(() => verifyNavigationGreen(completed({ stdout: JSON.stringify(result) }), result.head))
  }
})
