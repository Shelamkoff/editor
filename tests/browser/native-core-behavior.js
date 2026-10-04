import { test, make, para, editableField, blockElement, editorRoot, select, pause, equal, assert, run } from './regressions/harness.js'
import { dispatchKey, dragAcross, printable, clickNative } from './native-input-helpers.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../core/ClipboardFragment.js'
import { createParagraphPlugin, createHeadingPlugin, createCodePlugin, createQuotePlugin } from '../../plugins/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'

function caret(editor, id, offset, selector) {
  const field = editableField(editor, id, selector)
  const native = window.getSelection()
  assert(document.activeElement === field, 'Core command lost the editing host focus')
  assert(native.isCollapsed && field.contains(native.anchorNode), 'Core command lost its collapsed caret')
  equal(getTextOffset(field, native.anchorNode, native.anchorOffset), offset)
}

test('Ctrl+A on Russian layout selects the field and then the whole document as in v1', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  await dispatchKey('ф', 'KeyA', 65, 2)
  equal(window.getSelection().toString(), 'Alpha', 'First Ctrl+A did not select the current field')
  equal(editor.blocks.selectedIds(), [])
  await dispatchKey('ф', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), ['a', 'b'], 'Second Ctrl+A did not select whole blocks')
})

test('Ctrl+A expands a partial text selection to the whole document as in v1', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
  select(editableField(editor, 'a'), 1, 3)
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), ['a', 'b'])
})

test('Ctrl+A cycles from whole blocks back to the current field as in v1', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), ['a', 'b'])
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), [], 'Third Ctrl+A retained the whole-block selection')
  equal(window.getSelection().toString(), 'Alpha')
  equal(editor.canUndo, false, 'Selection-only commands created document history')
})

test('Russian Ctrl+B formats a backward cross-block selection as one undoable action', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
    injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['bold'] }),
  })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 5, true)
  await dispatchKey('и', 'KeyB', 66, 2)
  equal(editor.save().blocks.map(block => block.data.text), ['<b>Alpha</b>', '<b>Bravo</b>'])
  await dispatchKey('я', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('Н', 'KeyY', 89, 2)
  equal(editor.save().blocks.map(block => block.data.text), ['<b>Alpha</b>', '<b>Bravo</b>'])
})

test('Russian history shortcuts work when editor chrome owns focus', async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AlXpha')
  // A block shell is editor chrome, with no contenteditable native history fallback.
  const shell = editorRoot(editor).querySelector('[data-block-id="a"]')
  shell.tabIndex = -1
  shell.focus()
  assert(document.activeElement === shell)
  await dispatchKey('я', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, 'Alpha')
  shell.focus()
  await dispatchKey('Я', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.text, 'AlXpha')
})

test('native block drag preserves DOM identity and the caret through Undo/Redo', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')], { injectStyles: true })
  await clickNative(editableField(editor, 'a'))
  editor.blocks.focus('a', { offset: 2 })
  const before = editor.save().blocks
  const shells = ['a', 'b', 'c'].map(id => blockElement(editor, id))
  const handle = editorRoot(editor).querySelector('.oe-toolbar__drag')
  const from = handle.getBoundingClientRect()
  const last = blockElement(editor, 'c').getBoundingClientRect()
  let trusted = false
  handle.addEventListener('pointerdown', event => { trusted = event.isTrusted }, { once: true })
  await window.__testInput('Input.drag', {
    from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
    to: { x: from.left + from.width / 2, y: last.bottom + 100 },
  })
  await pause(30)
  assert(trusted, 'Block drag did not start with a trusted pointer')
  equal(editor.save().blocks.map(block => block.id), ['b', 'c', 'a'])
  assert(['a', 'b', 'c'].every((id, index) => blockElement(editor, id) === shells[index]), 'Block drag rebuilt unaffected DOM')
  caret(editor, 'a', 2)
  const after = editor.save().blocks
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  caret(editor, 'a', 2)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 2)
})

