import { getTextOffset, restoreSelectionByOffsets } from '../../../core/textOffset.js'
import { findNodeAtOffset } from '../../../inline-tools/utils.js'
import { test, make, para, equal, assert, key } from './harness.js'

function atom() {
  return {
    type: 'atom',
    createWidget(data, id) {
      const span = document.createElement('span')
      span.dataset.inlinePlugin = 'atom'; span.dataset.id = id
      span.dataset.value = data.value; span.textContent = data.value
      span.contentEditable = 'false'
      return span
    },
    hydrate() {},
    getData(span) { return { value: span.dataset.value } },
  }
}
const inline = { w_atom: { type: 'atom', data: { value: 'Bob' } } }
function at(node, offset) {
  const range = document.createRange(); range.setStart(node, offset); range.collapse(true)
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
}
function prefix(element, point) {
  const range = document.createRange(); range.selectNodeContents(element); range.setEnd(point.node, point.offset)
  const holder = document.createElement('div'); holder.append(range.cloneContents()); return holder
}

export function register() {
  test('logical positions count widgets once and preserve both sides of a BR', () => {
    const editor = make([para('a', 'a{{w_atom}}<br>b', { inline })], { inlinePlugins: [atom()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    equal([0, 1, 2, 3, 4].map(index => getTextOffset(p, p, index)), [0, 1, 2, 3, 4])
    const afterWidget = prefix(p, findNodeAtOffset(p, 2))
    equal(afterWidget.textContent, 'aBob')
    assert(afterWidget.querySelector('[data-inline-plugin]'))
    equal(afterWidget.querySelector('br'), null)
    const afterBreak = prefix(p, findNodeAtOffset(p, 3))
    equal(afterBreak.textContent, 'aBob')
    assert(afterBreak.querySelector('br'), 'the restored point must follow the break')
    restoreSelectionByOffsets(p, 3, 4)
    equal(window.getSelection().toString(), 'b')
  })
  test('Delete at the end of a block containing a widget merges the next block', () => {
    const editor = make([para('a', 'a{{w_atom}}b', { inline }), para('b', 'TAIL')], { inlinePlugins: [atom()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    p.focus(); at(p, p.childNodes.length)
    assert(key(p, 'Delete').defaultPrevented)
    equal(editor.save().blocks.length, 1)
    equal(editor.save().blocks[0].data.text, 'a{{w_atom}}bTAIL')
  })
  test('Backspace after a leading widget is not mistaken for the beginning of the block', () => {
    const editor = make([para('a', 'A'), para('b', '{{w_atom}}B', { inline })], { inlinePlugins: [atom()] })
    const p = editor.blocks.getBlockByIndex(1).contentElement
    p.focus(); at(p, 1)
    equal(key(p, 'Backspace').defaultPrevented, false)
    equal(editor.save().blocks.length, 2)
  })
  test('undo restores the caret after BR rather than before it', () => {
    const editor = make([para('a', 'A<br>B')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    p.focus(); at(p, 2)
    editor.blocks.insert('paragraph', { text: 'tail' }, 1, 'b')
    editor.undo()
    const restored = editor.blocks.getBlockByIndex(0).contentElement
    window.getSelection().getRangeAt(0).insertNode(document.createTextNode('X'))
    restored.dispatchEvent(new InputEvent('input', { bubbles: true }))
    equal(editor.save().blocks[0].data.text, 'A<br>XB')
  })
  test('focusing the end of a widget-only block never enters its noneditable label', () => {
    const editor = make([para('a', '{{w_atom}}', { inline })], { inlinePlugins: [atom()] })
    editor.render(editor.save())
    const p = editor.blocks.getBlockByIndex(0).contentElement
    const range = window.getSelection().getRangeAt(0)
    assert(range.startContainer === p, 'the caret must be outside the widget')
    equal(range.startOffset, 1)
  })
}
