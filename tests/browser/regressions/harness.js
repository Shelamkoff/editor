import { createEditor } from '../../../core/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'

const cases = []
const editors = []
const holders = []
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
    try { await run(); results.push({ name, status: 'PASS' }) }
    catch (error) { results.push({ name, status: 'FAIL', error: error.stack }) }
    finally {
      for (const editor of editors.splice(0)) editor.destroy()
      for (const holder of holders.splice(0)) holder.remove()
    }
  }
  window.__auditResults = results
  const failed = results.filter(result => result.status !== 'PASS')
  document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
  document.body.dataset.status = failed.length ? 'fail' : 'pass'
}
