import { Paragraph, Heading, Delimiter } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { selectAcross } from './cross-input-fixture.js'
import { convertSelection } from './conversion-fixture.js'
import { test, make, para, equal } from './harness.js'

export function register() {
  for (const backwards of [false, true]) {
    test(`partial ${backwards ? 'backward' : 'forward'} cross conversion transfers payloads and tunes to both endpoint fragments`, () => {
      const a = { wa: { type: 'missing', data: { name: 'FIRST' } } }
      const b = { wb: { type: 'missing', data: { name: 'LAST' } } }
      const original = [para('a', 'A{{wa}}Z', { inline: a, tunes: { textAlign: 'right' } }), para('b', 'B{{wb}}Q', { inline: b, tunes: { textAlign: 'center' } })]
      const editor = make(original, { plugins: [new Paragraph(), new Heading()] })
      const before = editor.save().blocks
      selectAcross(editor, editor.blocks.getBlockById('a').contentElement, 1, editor.blocks.getBlockById('b').contentElement, 1, backwards)
      convertSelection(editor, 'heading')
      const saved = editor.save().blocks
      equal(saved.map(block => block.data.text), ['A', '{{wa}}Z', 'B', '{{wb}}Q'])
      equal(saved.map(block => block.inline), [undefined, a, undefined, b])
      equal(saved.map(block => block.tunes), [{ textAlign: 'right' }, { textAlign: 'right' }, { textAlign: 'center' }, { textAlign: 'center' }])
      editor.undo()
      equal(editor.save().blocks, before)
      editor.redo()
      equal(editor.save().blocks, saved)
    })
  }
  test('registered inline widgets and opaque widgets survive different endpoint fragments', () => {
    const a = { wa: { type: 'color', data: { value: '#ff0000' } } }
    const b = { wb: { type: 'missing', data: { name: 'OPAQUE' } } }
    const editor = make([para('a', 'A{{wa}}Z', { inline: a }), para('b', 'B{{wb}}Q', { inline: b })], {
      plugins: [new Paragraph(), new Heading()], inlinePlugins: [createColorSwatchPlugin()],
    })
    selectAcross(editor, editor.blocks.getBlockById('a').contentElement, 1, editor.blocks.getBlockById('b').contentElement, 1)
    convertSelection(editor, 'heading')
    equal(editor.save().blocks.map(block => block.inline), [undefined, a, undefined, b])
  })
  test('non-text cross conversion preserves metadata on its unselected suffix', () => {
    const inline = { w: { type: 'missing', data: { name: 'KEEP' } } }
    const editor = make([para('a', 'Alpha'), para('b', 'B{{w}}Q', { inline, tunes: { textAlign: 'right' } })], {
      plugins: [new Paragraph(), new Delimiter()],
    })
    selectAcross(editor, editor.blocks.getBlockById('a').contentElement, 2, editor.blocks.getBlockById('b').contentElement, 1)
    convertSelection(editor, 'delimiter')
    const saved = editor.save().blocks
    equal(saved.map(block => block.type), ['paragraph', 'delimiter', 'paragraph'])
    equal(saved[2].data.text, '{{w}}Q')
    equal(saved[2].inline, inline)
    equal(saved[2].tunes, { textAlign: 'right' })
  })
  test('failed endpoint conversion rolls back the document with all opaque metadata intact', () => {
    class FailingHeading extends Heading {
      render(data) { if (data.text.includes('{{w}}')) throw new Error('deliberate endpoint failure'); return super.render(data) }
    }
    const original = [para('a', 'A{{w}}Z', { inline: { w: { type: 'missing', data: { name: 'KEEP' } } }, tunes: { textAlign: 'right' } }), para('b', 'Bravo')]
    const editor = make(original, { plugins: [new Paragraph(), new FailingHeading()] })
    const before = editor.save().blocks
    selectAcross(editor, editor.blocks.getBlockById('a').contentElement, 1, editor.blocks.getBlockById('b').contentElement, 3)
    convertSelection(editor, 'heading')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
