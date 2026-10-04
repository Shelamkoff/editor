import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import { createParagraphPlugin, createQuotePlugin, createTablePlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import {
  test,
  make,
  para,
  editableField,
  editorRoot,
  select,
  pause,
  paste,
  assert,
  equal,
  texts,
  run,
} from './regressions/harness.js'

import { dispatchKey, printable, selectAcross, dragAcross, decodeInline } from './native-input-helpers.js'

for (const boundary of ['first', 'last', 'both', 'empty']) {
  for (const operation of ['delete', 'type', 'paste plain', 'paste private', 'paste HTML']) {
    test(`native select-all includes opaque ${boundary} boundaries before ${operation}`, async () => {
      const opaque = id => ({ id, type: 'future-block', dataVersion: 9, data: { secret: id } })
      const blocks = [
        ...(boundary !== 'last' ? [opaque('first')] : []),
        para('a', boundary === 'empty' ? '' : 'Alpha'),
        ...(boundary !== 'first' ? [opaque('last')] : []),
      ]
      const editor = make(blocks, { inlineTools: createDefaultInlineTools({ types: ['bold'] }) })
      const before = editor.save().blocks
      select(editableField(editor, 'a'), 0)
      await dispatchKey('a', 'KeyA', 65, 2)
      // v1 selects whole blocks immediately from an empty field; another
      // Ctrl+A cycles back to its native local selection.
      if (boundary !== 'empty') await dispatchKey('a', 'KeyA', 65, 2)
      equal(editor.blocks.selectedIds(), blocks.map(block => block.id), 'select-all excluded opaque boundaries')
      await dispatchKey('b', 'KeyB', 66, 2)
      equal(editor.save().blocks, before, 'mixed opaque selection was partially formatted')
      const copied = new DataTransfer()
      editableField(editor, 'a').dispatchEvent(new ClipboardEvent('copy', { clipboardData: copied, bubbles: true, cancelable: true }))
      equal(JSON.parse(copied.getData('application/x-rector-fragment')).parts.map(part => part.block.type), blocks.map(block => block.type), 'whole selection copy omitted opaque content')
      if (operation === 'delete') await dispatchKey('Backspace', 'Backspace', 8)
      else if (operation === 'type') await window.__testInput('Input.insertText', { text: 'X' })
      else await paste(editableField(editor, 'a'), operation === 'paste plain'
        ? { 'text/plain': 'X' }
        : operation === 'paste HTML' ? { 'text/html': '<p><b>X</b></p>' }
          : { 'application/x-rector-fragment': JSON.stringify({ version: 2, parts: [{ kind: 'rich-text', html: '<b>X</b>' }] }) })
      await pause(20)
      equal(texts(editor), [operation === 'delete' ? '' : operation === 'paste HTML' || operation === 'paste private' ? '<b>X</b>' : 'X'])
      if (operation === 'type') {
        const field = editableField(editor, 0)
        const native = window.getSelection()
        equal(getTextOffset(field, native.anchorNode, native.anchorOffset), 1, 'whole-document replacement caret precedes text')
      }
      editor.undo()
      equal(editor.save().blocks, before, 'whole-document change was not atomic')
      equal(editor.canUndo, false, 'whole-document change created extra history')
    })
  }
}

for (const backwards of [false, true]) {
  test(`native mouse drag retains the ${backwards ? 'backward' : 'forward'} cross-block range on release`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backwards)
    await window.__testInput('Input.insertText', { text: 'X' })
    await pause(20)
    equal(texts(editor), ['AlXvo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
  })
}

for (const backwards of [false, true]) {
  test(`native mouse drag formats both quote fields ${backwards ? 'backward' : 'forward'}`, async () => {
    const editor = make([{ id: 'quote', type: 'quote', dataVersion: 1, data: { text: 'Alpha', caption: 'Bravo' } }], {
      plugins: [createParagraphPlugin(), createQuotePlugin()],
      inlineTools: createDefaultInlineTools({ types: ['bold'] }),
    })
    const text = editableField(editor, 'quote', '.oe-quote__text')
    const caption = editableField(editor, 'quote', '.oe-quote__caption')
    await dragAcross(editor, text, 2, caption, 3, backwards)
    await dispatchKey('b', 'KeyB', 66, 2)
    equal(editor.save().blocks[0].data, { text: 'Al<b>pha</b>', caption: '<b>Bra</b>vo' })
    editor.undo()
    equal(editor.save().blocks[0].data, { text: 'Alpha', caption: 'Bravo' })
    equal(editor.canUndo, false, 'multi-field formatting was not atomic')
  })
}

for (const backwards of [false, true]) {
  for (const mode of ['keyboard', 'insertText']) {
    test(`physical ${mode} replaces the full ${backwards ? 'backward' : 'forward'} cross-block selection`, async () => {
      const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
      const first = editableField(editor, 'a')
      const last = editableField(editor, 'b')
      await selectAcross(editor, first, 2, last, 3, backwards)

      if (mode === 'keyboard') await printable('X')
      else {
        await window.__testInput('Input.insertText', { text: '😀' })
        await pause(20)
      }

      equal(texts(editor), [mode === 'keyboard' ? 'AlXvo' : 'Al😀vo'])
      assert(!editorRoot(editor).classList.contains('oe-editor--cross-selecting'), 'replacement left cross selection active')
      editor.undo()
      equal(texts(editor), ['Alpha', 'Bravo'])
      equal(editor.canUndo, false, 'cross-block replacement was not one history operation')
      editor.redo()
      equal(texts(editor), [mode === 'keyboard' ? 'AlXvo' : 'Al😀vo'])
    })
  }
}

for (const mode of ['keyboard', 'insertText']) {
  test(`physical ${mode} replacement keeps the caret after the inserted text`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    await selectAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3)
    if (mode === 'keyboard') await printable('X')
    else await window.__testInput('Input.insertText', { text: '😀' })
    await window.__testInput('Input.insertText', { text: 'Y' })
    await pause(20)
    equal(texts(editor), [mode === 'keyboard' ? 'AlXYvo' : 'Al😀Yvo'])
    editor.undo()
    equal(texts(editor), [mode === 'keyboard' ? 'AlXvo' : 'Al😀vo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
  })
}

test('physical keyboard collapse revokes the previous cross-block formatting selection', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
    inlineTools: createDefaultInlineTools({ types: ['bold'] }),
  })
  await selectAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3)
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37)
  assert(window.getSelection().isCollapsed, 'ArrowLeft did not collapse the native range')
  await dispatchKey('b', 'KeyB', 66, 2)
  equal(texts(editor), ['Alpha', 'Bravo'], 'collapsed caret formatted the previous cross-block range')
  equal(editor.canUndo, false, 'collapsed caret created a formatting history entry')
})

