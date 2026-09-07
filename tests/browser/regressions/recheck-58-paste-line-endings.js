import { test, make, para, select, paste, equal, assert } from './harness.js'

export function register() {
  for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
    for (const [layout, value] of [
      ['adjacent lines', `X${newline}Y`],
      ['blank middle line', `X${newline}${newline}Y`],
      ['leading and trailing empty lines', `${newline}X${newline}Y${newline}`],
    ]) {
      test(`plain paste normalizes ${name} with ${layout} before the empty-line policy`, async () => {
        const editor = make([para('a', 'abcd')])
        const before = editor.save().blocks
        const field = editor.blocks.getBlockById('a').contentElement
        select(field, 2)
        await paste(field, { 'text/plain': value })
        const after = editor.save().blocks
        equal(after.map(block => block.data.text), ['abX', 'Ycd'])
        const caret = window.getSelection().getRangeAt(0)
        const end = editor.blocks.getBlockByIndex(1).contentElement
        assert(end.contains(caret.startContainer))
        const prefix = document.createRange(); prefix.selectNodeContents(end); prefix.setEnd(caret.startContainer, caret.startOffset)
        equal(prefix.toString(), 'Y', 'caret stays before the original suffix')
        editor.undo(); equal(editor.save().blocks, before); equal(editor.canUndo, false)
        editor.redo(); equal(editor.save().blocks, after)
      })
    }
  }

  test('mixed newline conventions produce the same sequence of paragraphs', async () => {
    const editor = make([para('a', 'abcd')])
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2); await paste(field, { 'text/plain': 'X\r\nY\rZ\nW' })
    equal(editor.save().blocks.map(block => block.data.text), ['abX', 'Y', 'Z', 'Wcd'])
  })

  test('CRLF selection replacement deletes only selected characters and keeps its suffix', async () => {
    const editor = make([para('a', 'abcdef')])
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2, 4); await paste(field, { 'text/plain': 'X\r\nY' })
    equal(editor.save().blocks.map(block => block.data.text), ['abX', 'Yef'])
    editor.undo(); equal(editor.save().blocks.map(block => block.data.text), ['abcdef'])
  })

  test('newline normalization does not reinterpret plain markup as HTML', async () => {
    const editor = make([para('a', 'abcd')])
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2); await paste(field, { 'text/plain': '<X>\r\n&Y' })
    equal(editor.save().blocks.map(block => block.data.text), ['ab&lt;X&gt;', '&amp;Ycd'])
  })

  test('newline-only text keeps the existing no-content paste behavior', async () => {
    const editor = make([para('a', 'abcd')])
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2); await paste(field, { 'text/plain': '\r\n\r\n' })
    equal(editor.save().blocks.map(block => block.data.text), ['abcd'])
    equal(editor.canUndo, false)
  })
}
