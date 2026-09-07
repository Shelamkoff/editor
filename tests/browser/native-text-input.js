import { registerNative as fragmentInlineNative } from './regressions/recheck-61-fragment-inline.js'
import { registerNative as nestedPasteNative } from './regressions/recheck-63-nested-editing-host.js'
import { registerNative as emptyPasteNative } from './regressions/recheck-62-empty-paste.js'
import { registerNative as tableBreakNative } from './regressions/recheck-60-table-break-boundaries.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { decodedTexts } from './regressions/recheck-57-pattern-caret.js'
import { crossRange } from './regressions/recheck-56-native-cut.js'
import { Paragraph, Table } from '../../plugins/index.js'
import { test, make, para, select, pause, paste, assert, equal, texts, run } from './regressions/harness.js'
import { selectAcross } from './regressions/cross-input-fixture.js'

async function printable() {
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyDown', key: 'X', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'X' })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'X', code: 'KeyX', windowsVirtualKeyCode: 88 })
  await pause(20)
}

for (const backwards of [false, true]) {
  for (const mode of ['keyboard', 'text']) {
    test(`native ${mode} replaces the full ${backwards ? 'backward' : 'forward'} cross-block selection`, async () => {
      const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
      selectAcross(editor, editor.blocks.getBlockByIndex(0).contentElement, 2,
        editor.blocks.getBlockByIndex(1).contentElement, 3, backwards)
      equal([...CSS.highlights.get('oe-cross-select')].map(range => range.toString()), ['phaBra'])
      if (mode === 'keyboard') await printable()
      else { await window.__testInput('Input.insertText', { text: '😀' }); await pause(20) }
      equal(texts(editor), [mode === 'keyboard' ? 'AlXvo' : 'Al😀vo'])
      assert(!editor.rootElement.classList.contains('oe-editor--cross-selecting'))
      editor.undo()
      equal(texts(editor), ['Alpha', 'Bravo'])
      equal(editor.canUndo, false, 'typed replacement is one history step')
      editor.redo()
      equal(texts(editor), [mode === 'keyboard' ? 'AlXvo' : 'Al😀vo'])
    })
  }
}

test('native input within one paragraph keeps ordinary browser editing behavior', async () => {
  const editor = make([para('a', 'Alpha')])
  select(editor.blocks.getBlockByIndex(0).contentElement, 2, 4)
  await printable()
  equal(texts(editor), ['AlXa'])
})

for (const empty of [false, true]) {
  test(`native ArrowUp inserts into the ${empty ? 'empty' : 'populated'} final table cell`, async () => {
    const editor = make([
      { id: 'table', type: 'table', data: { withHeadings: false, content: [['A', empty ? '' : 'B']] } },
      para('after', 'After'),
    ], { plugins: [new Paragraph(), new Table()] })
    select(editor.blocks.getBlockById('after').contentElement, 0)
    await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
    await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
    await window.__testInput('Input.insertText', { text: 'X' })
    equal(editor.save().blocks[0].data.content, [['A', empty ? 'X' : 'BX']])
    editor.undo()
    equal(editor.save().blocks[0].data.content, [['A', empty ? '' : 'B']])
  })
}

for (const key of ['Backspace', 'Delete']) {
  test(`native ${key} deletes a DOM Range spanning multiple editable hosts`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    const last = editor.blocks.getBlockById('b').contentElement
    first.focus()
    const range = document.createRange(); range.setStart(first.firstChild, 2); range.setEnd(last.firstChild, 3)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
    equal(selection.getRangeAt(0).toString(), 'phaBra')
    const params = { key, code: key, windowsVirtualKeyCode: key === 'Backspace' ? 8 : 46 }
    await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
    await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    equal(texts(editor), ['Alvo'])
    await window.__testInput('Input.insertText', { text: 'X' })
    equal(texts(editor), ['AlXvo'])
    editor.undo(); equal(texts(editor), ['Alvo'])
    editor.undo(); equal(texts(editor), ['Alpha', 'Bravo'])
  })
}

test('native typing replaces all characters produced by Unicode case expansion', async () => {
  const editor = make([para('a', 'aßb')], { inlineTools: ['caseTransform'] })
  const field = editor.blocks.getBlockById('a').contentElement
  select(field, 1, 2)
  document.dispatchEvent(new Event('selectionchange')); await pause(35)
  editor.rootElement.querySelector('[data-tool="caseTransform"]').click()
  equal(field.textContent, 'aSSb')
  equal(window.getSelection().getRangeAt(0).toString(), 'SS')
  await window.__testInput('Input.insertText', { text: 'X' })
  equal(texts(editor), ['aXb'])
  editor.undo(); equal(texts(editor), ['aSSb'])
  editor.undo(); equal(texts(editor), ['aßb'])
})

for (const backwards of [false, true]) {
  test(`native Ctrl+X cuts the full ${backwards ? 'backward' : 'forward'} cross-host Range`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    crossRange(first, editor.blocks.getBlockById('b').contentElement, backwards)
    let cuts = 0
    editor.rootElement.addEventListener('cut', () => { cuts++ }, { once: true })
    const params = { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers: 2 }
    await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
    await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    equal(cuts, 1, 'native clipboard event is delivered')
    equal(texts(editor), ['Alvo'])
    editor.undo(); equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
    editor.redo(); equal(texts(editor), ['Alvo'])
  })
}
for (const [initial, offset, value, expected] of [
  ['', 0, '#ff0000 mid #00ff00 tail', ['#ff0000 mid #00ff00 tailX']],
  ['abcd', 2, '#ff0000 tail', ['ab#ff0000 tailXcd']],
  ['abcd', 2, '#ff0000 tail\n#00ff00 end', ['ab#ff0000 tail', '#00ff00 endXcd']],
]) {
  test(`native typing stays after the full pattern paste: ${JSON.stringify(value)}`, async () => {
    const editor = make([para('a', initial)], { inlinePlugins: [createColorSwatchPlugin()] })
    select(editor.blocks.getBlockById('a').contentElement, offset)
    await paste(editor.blocks.getBlockById('a').contentElement, { 'text/plain': value })
    const pasted = editor.save().blocks
    assert(pasted.some(block => block.inline), 'automatic conversion ran')
    await window.__testInput('Input.insertText', { text: 'X' })
    equal(decodedTexts(editor), expected)
    editor.undo(); equal(editor.save().blocks, pasted)
    editor.undo(); equal(texts(editor), [initial])
    equal(editor.canUndo, false)
  })
}
tableBreakNative()
emptyPasteNative()
nestedPasteNative()
fragmentInlineNative()
await run()
