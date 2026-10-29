import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { replaceRichTextRange, scanRichTextPlaceholders, getRichTextLogicalLength } from '../../shared/richTextOperations.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { test, assert, equal, make, para, editableField, select, paste, key, run } from './regressions/harness.js'

const colors = blocks => blocks.flatMap(block => Object.values(block.inline ?? {}).map(ref => ref.data.value))
const visible = editor => editor.save().blocks.map(block => {
  const element = document.createElement('div')
  element.innerHTML = block.data.text
  return element.textContent.replace(/\{\{([\w-]+)\}\}/g, (text, id) => block.inline?.[id]?.data.value ?? text)
})

test('matched paste inserts owned references, keeps surrounding text and restores one complete history action', async () => {
  const editor = make([para('a', 'LeftRight')], { inlinePlugins: [createColorSwatchPlugin()] })
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 4)
  await paste(editableField(editor, 'a'), { 'text/plain': '#f00 tail' })
  const after = editor.save().blocks
  equal(colors(after), ['#f00'])
  equal(visible(editor), ['Left#f00 tailRight'])
  const field = editableField(editor, 'a'), selection = window.getSelection()
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 10)
  assert(editor.undo())
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  assert(editor.redo())
  equal(editor.save().blocks, after)
})

test('multiline matched paste partitions references and retains the trailing target suffix', async () => {
  const editor = make([para('a', 'ABCD')], { inlinePlugins: [createColorSwatchPlugin()] })
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 2)
  await paste(editableField(editor, 'a'), { 'text/plain': '#f00 first\n#0f0 last' })
  const after = editor.save().blocks
  equal(colors(after), ['#f00', '#0f0'])
  equal(visible(editor), ['AB#f00 first', '#0f0 lastCD'])
  equal(after.map(block => Object.keys(block.inline ?? {}).length), [1, 1])
  const field = editableField(editor, 1), selection = window.getSelection()
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 6)
  assert(editor.undo())
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  assert(editor.redo())
  equal(editor.save().blocks, after)
})

for (const delimiter of [' ', 'Enter']) {
  test(`typed Color ${JSON.stringify(delimiter)} uses the same owned-reference transfer`, () => {
    const editor = make([para('a', '#f00')], { inlinePlugins: [createColorSwatchPlugin()] })
    const before = editor.save().blocks
    const field = editableField(editor, 'a')
    select(field, 4)
    assert(key(field, delimiter).defaultPrevented, 'matched delimiter was not owned')
    equal(colors(editor.save().blocks), ['#f00'])
    equal(visible(editor), [delimiter === ' ' ? '#f00 ' : '#f00'])
    equal(editor.blocks.count, 1)
    assert(editor.undo())
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}

test('mixed transfer protects author literals and HTML while retaining explicit references', () => {
  const inline = { x: { type: 'future', dataVersion: 9, data: {} }, y: { type: 'future', dataVersion: 9, data: {} } }
  const html = replaceRichTextRange('L{{x}}R', inline, { start: 2, end: 2 }, {
    kind: 'segments', segments: [
      { kind: 'text', text: '{{x}}<img src=x>' },
      { kind: 'inline-reference', id: 'y' },
      { kind: 'text', text: '{{' }, { kind: 'text', text: 'y}}' },
    ],
  }, document)
  const node = document.createElement('div')
  node.innerHTML = html
  equal(node.querySelector('img'), null, 'author text became executable markup')
  equal(node.textContent, 'L{{x}}{{x}}<img src=x>{{y}}{{y}}R')
  equal([...scanRichTextPlaceholders(html, inline, document).occurrences], [['x', 1], ['y', 1]])
  equal(node.querySelectorAll('.oe-inline-literal').length, 2)
  equal(getRichTextLogicalLength(html, inline, document), 1 + 1 + '{{x}}<img src=x>'.length + 1 + 5 + 1)
})

test('mixed transfer rejects undeclared references and nested or sparse parts before exposing output', () => {
  const inline = Object.create({ inherited: { type: 'future', dataVersion: 1, data: {} } })
  for (const segments of [
    [{ kind: 'inline-reference', id: 'missing' }],
    [{ kind: 'inline-reference', id: 'inherited' }],
    [{ kind: 'html', html: '<b>not a declared segment</b>' }],
    [{ kind: 'segments', segments: [] }],
    new Array(1),
  ]) {
    let failed = false
    try { replaceRichTextRange('Original', inline, { start: 0, end: 0 }, { kind: 'segments', segments }, document) }
    catch { failed = true }
    assert(failed, 'invalid transfer segment was silently accepted')
  }
})

await run()
