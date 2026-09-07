import { test, make, para, equal } from './harness.js'
import { openTool } from './formatting-fixture.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
export function register() {
  for (const [text, wanted] of [['ABC', 'abc'], ['ЖЖ', 'жж'], ['abc', 'ABC'], ['AbC', 'ABC'], ['123!', '123!']]) {
    test(`case decision for ${text} uses authored text, not the widget label`, async () => {
      const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
      const editor = make([para('a', `${text}{{w}}`, { inline })], { inlinePlugins: [createColorSwatchPlugin()], inlineTools: ['caseTransform'] })
      const field = editor.blocks.getBlockById('a').contentElement
      const widget = field.querySelector('[data-inline-plugin]')
      const before = editor.save().blocks
      field.focus(); const range = document.createRange(); range.selectNodeContents(field)
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      await openTool(editor, 'caseTransform')
      equal(editor.save().blocks[0].data.text, `${wanted}{{w}}`)
      equal(editor.save().blocks[0].inline, inline)
      equal(field.querySelector('[data-inline-plugin]'), widget)
      if (text !== wanted) {
        editor.undo(); equal(editor.save().blocks, before)
        editor.redo(); equal(editor.save().blocks[0].data.text, `${wanted}{{w}}`)
      }
    })
  }
  test('a selection with only a color widget leaves its label and data untouched', async () => {
    const inline = { w: { type: 'color', data: { value: '#abcdef' } } }
    const editor = make([para('a', '{{w}}', { inline })], { inlinePlugins: [createColorSwatchPlugin()], inlineTools: ['caseTransform'] })
    const field = editor.blocks.getBlockById('a').contentElement
    const before = editor.save().blocks
    field.focus(); const range = document.createRange(); range.selectNodeContents(field)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    await openTool(editor, 'caseTransform')
    equal(editor.save().blocks, before)
    equal(field.querySelector('.oe-ip__label').textContent, '#abcdef')
  })
}
