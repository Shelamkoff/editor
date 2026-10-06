
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { test, make, blockElement, editorRoot, equal, assert, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

test('Escape cancels the color widget preview, releases its popup, and returns keyboard focus', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const before = editor.save().blocks, root = editorRoot(editor)
  const swatch = blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]')
  await clickNative(swatch)
  const input = root.querySelector('.oe-ip-popup .oe-color-hex')
  assert(input)
  await clickNative(input)
  await dispatchKey('a', 'KeyA', 65, 2)
  for (const character of '#ff0000') await printable(character)
  await dispatchKey('Tab', 'Tab', 9)
  equal(swatch.querySelector('.oe-ip__label').textContent, '#ff0000')
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('Escape', 'Escape', 27)
  assert(!root.querySelector('.oe-ip-popup'), 'Escape retained the owned color popup')
  equal(swatch.querySelector('.oe-ip__label').textContent, '#123456')
  equal(document.activeElement, swatch)
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('Enter', 'Enter', 13)
  assert(root.querySelector('.oe-ip-popup'), 'Escape did not restore keyboard access to the widget')
  editor.setReadOnly(true)
  assert(!root.querySelector('.oe-ip-popup'))
  editor.destroy()
  assert(!document.querySelector('.oe-ip-popup'))
})

for (const action of ['delete-block', 'destroy-editor']) test('Open color popup cleans up after ' + action + ' without accessing a revoked widget', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_color}}' }, inline: { w_color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }], { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true })
  const errors = [], originalError = console.error
  console.error = (...args) => { if (args[0] === 'Inline popup cleanup failed') errors.push(args); else originalError(...args) }
  try {
    await clickNative(blockElement(editor, 'a').querySelector('[data-inline-plugin="color"]'))
    assert(editorRoot(editor).querySelector('.oe-ip-popup'))
    if (action === 'delete-block') editor.blocks.remove('a')
    else editor.destroy()
    await pause(50)
    assert(!document.querySelector('.oe-ip-popup'), 'Deleted widget kept its popup')
    equal(errors.length, 0, 'Popup cleanup read from a revoked widget')
  } finally { console.error = originalError; editor.destroy() }
})

await run()
