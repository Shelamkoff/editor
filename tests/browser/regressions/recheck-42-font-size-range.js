import { test, make, para, equal } from './harness.js'
import { textRange, characterStyles, sizeAction } from './formatting-fixture.js'

const sizes = field => characterStyles(field, element => getComputedStyle(element).fontSize)
export function register() {
  for (const nested of [false, true]) {
    test(`font sizing only changes selected text across ${nested ? 'nested' : 'adjacent'} styled spans`, async () => {
      const html = nested
        ? '<span style="font-size: 20px;">A<i>B</i></span><span style="font-size: 30px;">CD</span>'
        : '<span style="font-size: 20px;">AB</span><span style="font-size: 30px;">CD</span>'
      const editor = make([para('a', html)], { inlineTools: ['fontSize'] })
      const field = editor.blocks.getBlockByIndex(0).contentElement
      const start = nested ? field.querySelector('i').firstChild : field.firstChild.firstChild
      textRange(start, nested ? 0 : 1, field.lastChild.firstChild, 1)
      await sizeAction(editor, 24)
      equal(sizes(field), [['A', '20px'], ['B', '24px'], ['C', '24px'], ['D', '30px']])
      equal(window.getSelection().toString(), 'BC')
      const result = editor.save().blocks[0].data.text
      editor.undo(); equal(editor.save().blocks[0].data.text, html)
      editor.redo(); equal(editor.save().blocks[0].data.text, result)
    })
  }
  test('changing size preserves unselected siblings and unrelated background styling', async () => {
    const editor = make([para('a', '<span style="font-size: 20px;background-color:red">AB</span><i>CD</i>')], { inlineTools: ['fontSize'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.firstChild.firstChild, 1, field.lastChild.firstChild, 1)
    await sizeAction(editor, 24)
    equal(sizes(field).slice(0, 3), [['A', '20px'], ['B', '24px'], ['C', '24px']])
    equal(characterStyles(field, element => element.closest('[style*="background-color"]')?.style.backgroundColor || '').slice(0, 2), [['A', 'red'], ['B', 'red']])
  })
  test('font size in a single existing span leaves both unselected edges unchanged', async () => {
    const editor = make([para('a', '<span style="font-size: 20px;">ABC</span>')], { inlineTools: ['fontSize'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.firstChild.firstChild, 1, field.firstChild.firstChild, 2)
    await sizeAction(editor, 24)
    equal(sizes(field), [['A', '20px'], ['B', '24px'], ['C', '20px']])
  })
}