for (const [key, code, keyCode] of [['Backspace', 'Backspace', 8], ['Delete', 'Delete', 46]]) {
  test(`Ctrl+${key} removes the entire cross-block selection with one Undo/Redo`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, true)
    await dispatchKey(key, code, keyCode, 2)
    equal(editor.save().blocks.map(block => block.data.text), ['Alvo'])
    caret(editor, 'a', 2)
    const after = editor.save().blocks
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(editor, 'a', 2)
  })
}

test('Delete removes host-selected disjoint whole blocks as in v1', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie'), para('d', 'Delta')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  const before = editor.save().blocks
  editor.blocks.select(['d', 'b'])
  equal(editor.blocks.selectedIds(), ['b', 'd'])
  await dispatchKey('Delete', 'Delete', 46)
  equal(editor.save().blocks, [before[0], before[2]], 'Delete ignored the explicit whole-block selection')
  equal(editor.blocks.selectedIds(), [])
  caret(editor, 'c', 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, [before[0], before[2]])
  caret(editor, 'c', 0)
})

test('Typing replaces only host-selected whole blocks, preserves gaps and restores the insertion caret', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie'), para('d', 'Delta')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  const before = editor.save().blocks
  editor.blocks.select(['b', 'd'])
  await printable('X')
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['Alpha', 'X', 'Charlie'])
  equal(after[0], before[0])
  equal(after[2], before[2])
  caret(editor, after[1].id, 1)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, after[1].id, 1)
})

for (const operation of ['copy', 'cut']) {
  test(`Native ${operation}/paste transfers only host-selected disjoint blocks in document order`, async () => {
    const source = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie'), para('d', 'Delta')], { injectStyles: true })
    const target = make([para('t', '')], { injectStyles: true })
    source.blocks.focus('a', { offset: 2 })
    const before = source.save().blocks
    source.blocks.select(['d', 'b'])
    let payload
    editorRoot(source).addEventListener(operation, event => {
      assert(event.isTrusted, 'Whole-block clipboard event was synthesized')
      payload = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
    }, { once: true })
    await dispatchKey(operation === 'copy' ? 'c' : 'x', operation === 'copy' ? 'KeyC' : 'KeyX', operation === 'copy' ? 67 : 88, 2)
    assert(payload, 'Host-selected blocks were not exported to private clipboard')
    equal(source.save().blocks, operation === 'cut' ? [before[0], before[2]] : before)
    if (operation === 'cut') caret(source, 'c', 0)
    target.blocks.focus('t', { offset: 0 })
    await dispatchKey('v', 'KeyV', 86, 2)
    equal(target.save().blocks.map(block => block.data.text), ['Bravo', 'Delta'])
    target.undo()
    equal(target.save().blocks.map(block => block.data.text), [''])
    equal(target.canUndo, false)
    if (operation === 'cut') {
      source.undo()
      equal(source.save().blocks, before)
      equal(source.canUndo, false)
      source.redo()
      equal(source.save().blocks, [before[0], before[2]])
      caret(source, 'c', 0)
    }
  })
}

test('Native paste replaces host-selected blocks and preserves the unselected gap', async () => {
  const source = make([para('s', 'Incoming')], { injectStyles: true })
  source.blocks.focus('s', { offset: 0 })
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('c', 'KeyC', 67, 2)
  const target = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie'), para('d', 'Delta')], { injectStyles: true })
  target.blocks.focus('a', { offset: 2 })
  const before = target.save().blocks
  target.blocks.select(['d', 'b'])
  await dispatchKey('v', 'KeyV', 86, 2)
  const after = target.save().blocks
  equal(after.map(block => block.data.text), ['Alpha', 'Incoming', 'Charlie'])
  equal(after[0], before[0])
  equal(after[2], before[2])
  target.undo()
  equal(target.save().blocks, before)
  equal(target.canUndo, false)
  target.redo()
  equal(target.save().blocks, after)
})

