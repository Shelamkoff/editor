import { Code } from '../../../plugins/code/index.js'
import { Raw } from '../../../plugins/raw/index.js'
import { test, make, equal, key, assert } from './harness.js'

export function register() {
  for (const [type, width, field] of [['code', 4, 'code'], ['raw', 2, 'html']]) {
    const setup = value => {
      const editor = make([{ id: 'source', type, data: { [field]: value } }], {
        plugins: [type === 'code' ? new Code() : new Raw()], validationMode: 'strict',
      })
      editor.rootElement.querySelector('.oe-code-btn--edit')?.click()
      const textarea = editor.rootElement.querySelector('textarea')
      textarea.focus()
      return { editor, textarea }
    }
    for (const direction of ['forward', 'backward']) {
      test(`${type} Tab leaves the unselected following line intact (${direction})`, () => {
        const { editor, textarea } = setup('alpha\nbeta')
        textarea.setSelectionRange(0, 6, direction)
        assert(key(textarea, 'Tab').defaultPrevented)
        const expected = type === 'code' ? '    alpha\nbeta' : '  alpha\nbeta'
        equal(textarea.value, expected)
        equal([textarea.selectionStart, textarea.selectionEnd], [0, width + 6])
        equal(textarea.selectionDirection, direction)
        equal(editor.save().blocks[0].data[field], expected)
        editor.undo(); equal(editor.save().blocks[0].data[field], 'alpha\nbeta')
        editor.redo(); equal(editor.save().blocks[0].data[field], expected)
      })
    }
    for (const direction of ['forward', 'backward']) {
      test(`${type} Tab selects the indented range starting with an empty first line (${direction})`, () => {
        const { textarea } = setup('\nalpha\nbeta')
        textarea.setSelectionRange(0, 7, direction)
        key(textarea, 'Tab')
        equal(textarea.value, type === 'code' ? '    \n    alpha\nbeta' : '  \n  alpha\nbeta')
        equal([textarea.selectionStart, textarea.selectionEnd], [0, 7 + 2 * width])
        equal(textarea.selectionDirection, direction)
      })
    }
    test(`${type} Tab preserves backward multiline selection direction`, () => {
      const { textarea } = setup('alpha\nbeta')
      textarea.setSelectionRange(2, 8, 'backward')
      key(textarea, 'Tab')
      equal(textarea.value, type === 'code' ? '    alpha\n    beta' : '  alpha\n  beta')
      equal(textarea.selectionDirection, 'backward')
    })
    test(`${type} Tab still inserts one indentation unit at a collapsed caret`, () => {
      const { textarea } = setup('alpha')
      textarea.setSelectionRange(2, 2)
      key(textarea, 'Tab')
      equal(textarea.value, type === 'code' ? 'al    pha' : 'al  pha')
      equal([textarea.selectionStart, textarea.selectionEnd], [2 + width, 2 + width])
    })
  }
}
