import { test, make, para, select, pause, assert, equal, texts, run } from './regressions/harness.js'
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

await run()