test('Slash Escape and Undo/Redo restore the caret before an untouched suffix', async () => {
  const editor = make([para('a', 'Before--after')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 7 })
  await window.__testInput('Input.insertText', { text: '/hea' })
  await pause(30)
  assert(editorRoot(editor).querySelector('.oe-slash-menu').style.display !== 'none')
  await dispatchKey('Escape', 'Escape', 27)
  equal(editor.save().blocks[0].data.text, 'Before--after')
  caret(editor, 'a', 7)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, 'Before-/hea-after')
  caret(editor, 'a', 11)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.text, 'Before--after')
  caret(editor, 'a', 7)
})

test('Slash Enter inserts the requested block and Redo restores its editing host and caret', async () => {
  const editor = make([para('a', 'Before--after')], {
    injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin()],
  })
  editor.blocks.focus('a', { offset: 7 })
  await window.__testInput('Input.insertText', { text: '/heading' })
  await pause(30)
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.type), ['paragraph', 'heading'])
  equal(after[0].data.text, 'Before--after')
  caret(editor, after[1].id, 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks.map(block => block.data.text), ['Before-/heading-after'])
  caret(editor, 'a', 15)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, after[1].id, 0)
})

test('IME Enter with keyCode 229 does not execute an open slash command', async () => {
  const editor = make([para('a', '')], {
    injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin()],
  })
  editor.blocks.focus('a', { offset: 0 })
  await window.__testInput('Input.insertText', { text: '/heading' })
  await pause(30)
  const before = editor.save().blocks
  let observed
  editorRoot(editor).addEventListener('keydown', event => { observed = event }, { capture: true, once: true })
  await dispatchKey('Enter', 'Enter', 229, 0, '')
  assert(observed?.isTrusted, 'IME processing key was not native')
  assert(!observed.defaultPrevented, 'Slash menu stole the IME confirmation key')
  equal(editor.save().blocks, before)
})

for (const explicit of [true, false]) test(`Inline widget ${explicit ? 'explicit' : 'fresh'} insertion and Undo/Redo retain the caret immediately after the atom`, async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true, inlinePlugins: [createColorSwatchPlugin()] })
  select(editableField(editor, 'a'), 2, 4)
  const before = editor.save().blocks
  assert(editor.insertInlinePlugin('color', explicit ? { value: '#ff0000' } : undefined))
  const after = editor.save().blocks
  caret(editor, 'a', 3)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(window.getSelection().toString(), 'ph')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 3)
})

test('Ctrl+A in a document containing only plain-text Code hosts selects all blocks', async () => {
  const code = createCodePlugin()
  const editor = make(['Alpha', 'Bravo'].map((text, index) => ({
    id: index ? 'b' : 'a', type: 'code', dataVersion: code.schema.currentVersion, data: { code: text, language: 'plaintext' },
  })), { injectStyles: true, plugins: [createParagraphPlugin(), code] })
  editor.blocks.focus('a', { fieldKey: 'code', offset: 2 })
  await dispatchKey('a', 'KeyA', 65, 2)
  const input = document.activeElement
  equal([input.selectionStart, input.selectionEnd], [0, 5])
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), ['a', 'b'])
  const before = editor.save().blocks
  await printable('X')
  const after = editor.save().blocks
  equal(after.map(block => [block.type, block.data.text]), [['paragraph', 'X']])
  caret(editor, after[0].id, 1)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, after[0].id, 1)
})

test('Replacing a document revokes host block selection even when block IDs are reused', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 2 })
  editor.blocks.select(['b'])
  editor.render({ version: '2.0.0', blocks: [para('a', 'New Alpha'), para('b', 'New Bravo')] })
  editor.blocks.focus('a', { offset: 2 })
  await dispatchKey('Delete', 'Delete', 46)
  equal(editor.save().blocks.map(block => block.data.text), ['Ne Alpha', 'New Bravo'], 'Stale whole-block selection deleted replacement data')
})

