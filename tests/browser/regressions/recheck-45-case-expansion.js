import { test, make, para, select, equal, assert } from './harness.js'
import { openTool, textRange } from './formatting-fixture.js'
import { selectAcross } from './cross-input-fixture.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'

export function register() {
  for (const [source, result, selected, end] of [
    ['aßb', 'aSSb', 'SS', 2], ['aﬃb', 'aFFIb', 'FFI', 2], ['aİb', 'ai\u0307b', 'i\u0307', 2], ['abcd', 'aBCd', 'BC', 3],
  ]) {
    test(`case transformation retains the full selected replacement for ${source}`, async () => {
      const editor = make([para('a', source)], { inlineTools: ['caseTransform'] })
      const field = editor.blocks.getBlockByIndex(0).contentElement
      select(field, 1, end); await openTool(editor, 'caseTransform')
      equal(field.textContent, result)
      equal(window.getSelection().getRangeAt(0).toString(), selected)
      editor.undo(); equal(editor.save().blocks[0].data.text, source)
      editor.redo(); equal(editor.save().blocks[0].data.text, result)
    })
  }
  test('case expansion sums changes across differently formatted selected text nodes', async () => {
    const editor = make([para('a', 'a<i>ß</i><b>ﬃ</b>b')], { inlineTools: ['caseTransform'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.querySelector('i').firstChild, 0, field.querySelector('b').firstChild, 1)
    await openTool(editor, 'caseTransform')
    equal(editor.save().blocks[0].data.text, 'a<i>SS</i><b>FFI</b>b')
    equal(window.getSelection().getRangeAt(0).toString(), 'SSFFI')
  })
  test('case expansion after a widget preserves logical positions and its payload', async () => {
    const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
    const editor = make([para('a', '{{w}}aßb', { inline })], { inlineTools: ['caseTransform'], inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.lastChild, 1, field.lastChild, 2)
    await openTool(editor, 'caseTransform')
    equal(window.getSelection().getRangeAt(0).toString(), 'SS')
    equal(editor.save().blocks[0].inline, inline)
  })
  for (const backwards of [false, true]) {
    test(`case expansion respects distinct field offsets for a ${backwards ? 'backward' : 'forward'} cross-block range`, async () => {
      const editor = make([para('a', 'aß'), para('b', 'ﬃb')], { inlineTools: ['caseTransform'] })
      selectAcross(editor, editor.blocks.getBlockById('a').contentElement, 1, editor.blocks.getBlockById('b').contentElement, 1, backwards)
      await openTool(editor, 'caseTransform')
      equal(editor.save().blocks.map(block => block.data.text), ['aSS', 'FFIb'])
      const highlighted = [...CSS.highlights.get('oe-cross-select')]
      equal(highlighted.map(range => range.toString()), ['SSFFI'])
      assert(highlighted[0].endContainer.parentElement.closest('[data-block-id]').dataset.blockId === 'b')
    })
  }
}
