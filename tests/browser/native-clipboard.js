import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { restoreSelectionByOffsets } from '../../shared/textOffset.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../core/ClipboardFragment.js'
import { test, make, para, editableField, editorRoot, select, assert, equal, texts, run } from './regressions/harness.js'
import { dispatchKey, selectAcross, decodeInline } from './native-input-helpers.js'

for (const backwards of [false, true]) {
  test(`physical Ctrl+X cuts the full ${backwards ? 'backward' : 'forward'} cross-block selection`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editableField(editor, 'a')
    const last = editableField(editor, 'b')
    await selectAcross(editor, first, 2, last, 3, backwards)
    let cuts = 0
    editorRoot(editor).addEventListener('cut', event => { assert(event.isTrusted, 'native cut event was synthesized'); cuts++ }, { once: true })
    await dispatchKey('x', 'KeyX', 88, 2)
    equal(cuts, 1, 'native cut event was not delivered')
    equal(texts(editor), ['Alvo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
    editor.redo()
    equal(texts(editor), ['Alvo'])
  })
}

for (const backwards of [false, true]) {
  for (const operation of ['copy', 'cut']) {
    test(`native ${operation}/paste preserves a ${backwards ? 'backward' : 'forward'} fragment between independent editors`, async () => {
      const source = make([para('a', 'Alpha'), para('b', 'Bravo')])
      const destination = make([para('target', '')])
      await selectAcross(source, editableField(source, 'a'), 2, editableField(source, 'b'), 3, backwards)
      let copied = null
      editorRoot(source).addEventListener(operation, event => {
        assert(event.isTrusted, 'clipboard event was synthesized')
        copied = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
      }, { once: true })
      await dispatchKey(operation === 'copy' ? 'c' : 'x', operation === 'copy' ? 'KeyC' : 'KeyX', operation === 'copy' ? 67 : 88, 2)
      assert(copied, 'native clipboard did not receive the private fragment')
      equal(texts(source), operation === 'copy' ? ['Alpha', 'Bravo'] : ['Alvo'])
      const target = editableField(destination, 'target')
      select(target, 0)
      let received = null
      editorRoot(destination).addEventListener('paste', event => {
        assert(event.isTrusted, 'paste event was synthesized')
        received = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
      }, { once: true })
      await dispatchKey('v', 'KeyV', 86, 2)
      equal(received, copied, 'private MIME did not survive native clipboard transfer')
      equal(texts(destination), ['pha', 'Bra'])
      destination.undo()
      equal(texts(destination), [''])
      equal(destination.canUndo, false, 'native paste was not one history entry')
      destination.redo()
      equal(texts(destination), ['pha', 'Bra'])
      if (operation === 'cut') {
        source.undo()
        equal(texts(source), ['Alpha', 'Bravo'])
        equal(source.canUndo, false, 'native cut was not one history entry')
      }
    })
  }
}

test('native private clipboard carries only the selected atomic widget', async () => {
  const options = () => ({ inlinePlugins: [createColorSwatchPlugin()] })
  const source = make([para('widgets', 'A{{selected}}B{{outside}}C', { inline: {
    selected: { type: 'color', dataVersion: 1, data: { value: '#ff0000' } },
    outside: { type: 'color', dataVersion: 1, data: { value: '#00ff00' } },
  } })], options())
  const destination = make([para('target', '')], options())
  const field = editableField(source, 'widgets')
  field.focus()
  restoreSelectionByOffsets(field, 0, 3)
  let copied = null
  editorRoot(source).addEventListener('copy', event => {
    assert(event.isTrusted, 'widget copy event was synthesized')
    copied = JSON.parse(event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME))
  }, { once: true })
  await dispatchKey('c', 'KeyC', 67, 2)
  assert(copied, 'widget copy did not populate private MIME')
  const values = copied.parts.flatMap(part => Object.values(part.inline ?? {}).map(item => item.data.value))
  equal(values, ['#ff0000'], 'clipboard leaked an unselected widget payload')
  select(editableField(destination, 'target'), 0)
  await dispatchKey('v', 'KeyV', 86, 2)
  equal(decodeInline(destination), ['A#ff0000B'])
  const widget = editorRoot(destination).querySelector('[data-inline-plugin="color"]')
  assert(widget instanceof HTMLElement && widget.contentEditable === 'false', 'pasted widget lost its atomic projection')
  destination.undo()
  equal(texts(destination), [''])
  destination.redo()
  equal(decodeInline(destination), ['A#ff0000B'])
})

await run()