for (const mode of ['plain-text', 'HTML', 'multiline']) test(`Native external ${mode} paste replaces a local range and preserves the insertion caret on Redo`, async () => {
  const html = mode === 'HTML'
  const multiline = mode === 'multiline'
  const source = document.createElement(html ? 'div' : 'textarea')
  if (html) { source.contentEditable = 'true'; source.innerHTML = '<b>XY</b>' }
  else source.value = multiline ? 'One\nTwo' : 'XY'
  document.body.append(source)
  try {
    source.focus()
    await dispatchKey('a', 'KeyA', 65, 2)
    await dispatchKey('c', 'KeyC', 67, 2)
    const editor = make([para('a', 'Alpha')], { injectStyles: true })
    const before = editor.save().blocks
    select(editableField(editor, 'a'), 2, 4)
    await dispatchKey('v', 'KeyV', 86, 2)
    const after = editor.save().blocks
    equal(after.map(block => block.data.text), multiline ? ['AlOnea', 'Two'] : [html ? 'Al<b>XY</b>a' : 'AlXYa'])
    const caretId = multiline ? after[1].id : 'a'
    const caretOffset = multiline ? 3 : 4
    caret(editor, caretId, caretOffset)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(window.getSelection().toString(), 'ph')
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(editor, caretId, caretOffset)
  } finally { source.remove() }
})

for (const plain of [false, true]) test(`Native IME replaces host-selected ${plain ? 'plain-text' : 'rich-text'} whole blocks once and preserves unselected gaps`, async () => {
  const code = createCodePlugin()
  const blocks = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((text, index) => plain
    ? { id: ['a', 'b', 'c', 'd'][index], type: 'code', dataVersion: code.schema.currentVersion, data: { code: text, language: 'plaintext' } }
    : para(['a', 'b', 'c', 'd'][index], text))
  const editor = make(blocks, { injectStyles: true, plugins: [createParagraphPlugin(), code] })
  editor.blocks.focus('a', { offset: 2 })
  const before = editor.save().blocks
  editor.blocks.select(['b', 'd'])
  await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', windowsVirtualKeyCode: 229 })
  await window.__testInput('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  equal(editor.save().blocks, before, 'Provisional IME text changed canonical data')
  equal(editor.canUndo, false)
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', windowsVirtualKeyCode: 229 })
  await window.__testInput('Input.insertText', { text: '日本' })
  await pause(30)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text ?? block.data.code), ['Alpha', '日本', 'Charlie'])
  caret(editor, after[1].id, 2)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, after[1].id, 2)
})

test('Native editing publishes committed model/DOM/history snapshots and suppresses no-op and destroyed notifications', async () => {
  const changed = []
  const editor = make([para('a', 'Alpha')], { injectStyles: true, changeDebounceMs: 100,
    onChange: document => changed.push(document.blocks[0].data.text),
  })
  const events = []
  editor.on('transaction:committed', event => events.push({
    action: event.action, sequence: event.sequence, frozen: Object.isFrozen(event),
    text: editor.save().blocks[0].data.text, dom: editableField(editor, 'a').textContent,
    canUndo: editor.canUndo, canRedo: editor.canRedo,
  }))
  editor.blocks.focus('a', { offset: 2 })
  await printable('X')
  editor.blocks.update('a', block => ({ data: { ...block.data } }))
  equal(events.length, 1, 'A no-op created a committed transaction')
  await dispatchKey('z', 'KeyZ', 90, 2)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(events.map(event => [event.action, event.text, event.dom, event.canUndo, event.canRedo, event.frozen]), [
    ['commit', 'AlXpha', 'AlXpha', true, false, true],
    ['undo', 'Alpha', 'Alpha', false, true, true],
    ['redo', 'AlXpha', 'AlXpha', true, false, true],
  ])
  assert(events.every((event, index) => !index || event.sequence === events[index - 1].sequence + 1))
  await pause(130)
  equal(changed, ['AlXpha'], 'Debounce delivered an obsolete intermediate snapshot')
  await printable('Y')
  editor.destroy()
  await pause(130)
  equal(changed, ['AlXpha'], 'Destroyed editor delivered a pending onChange callback')
})

