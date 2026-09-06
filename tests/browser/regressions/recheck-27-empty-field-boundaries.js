import { Paragraph, Quote, Warning, Toggle, Spoiler, Table } from '../../../plugins/index.js'
import { test, make, para, key, equal, assert } from './harness.js'

function caret(field, end = false) {
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  range.collapse(!end)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
}
const fixtures = [
  [Quote, 'quote', 'blockquote', 'cite', 'text', 'caption'],
  [Warning, 'warning', '.oe-warning__title', '.oe-warning__message', 'title', 'message'],
  [Toggle, 'toggle', '.oe-toggle__title', '.oe-toggle__body', 'title', 'content'],
  [Spoiler, 'spoiler', '.oe-spoiler__label', '.oe-spoiler__content', 'label', 'content'],
]

export function register() {
  for (const [Plugin, type, first, last, head, tail] of fixtures) {
    for (const action of ['Backspace', 'Delete']) {
      test(`${type}: ${action} inside a later/earlier field does not merge past empty neighboring fields`, () => {
        const left = { [head]: 'LEFT', [tail]: action === 'Delete' ? '' : 'Left body', ...(type === 'toggle' ? { open: true } : {}) }
        const right = { [head]: action === 'Backspace' ? '' : 'RIGHT', [tail]: 'Right body', ...(type === 'toggle' ? { open: true } : {}) }
        const editor = make([{ id: 'a', type, data: left }, { id: 'b', type, data: right }], { plugins: [new Paragraph(), new Plugin()] })
        const field = editor.blocks.getBlockByIndex(action === 'Backspace' ? 1 : 0).contentElement.querySelector(action === 'Backspace' ? last : first)
        const before = editor.save().blocks
        caret(field, action === 'Delete')
        const event = key(field, action)
        equal(editor.save().blocks, before, 'empty fields must still form distinct block boundaries')
        equal(event.defaultPrevented, false, 'leave field-internal editing to the browser/plugin')
        equal(editor.canUndo, false)
      })
    }
  }

  test('navigation does not jump to another block from a non-boundary empty table cell', () => {
    const editor = make([para('a', 'Before'), { id: 't', type: 'table', data: { withHeadings: false, content: [['', '']] } }, para('b', 'After')], { plugins: [new Paragraph(), new Table()] })
    const cells = editor.blocks.getBlockById('t').contentElement.querySelectorAll('td')
    for (const [cell, action] of [[cells[1], 'ArrowUp'], [cells[0], 'ArrowDown']]) {
      caret(cell, action === 'ArrowDown')
      key(cell, action)
      equal(editor.blocks.getCurrentBlock().id, 't', 'a sibling empty field is not outside the block')
      assert(cell.contains(window.getSelection().anchorNode), 'caret must not jump to an adjacent paragraph')
    }
  })

  test('genuine first/last field boundaries still allow merging through empty edge fields', () => {
    for (const action of ['Backspace', 'Delete']) {
      const editor = make([
        { id: 'a', type: 'quote', data: { text: 'LEFT', caption: '' } },
        { id: 'b', type: 'quote', data: { text: '', caption: 'RIGHT' } },
      ], { plugins: [new Paragraph(), new Quote()] })
      const field = editor.blocks.getBlockByIndex(action === 'Backspace' ? 1 : 0).contentElement.querySelector(action === 'Backspace' ? 'blockquote' : 'cite')
      caret(field, action === 'Delete')
      key(field, action)
      equal(editor.save().blocks.map(block => block.data), [{ text: 'LEFT', caption: 'RIGHT' }])
      editor.undo()
      equal(editor.save().blocks.length, 2)
    }
  })
}
