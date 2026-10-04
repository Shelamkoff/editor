import { assert, equal, editorRoot, editableField, pause } from './regressions/harness.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { findNodeAtOffset } from '../../shared/textOffset.js'
export async function dispatchKey(key, code, windowsVirtualKeyCode, modifiers = 0, text) {
  const params = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers }
  const nativeText = text ?? (key === 'Enter' && !(modifiers & (1 | 2 | 4)) ? '\r' : undefined)
  await window.__testInput('Input.dispatchKeyEvent', {
    type: nativeText === undefined ? 'rawKeyDown' : 'keyDown',
    ...params,
    ...(nativeText === undefined ? {} : { text: nativeText }),
  })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  await pause(20)
}

export async function printable(text = 'X') {
  const params = {
    key: text,
    code: 'KeyX',
    windowsVirtualKeyCode: 88,
    nativeVirtualKeyCode: 88,
    text,
  }
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  await pause(20)
}

export function pointAt(element, offset) {
  const clamped = Math.max(0, offset)
  const caret = findNodeAtOffset(element, clamped, 'start')
  const collapsed = document.createRange()
  collapsed.setStart(caret.node, caret.offset)
  collapsed.setEnd(caret.node, caret.offset)
  const caretRect = collapsed.getBoundingClientRect()
  if (caretRect.height) return { clientX: caretRect.left + 0.1, clientY: caretRect.top + caretRect.height / 2 }
  const start = findNodeAtOffset(element, clamped === 0 ? 0 : clamped - 1, 'start')
  const end = findNodeAtOffset(element, clamped === 0 ? 1 : clamped, 'end')
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const rect = range.getBoundingClientRect()
  return {
    clientX: clamped === 0 ? rect.left + 1 : rect.right - 1,
    clientY: rect.top + Math.max(1, rect.height / 2),
  }
}

export async function clickNative(element) {
  assert(element instanceof HTMLElement, 'Native click requires a mounted element')
  await waitForStyles(element.ownerDocument)
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const rect = element.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, 'Native click target is not visible')
  let delivered = null
  const capture = event => { delivered = { isTrusted: event.isTrusted, hit: element.contains(event.target), target: event.target?.outerHTML?.slice(0, 250) } }
  const ownerDocument = element.ownerDocument
  ownerDocument.addEventListener('mousedown', capture, { capture: true, once: true })
  try {
    await window.__testInput('Input.click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  } finally {
    ownerDocument.removeEventListener('mousedown', capture, true)
  }
  assert(delivered?.isTrusted, 'Native click was not delivered as a trusted mouse event')
  assert(delivered.hit, `Native click missed ${element.dataset.tool ?? element.className} at ${JSON.stringify(rect.toJSON())}: ${delivered.target}`)
  await pause(30)
}

export async function selectAcross(editor, start, startOffset, end, endOffset, backwards = false) {
  const anchor = backwards ? end : start
  const focus = backwards ? start : end
  const anchorOffset = backwards ? endOffset : startOffset
  const focusOffset = backwards ? startOffset : endOffset
  const startPoint = pointAt(anchor, anchorOffset)
  const endPoint = pointAt(focus, focusOffset)

  anchor.focus()
  anchor.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    ...startPoint,
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    ...endPoint,
  }))
  document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    button: 0,
    buttons: 0,
  }))
  await pause(30)

  const root = editorRoot(editor)
  assert(root.classList.contains('oe-editor--cross-selecting'), 'physical cross-block selection did not activate')
  equal(editor.blocks.selectedIds().length, 2, 'physical cross-block selection lost selected block ids')
  return anchor
}

export async function dragAcross(editor, start, startOffset, end, endOffset, backwards = false) {
  await waitForStyles(start.ownerDocument)
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const from = pointAt(backwards ? end : start, backwards ? endOffset : startOffset)
  const to = pointAt(backwards ? start : end, backwards ? startOffset : endOffset)
  await window.__testInput('Input.drag', {
    from: { x: from.clientX, y: from.clientY },
    to: { x: to.clientX, y: to.clientY },
  })
  await pause(30)
  const ids = editor.save().blocks.map(block => block.id)
  const startIndex = ids.indexOf(start.closest('[data-block-id]').dataset.blockId)
  const endIndex = ids.indexOf(end.closest('[data-block-id]').dataset.blockId)
  equal(editor.blocks.selectedIds().length, Math.abs(endIndex - startIndex) + 1,
    `native mouse drag lost selected block ids: ${JSON.stringify({ ids, selected: editor.blocks.selectedIds(), from, to })}`)
  assert(editorRoot(editor).classList.contains('oe-editor--cross-selecting'), 'native drag did not retain its cross-field range')
  const native = window.getSelection()
  equal(getTextOffset(backwards ? end : start, native.anchorNode, native.anchorOffset), backwards ? endOffset : startOffset, 'native drag changed the anchor')
  equal(getTextOffset(backwards ? start : end, native.focusNode, native.focusOffset), backwards ? startOffset : endOffset, 'native drag changed the focus')
}

export async function waitForStyles(ownerDocument) {
  const deadline = Date.now() + 10_000
  while ([...ownerDocument.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Native gesture cannot start before its stylesheets have loaded')
    await pause(20)
  }
  await ownerDocument.fonts?.ready
}

export function decodeInline(editor) {
  return editor.save().blocks.map(block => String(block.data.text ?? '').replace(
    /\{\{([\w-]+)\}\}/g,
    (token, id) => block.inline?.[id]?.data?.value ?? token,
  ))
}
