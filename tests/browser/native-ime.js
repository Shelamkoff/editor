import { getTextOffset } from '../../shared/textOffset.js'
import { createParagraphPlugin, createQuotePlugin } from '../../plugins/index.js'
import { test, make, para, editableField, editorRoot, select, pause, assert, equal, texts, run } from './regressions/harness.js'
import { selectAcross, dragAcross, dispatchKey } from './native-input-helpers.js'

async function composition(editor, unchanged, final = '日本') {
  const events = []
  const couldUndo = editor.canUndo
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
    editorRoot(editor).addEventListener(type, event => {
      // Chrome marks compositionstart/update as trusted. CDP insertText's
      // engine-generated compositionend is untrusted; no DOM event is dispatched
      // by this fixture. This exercises the engine, not a physical OS IME.
      if (type !== 'compositionend') assert(event.isTrusted, `${type} was synthesized`)
      events.push({ type, data: event.data, trusted: event.isTrusted })
    })
  }
  for (const text of ['に', '日本']) {
    // Windows IMEs announce candidate processing with keyCode 229 before
    // Chrome receives the composition text from the platform input method.
    await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', windowsVirtualKeyCode: 229 })
    await window.__testInput('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
    await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', windowsVirtualKeyCode: 229 })
    await pause(20)
    equal(editor.save().blocks, unchanged, 'an unfinished composition changed canonical data')
    equal(editor.canUndo, couldUndo, 'preedit changed history availability')
    assert(editorRoot(editor).textContent.includes(text), 'native preedit was not displayed')
  }
  if (final) await window.__testInput('Input.insertText', { text: final })
  else await window.__testInput('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
  await pause(30)
  equal(events.filter(event => event.type === 'compositionstart').length, 1)
  equal(events.filter(event => event.type === 'compositionend').map(event => event.data), [final])
}

test('native browser IME commits one paragraph once and keeps its caret', async () => {
  const editor = make([para('a', 'AB')])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 1)
  await composition(editor, before)
  equal(texts(editor), ['A日本B'])
  const field = editableField(editor, 0)
  const selection = window.getSelection()
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 3, 'IME caret precedes committed text')
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'IME commit was not one history entry')
  editor.redo()
  equal(texts(editor), ['A日本B'])
})

for (const backwards of [false, true]) test(`native browser IME replaces the full ${backwards ? 'backward' : 'forward'} cross-block selection atomically`, async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  await selectAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backwards)
  await composition(editor, before)
  equal(texts(editor), ['Al日本vo'])
  const field = editableField(editor, 0)
  const selection = window.getSelection()
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 4, 'cross-block IME caret precedes committed text')
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'cross-block IME created extra history')
  editor.redo()
  equal(texts(editor), ['Al日本vo'])
})

test('cancelling native cross-block IME keeps data, history and backward selection', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  await selectAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, true)
  await composition(editor, before, '')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  const selection = window.getSelection()
  equal(getTextOffset(editableField(editor, 'b'), selection.anchorNode, selection.anchorOffset), 3)
  equal(getTextOffset(editableField(editor, 'a'), selection.focusNode, selection.focusOffset), 2)
  equal(selection.getRangeAt(0).toString(), 'phaBra', 'IME cancellation lost part of the DOM range')
  equal(editor.blocks.selectedIds(), ['a', 'b'])
})

test('native IME replaces a whole document including opaque boundary blocks', async () => {
  const opaque = id => ({ id, type: 'future-block', dataVersion: 9, data: { secret: id } })
  const editor = make([opaque('first'), para('a', 'Alpha'), opaque('last')])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 0)
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('a', 'KeyA', 65, 2)
  await composition(editor, before)
  equal(texts(editor), ['日本'])
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('native IME replaces both quote fields in one history entry', async () => {
  const editor = make([{ id: 'q', type: 'quote', dataVersion: 1, data: { text: 'Alpha', caption: 'Bravo' } }], {
    plugins: [createParagraphPlugin(), createQuotePlugin()],
  })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'q', '.oe-quote__text'), 2, editableField(editor, 'q', '.oe-quote__caption'), 3, true)
  await composition(editor, before)
  equal(editor.save().blocks[0].data, { text: 'Al日本', caption: 'vo' })
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('successive IME confirmations remain separate Undo gestures', async () => {
  const editor = make([para('a', '')])
  select(editableField(editor, 'a'), 0)
  await composition(editor, editor.save().blocks)
  await composition(editor, editor.save().blocks)
  equal(texts(editor), ['日本日本'])
  editor.undo()
  equal(texts(editor), ['日本'], 'one Undo removed two IME confirmations')
  editor.undo()
  equal(texts(editor), [''])
})

test('native IME completion cannot overwrite a replacement document', async () => {
  const editor = make([para('a', 'AB')])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 1)
  await window.__testInput('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  editor.render({ version: '2.0.0', blocks: [para('new', 'Replacement')] })
  await window.__testInput('Input.insertText', { text: '日本' })
  await pause(30)
  equal(texts(editor), ['Replacement'])
  equal(editableField(editor, 'new').textContent, 'Replacement')
  editor.undo()
  equal(editor.save().blocks, before, 'IME completion added history after host render')
  equal(editor.canUndo, false)
})

test('read-only transition discards native preedit before editing resumes', async () => {
  const editor = make([para('a', 'AB')])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 1)
  await window.__testInput('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  editor.setReadOnly(true)
  editor.setReadOnly(false)
  await pause(30)
  equal(editor.save().blocks, before)
  equal(editableField(editor, 'a').textContent, 'AB', 'revoked preedit remains in the editable projection')
  equal(editor.canUndo, false)
  select(editableField(editor, 'a'), 1)
  await window.__testInput('Input.insertText', { text: 'X' })
  equal(texts(editor), ['AXB'], 'subsequent typing committed revoked preedit')
  editor.undo()
  equal(editor.save().blocks, before)
})

await run()
