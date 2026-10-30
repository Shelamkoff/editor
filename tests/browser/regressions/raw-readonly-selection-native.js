import { createParagraphPlugin, createRawPlugin } from '../../../plugins/index.js'
import { test, make, para, blockElement, equal } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'

test('Raw read-only round trip retains a backward literal source range for native editing', async () => {
  const source = '<p>Alpha &amp; Beta</p>\n<p>Bravo</p>'
  const editor = make([para('before', 'Before'), { id: 'raw', type: 'raw', dataVersion: 1, data: { html: source } }, para('after', 'After')], {
    plugins: [createParagraphPlugin(), createRawPlugin()], injectStyles: true,
  })
  const field = () => blockElement(editor, 'raw').querySelector('textarea')
  const before = editor.save().blocks
  editor.blocks.focus('raw', { fieldKey: 'html', offset: 8 })
  for (let index = 0; index < 5; index++) await dispatchKey('ArrowLeft', 'ArrowLeft', 37, 8)
  equal([field().selectionStart, field().selectionEnd, field().selectionDirection], [3, 8, 'backward'])

  editor.setReadOnly(true)
  equal(blockElement(editor, 'raw').querySelector('iframe')?.srcdoc, source)
  editor.setReadOnly(false)
  await clickNative(blockElement(editor, 'raw').querySelector('.oe-raw__toggle'))

  equal(document.activeElement, field(), 'Returning from read-only preview did not focus source')
  equal([field().selectionStart, field().selectionEnd, field().selectionDirection], [3, 8, 'backward'], 'Read-only round trip changed the existing source range')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await printable('X')
  const after = before.map(block => block.id === 'raw' ? { ...block, data: { html: '<p>X &amp; Beta</p>\n<p>Bravo</p>' } } : block)
  equal(editor.save().blocks, after)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal([field().selectionStart, field().selectionEnd, field().selectionDirection], [3, 8, 'backward'])
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
  equal([field().selectionStart, field().selectionEnd], [4, 4])
})
