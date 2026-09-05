import { test, make, para, select, key, equal, texts } from './harness.js'

export function register() {
  test('Enter replaces selected text before splitting the paragraph', () => {
    const editor = make([para('a', 'abcdef')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2, 4)
    key(p, 'Enter')
    equal(texts(editor), ['ab', 'ef'])
    editor.undo()
    equal(texts(editor), ['abcdef'])
    editor.redo()
    equal(texts(editor), ['ab', 'ef'])
  })
  test('Enter at a collapsed caret still preserves both halves', () => {
    const editor = make([para('a', 'abcdef')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    key(p, 'Enter')
    equal(texts(editor), ['ab', 'cdef'])
  })
}
