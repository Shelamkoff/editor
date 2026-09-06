import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, para, equal, assert, texts } from './harness.js'

function press(editor) {
  editor.rootElement.scrollIntoView()
  const first = editor.blocks.getBlockByIndex(0)
  first.focus()
  const rect = first.element.getBoundingClientRect()
  editor.rootElement.querySelector('.oe-toolbar__drag').dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: rect.left + 4, clientY: rect.top + 4,
  }))
  return first
}
function moveToEnd(editor) {
  const rect = editor.blocks.getBlockByIndex(editor.blocks.getBlockCount() - 1).element.getBoundingClientRect()
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: rect.left + 8, clientY: rect.bottom + 20 }))
}
function release() { document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 })) }
function start(editor) { const block = press(editor); moveToEnd(editor); assert(block.element.classList.contains('oe-block--dragging'), 'the actual drag must be active'); return block }
const initial = () => [para('a', 'A'), para('b', 'B'), para('c', 'C')]

export function register() {
  for (const phase of ['pressed', 'dragging']) {
    test(`document replacement cancels a ${phase} gesture even when every ID is reused`, () => {
      const editor = make(initial())
      if (phase === 'pressed') press(editor); else start(editor)
      editor.render({ version: 'new', blocks: [para('a', 'New A'), para('b', 'New B'), para('c', 'New C')] })
      const before = editor.save().blocks
      moveToEnd(editor)
      release()
      equal(editor.save().blocks, before)
      equal(editor.rootElement.querySelector('.oe-block--dragging'), null)
      equal(document.body.style.cursor, '')
      // Cancellation must not disable subsequent gestures.
      start(editor); release()
      equal(texts(editor), ['New B', 'New C', 'New A'])
    })
  }
  for (const replacement of ['convert', 'reinsert']) {
    test(`a dragged block replaced by ${replacement} cannot move its new same-ID owner`, () => {
      const editor = make(initial(), { plugins: [new Paragraph(), new Heading()] })
      const old = start(editor)
      if (replacement === 'convert') editor.blocks.convert(0, 'heading')
      else { editor.blocks.remove(0); editor.blocks.insert('paragraph', { text: 'Replacement' }, 0, 'a') }
      const before = editor.save().blocks
      release()
      equal(editor.save().blocks, before)
      equal(old.element.classList.contains('oe-block--dragging'), false)
    })
  }
  test('ordinary drag remains one undoable move and survives replacement of an unrelated editor', () => {
    const editor = make(initial())
    const other = make([para('other', 'Other')])
    start(editor)
    other.render({ version: 'new', blocks: [para('other', 'Changed elsewhere')] })
    release()
    equal(texts(editor), ['B', 'C', 'A'])
    editor.undo(); equal(texts(editor), ['A', 'B', 'C'])
    editor.redo(); equal(texts(editor), ['B', 'C', 'A'])
  })
  test('destruction and read-only transitions remove active drag state', () => {
    const editor = make(initial())
    start(editor)
    editor.setReadOnly(true)
    release()
    equal(texts(editor), ['A', 'B', 'C'])
    editor.setReadOnly(false)
    const element = start(editor).element
    editor.destroy()
    release()
    equal(element.classList.contains('oe-block--dragging'), false)
    equal(document.body.style.cursor, '')
  })
}
