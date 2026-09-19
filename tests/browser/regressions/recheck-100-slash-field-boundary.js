import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { Heading } from '../../../plugins/heading/index.js'
import { Table } from '../../../plugins/table/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, select, key, assert, equal } from './harness.js'

function notify(field) {
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
}
function assertOpen(editor) {
  assert(editor.rootElement.querySelector('.oe-slash-menu').style.display !== 'none', 'slash query must open in its own field')
}

export function register() {
  test('slash Escape in a quote preserves both fields and unrelated caption text', () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: '/', caption: 'KEEP' } }], {
      plugins: [new Paragraph(), new Quote(), new Heading()],
    })
    const root = editor.blocks.getBlockById('q').contentElement
    const field = root.querySelector('.oe-quote__text'), caption = root.querySelector('.oe-quote__caption')
    select(field, 1); notify(field); assertOpen(editor)
    key(field, 'Escape')
    equal(editor.save().blocks[0].data, { text: '', caption: 'KEEP' })
    assert(root.querySelector('.oe-quote__text') === field && root.querySelector('.oe-quote__caption') === caption)
    editor.undo()
    equal(editor.save().blocks[0].data, { text: '/', caption: 'KEEP' })
  })

  test('slash insertion from a caption preserves the quote and stays one undoable command', () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP', caption: '/' } }], {
      plugins: [new Paragraph(), new Quote(), new Heading()],
    })
    const field = editor.blocks.getBlockById('q').contentElement.querySelector('.oe-quote__caption')
    select(field, 1); notify(field); assertOpen(editor)
    field.textContent = '/head'; select(field, 5); notify(field)
    const before = editor.save().blocks
    key(field, 'Enter')
    const after = editor.save().blocks
    equal(after.map(block => block.type), ['quote', 'heading'])
    equal(after[0].data, { text: 'KEEP', caption: '' })
    editor.undo(); equal(editor.save().blocks, before)
    editor.redo(); equal(editor.save().blocks, after)
  })

  test('slash command in a table cell preserves the cell matrix', () => {
    const editor = make([{ id: 't', type: 'table', data: { content: [['/', 'KEEP']], withHeadings: false } }], {
      plugins: [new Paragraph(), new Table(), new Heading()],
    })
    const root = editor.blocks.getBlockById('t').contentElement
    const cells = root.querySelectorAll('[contenteditable="true"]')
    const field = cells[0]
    select(field, 1); notify(field); assertOpen(editor)
    key(field, 'Enter')
    equal(editor.save().blocks.map(block => block.type), ['table', 'paragraph'])
    equal(editor.save().blocks[0].data.content, [['', 'KEEP']])
    assert(root.querySelectorAll('[contenteditable="true"]').length === cells.length)
  })

  test('slash Escape removes a query across formatting without touching another field', () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP', caption: 'prefix/' } }], {
      plugins: [new Paragraph(), new Quote(), new Heading()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockById('q').contentElement.querySelector('.oe-quote__caption')
    select(field, 7); notify(field); assertOpen(editor)
    const formatted = document.createElement('em'); formatted.textContent = 'head'; field.appendChild(formatted)
    formatted.focus(); notify(field)
    key(field, 'Escape')
    equal(field.textContent, 'prefix')
    equal(editor.save().blocks[0].data, { text: 'KEEP', caption: 'prefix' })
  })
}