for (const [type, initial, end, selected, nextEnd] of [
  ['bold', 'Alpha', 4, 'lph', 4],
  ['caseTransform', 'aßb', 2, 'SS', 3],
]) {
  test(`backward single-field ${type} keeps anchor/focus direction`, async () => {
    const editor = make([para('a', initial)], {
      inlineTools: createDefaultInlineTools({ types: [type] }),
    })
    const field = editableField(editor, 'a')
    field.focus()
    const native = window.getSelection()
    native.setBaseAndExtent(field.firstChild, end, field.firstChild, 1)
    document.dispatchEvent(new Event('selectionchange'))
    await pause(35)
    const tool = editorRoot(editor).querySelector(`.oe-inline-tool[data-tool="${type}"]`)
    assert(tool instanceof HTMLElement, 'backward formatting tool is missing')
    tool.click()
    equal(native.toString(), selected)
    equal(getTextOffset(field, native.anchorNode, native.anchorOffset), nextEnd, 'formatting reversed the backward anchor')
    equal(getTextOffset(field, native.focusNode, native.focusOffset), 1, 'formatting reversed the backward focus')
    await window.__testInput('Input.insertText', { text: 'Y' })
    await pause(20)
    equal(field.textContent, type === 'bold' ? 'AYa' : 'aYb')
  })
}

test('physical native input within one paragraph keeps ordinary browser editing semantics', async () => {
  const editor = make([para('a', 'Alpha')])
  const field = editableField(editor, 'a')
  select(field, 2, 4)
  await printable('X')
  equal(texts(editor), ['AlXa'])
  assert(document.activeElement === field, 'single-field native edit lost focus')
})

