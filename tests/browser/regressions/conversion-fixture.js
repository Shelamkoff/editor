import { assert } from './harness.js'

/** Exercise the real type selector while preserving its selection snapshot. */
export function convertSelection(editor, type) {
  editor.rootElement.querySelector('.oe-inline-toolbar__type-select').click()
  const target = editor.rootElement.querySelector(`[data-plugin-type="${type}"].oe-inline-toolbar__type-item`)
  assert(target, 'the registered target must be available in the selector')
  target.click()
}

export function selectNative(start, startOffset, end, endOffset) {
  start.focus()
  const range = document.createRange()
  range.setStart(start.firstChild || start, startOffset)
  range.setEnd(end.firstChild || end, endOffset)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}
