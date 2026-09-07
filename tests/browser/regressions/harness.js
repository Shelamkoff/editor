import { createEditor } from '../../../core/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'

const cases = []
const editors = []
const holders = []
let activeErrors = null

/** Declare exactly one intentional browser event error in the current test. */
export function expectError(pattern) {
  if (!activeErrors || !(pattern instanceof RegExp)) throw new TypeError('expectError requires a RegExp inside an active test')
  activeErrors.expected.push({ pattern, seen: false })
}

export const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
export const para = (id, text, extra = {}) => ({ id, type: 'paragraph', data: { text }, ...extra })
export function test(name, run) { cases.push({ name, run }) }
export function assert(value, message = 'Assertion failed') { if (!value) throw new Error(message) }
export function equal(actual, expected, message = '') {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}\nexpected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
export function make(blocks = [para('a', 'A')], options = {}) {
  const holder = document.createElement('section')
  document.body.appendChild(holder)
  holders.push(holder)
  const editor = createEditor({
    holder, injectStyles: false, plugins: [new Paragraph()], inlineTools: [],
    data: { version: '1', blocks },
    tuning: {
      undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
      animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
    },
    ...options,
  })
  editors.push(editor)
  return editor
}
export function select(element, start, end = start) {
  element.focus()
  const range = document.createRange()
  range.setStart(element.firstChild || element, start)
  range.setEnd(element.firstChild || element, end)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}
export function key(element, name, options = {}) {
  const event = new KeyboardEvent('keydown', { key: name, code: name, bubbles: true, cancelable: true, ...options })
  element.dispatchEvent(event)
  return event
}
export function input(element, text) {
  element.textContent = text
  element.dispatchEvent(new InputEvent('input', { bubbles: true }))
}
export async function paste(element, values) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(values)) data.setData(type, value)
  element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  await pause(20)
}
export const texts = editor => editor.save().blocks.map(block => block.data.text)
export async function run() {
  const results = []
  for (const { name, run } of cases) {
    const errors = { expected: [], unexpected: [] }
    activeErrors = errors
    const capture = (event) => {
      const cause = event.type === 'unhandledrejection' ? event.reason : event.error ?? event.message
      const message = cause?.message ?? String(cause)
      const expected = errors.expected.find(item => {
        item.pattern.lastIndex = 0
        return !item.seen && item.pattern.test(message)
      })
      if (expected) expected.seen = true
      else errors.unexpected.push(cause?.stack ?? message)
      // The result below owns the failure. Avoid duplicate browser logging,
      // but never turn an unexpected event into a successful test.
      event.preventDefault()
    }
    window.addEventListener('error', capture)
    window.addEventListener('unhandledrejection', capture)
    const failures = []
    try { await run() }
    catch (error) { failures.push(error?.stack ?? String(error)) }
    finally {
      // Allow native rejection reporting and the opening event's microtasks.
      await pause()
      for (const editor of editors.splice(0)) {
        try { editor.destroy() } catch (error) { failures.push(error?.stack ?? String(error)) }
      }
      for (const holder of holders.splice(0)) holder.remove()
      await pause()
      window.removeEventListener('error', capture)
      window.removeEventListener('unhandledrejection', capture)
      activeErrors = null
    }
    failures.push(...errors.unexpected)
    for (const item of errors.expected) {
      if (!item.seen) failures.push(`Expected browser error was not raised: ${item.pattern}`)
    }
    results.push(failures.length
      ? { name, status: 'FAIL', error: failures.join('\n') }
      : { name, status: 'PASS' })
  }
  window.__auditResults = results
  const failed = results.filter(result => result.status !== 'PASS')
  document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
  document.body.dataset.status = failed.length ? 'fail' : 'pass'
}
