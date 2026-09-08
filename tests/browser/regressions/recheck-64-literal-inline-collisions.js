import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, select, key, paste, equal, assert } from './harness.js'

const payload = { type: 'missing', data: { name: 'KEEP', nested: { id: 42 } } }
function checkTransfer(block, prefix) {
  assert(block.data.text.startsWith(prefix), 'the authored literal must remain unchanged')
  equal(Object.hasOwn(block.inline ?? {}, 'w'), false, 'the literal cannot acquire transferred data')
  equal(Object.values(block.inline ?? {}), [payload])
  const tokens = [...block.data.text.matchAll(/\{\{([\w-]+)\}\}/g)]
  equal(tokens.filter(([, id]) => Object.hasOwn(block.inline ?? {}, id)).length, 1)
}
export function register() {
  for (const action of ['Backspace', 'Delete']) {
    test(`${action} merge preserves a literal token beside a transferred reference`, () => {
      const editor = make([para('a', 'A{{w}}'), para('b', 'B{{w}}Z', { inline: { w: payload } })])
      const before = editor.save().blocks
      const field = editor.blocks.getBlockById(action === 'Backspace' ? 'b' : 'a').contentElement
      select(field, action === 'Backspace' ? 0 : field.textContent.length)
      key(field, action)
      const merged = editor.save().blocks
      equal(merged.length, 1, 'merge must actually execute')
      checkTransfer(merged[0], 'A{{w}}B')
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, merged)
    })
  }
  for (const format of ['plain', 'html']) {
    test(`multiline ${format} paste does not bind its literal token to the original suffix`, async () => {
      const editor = make([para('a', 'A{{w}}Z', { inline: { w: payload } })])
      const before = editor.save().blocks
      const field = editor.blocks.getBlockById('a').contentElement
      select(field, 1)
      await paste(field, format === 'plain' ? { 'text/plain': 'X\n{{w}}' } : { 'text/html': '<p>X</p><p>{{w}}</p>' })
      const after = editor.save().blocks
      equal(after.length, 2)
      equal(after[0].data.text, 'AX')
      checkTransfer(after[1], '{{w}}')
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, after)
    })
  }
  test('a literal token does not turn into a second live color after merge and reload', () => {
    const color = { type: 'color', data: { value: '#ff0000' } }
    const editor = make([para('a', 'A{{w}}'), para('b', 'B{{w}}Z', { inline: { w: color } })], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockById('b').contentElement
    select(field, 0); key(field, 'Backspace')
    const saved = editor.save()
    equal(saved.blocks.length, 1)
    equal(Object.hasOwn(saved.blocks[0].inline, 'w'), false)
    editor.render(saved)
    equal(editor.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
    assert(editor.blocks.getBlockByIndex(0).contentElement.textContent.startsWith('A{{w}}B'))
  })
  test('literal tokens nested in author formatting reserve their IDs during merge', () => {
    const editor = make([para('a', 'A<b>{{w}}</b>'), para('b', 'B{{w}}Z', { inline: { w: payload } })])
    const field = editor.blocks.getBlockById('b').contentElement
    select(field, 0); key(field, 'Backspace')
    checkTransfer(editor.save().blocks[0], 'A<b>{{w}}</b>B')
  })
  test('token-like attributes are not text references and do not force remapping', () => {
    const editor = make([para('a', '<a href="https://example.test/{{w}}">A</a>'), para('b', 'B{{w}}Z', { inline: { w: payload } })])
    const field = editor.blocks.getBlockById('b').contentElement
    select(field, 0); key(field, 'Backspace')
    equal(editor.save().blocks[0].inline, { w: payload })
  })
  test('two real references with the same source ID still stay independent', () => {
    const left = { type: 'missing', data: { name: 'LEFT' } }
    const editor = make([para('a', 'A{{w}}', { inline: { w: left } }), para('b', 'B{{w}}', { inline: { w: payload } })])
    const field = editor.blocks.getBlockById('b').contentElement
    select(field, 0); key(field, 'Backspace')
    equal(Object.values(editor.save().blocks[0].inline), [left, payload])
  })
}
