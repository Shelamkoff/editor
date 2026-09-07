import { Paragraph, Quote } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, select, paste, key, assert, equal } from './harness.js'

export function decodedTexts(editor) {
  return editor.save().blocks.map(block => block.data.text.replace(/\{\{([\w-]+)\}\}/g,
    (_, id) => block.inline?.[id]?.data.value ?? 'UNRESOLVED'))
}
function preceding(field) {
  const caret = window.getSelection().getRangeAt(0)
  assert(caret.collapsed, 'paste should leave one caret')
  assert(field.contains(caret.startContainer), 'caret stays in its target field')
  const range = document.createRange()
  range.selectNodeContents(field)
  range.setEnd(caret.startContainer, caret.startOffset)
  return range.toString()
}

export function register() {
  for (const [name, initial, offset, value, prefix, expected] of [
    ['one color', '', 0, '#ff0000 tail', '#ff0000 tail', ['#ff0000 tail']],
    ['two colors', '', 0, '#ff0000 mid #00ff00 tail', '#ff0000 mid #00ff00 tail', ['#ff0000 mid #00ff00 tail']],
    ['middle paste', 'abcd', 2, '#ff0000 tail', 'ab#ff0000 tail', ['ab#ff0000 tailcd']],
    ['multiline paste', 'abcd', 2, '#ff0000 tail\n#00ff00 end', '#00ff00 end', ['ab#ff0000 tail', '#00ff00 endcd']],
    ['terminal color', 'abcd', 2, '#ff0000', 'ab#ff0000', ['ab#ff0000cd']],
    ['suffix also contains a color', 'ab cd #00ff00 end', 2, '#ff0000 tail', 'ab#ff0000 tail', ['ab#ff0000 tail cd #00ff00 end']],
  ]) {
    test(`automatic pattern replacement retains the paste boundary: ${name}`, async () => {
      const editor = make([para('a', initial)], { inlinePlugins: [createColorSwatchPlugin()] })
      const before = editor.save().blocks
      const field = editor.blocks.getBlockById('a').contentElement
      select(field, offset)
      await paste(field, { 'text/plain': value })
      const after = editor.save().blocks
      assert(after.some(block => block.inline), 'patterns were converted, not skipped')
      equal(decodedTexts(editor), expected)
      equal(preceding(editor.blocks.getCurrentBlock().contentElement), prefix)
      editor.undo(); equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'paste and all replacements share one history step')
      editor.redo(); equal(editor.save().blocks, after)
      equal(preceding(editor.blocks.getCurrentBlock().contentElement), prefix, 'redo restores the same boundary')
    })
  }

  test('HTML paste retains its boundary after a color in nested formatting', async () => {
    const editor = make([para('a', 'abcd')], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2)
    await paste(field, { 'text/html': '<p><em>#ff0000</em> tail</p>' })
    assert(editor.save().blocks[0].inline)
    equal(preceding(field), 'ab#ff0000 tail')
    equal(decodedTexts(editor), ['ab<em>#ff0000</em> tailcd'])
  })

  test('automatic patterns preserve the active Quote caption rather than its earlier field', async () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP', caption: 'abcd' } }], {
      plugins: [new Paragraph(), new Quote()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockById('q').contentElement.querySelector('cite')
    select(field, 2)
    await paste(field, { 'text/plain': '#ff0000 tail' })
    equal(preceding(field), 'ab#ff0000 tail')
    const saved = editor.save().blocks[0]
    assert(saved.inline)
    equal(saved.data.text, 'KEEP')
  })

  test('space-triggered pattern conversion still places the caret after the generated space', () => {
    const editor = make([para('a', '#ff0000')], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 7)
    assert(key(field, ' ').defaultPrevented)
    assert(editor.save().blocks[0].inline)
    equal(preceding(field), '#ff0000 ')
    equal(decodedTexts(editor), ['#ff0000 '])
  })

  test('paste without patterns keeps its original suffix boundary', async () => {
    const editor = make([para('a', 'abcd')], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 2); await paste(field, { 'text/plain': 'plain' })
    equal(preceding(field), 'abplain')
    equal(decodedTexts(editor), ['abplaincd'])
  })
}
