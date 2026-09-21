import { Code } from '../../../plugins/code/index.js'
import { Raw } from '../../../plugins/raw/index.js'
import { test, make, equal, key, assert } from './harness.js'

export function register() {
  for (const type of ['code', 'raw']) {
    const width = type === 'code' ? 4 : 2
    const pad = ' '.repeat(width)
    const field = type === 'code' ? 'code' : 'html'
    const setup = value => {
      const editor = make([{ id: 'source', type, data: { [field]: value } }], {
        plugins: [type === 'code' ? new Code() : new Raw()], validationMode: 'strict',
      })
      editor.rootElement.querySelector('.oe-code-btn--edit')?.click()
      const textarea = editor.rootElement.querySelector('textarea')
      assert(textarea)
      textarea.focus()
      return { editor, textarea }
    }
    for (const offset of [0, 1, width]) {
      test(`${type} Shift+Tab removes a full indentation unit with caret at column ${offset}`, () => {
        const initial = pad + 'alpha'
        const { editor, textarea } = setup(initial)
        textarea.setSelectionRange(offset, offset)
        const event = key(textarea, 'Tab', { shiftKey: true })
        assert(event.defaultPrevented)
        equal(textarea.value, 'alpha')
        equal([textarea.selectionStart, textarea.selectionEnd], [0, 0])
        equal(editor.save().blocks[0].data[field], 'alpha')
        editor.undo(); equal(editor.save().blocks[0].data[field], initial)
        editor.redo(); equal(editor.save().blocks[0].data[field], 'alpha')
      })
    }
    test(`${type} Shift+Tab dedents the whole final selected line, not only the prefix before selectionEnd`, () => {
      const { editor, textarea } = setup(pad + 'a\n' + pad + 'b')
      textarea.setSelectionRange(1, width + 3, 'backward')
      key(textarea, 'Tab', { shiftKey: true })
      equal(textarea.value, 'a\nb')
      equal([textarea.selectionStart, textarea.selectionEnd], [0, 2])
      equal(textarea.selectionDirection, 'backward')
      equal(editor.save().blocks[0].data[field], 'a\nb')
    })
    test(`${type} Shift+Tab at an empty first line does not change the next line`, () => {
      const initial = '\n' + pad + 'beta'
      const { editor, textarea } = setup(initial)
      textarea.setSelectionRange(0, 0)
      key(textarea, 'Tab', { shiftKey: true })
      equal(textarea.value, initial)
      equal(editor.canUndo, false)
    })
    test(`${type} Shift+Tab at a following line start leaves the preceding line unchanged`, () => {
      const { textarea } = setup(pad + 'alpha\n' + pad + 'beta')
      const start = width + 6
      textarea.setSelectionRange(start, start)
      key(textarea, 'Tab', { shiftKey: true })
      equal(textarea.value, pad + 'alpha\nbeta')
      equal([textarea.selectionStart, textarea.selectionEnd], [start, start])
    })
  }
}