test('Ctrl+A selects whole blocks immediately from an empty field and then cycles back as in v1', async () => {
  const editor = make([para('a', ''), para('b', 'Bravo')], { injectStyles: true })
  editor.blocks.focus('a', { offset: 0 })
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), ['a', 'b'])
  await dispatchKey('a', 'KeyA', 65, 2)
  equal(editor.blocks.selectedIds(), [])
  equal(editor.save().blocks.map(block => block.data.text), ['', 'Bravo'])
  equal(editor.canUndo, false)
})

test('Native paste into a toolbar link input never replaces the retained document selection', async () => {
  const source = document.createElement('textarea')
  source.value = 'https://example.test/incoming'
  document.body.append(source)
  try {
    source.focus()
    await dispatchKey('a', 'KeyA', 65, 2)
    await dispatchKey('c', 'KeyC', 67, 2)
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
      injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['link'] }),
    })
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 5, true)
    await clickNative(editorRoot(editor).querySelector('.oe-inline-tool[data-tool="link"]'))
    const input = editorRoot(editor).querySelector('.oe-inline-toolbar__link-input')
    assert(document.activeElement === input, 'Link popup did not focus its native input')
    let trusted = false
    input.addEventListener('paste', event => { trusted = event.isTrusted }, { once: true })
    await dispatchKey('v', 'KeyV', 86, 2)
    assert(trusted, 'Auxiliary paste was not native')
    equal(input.value, source.value)
    equal(editor.save().blocks, before, 'Auxiliary paste changed the authored document')
    equal(editor.canUndo, false)
  } finally { source.remove() }
})

for (const operation of ['copy', 'cut']) test(`Native auxiliary ${operation} leaves the document selection and history untouched`, async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
    injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['link'] }),
  })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 5, true)
  await clickNative(editorRoot(editor).querySelector('.oe-inline-tool[data-tool="link"]'))
  const input = editorRoot(editor).querySelector('.oe-inline-toolbar__link-input')
  await window.__testInput('Input.insertText', { text: 'https://example.test/aux' })
  await dispatchKey('a', 'KeyA', 65, 2)
  let payload
  input.addEventListener(operation, event => {
    assert(event.isTrusted)
    payload = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
  }, { once: true })
  await dispatchKey(operation === 'copy' ? 'c' : 'x', operation === 'copy' ? 'KeyC' : 'KeyX', operation === 'copy' ? 67 : 88, 2)
  equal(payload, '', 'Auxiliary clipboard exported the retained document fragment')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  equal(input.value, operation === 'cut' ? '' : 'https://example.test/aux')
})

test('Native inline-pattern paste restores its atom and suffix caret on Redo', async () => {
  const source = document.createElement('textarea')
  source.value = '#ff0000 tail'
  document.body.append(source)
  try {
    source.focus()
    await dispatchKey('a', 'KeyA', 65, 2)
    await dispatchKey('c', 'KeyC', 67, 2)
    const editor = make([para('a', 'Alpha')], { injectStyles: true, inlinePlugins: [createColorSwatchPlugin()] })
    const before = editor.save().blocks
    select(editableField(editor, 'a'), 2, 4)
    await dispatchKey('v', 'KeyV', 86, 2)
    const after = editor.save().blocks
    equal(Object.values(after[0].inline).map(widget => widget.data.value), ['#ff0000'])
    caret(editor, 'a', 8)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(window.getSelection().toString(), 'ph')
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(editor, 'a', 8)
  } finally { source.remove() }
})

test('Prepared file paste commits once and native Redo restores the resulting editing host', async () => {
  const paragraph = createParagraphPlugin()
  let release
  let started = false
  const pending = new Promise(resolve => { release = resolve })
  const plugin = { ...paragraph, capabilities: { ...paragraph.capabilities, paste: {
    accepts: input => input.kind === 'file',
    async resolve() { started = true; await pending; return { kind: 'block', data: { text: 'File content' } } },
  } } }
  const editor = make([para('a', 'Alpha')], { injectStyles: true, plugins: [plugin] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 2 })
  const transfer = new DataTransfer()
  transfer.items.add(new File(['sample'], 'sample.txt', { type: 'text/plain' }))
  // The disposable file payload is synthetic; subsequent history keys are native.
  editableField(editor, 'a').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
  assert(started)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'A pending resolver opened document history')
  release()
  await pause(30)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['Alpha', 'File content'])
  caret(editor, after[1].id, 12)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  caret(editor, 'a', 2)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, after[1].id, 12)
})

