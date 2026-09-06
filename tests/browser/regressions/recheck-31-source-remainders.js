import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, select, equal, texts } from './harness.js'
import { convertSelection, selectNative } from './conversion-fixture.js'

export function register() {
  for (const start of [0, 1]) {
    test(`partial heading conversion retains source schema on the ${start ? 'middle-selection' : 'prefix-selection'} remainder`, () => {
      const editor = make([{ id: 'h', type: 'heading', data: { text: 'ABCDE', level: 4, align: 'right' } }], {
        plugins: [new Paragraph(), new Heading()],
      })
      const before = editor.save().blocks
      select(editor.blocks.getBlockById('h').contentElement, start, 3)
      convertSelection(editor, 'paragraph')
      const saved = editor.save().blocks
      equal(saved.map(block => block.data.text), start ? ['A', 'BC', 'DE'] : ['ABC', 'DE'])
      for (const remainder of saved.filter(block => block.type === 'heading')) {
        equal(remainder.data.level, 4)
        equal(remainder.data.align, 'right')
      }
      equal(saved.find(block => block.type === 'paragraph').data.level, undefined, 'source-only properties must not leak to a neutral target')
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, saved)
    })
  }
  test('both unselected cross-block heading remainders keep their own schema', () => {
    const editor = make([
      { id: 'a', type: 'heading', data: { text: 'ABCDE', level: 4, align: 'right' } },
      { id: 'b', type: 'heading', data: { text: 'FGHIJ', level: 5, align: 'center' } },
    ], { plugins: [new Paragraph(), new Heading()] })
    selectNative(editor.blocks.getBlockById('a').contentElement, 1, editor.blocks.getBlockById('b').contentElement, 2)
    convertSelection(editor, 'paragraph')
    const saved = editor.save().blocks
    equal(saved.map(block => block.data.text), ['A', 'BCDE', 'FG', 'HIJ'])
    equal(saved[0].data, { text: 'A', level: 4, align: 'right' })
    equal(saved[3].data, { text: 'HIJ', level: 5, align: 'center' })
  })
  test('source remainder retains plugin-specific settings as well as opaque inline metadata', () => {
    class ConfiguredHeading extends Heading {
      render(data, context) { const element = super.render(data, context); element.dataset.customMode = data.customMode ?? 'default'; return element }
      save(element) { return { ...super.save(element), customMode: element.dataset.customMode } }
    }
    const inline = { w: { type: 'missing', data: { name: 'KEEP' } } }
    const editor = make([{ id: 'a', type: 'heading', data: { text: 'AB{{w}}', level: 3, customMode: 'author-choice' }, inline }], { plugins: [new Paragraph(), new ConfiguredHeading()] })
    select(editor.blocks.getBlockById('a').contentElement, 0, 1)
    convertSelection(editor, 'paragraph')
    const remainder = editor.save().blocks[1]
    equal(remainder.data, { text: 'B{{w}}', level: 3, customMode: 'author-choice' })
    equal(remainder.inline, inline)
  })
  test('failure rendering a source remainder rolls back the complete conversion', () => {
    class FailingHeading extends Heading {
      render(data) { if (data.text === 'DE') throw new Error('deliberate remainder failure'); return super.render(data) }
    }
    const editor = make([{ id: 'a', type: 'heading', data: { text: 'ABCDE', level: 4 } }], { plugins: [new Paragraph(), new FailingHeading()] })
    const before = editor.save().blocks
    select(editor.blocks.getBlockById('a').contentElement, 1, 3)
    convertSelection(editor, 'paragraph')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
