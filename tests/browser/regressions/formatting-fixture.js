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
export async function backgroundAction(editor, remove = false) {
  await openTool(editor, 'bgcolor')
  const picker = editor.rootElement.querySelector('.oe-color-dropdown')
  assert(picker, 'missing built-in ColorPicker')
  if (remove) picker.querySelector('.oe-color-btn--remove').click()
  else {
    const input = picker.querySelector('.oe-color-hex')
    input.value = '#00ff00'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    picker.querySelector('.oe-color-btn--apply').click()
  }
  await pause()
}
export function backgroundAt(element) {
  const host = element.closest('[contenteditable="true"]')
  while (element && element !== host) {
    if (element.style.backgroundColor) return element.style.backgroundColor
    element = element.parentElement
  }
  return 'none'
}
