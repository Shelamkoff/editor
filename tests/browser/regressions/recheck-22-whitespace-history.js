import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, para, select, key, equal } from './harness.js'

export function register() {
  for (const offset of [5, 6]) {
    test(`a word separator survives split at ${offset}, Undo/Redo and merge`, () => {
      const editor = make([para('a', 'Hello world')])
      const first = editor.blocks.getBlockByIndex(0).contentElement
      select(first, offset)
      key(first, 'Enter')
      equal(editor.save().blocks.map(block => block.data.text), offset === 5 ? ['Hello', ' world'] : ['Hello ', 'world'])
      editor.undo()
      editor.redo()
      const second = editor.blocks.getBlockByIndex(1).contentElement
      select(second, 0)
      key(second, 'Backspace')
      equal(editor.save().blocks.map(block => block.data.text), ['Hello world'])
      editor.undo()
      editor.redo()
      equal(editor.save().blocks.map(block => block.data.text), ['Hello world'])
    })
  }

  test('ordinary word fragments still merge without an invented separator', () => {
    const editor = make([para('a', 'Hello')])
    const first = editor.blocks.getBlockByIndex(0).contentElement
    select(first, 2)
    key(first, 'Enter')
    editor.undo()
    editor.redo()
    const second = editor.blocks.getBlockByIndex(1).contentElement
    select(second, 0)
    key(second, 'Backspace')
    equal(editor.save().blocks[0].data.text, 'Hello')
  })

  test('save, render and read-only transitions preserve authored boundary whitespace', () => {
    const editor = make([para('a', '  <strong>Words</strong>  ')])
    equal(editor.save().blocks[0].data.text, '  <strong>Words</strong>  ')
    editor.render(editor.save())
    editor.setReadOnly(true)
    editor.setReadOnly(false)
    equal(editor.blocks.getBlockByIndex(0).contentElement.innerHTML, '  <strong>Words</strong>  ')
  })

  test('conversion between paragraph and heading preserves boundary separators', () => {
    const editor = make([para('a', ' Hello ')], { plugins: [new Paragraph(), new Heading()] })
    editor.blocks.convert(0, 'heading', { level: 2 })
    equal(editor.save().blocks[0].data.text, ' Hello ')
    editor.blocks.convert(0, 'paragraph')
    equal(editor.save().blocks[0].data.text, ' Hello ')
    editor.undo()
    equal(editor.save().blocks[0].data.text, ' Hello ')
  })
}