for (const name of ['Ada', '']) test(`Native widget deletion ${name ? 'updates' : 'removes'} an atom and restores the resulting caret on Redo`, async () => {
  const editor = make([para('a', 'Al{{mention}}ha', { inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'person', name } },
  } })], { injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 3 })
  await dispatchKey('Backspace', 'Backspace', 8)
  const after = editor.save().blocks
  if (name) equal(after[0].inline.mention.data.name, 'Ad')
  else { equal(after[0].data.text, 'Alha'); assert(!after[0].inline?.mention) }
  caret(editor, 'a', name ? 3 : 2)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', name ? 3 : 2)
})

test('Native Delete converts a mention trigger into plain text and keeps its boundary caret on Redo', async () => {
  const editor = make([para('a', 'Al{{mention}}ha', { inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada' } },
  } })], { injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 2 })
  await dispatchKey('Delete', 'Delete', 46)
  const after = editor.save().blocks
  equal(after[0].data.text, 'AlAdaha')
  assert(!after[0].inline?.mention)
  caret(editor, 'a', 2)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 2)
})

test('Native auxiliary Backspace cannot edit an inline atom through a stale DOM caret', async () => {
  const editor = make([para('a', 'Al{{mention}}ha', { inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada' } },
  } })], { injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks
  const input = document.createElement('input')
  input.value = 'ABC'
  input.setAttribute('aria-label', 'Auxiliary plugin input')
  // An unregistered control in editor chrome owns its native input events.
  editorRoot(editor).append(input)
  editor.blocks.focus('a', { offset: 3 })
  input.focus()
  input.setSelectionRange(3, 3)
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(input.value, 'AB', 'Inline input routing stole auxiliary deletion')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

for (const caption of [false, true]) test(`Native private fragment paste into ${caption ? 'Quote caption' : 'Paragraph'} keeps the caret before an untouched suffix`, async () => {
  const source = make([para('source', 'XY')], { injectStyles: true })
  select(editableField(source, 'source'), 0, 2)
  await dispatchKey('c', 'KeyC', 67, 2)
  const quote = createQuotePlugin()
  const editor = make(caption ? [{ id: 'a', type: 'quote', dataVersion: quote.schema.currentVersion, data: { text: 'Body', caption: 'Alpha' } }] : [para('a', 'Alpha')], {
    injectStyles: true, plugins: [createParagraphPlugin(), quote],
  })
  const selector = caption ? '.oe-quote__caption' : undefined
  const before = editor.save().blocks
  select(editableField(editor, 'a', selector), 2, 4)
  await dispatchKey('v', 'KeyV', 86, 2)
  const after = editor.save().blocks
  equal(after[0].data[caption ? 'caption' : 'text'], 'AlXYa')
  if (caption) equal(after[0].data.text, 'Body')
  caret(editor, 'a', 4, selector)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(window.getSelection().toString(), 'ph')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 4, selector)
})

for (const backward of [false, true]) test(`Native private paste replaces a ${backward ? 'backward' : 'forward'} cross-block range before its untouched suffix`, async () => {
  const source = make([para('source', 'XY')], { injectStyles: true })
  select(editableField(source, 'source'), 0, 2)
  await dispatchKey('c', 'KeyC', 67, 2)
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backward)
  await dispatchKey('v', 'KeyV', 86, 2)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['AlXYvo'])
  caret(editor, 'a', 4)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  const native = window.getSelection()
  equal(getTextOffset(editableField(editor, backward ? 'b' : 'a'), native.anchorNode, native.anchorOffset), backward ? 3 : 2)
  equal(getTextOffset(editableField(editor, backward ? 'a' : 'b'), native.focusNode, native.focusOffset), backward ? 2 : 3)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 4)
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AlXYXvo')
})

