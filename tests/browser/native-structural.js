import { test, make, para, editableField, editorRoot, select, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { createParagraphPlugin, createHeadingPlugin, createListPlugin, createChecklistPlugin, createQuotePlugin, createTogglePlugin } from '../../plugins/index.js'

function caret(field, offset) {
  assert(document.activeElement === field, 'Structural edit lost the editing host focus')
  const selection = window.getSelection()
  assert(selection.isCollapsed && field.contains(selection.anchorNode), 'Structural edit lost its collapsed caret')
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset, 'Caret is not at the edit boundary')
}

test('Backspace joins paragraphs at the original boundary and typing continues there', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  select(editableField(editor, 'b'), 0)
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(editor.save().blocks.map(block => block.data.text), ['AlphaBravo'])
  caret(editableField(editor, 'a'), 5)
  const merged = editor.save().blocks
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  caret(editableField(editor, 'b'), 0)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, merged)
  caret(editableField(editor, 'a'), 5)
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AlphaXBravo')
})

for (const type of ['list', 'checklist']) {
  test(`Backspace joins ${type} items at the original boundary without losing marks`, async () => {
    const editor = make([{ id: 'a', type, dataVersion: 2, data: {
      ...(type === 'list' ? { style: 'ordered' } : {}),
      items: [{ id: 'first', text: '<b>Alpha</b>', ...(type === 'checklist' ? { checked: true } : {}) },
        { id: 'second', text: 'Bravo', ...(type === 'checklist' ? { checked: false } : {}) }],
    } }], { plugins: [createParagraphPlugin(), createListPlugin(), createChecklistPlugin()] })
    const before = editor.save().blocks
    editor.blocks.focus('a', { fieldKey: 'item:second', offset: 'start' })
    equal(document.activeElement?.textContent, 'Bravo', 'Focus did not enter the requested item')
    caret(document.activeElement, 0)
    await dispatchKey('Backspace', 'Backspace', 8)
    equal(editor.save().blocks[0].data.items.map(item => item.text), ['<b>Alpha</b>Bravo'])
    const field = editableField(editor, 'a')
    caret(field, 5)
    const merged = editor.save().blocks
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, merged)
    caret(editableField(editor, 'a'), 5)
    await printable('X')
    equal(editableField(editor, 'a').textContent, 'AlphaXBravo')
  })
}

for (const definition of [createHeadingPlugin(), createListPlugin(), createChecklistPlugin()]) {
  test(`Backspace exits an empty first ${definition.type} block as in v1`, async () => {
    const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: definition.schema.createDefault() }], {
      plugins: [createParagraphPlugin(), definition],
    })
    const before = editor.save().blocks
    editor.blocks.focus('a', { offset: 'start' })
    await dispatchKey('Backspace', 'Backspace', 8)
    equal(editor.save().blocks.map(block => [block.id, block.type, block.data.text]), [['a', 'paragraph', '']])
    caret(editableField(editor, 'a'), 0)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks[0].type, 'paragraph')
    caret(editableField(editor, 'a'), 0)
  })
}

test('Backspace removes an empty trailing List without appending an empty item to the previous List', async () => {
  const definition = createListPlugin()
  const editor = make([
    { id: 'a', type: 'list', dataVersion: 2, data: { style: 'ordered', items: [{ id: 'first', text: 'Alpha' }] } },
    { id: 'b', type: 'list', dataVersion: 2, data: definition.schema.createDefault() },
  ], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('b', { offset: 'start' })
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(editor.save().blocks, before.slice(0, 1))
  caret(editableField(editor, 'a'), 5)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, before.slice(0, 1))
  caret(editableField(editor, 'a'), 5)
})

test('Backspace in Quote caption does not merge whole neighboring Quote blocks', async () => {
  const editor = make([
    { id: 'a', type: 'quote', dataVersion: 1, data: { text: 'Alpha', caption: 'First' } },
    { id: 'b', type: 'quote', dataVersion: 1, data: { text: 'Bravo', caption: 'Second' } },
  ], { plugins: [createParagraphPlugin(), createQuotePlugin()] })
  const before = editor.save().blocks
  editor.blocks.focus('b', { fieldKey: 'caption', offset: 'start' })
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(editor.save().blocks, before, 'Field start was mistaken for the start of the entire Quote')
})

test('Delete in the first List item does not merge whole neighboring List blocks', async () => {
  const editor = make([
    { id: 'a', type: 'list', dataVersion: 2, data: { style: 'ordered', items: [{ id: 'first', text: 'Alpha' }, { id: 'tail', text: 'Tail' }] } },
    { id: 'b', type: 'list', dataVersion: 2, data: { style: 'unordered', items: [{ id: 'next', text: 'Bravo' }] } },
  ], { plugins: [createParagraphPlugin(), createListPlugin()] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'item:first', offset: 'end' })
  await dispatchKey('Delete', 'Delete', 46)
  equal(editor.save().blocks, before, 'Field end was mistaken for the end of the entire List')
})

test('Enter splits marked paragraph text and Redo restores the new block caret', async () => {
  const editor = make([para('a', 'AB<b>CD</b>EF')])
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 3 })
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['AB<b>C</b>', '<b>D</b>EF'])
  caret(editableField(editor, after[1].id), 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  caret(editableField(editor, 'a'), 3)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editableField(editor, after[1].id), 0)
})

