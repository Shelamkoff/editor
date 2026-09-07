import { test, make, para, equal, assert } from './harness.js'
import { characterStyles, sizeAction, textRange } from './formatting-fixture.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
const sizes = field => characterStyles(field, node => getComputedStyle(node).fontSize)
function contents(field) {
  field.focus()
  const range = document.createRange(); range.selectNodeContents(field)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
export function register() {
  for (const [label, html] of [
    ['smaller size', 'A<span style="font-size:20px">BC</span>D'],
    ['larger size', 'A<span style="font-size:40px">BC</span>D'],
    ['nested style', '<span style="font-size:32px">A<b><span style="font-size:40px">BC</span></b>D</span>'],
    ['container boundaries', '<span style="font-size:20px">ABCD</span>'],
    ['unrelated formatting', 'A<b>BC</b>D'],
  ]) {
    test(`font size overrides selected ${label}, including enclosed descendants`, async () => {
      const editor = make([para('a', html)], { inlineTools: ['fontSize'] })
      const field = editor.blocks.getBlockById('a').contentElement
      const before = editor.save().blocks
      contents(field); await sizeAction(editor, 24)
      equal(sizes(field), [['A', '24px'], ['B', '24px'], ['C', '24px'], ['D', '24px']])
      equal(window.getSelection().toString(), 'ABCD')
      const after = editor.save().blocks
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, after)
    })
  }
  test('font sizing nested text keeps the unselected styled edges and background', async () => {
    const editor = make([para('a', '<span style="font-size:40px;background-color:red">A<b>BC</b>D</span>')], { inlineTools: ['fontSize'] })
    const field = editor.blocks.getBlockById('a').contentElement
    textRange(field.querySelector('b').firstChild, 0, field.querySelector('b').firstChild, 2)
    await sizeAction(editor, 24)
    equal(sizes(field), [['A', '40px'], ['B', '24px'], ['C', '24px'], ['D', '40px']])
    assert(field.querySelector('b'))
    equal(field.firstElementChild.style.backgroundColor, 'red')
  })
  test('font sizing surrounding text leaves atomic widget nodes and their own font size intact', async () => {
    const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
    const editor = make([para('a', 'A{{w}}B', { inline })], { inlineTools: ['fontSize'], inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    const widget = field.querySelector('[data-inline-plugin]')
    widget.style.fontSize = '13px'
    contents(field); await sizeAction(editor, 24)
    equal(sizes(field), [['A', '24px'], ['B', '24px']])
    equal(field.querySelector('[data-inline-plugin]'), widget)
    equal(getComputedStyle(widget).fontSize, '13px')
    equal(editor.save().blocks[0].inline, inline)
    widget.click(); assert(editor.rootElement.querySelector('.oe-ip-popup'))
  })
}
