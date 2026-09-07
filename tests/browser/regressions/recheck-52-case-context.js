import { test, make, para, equal } from './harness.js'
import { openTool, textRange } from './formatting-fixture.js'
import { Paragraph, Table } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
function contents(field) {
  field.focus(); const range = document.createRange(); range.selectNodeContents(field)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
export function register() {
  for (const [label, html, wanted, selected] of [
    ['plain context', 'ΟΣ', 'ος', 'ος'],
    ['preceding context across bold', 'Ο<b>Σ</b>', 'ο<b>ς</b>', 'ος'],
    ['following context across bold', '<b>ΟΣ</b>Α', '<b>οσ</b>α', 'οσα'],
    ['both sides across bold', 'Ο<b>Σ</b>Α', 'ο<b>σ</b>α', 'οσα'],
    ['case-ignorable mark', 'Ο<i>́</i><b>Σ</b>', 'ο<i>́</i><b>ς</b>', 'ός'],
    ['punctuation ending', 'Ο<b>Σ</b>!', 'ο<b>ς</b>!', 'ος!'],
    ['expansion with context', 'İΟ<b>Σ</b>', 'i̇ο<b>ς</b>', 'i̇ος'],
    ['uppercase expansion', '<b>ß</b>ﬃ', '<b>SS</b>FFI', 'SSFFI'],
    ['line-break boundary', 'Ο<br><b>Σ</b>', 'ο<br><b>σ</b>', 'οσ'],
  ]) {
    test(`case conversion preserves Unicode ${label} and formatting`, async () => {
      const editor = make([para('a', html)], { inlineTools: ['caseTransform'] })
      const field = editor.blocks.getBlockById('a').contentElement
      const before = editor.save().blocks
      contents(field); await openTool(editor, 'caseTransform')
      equal(editor.save().blocks[0].data.text, wanted)
      equal(window.getSelection().getRangeAt(0).toString(), selected)
      const after = editor.save().blocks
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, after)
    })
  }
  test('case context never joins text across an atomic widget', async () => {
    const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
    const editor = make([para('a', 'Ο{{w}}<b>Σ</b>', { inline })], { inlineTools: ['caseTransform'], inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('a').contentElement
    const widget = field.querySelector('[data-inline-plugin]')
    contents(field); await openTool(editor, 'caseTransform')
    equal(editor.save().blocks[0].data.text, 'ο{{w}}<b>σ</b>')
    equal(editor.save().blocks[0].inline, inline)
    equal(field.querySelector('[data-inline-plugin]'), widget)
  })
  test('separate table fields remain separate Unicode context runs', async () => {
    const editor = make([{ id: 't', type: 'table', data: { withHeadings: false, content: [['Ο', 'Σ']] } }], { plugins: [new Paragraph(), new Table()], inlineTools: ['caseTransform'] })
    const cells = editor.blocks.getBlockById('t').contentElement.querySelectorAll('td')
    textRange(cells[0].firstChild, 0, cells[1].firstChild, 1)
    await openTool(editor, 'caseTransform')
    equal(editor.save().blocks[0].data.content, [['ο', 'σ']])
  })
  test('partial case conversion keeps unselected text and selects the transformed logical run', async () => {
    const editor = make([para('a', 'XΟ<b>Σ</b>Y')], { inlineTools: ['caseTransform'] })
    const field = editor.blocks.getBlockById('a').contentElement
    textRange(field.firstChild, 1, field.querySelector('b').firstChild, 1)
    await openTool(editor, 'caseTransform')
    equal(editor.save().blocks[0].data.text, 'Xο<b>ς</b>Y')
    equal(window.getSelection().toString(), 'ος')
  })
}
