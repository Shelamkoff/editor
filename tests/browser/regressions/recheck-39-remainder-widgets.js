import { Paragraph, Heading } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, assert, equal, pause } from './harness.js'
import { convertSelection } from './conversion-fixture.js'

export function register() {
  for (const text of ['{{w}}ABCD', '<em>{{w}}ABCD</em>', '{{w}}ABC']) {
    test(`partial conversion preserves the live unselected prefix widget: ${text}`, async () => {
      const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
      const editor = make([para('a', text, { inline })], { plugins: [new Paragraph(), new Heading()], inlinePlugins: [createColorSwatchPlugin()] })
      const field = editor.blocks.getBlockByIndex(0).contentElement
      const widget = field.querySelector('[data-inline-plugin]')
      const letters = text.startsWith('<em>') ? field.querySelector('em').lastChild : field.lastChild
      field.focus(); const range = document.createRange(); range.setStart(letters, 1); range.setEnd(letters, 3)
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      convertSelection(editor, 'heading')
      const prefix = editor.blocks.getBlockByIndex(0).contentElement
      assert(prefix.contains(widget), 'unselected live nodes must not be reconstructed from HTML')
      equal(editor.save().blocks[0].inline, inline)
      widget.click(); await pause(); assert(editor.rootElement.querySelector('.oe-ip-popup'), 'original live handler must still work')
      editor.undo(); equal(editor.save().blocks[0].data.text, text)
      editor.redo()
      editor.blocks.getBlockByIndex(0).contentElement.querySelector('[data-inline-plugin]').click()
      assert(editor.rootElement.querySelector('.oe-ip-popup'), 'history reconstruction must hydrate too')
    })
  }
  test('widgets in the selected fragment and the suffix hydrate while the prefix is retained', () => {
    const inline = Object.fromEntries(['left', 'selected', 'right'].map(id => [id, { type: 'color', data: { value: '#ff0000' } }]))
    const editor = make([para('a', '{{left}}A{{selected}}B{{right}}C', { inline })], {
      plugins: [new Paragraph(), new Heading()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    const left = field.querySelector('[data-id="left"]')
    field.focus(); const range = document.createRange()
    range.setStartBefore(field.querySelector('[data-id="selected"]')); range.setEndAfter(field.querySelector('[data-id="selected"]'))
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    convertSelection(editor, 'heading')
    assert(editor.blocks.getBlockByIndex(0).contentElement.contains(left))
    for (const block of editor.blocks) {
      const widget = block.contentElement.querySelector('[data-inline-plugin]')
      assert(widget, 'all three fragments retain their own widget')
      widget.click(); assert(editor.rootElement.querySelector('.oe-ip-popup'))
    }
    equal(editor.save().blocks.length, 3)
  })
}
