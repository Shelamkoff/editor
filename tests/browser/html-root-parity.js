import { createHeadingPlugin, createParagraphPlugin } from '../../plugins/index.js'
import { test, make, para, editableField, select, paste, equal, texts } from './regressions/harness.js'

// Register in native-clipboard's existing runner. These cases use the actual
// editor, sanitizers, logical range planner and history, not a parser mock.
for (const [name, html, expected] of [
  ['sibling div roots', '<div>A</div><div>B</div>', ['abcAghi', 'B']],
  ['formatted div roots', '<div><b>A</b></div><div><i>B</i></div>', ['abc<b>A</b>ghi', '<i>B</i>']],
  ['text around a div root', 'prefix<div>A</div>suffix', ['abcprefixghi', 'A', 'suffix']],
  ['empty div roots between text', '<div>A</div><div></div><div>B</div>', ['abcAghi', 'B']],
  ['unregistered heading roots', '<h2>A</h2><h3>B</h3>', ['abcDEFghi', 'A', 'B']],
  ['single div remains local', '<div>A <b>B</b></div>', ['abcA <b>B</b>ghi']],
]) {
  test(`external HTML root parity: ${name}`, async () => {
    const editor = make([para('a', 'abcDEFghi')])
    const target = editableField(editor, 'a')
    select(target, 3, 6)
    await paste(target, { 'text/html': html, 'text/plain': 'must not use plain fallback' })
    equal(texts(editor), expected)
    equal(editor.save().blocks.map(block => block.type), expected.map(() => 'paragraph'))
    equal(editor.undo(), true)
    equal(texts(editor), ['abcDEFghi'])
    equal(editor.canUndo, false, 'one HTML Paste must produce one history entry')
    equal(editor.redo(), true)
    equal(texts(editor), expected)
  })
}

test('external HTML root parity: fallback blocks use the default type, not the current heading', async () => {
  const editor = make([{
    id: 'a', type: 'heading', dataVersion: 2, data: { text: 'abcDEFghi', level: 3 },
  }], {
    plugins: [createParagraphPlugin(), createHeadingPlugin()],
    defaultBlock: 'paragraph',
  })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, { 'text/html': '<div>A</div><div>B</div>', 'text/plain': 'A\nB' })
  equal(texts(editor), ['abcAghi', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['heading', 'paragraph'])
  equal(editor.save().blocks[0].data.level, 3)
  equal(editor.undo(), true)
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.save().blocks[0].type, 'heading')
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(texts(editor), ['abcAghi', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['heading', 'paragraph'])
})

test('external HTML root parity: a registered div importer retains structural ownership', async () => {
  const paragraph = createParagraphPlugin({ injectStyles: false })
  const custom = Object.freeze({
    ...paragraph,
    type: 'custom-div',
    capabilities: Object.freeze({
      ...paragraph.capabilities,
      htmlImport: Object.freeze({
        matchesRoot: element => element.tagName === 'DIV',
        importRoot: (element, context) => ({ text: context.serializeRichText(element) }),
      }),
    }),
  })
  const editor = make([para('a', 'abcDEFghi')], { plugins: [paragraph, custom] })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, { 'text/html': '<div>A</div><div>B</div>', 'text/plain': 'A\nB' })
  equal(texts(editor), ['abcDEFghi', 'A', 'B'])
  equal(editor.save().blocks.map(block => block.type), ['paragraph', 'custom-div', 'custom-div'])
  equal(editor.undo(), true)
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(texts(editor), ['abcDEFghi', 'A', 'B'])
})
