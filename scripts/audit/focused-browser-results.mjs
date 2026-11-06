import assert from 'node:assert/strict'

// Maintained case IDs are explicit: an empty, partial or duplicated run cannot pass.
export const STANDARD_CLIPBOARD_CASES = Object.freeze([
  "external standard clipboard copy preserves line breaks",
  "external standard clipboard copy preserves terminal authored break without caret padding",
  "external standard clipboard copy preserves consecutive authored breaks",
  "external standard clipboard copy preserves mention label",
  "external standard clipboard copy preserves color label",
  "external standard clipboard copy preserves visible RGB color",
  "external standard clipboard copy preserves escaped visible label",
  "external standard clipboard copy preserves authored literal beside a widget",
  "external standard clipboard cut preserves line breaks",
  "external standard clipboard cut preserves terminal authored break without caret padding",
  "external standard clipboard cut preserves consecutive authored breaks",
  "external standard clipboard cut preserves mention label",
  "external standard clipboard cut preserves color label",
  "external standard clipboard cut preserves visible RGB color",
  "external standard clipboard cut preserves escaped visible label",
  "external standard clipboard cut preserves authored literal beside a widget",
  "external standard clipboard preserves marks in a forward partial selection",
  "external standard clipboard preserves marks in a backward partial selection",
  "external standard clipboard retains enclosing marks and links when pasted into another editing host",
  "external standard clipboard excludes controls and nested editing hosts between logical endpoints",
  "external standard clipboard preserves a visible inert atomic label",
  "external standard clipboard preserves a visible aria-hidden atomic label",
  "external standard clipboard preserves a visible multiline atomic label",
  "external standard clipboard preserves a visible locked-label atomic label"
])

export const FULL_CLIPBOARD_CASES = Object.freeze([
  "external HTML root parity: sibling div roots",
  "external HTML root parity: formatted div roots",
  "external HTML root parity: text around a div root",
  "external HTML root parity: empty div roots between text",
  "external HTML root parity: unregistered heading roots",
  "external HTML root parity: single div remains local",
  "external HTML root parity: fallback blocks use the default type, not the current heading",
  "external HTML root parity: a registered div importer retains structural ownership",
  "external HTML Table preserves headers after an empty leading tr",
  "external HTML Quote preserves its nested cite attribution as a separate rich field",
  "external HTML Quote preserves its nested footer attribution as a separate rich field",
  "external HTML Quote preserves its nested figcaption attribution as a separate rich field",
  "external HTML Quote import preserves source DOM and existing Figure attribution",
  "external HTML fallback importers cannot mutate the content seen by later importers",
  "physical Ctrl+X cuts the full forward cross-block selection",
  "physical Ctrl+X cuts the full backward cross-block selection",
  "native copy/paste preserves a forward fragment between independent editors",
  "native cut/paste preserves a forward fragment between independent editors",
  "native copy/paste preserves a backward fragment between independent editors",
  "native cut/paste preserves a backward fragment between independent editors",
  "native private clipboard carries only the selected atomic widget",
  "external multi-paragraph HTML replaces a local selection and is one Undo step",
  "external structural-first HTML does not delete selected paragraph text",
  "failed owned Cut preserves both canonical model and native contenteditable text",
  "editor chrome button keeps native clipboard ownership with selected blocks",
  "external standard clipboard copy preserves line breaks",
  "external standard clipboard copy preserves terminal authored break without caret padding",
  "external standard clipboard copy preserves consecutive authored breaks",
  "external standard clipboard copy preserves mention label",
  "external standard clipboard copy preserves color label",
  "external standard clipboard copy preserves visible RGB color",
  "external standard clipboard copy preserves escaped visible label",
  "external standard clipboard copy preserves authored literal beside a widget",
  "external standard clipboard cut preserves line breaks",
  "external standard clipboard cut preserves terminal authored break without caret padding",
  "external standard clipboard cut preserves consecutive authored breaks",
  "external standard clipboard cut preserves mention label",
  "external standard clipboard cut preserves color label",
  "external standard clipboard cut preserves visible RGB color",
  "external standard clipboard cut preserves escaped visible label",
  "external standard clipboard cut preserves authored literal beside a widget",
  "external standard clipboard preserves marks in a forward partial selection",
  "external standard clipboard preserves marks in a backward partial selection",
  "external standard clipboard retains enclosing marks and links when pasted into another editing host",
  "external standard clipboard excludes controls and nested editing hosts between logical endpoints",
  "external standard clipboard preserves a visible inert atomic label",
  "external standard clipboard preserves a visible aria-hidden atomic label",
  "external standard clipboard preserves a visible multiline atomic label",
  "external standard clipboard preserves a visible locked-label atomic label",
  "custom widget clipboard copy excludes display:none descendants",
  "custom widget clipboard cut excludes display:none descendants",
  "custom widget clipboard copy excludes visibility:hidden text while preserving visible descendants",
  "custom widget clipboard cut excludes visibility:hidden text while preserving visible descendants",
  "whole-block custom widget clipboard copy excludes display:none descendants",
  "whole-block custom widget clipboard cut excludes display:none descendants",
  "whole-block custom widget clipboard copy excludes visibility:hidden text while preserving visible descendants",
  "whole-block custom widget clipboard cut excludes visibility:hidden text while preserving visible descendants",
  "cross-field custom widget clipboard copy excludes display:none descendants",
  "cross-field custom widget clipboard cut excludes display:none descendants",
  "cross-field custom widget clipboard copy excludes visibility:hidden text while preserving visible descendants",
  "cross-field custom widget clipboard cut excludes visibility:hidden text while preserving visible descendants",
  "whole-block custom widget clipboard copy preserves a class-visible child in HTML-rich Paste",
  "cross-field custom widget clipboard copy preserves a class-visible child in HTML-rich Paste",
  "whole-block clipboard copy preserves authored line breaks in an external text field",
  "whole-block clipboard cut preserves authored line breaks in an external text field",
  "cross-field clipboard copy preserves authored line breaks in an external text field",
  "cross-field clipboard cut preserves authored line breaks in an external text field"
])