for (const empty of [false, true]) {
  test(`physical ArrowUp targets the ${empty ? 'empty' : 'populated'} final table cell`, async () => {
    const table = {
      id: 'table',
      type: 'table',
      dataVersion: 2,
      data: {
        withHeadings: false,
        rows: [{
          id: 'row-1',
          cells: [
            { id: 'cell-a', text: 'A' },
            { id: 'cell-b', text: empty ? '' : 'B' },
          ],
        }],
      },
    }
    const editor = make([table, para('after', 'After')], {
      plugins: [createParagraphPlugin({ injectStyles: false }), createTablePlugin()],
    })
    const after = editableField(editor, 'after')
    select(after, 0)
    await dispatchKey('ArrowUp', 'ArrowUp', 38)
    const cell = editorRoot(editor).querySelector('[data-cell-id="cell-b"]')
    assert(cell instanceof HTMLElement && document.activeElement === cell, 'ArrowUp did not focus the last table cell')
    await window.__testInput('Input.insertText', { text: 'X' })
    await pause(20)
    const cells = editor.save().blocks[0].data.rows[0].cells
    equal(cells.map(entry => entry.text), ['A', empty ? 'X' : 'BX'])
    editor.undo()
    equal(editor.save().blocks[0].data.rows[0].cells.map(entry => entry.text), ['A', empty ? '' : 'B'])
  })
}

for (const key of ['Backspace', 'Delete']) {
  test(`physical ${key} deletes a cross-block selection and leaves the caret in the merged block`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editableField(editor, 'a')
    const last = editableField(editor, 'b')
    await selectAcross(editor, first, 2, last, 3)
    await dispatchKey(key, key, key === 'Backspace' ? 8 : 46)
    equal(texts(editor), ['Alvo'])
    assert(document.activeElement === editableField(editor, 0), `${key} cross-block delete lost focus`)
    await window.__testInput('Input.insertText', { text: 'X' })
    await pause(20)
    equal(texts(editor), ['AlXvo'])
    editor.undo()
    equal(texts(editor), ['Alvo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
  })
}

test('physical typing replaces the complete Unicode case-expansion selection', async () => {
  const editor = make([para('a', 'aßb')], {
    inlineTools: createDefaultInlineTools({ types: ['caseTransform'] }),
  })
  const field = editableField(editor, 'a')
  select(field, 1, 2)
  document.dispatchEvent(new Event('selectionchange'))
  await pause(35)
  const tool = editorRoot(editor).querySelector('.oe-inline-tool[data-tool="caseTransform"]')
  assert(tool instanceof HTMLElement, 'case-transform inline tool is missing')
  tool.click()
  equal(field.textContent, 'aSSb')
  equal(window.getSelection().toString(), 'SS')
  await window.__testInput('Input.insertText', { text: 'X' })
  await pause(20)
  equal(texts(editor), ['aXb'])
  editor.undo()
  equal(texts(editor), ['aSSb'])
  editor.undo()
  equal(texts(editor), ['aßb'])
})

for (const [initial, offset, pastedText, expected] of [
  ['', 0, '#ff0000 tail', ['#ff0000 tailX']],
  ['abcd', 2, '#ff0000 tail', ['ab#ff0000 tailXcd']],
  ['abcd', 2, '#ff0000 tail\n#00ff00 end', ['ab#ff0000 tail', '#00ff00 endXcd']],
]) {
  test(`physical typing preserves the caret after inline-pattern paste: ${JSON.stringify(pastedText)}`, async () => {
    const editor = make([para('a', initial)], { inlinePlugins: [createColorSwatchPlugin()] })
    const field = editableField(editor, 'a')
    select(field, offset)
    await paste(field, { 'text/plain': pastedText })
    const pasted = editor.save().blocks
    assert(pasted.some(block => block.inline), 'inline pattern paste did not create canonical widget data')
    await window.__testInput('Input.insertText', { text: 'X' })
    await pause(20)
    equal(decodeInline(editor), expected)
    editor.undo()
    equal(editor.save().blocks, pasted)
    editor.undo()
    equal(texts(editor), [initial])
    equal(editor.canUndo, false)
  })
}

await run()
