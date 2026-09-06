import { Paragraph, Quote, Warning, Toggle, Spoiler, List, Checklist } from '../../../plugins/index.js'
import { test, make, para, key, assert, equal } from './harness.js'

function boundary(element, end = false) {
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(!end)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
}
function assertPrefix(field, text) {
  const caret = window.getSelection().getRangeAt(0)
  assert(field.contains(caret.startContainer), 'caret must stay in the destination field')
  const before = document.createRange()
  before.selectNodeContents(field)
  before.setEnd(caret.startContainer, caret.startOffset)
  equal(before.toString(), text, 'caret must precede the merged-in content')
}
const fixtures = [
  [Quote, 'quote', 'blockquote', 'cite', { text: 'LEFT', caption: 'AuthorA' }, { text: 'RIGHT', caption: 'AuthorB' }],
  [Warning, 'warning', '.oe-warning__title', '.oe-warning__message', { title: 'LEFT', message: 'BodyA' }, { title: 'RIGHT', message: 'BodyB' }],
  [Toggle, 'toggle', '.oe-toggle__title', '.oe-toggle__body', { title: 'LEFT', content: 'BodyA', open: true }, { title: 'RIGHT', content: 'BodyB', open: true }],
  [Spoiler, 'spoiler', '.oe-spoiler__label', '.oe-spoiler__content', { label: 'LEFT', content: 'BodyA' }, { label: 'RIGHT', content: 'BodyB' }],
]

export function register() {
  for (const [Plugin, type, first, last, left, right] of fixtures) {
    for (const action of ['Backspace', 'Delete']) {
      test(`${type} ${action} merge keeps the next input at the field-local join`, () => {
        const editor = make([{ id: 'a', type, data: left }, { id: 'b', type, data: right }], { plugins: [new Paragraph(), new Plugin()] })
        const selector = action === 'Backspace' ? first : last
        const source = editor.blocks.getBlockByIndex(action === 'Backspace' ? 1 : 0).contentElement.querySelector(selector)
        boundary(source, action === 'Delete')
        assert(key(source, action).defaultPrevented)
        const field = editor.blocks.getBlockByIndex(0).contentElement.querySelector(selector)
        const prefix = action === 'Backspace' ? 'LEFT' : type === 'quote' ? 'AuthorA' : 'BodyA'
        assertPrefix(field, prefix)
        const merged = editor.save().blocks
        editor.undo()
        equal(editor.save().blocks.map(block => block.data), [left, right])
        editor.redo()
        equal(editor.save().blocks, merged)
        assertPrefix(editor.blocks.getBlockByIndex(0).contentElement.querySelector(selector), prefix)
        assert(document.execCommand('insertText', false, 'X'), 'native insertion should reach the restored caret')
        const expectedField = editor.blocks.getBlockByIndex(0).contentElement.querySelector(selector)
        assert(expectedField.textContent.startsWith(prefix + 'X'), 'next typed text must stay at the merge boundary')
      })
    }
  }

  for (const [Plugin, type, selector, data] of [
    [List, 'list', 'li', { style: 'unordered', items: ['A', 'B'] }],
    [Checklist, 'checklist', '.oe-checklist__text', { items: [{ text: 'A', checked: false }, { text: 'B', checked: true }] }],
  ]) {
    for (const action of ['Backspace', 'Delete']) {
      test(`append-only ${type} ${action} merge stays at the end of its last preexisting item`, () => {
        const right = type === 'list' ? { style: 'unordered', items: ['C'] } : { items: [{ text: 'C', checked: false }] }
        const editor = make([{ id: 'a', type, data }, { id: 'b', type, data: right }], { plugins: [new Paragraph(), new Plugin()] })
        const fields = editor.blocks.getBlockByIndex(action === 'Backspace' ? 1 : 0).contentElement.querySelectorAll(selector)
        const source = action === 'Backspace' ? fields[0] : fields[fields.length - 1]
        boundary(source, action === 'Delete')
        assert(key(source, action).defaultPrevented)
        assertPrefix(editor.blocks.getBlockByIndex(0).contentElement.querySelectorAll(selector)[1], 'B')
      })
    }
  }

  test('a paragraph merge with inline markup retains its logical boundary', () => {
    const editor = make([para('a', 'A<br><strong>B</strong>'), para('b', 'C')])
    const source = editor.blocks.getBlockByIndex(1).contentElement
    boundary(source)
    key(source, 'Backspace')
    assertPrefix(editor.blocks.getBlockByIndex(0).contentElement, 'AB')
    equal(editor.save().blocks[0].data.text, 'A<br><strong>B</strong>C')
  })
}