export const COMMIT_FOCUS_CASES = Object.freeze([
  "Native Enter split preserves synchronous commit-observer focus on another editor field",
  "Native Enter split preserves queued commit-observer focus on an external input",
  "Native Shift+Enter line break preserves synchronous commit-observer focus on another editor field",
  "Native Shift+Enter line break preserves queued commit-observer focus on an external input",
  "Native Slash Enter preserves synchronous commit-observer focus on another editor field",
  "Native Slash Enter preserves queued commit-observer focus on an external input",
  "Native Slash Escape preserves synchronous commit-observer focus on another editor field",
  "Native Slash Escape preserves queued commit-observer focus on an external input",
  "Native Backspace merge preserves synchronous commit-observer focus on an external input",
  "Native Backspace merge preserves queued commit-observer focus on another editor field",
  "Native Delete merge preserves synchronous commit-observer focus on another editor field",
  "Native Delete merge preserves queued commit-observer focus on an external input",
  "Native selected-block Backspace preserves synchronous commit-observer focus on another editor field",
  "Native selected-block Backspace preserves queued commit-observer focus on an external input",
  "Native whole-block Cut preserves synchronous commit-observer focus on another editor field",
  "Native whole-block Cut preserves queued commit-observer focus on an external input",
  "Native local Paste preserves synchronous commit-observer focus on an external input",
  "Native local Paste preserves queued commit-observer focus on another editor field",
  "Native multiline Paste preserves synchronous commit-observer focus on another editor field",
  "Native multiline Paste preserves queued commit-observer focus on an external input",
  "Native block drag preserves synchronous commit-observer focus on another editor field",
  "Native block drag preserves queued commit-observer focus on an external input",
  "Native Mention Backspace preserves synchronous commit-observer focus on another editor field",
  "Native Mention Backspace preserves queued commit-observer focus on an external input"
])

export const FONT_SIZE_RETAINED_CASES = Object.freeze([
  "native retained FontSize Enter cannot command a successor mount of the same tool",
  "native retained FontSize Apply cannot command a successor mount of the same tool"
])

function completed(run, expectedExit) {
  assert.equal(run.exitCode, expectedExit, 'Unexpected child process exit status')
  assert(!run.signal && !run.timedOut && !run.spawnError && !run.receivedSignal,
    'A launch failure, timeout or interrupted process is not a product result')
}

function completeCases(rows, expectedNames) {
  assert(Array.isArray(rows), 'Native report must contain a case array')
  assert.equal(rows.length, expectedNames.length, 'Native report is incomplete')
  const names = rows.map(row => row.name)
  assert.equal(new Set(names).size, names.length, 'Native report repeats a case')
  assert.deepEqual([...names].sort(), [...expectedNames].sort(), 'Native case IDs differ from the maintained inventory')
  assert(rows.every(row => row.status === 'PASS' || row.status === 'FAIL'), 'Native report contains an unknown/skipped status')
}

function leadingJsonArray(text) {
  assert(text.startsWith('['), 'Failure report does not begin with a case array')
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
  throw new Error('Truncated native failure report')
}

