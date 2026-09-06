import { Paragraph, Table } from '../../plugins/index.js'
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

await run()