for (const definition of [createListPlugin(), createChecklistPlugin()]) {
  test(`Enter splits ${definition.type} items and keeps one history entry and the new item caret`, async () => {
    const editor = make([{ id: 'a', type: definition.type, dataVersion: 2, data: {
      ...definition.schema.createDefault(), items: [{ id: 'first', text: '<b>Alpha</b>', ...(definition.type === 'checklist' ? { checked: true } : {}) }],
    } }], { plugins: [createParagraphPlugin(), definition] })
    const before = editor.save().blocks
    editor.blocks.focus('a', { fieldKey: 'item:first', offset: 2 })
    await dispatchKey('Enter', 'Enter', 13)
    const after = editor.save().blocks
    equal(after[0].data.items.map(item => item.text), ['<b>Al</b>', '<b>pha</b>'])
    const newField = document.activeElement
    caret(newField, 0)
    equal(newField.textContent, 'pha')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    caret(editableField(editor, 'a'), 2)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(document.activeElement, 0)
    equal(document.activeElement.textContent, 'pha')
  })
}

test('Enter opens a closed Toggle and history keeps the content field focus', async () => {
  const editor = make([{ id: 'a', type: 'toggle', dataVersion: 1, data: { title: 'Title', content: 'Content', open: false } }], {
    plugins: [createParagraphPlugin(), createTogglePlugin()],
  })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'title', offset: 'end' })
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks[0].data.open, true)
  equal(document.activeElement.textContent, 'Content')
  caret(document.activeElement, 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.open, true)
  equal(document.activeElement.textContent, 'Content')
  caret(document.activeElement, 0)
})

test('Delete joins paragraphs and keeps the original caret after Undo/Redo', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 'end' })
  await dispatchKey('Delete', 'Delete', 46)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['AlphaBravo'])
  caret(editableField(editor, 'a'), 5)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editableField(editor, 'a'), 5)
})

test('clicking below the last populated block adds a focused paragraph as in v1', async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true, minHeight: 260 })
  const before = editor.save().blocks
  await clickNative(editorRoot(editor).querySelector('.oe-click-area'))
  const after = editor.save().blocks
  equal(after.length, 2, 'Click area did not append a paragraph')
  equal(after[0], before[0])
  equal([after[1].type, after[1].data.text], ['paragraph', ''])
  caret(editableField(editor, after[1].id), 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editableField(editor, after[1].id), 0)
})

test('Enter in the last empty List item exits below the List as one action', async () => {
  const editor = make([{ id: 'a', type: 'list', dataVersion: 2, data: { style: 'ordered', items: [{ id: 'first', text: '<b>Alpha</b>' }, { id: 'empty', text: '' }] } }], {
    plugins: [createParagraphPlugin(), createListPlugin()],
  })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'item:empty', offset: 'start' })
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.type), ['list', 'paragraph'], 'Enter did not exit below the List')
  equal(after[0].data, { style: 'ordered', items: [{ id: 'first', text: '<b>Alpha</b>' }] })
  equal(after[1].data.text, '')
  caret(editableField(editor, after[1].id), 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  caret(document.activeElement, 0)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(editableField(editor, after[1].id), 0)
})

for (const definition of [createListPlugin(), createChecklistPlugin()]) {
  for (const position of ['middle', 'last']) {
    if (definition.type === 'list' && position === 'last') continue
    test(`Enter removes an empty ${position} ${definition.type} item and focuses the correct next field`, async () => {
      const item = (id, text) => ({ id, text, ...(definition.type === 'checklist' ? { checked: id === 'first' } : {}) })
      const items = [item('first', 'Alpha'), item('empty', ''), ...(position === 'middle' ? [item('next', 'Bravo')] : [])]
      const editor = make([{ id: 'a', type: definition.type, dataVersion: 2, data: { ...definition.schema.createDefault(), items } }], { plugins: [createParagraphPlugin(), definition] })
      const before = editor.save().blocks
      editor.blocks.focus('a', { fieldKey: 'item:empty', offset: 'start' })
      await dispatchKey('Enter', 'Enter', 13)
      const after = editor.save().blocks
      equal(after[0].data.items, items.filter(item => item.id !== 'empty'))
      equal(after.length, position === 'last' ? 2 : 1)
      equal(document.activeElement.textContent, position === 'last' ? '' : 'Bravo')
      caret(document.activeElement, 0)
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after)
      equal(document.activeElement.textContent, position === 'last' ? '' : 'Bravo')
      caret(document.activeElement, 0)
    })
  }
}

test('repeated clicks below an empty final paragraph reuse it without history', async () => {
  const editor = make([para('a', 'Alpha'), para('empty', '')], { injectStyles: true, minHeight: 260 })
  const before = editor.save().blocks
  for (let count = 0; count < 2; count++) {
    await clickNative(editorRoot(editor).querySelector('.oe-click-area'))
    caret(editableField(editor, 'empty'), 0)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  }
})

test('clicking below a read-only document cannot append a paragraph', async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true, minHeight: 260, readOnly: true })
  const before = editor.save().blocks
  await clickNative(editorRoot(editor).querySelector('.oe-click-area'))
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

await run()
