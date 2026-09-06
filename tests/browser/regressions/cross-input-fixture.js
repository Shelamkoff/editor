import { assert, equal } from './harness.js'

/** Exercise the real mouse-selection manager, not a substitute Range store. */
export function selectAcross(editor, start, startOffset, end, endOffset, backwards = false) {
  editor.rootElement.style.width = '640px'
  editor.rootElement.scrollIntoView()
  const before = editor.save().blocks
  const point = (element, offset) => {
    const range = document.createRange()
    range.setStart(element.firstChild, offset - 1)
    range.setEnd(element.firstChild, offset)
    const rect = range.getBoundingClientRect()
    return { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 }
  }
  const anchor = backwards ? end : start
  anchor.focus()
  anchor.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1,
    ...point(anchor, backwards ? endOffset : startOffset),
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, buttons: 1,
    ...point(backwards ? start : end, backwards ? startOffset : endOffset),
  }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  assert(editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'cross-selection fixture must activate')
  equal(editor.save().blocks, before, 'setting a selection must not modify the document')
  return anchor
}
