import { assert, pause } from './harness.js'

/** Interact with real toolbar controls, retaining their normal selection flow. */
export async function openTool(editor, type) {
  document.dispatchEvent(new Event('selectionchange'))
  await pause(35)
  const button = editor.rootElement.querySelector(`[data-tool="${type}"]`)
  assert(button, `missing toolbar control ${type}`)
  button.click(); await pause(10)
}
export function textRange(first, start, last = first, end = start) {
  first.parentElement.closest('[contenteditable="true"]').focus()
  const range = document.createRange(); range.setStart(first, start); range.setEnd(last, end)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
export function characterStyles(root, read) {
  const result = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement.closest('[data-inline-plugin]')) continue
    for (const char of walker.currentNode.data) result.push([char, read(walker.currentNode.parentElement)])
  }
  return result
}
export async function sizeAction(editor, value) {
  await openTool(editor, 'fontSize')
  const button = editor.rootElement.querySelector(value === 'reset' ? '.oe-font-size-reset' : `[data-size="${value}"]`)
  assert(button, `missing font-size action ${value}`); button.click(); await pause()
}