export function verifyClipboardRed(run) {
  completed(run, 1)
  const marker = 'Error: History matrix failed: '
  const position = run.stderr.indexOf(marker)
  assert(position >= 0, 'Expected RED did not produce completed native assertion results')
  assert.equal(run.stderr.indexOf(marker, position + marker.length), -1,
    'Expected RED must contain exactly one completed native assertion report')
  const rows = leadingJsonArray(run.stderr.slice(position + marker.length))
  completeCases(rows, STANDARD_CLIPBOARD_CASES)
  const failed = rows.filter(row => row.status === 'FAIL')
  assert(failed.length > 0, 'Baseline unexpectedly passed every new F01 regression')
  assert(failed.every(row => /^Error: Standard (?:text\/plain|HTML) changed the selected visible text(?:\n|$)/.test(row.error)),
    'Baseline failed for a fixture/engine/environment reason, not the planned F01 output mismatch')
  for (const name of ['line breaks', 'mention label']) {
    assert(failed.some(row => row.name === `external standard clipboard copy preserves ${name}`),
      `The baseline did not reproduce the known ${name} defect`)
  }
  return { outcome: 'EXPECTED_PRODUCT_FAILURE', total: rows.length, failed: failed.length, rows }
}

export function verifyFontSizeRetainedRed(run) {
  completed(run, 1)
  const marker = 'Error: History matrix failed: '
  const position = run.stderr.indexOf(marker)
  assert(position >= 0, 'Expected RED did not produce completed native assertion results')
  assert.equal(run.stderr.indexOf(marker, position + marker.length), -1,
    'Expected RED must contain exactly one completed native assertion report')
  const rows = leadingJsonArray(run.stderr.slice(position + marker.length))
  completeCases(rows, FONT_SIZE_RETAINED_CASES)
  assert(rows.every(row => row.status === 'FAIL'
    && /^Error: The retained control mutated the successor document(?:\n|$)/.test(row.error)),
  'Both baseline actions must reproduce F07 successor mutation, not fixture/engine/environment failures')
  return { outcome: 'EXPECTED_PRODUCT_FAILURE', total: rows.length, failed: rows.length, rows }
}

export function verifyNativeGreen(run, page, expectedNames) {
  completed(run, 0)
  const reports = []
  for (const line of run.stdout.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue
    const parsed = JSON.parse(line)
    if (Object.hasOwn(parsed, page)) reports.push(parsed[page])
  }
  assert.equal(reports.length, 1, 'Native runner must emit exactly one completed page report')
  const rows = reports[0]
  completeCases(rows, expectedNames)
  assert(rows.every(row => row.status === 'PASS'), 'Candidate contains failed native assertions')
  return { outcome: 'PASS', total: rows.length, rows }
}

export function verifyNavigationGreen(run, head) {
  completed(run, 0)
  const report = JSON.parse(run.stdout)
  assert.equal(report.head, head, 'Navigation report belongs to a different commit')
  assert.equal(report.browser, '151.0.7922.34', 'Navigation browser differs from the paired runtime')
  assert.equal(report.sourceUnchanged, true)
  assert.equal(report.candidatePass, true)
  assert.equal(report.results?.length, 72, 'Navigation did not complete all comparisons')
  const names = ['_self', '_blank', '_parent', '_top', 'articlePreview', 'existing-named', 'control-click', 'shift-click', 'middle-click', 'relative', 'fragment-new-tab', 'fragment-control-click']
  const surfaces = ['raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer', 'paragraph-editor', 'paragraph-renderer']
  const actual = report.results.map(row => {
    assert.equal(row.status, 'PASS', 'Navigation candidate failed')
    assert.equal(row.control?.kind, 'platform-control')
    assert.equal(row.candidate?.kind, row.surface)
    assert.equal(row.control.actual.settled, true, 'Independent native control did not settle')
    assert.equal(row.control.actual.policyEnforced, true, 'Navigation owner did not enforce Trusted Types')
    assert(row.control.actual.activations?.length > 0 && row.control.actual.activations.every(event => event.trusted === true),
      'Navigation did not observe a trusted native activation')
    assert.deepEqual(row.candidate.actual, row.control.actual, 'Candidate navigation differs from its independent control')
    return row.name + '/' + row.surface
  })
  const expected = names.flatMap(name => surfaces.map(surface => name + '/' + surface))
  assert.deepEqual(actual, expected, 'Navigation order or full comparison coverage changed')
  return { outcome: 'PASS', total: 72, browser: report.browser,
    limitation: 'This paired-runtime pass does not establish the cause of the archived Chromium153 failure.' }
}
