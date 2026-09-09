import { Paragraph, Quote, Table, Columns } from '../../../plugins/index.js'
import { test, make, para, assert, equal, key, pause } from './harness.js'

function span(first, last) {
  first.focus()
  const range = document.createRange()
  range.setStart(first.firstChild, 2)
  range.setEnd(last.firstChild, 3)
  const selection = window.getSelection()
  selection.removeAllRanges(); selection.addRange(range)
  return range
}
function fixture(type = 'table') {
  const data = type === 'table'
    ? { withHeadings: false, content: [['Alpha', 'Middle', 'Bravo'], ['Next', 'Safe', 'Tail']] }
    : type === 'quote' ? { text: 'Alpha', caption: 'Bravo' }
      : { layout: '1-1', columns: [{ content: 'Alpha' }, { content: 'Bravo' }] }
  const Plugin = { table: Table, quote: Quote, columns: Columns }[type]
  const editor = make([{ id: 'target', type, data }], { plugins: [new Paragraph(), new Plugin()] })
  const root = editor.blocks.getBlockById('target').contentElement
  const fields = root.querySelectorAll(type === 'table' ? 'td' : type === 'quote' ? 'blockquote,cite' : '.oe-columns__col')
  const first = fields[0], last = fields[type === 'table' ? 2 : 1]
  span(first, last)
  return { editor, first, last, before: editor.save().blocks }
}
export function register() {
  for (const type of ['table', 'quote', 'columns']) for (const inputType of ['insertText', 'deleteContentBackward', 'deleteContentForward']) {
    test(`${type} refuses unsupported multi-field ${inputType} before mutating any field`, () => {
      const { editor, first, before } = fixture(type)
      const range = window.getSelection().getRangeAt(0).cloneRange()
      const event = new InputEvent('beforeinput', { inputType, data: inputType === 'insertText' ? 'X' : null, bubbles: true, cancelable: true })
      first.dispatchEvent(event)
      assert(event.defaultPrevented, 'a browser default must not edit just one selected field')
      equal(editor.save().blocks, before)
      equal(window.getSelection().getRangeAt(0).toString(), range.toString())
      equal(editor.canUndo, false)
    })
  }
  for (const action of ['Backspace', 'Delete']) test(`table ${action} refuses a multi-cell range before key default`, () => {
    const { editor, first, before } = fixture()
    assert(key(first, action).defaultPrevented)
    equal(editor.save().blocks, before); equal(editor.canUndo, false)
  })
  test('single-cell text editing stays native rather than becoming a no-op', () => {
    const { editor, first } = fixture()
    const range = document.createRange(); range.setStart(first.firstChild, 2); range.setEnd(first.firstChild, 4)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    const e = new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true })
    first.dispatchEvent(e)
    equal(e.defaultPrevented, false)
    equal(editor.canUndo, false)
  })
}
export function registerNative() {
  for (const action of ['Backspace', 'Delete', 'text']) test(`native table ${action} does not partially edit a multi-cell selection`, async () => {
    const { editor, before } = fixture()
    if (action === 'text') await window.__testInput('Input.insertText', { text: 'X' })
    else {
      const args = { key: action, code: action, windowsVirtualKeyCode: action === 'Backspace' ? 8 : 46 }
      await window.__testInput('Input.dispatchKeyEvent', { type: 'keyDown', ...args })
      await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...args })
    }
    await pause()
    equal(editor.save().blocks, before)
    equal(editor.blocks.getBlockById('target').contentElement.querySelectorAll('td').length, 6)
    equal(editor.canUndo, false)
  })
  test('native single-cell replacement remains functional and undoable', async () => {
    const { editor, first, before } = fixture()
    const r = document.createRange(); r.setStart(first.firstChild, 2); r.setEnd(first.firstChild, 4)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r)
    await window.__testInput('Input.insertText', { text: 'X' }); await pause()
    equal(editor.save().blocks[0].data.content[0], ['AlXa', 'Middle', 'Bravo'])
    editor.undo(); equal(editor.save().blocks, before)
  })
}
