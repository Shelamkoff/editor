import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import { createParagraphPlugin, createTablePlugin } from '../../plugins/index.js'
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

async function dispatchKey(key, code, windowsVirtualKeyCode, modifiers = 0, text) {
  const params = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers }
  await window.__testInput('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    ...params,
    ...(text === undefined ? {} : { text }),
  })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  await pause(20)
}

async function printable(text = 'X') {
  await dispatchKey(text, 'KeyX', 88, 0, text)
}

function pointAt(element, offset) {
  const text = element.firstChild
  assert(text?.nodeType === Node.TEXT_NODE, 'cross-block fixture requires text content')
  const clamped = Math.max(0, Math.min(offset, text.data.length))
  const range = document.createRange()
  if (clamped === 0) {
    range.setStart(text, 0)
    range.setEnd(text, Math.min(1, text.data.length))
  } else {
    range.setStart(text, clamped - 1)
    range.setEnd(text, clamped)
  }
  const rect = range.getBoundingClientRect()
  return {
    clientX: clamped === 0 ? rect.left + 1 : rect.right - 1,
    clientY: rect.top + Math.max(1, rect.height / 2),
  }
}

async function selectAcross(editor, start, startOffset, end, endOffset, backwards = false) {
  const anchor = backwards ? end : start
  const focus = backwards ? start : end
  const anchorOffset = backwards ? endOffset : startOffset
  const focusOffset = backwards ? startOffset : endOffset
  const startPoint = pointAt(anchor, anchorOffset)
  const endPoint = pointAt(focus, focusOffset)

  anchor.focus()
  anchor.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    ...startPoint,
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    ...endPoint,
  }))
  document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    button: 0,
    buttons: 0,
  }))
  await pause(30)

  const root = editorRoot(editor)
  assert(root.classList.contains('oe-editor--cross-selecting'), 'physical cross-block selection did not activate')
  equal(editor.blocks.selectedIds().length, 2, 'physical cross-block selection lost selected block ids')
  return anchor
}

function decodeInline(editor) {
  return editor.save().blocks.map(block => String(block.data.text ?? '').replace(
    /\{\{([\w-]+)\}\}/g,
    (token, id) => block.inline?.[id]?.data?.value ?? token,
  ))
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

for (const backwards of [false, true]) {
  test(`physical Ctrl+X cuts the full ${backwards ? 'backward' : 'forward'} cross-block selection`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editableField(editor, 'a')
    const last = editableField(editor, 'b')
    await selectAcross(editor, first, 2, last, 3, backwards)
    let cuts = 0
    editorRoot(editor).addEventListener('cut', () => { cuts++ }, { once: true })
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