test('Native rich-fragment paste into a registered plain Code host uses text and canonical history', async () => {
  const source = make([para('source', '<b>XY</b>')], { injectStyles: true })
  source.blocks.focus('source', { offset: 0 })
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('c', 'KeyC', 67, 2)
  const code = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: code.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }], {
    injectStyles: true, plugins: [createParagraphPlugin(), code],
  })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'code', offset: 2 })
  const field = document.activeElement
  field.setSelectionRange(2, 4)
  await dispatchKey('v', 'KeyV', 86, 2)
  const after = editor.save().blocks
  equal(after[0].data.code, 'AlXYa')
  assert(document.activeElement === field)
  equal([field.selectionStart, field.selectionEnd], [4, 4])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  const restored = document.activeElement
  equal([restored.selectionStart, restored.selectionEnd], [4, 4])
})

test('Native local Cut and Redo keep the caret at the removed text boundary', async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true })
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 2, 4)
  await dispatchKey('x', 'KeyX', 88, 2)
  const after = editor.save().blocks
  equal(after[0].data.text, 'Ala')
  caret(editor, 'a', 2)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(window.getSelection().toString(), 'ph')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editor, 'a', 2)
})

test('Native async rich-text paste keeps its secondary field and caret before a suffix', async () => {
  const source = document.createElement('textarea')
  source.value = 'XY'
  document.body.append(source)
  try {
    source.focus()
    await dispatchKey('a', 'KeyA', 65, 2)
    await dispatchKey('c', 'KeyC', 67, 2)
    const quote = createQuotePlugin()
    const definition = { ...quote, capabilities: { ...quote.capabilities, paste: {
      accepts: input => input.kind === 'text' && input.text === 'XY',
      async resolve() { return { kind: 'rich-text', replacement: { kind: 'text', text: 'XY' } } },
    } } }
    const editor = make([{ id: 'a', type: 'quote', dataVersion: quote.schema.currentVersion, data: { text: 'Body', caption: 'Alpha' } }], {
      injectStyles: true, plugins: [createParagraphPlugin(), definition],
    })
    const before = editor.save().blocks
    select(editableField(editor, 'a', '.oe-quote__caption'), 2, 4)
    await dispatchKey('v', 'KeyV', 86, 2)
    const after = editor.save().blocks
    equal(after[0].data, { ...before[0].data, caption: 'AlXYa' })
    caret(editor, 'a', 4, '.oe-quote__caption')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(editor, 'a', 4, '.oe-quote__caption')
  } finally { source.remove() }
})

for (const cut of [false, true]) test(`Native plain Code ${cut ? 'Cut' : 'Paste'} is a separate history action between typing bursts`, async () => {
  const source = make([para('source', 'XY')], { injectStyles: true })
  select(editableField(source, 'source'), 0, 2)
  await dispatchKey('c', 'KeyC', 67, 2)
  const code = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: code.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }], {
    injectStyles: true, plugins: [createParagraphPlugin(), code],
  })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'code', offset: 'end' })
  await printable('X')
  const typed = editor.save().blocks
  equal(typed[0].data.code, 'AlphaX')
  const field = document.activeElement
  field.setSelectionRange(2, 4)
  await dispatchKey(cut ? 'x' : 'v', cut ? 'KeyX' : 'KeyV', cut ? 88 : 86, 2)
  const clipped = editor.save().blocks
  equal(clipped[0].data.code, cut ? 'AlaX' : 'AlXYaX')
  await printable('Z')
  const after = editor.save().blocks
  equal(after[0].data.code, cut ? 'AlZaX' : 'AlXYZaX')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, clipped, 'Undo of subsequent typing also undid clipboard/preceding typing')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, typed, 'Clipboard was coalesced with preceding typing')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  for (const expected of [typed, clipped, after]) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, expected)
  }
})

await run()
