import './html-root-parity.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createParagraphPlugin, createTablePlugin } from '../../plugins/index.js'
import { restoreSelectionByOffsets } from '../../shared/textOffset.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../core/ClipboardFragment.js'
import { test, make, para, editableField, editorRoot, select, paste, assert, equal, texts, run } from './regressions/harness.js'
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

test('external multi-paragraph HTML replaces a local selection and is one Undo step', async () => {
  const editor = make([para('a', 'abcDEFghi')])
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, {
    'text/html': '<p>X</p><p>Y</p>',
    'text/plain': 'X\nY',
  })
  equal(texts(editor), ['abcXghi', 'Y'], 'leading paragraph did not replace selected text')
  assert(editor.canUndo, 'HTML paste was not recorded as an authored edit')
  editor.undo()
  equal(texts(editor), ['abcDEFghi'], 'Undo must restore selected author text and remove inserted block')
  equal(editor.canUndo, false, 'the paste created more than one history entry')
  editor.redo()
  equal(texts(editor), ['abcXghi', 'Y'])
})

test('external structural-first HTML does not delete selected paragraph text', async () => {
  const editor = make([para('a', 'abcDEFghi')], {
    plugins: [createParagraphPlugin(), createTablePlugin()],
  })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, {
    'text/html': '<table><tr><td>Q</td></tr></table>',
    'text/plain': 'Q',
  })
  const blocks = editor.save().blocks
  equal(blocks.length, 2)
  equal(blocks[0].data.text, 'abcDEFghi', 'structural-first HTML erased selected author text')
  equal(blocks[1].type, 'table')
  equal(blocks[1].data.rows[0].cells[0].text, 'Q')
  editor.undo()
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.canUndo, false)
  editor.redo()
  equal(editor.save().blocks[0].data.text, 'abcDEFghi')
  equal(editor.save().blocks[1].type, 'table')
})


test('failed owned Cut preserves both canonical model and native contenteditable text', async () => {
  const paragraph = createParagraphPlugin({ injectStyles: false })
  const failing = Object.freeze({
    ...paragraph,
    type: 'cut-failure',
    capabilities: Object.freeze({
      clipboard: Object.freeze({
        slice() { throw new Error('expected clipboard slice failure') },
      }),
    }),
  })
  const editor = make([{
    id: 'a', type: 'cut-failure', dataVersion: failing.schema.currentVersion,
    data: { text: 'Alpha' },
  }], { plugins: [paragraph, failing] })
  const field = editableField(editor, 'a')
  const before = editor.save().blocks
  select(field, 1, 4)
  let nativeCuts = 0
  editorRoot(editor).addEventListener('cut', event => {
    assert(event.isTrusted, 'Cut rejection was not tested with a native keyboard event')
    nativeCuts++
    assert(event.defaultPrevented, 'Rector failed to cancel destructive native Cut')
  }, { once: true })
  await dispatchKey('x', 'KeyX', 88, 2)
  equal(nativeCuts, 1)
  equal(field.textContent, 'Alpha', 'Browser removed selected text after rejected Cut')
  equal(editor.save().blocks, before, 'Rejected Cut mutated canonical model')
  equal(editor.canUndo, false, 'Rejected Cut created a history entry')
})

test('editor chrome button keeps native clipboard ownership with selected blocks', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  editor.blocks.select(['a'])
  const root = editorRoot(editor)
  const button = document.createElement('button')
  button.textContent = 'Independent auxiliary control'
  root.appendChild(button)
  const before = editor.save().blocks
  try {
    for (const type of ['copy', 'cut', 'paste']) {
      const clipboard = new DataTransfer()
      const event = new ClipboardEvent(type, {
        bubbles: true, cancelable: true, clipboardData: clipboard,
      })
      button.dispatchEvent(event)
      assert(!event.defaultPrevented,
        'editor chrome button lost native ' + type + ' ownership to an old selection')
      equal(clipboard.getData(CLIPBOARD_FRAGMENT_MIME), '',
        'editor exposed selected canonical block data to a toolbar button')
      equal(editor.save().blocks, before)
    }
  } finally {
    button.remove()
    editor.blocks.clearSelection()
  }
})

await run()
