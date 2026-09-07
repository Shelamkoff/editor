import { test, make, para, select, input, equal, assert, pause } from './harness.js'
import { Paragraph, Image, Quote } from '../../../plugins/index.js'

function nativeRange(a, start, b, end, backwards = false) {
  a.focus()
  const selection = window.getSelection()
  if (backwards) selection.setBaseAndExtent(b.firstChild, end, a.firstChild, start)
  else selection.setBaseAndExtent(a.firstChild, start, b.firstChild, end)
  return selection.getRangeAt(0)
}
function fixture(blocks = [para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Untouched')]) {
  let finish
  const upload = new Promise(resolve => { finish = resolve })
  const editor = make(blocks, { plugins: [new Paragraph(), new Quote(), new Image({ uploadFile: () => upload })] })
  return { editor, async finish() {
    finish({ url: 'https://example.test/file.png' })
    for (let n = 0; n < 40 && editor.rootElement.querySelector('.oe-pending-pastes'); n++) await pause(10)
    assert(!editor.rootElement.querySelector('.oe-pending-pastes'), 'pending upload must settle')
  } }
}
async function pasteFile(editor, field) {
  const data = new DataTransfer(); data.items.add(new File(['image'], 'file.png', { type: 'image/png' }))
  field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  await pause(10)
  assert(editor.rootElement.querySelector('.oe-pending-paste__indicator'), 'the real Image upload was started')
}
export function register() {
  for (const backwards of [false, true]) {
    test(`file paste replaces a ${backwards ? 'backward' : 'forward'} native cross-block selection atomically`, async () => {
      const { editor, finish } = fixture()
      const a = editor.blocks.getBlockById('a').contentElement, b = editor.blocks.getBlockById('b').contentElement
      equal(nativeRange(a, 2, b, 3, backwards).toString(), 'phaBra')
      await pasteFile(editor, a); await finish()
      const saved = editor.save().blocks
      equal(saved.map(block => block.type), ['paragraph', 'image', 'paragraph'])
      equal(saved.filter(block => block.type === 'paragraph').map(block => block.data.text), ['Alvo', 'Untouched'])
      equal(saved[1].data.file.url, 'https://example.test/file.png')
      editor.undo(); equal(editor.save().blocks.map(block => block.data.text), ['Alpha', 'Bravo', 'Untouched'])
      equal(editor.canUndo, false)
      editor.redo(); equal(editor.save().blocks, saved)
    })
  }
  for (const change of ['endpoint', 'selection', 'replacement', 'insert-between']) {
    test(`pending native file replacement is cancelled after ${change} changes`, async () => {
      const { editor, finish } = fixture()
      const a = editor.blocks.getBlockById('a').contentElement
      nativeRange(a, 2, editor.blocks.getBlockById('b').contentElement, 3)
      await pasteFile(editor, a)
      if (change === 'endpoint') input(a, 'Later author text')
      if (change === 'selection') select(editor.blocks.getBlockById('c').contentElement, 1)
      if (change === 'replacement') editor.render({ version: '1', blocks: [para('a', 'New document')] })
      if (change === 'insert-between') editor.blocks.insert('paragraph', { text: 'New middle' }, 1)
      const before = editor.save().blocks
      await finish(); equal(editor.save().blocks, before)
    })
  }
  test('unrelated document edits do not cancel a still-current native range', async () => {
    const { editor, finish } = fixture()
    const a = editor.blocks.getBlockById('a').contentElement
    nativeRange(a, 2, editor.blocks.getBlockById('b').contentElement, 3)
    await pasteFile(editor, a)
    input(editor.blocks.getBlockById('c').contentElement, 'Unrelated edit')
    await finish()
    equal(editor.save().blocks.filter(block => block.type === 'paragraph').map(block => block.data.text), ['Alvo', 'Unrelated edit'])
  })
  test('native file replacement preserves unselected fields after a Quote endpoint', async () => {
    const { editor, finish } = fixture([para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'KEEP' } }])
    const a = editor.blocks.getBlockById('a').contentElement
    nativeRange(a, 2, editor.blocks.getBlockById('q').contentElement.querySelector('blockquote'), 2)
    await pasteFile(editor, a); await finish()
    equal(editor.save().blocks.filter(block => block.type !== 'image').map(block => block.data), [{ text: 'Alote' }, { text: '', caption: 'KEEP' }])
  })
}
