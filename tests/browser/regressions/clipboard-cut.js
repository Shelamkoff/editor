import { test, make, para, key, input, pause, equal, assert, texts } from './harness.js'

function across(editor) {
  editor.rootElement.style.width = '640px'
  editor.rootElement.scrollIntoView()
  const start = editor.blocks.getBlockByIndex(0).contentElement
  const end = editor.blocks.getBlockByIndex(1).contentElement
  function point(element, offset) {
    const range = document.createRange()
    range.setStart(element.firstChild, offset - 1)
    range.setEnd(element.firstChild, offset)
    const rect = range.getBoundingClientRect()
    return { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 }
  }
  start.focus()
  start.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, ...point(start, 3) }))
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, ...point(end, 5) }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  assert(editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'cross-block selection fixture failed')
  return start
}

async function withClipboard(clipboard, run) {
  const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const oldItem = window.ClipboardItem
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
  if (!window.ClipboardItem) window.ClipboardItem = class { constructor(data) { this.data = data } }
  try { await run() } finally {
    if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard)
    else delete navigator.clipboard
    window.ClipboardItem = oldItem
  }
}
const fixture = () => make([para('a', 'Alpha one'), para('b', 'Bravo two')])

export function register() {
  test('cross-block Cut preserves the document when both clipboard writes fail', async () => {
    await withClipboard({ write: async () => { throw new Error('denied') }, writeText: async () => { throw new Error('denied') } }, async () => {
      const editor = fixture()
      key(across(editor), 'x', { ctrlKey: true, code: 'KeyX' })
      await pause(20)
      equal(texts(editor), ['Alpha one', 'Bravo two'])
      equal(editor.canUndo, false)
    })
  })
  test('cross-block Cut waits for a successful write and remains one undo step', async () => {
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    await withClipboard({ write: () => pending }, async () => {
      const editor = fixture()
      key(across(editor), 'x', { ctrlKey: true, code: 'KeyX' })
      equal(texts(editor), ['Alpha one', 'Bravo two'], 'pending write must not delete')
      finish()
      await pause(20)
      equal(texts(editor), ['Alp two'])
      editor.undo()
      equal(texts(editor), ['Alpha one', 'Bravo two'])
      editor.redo()
      equal(texts(editor), ['Alp two'])
    })
  })
  test('cross-block Cut can fall back to plain text after rich write rejection', async () => {
    let copied
    await withClipboard({ write: async () => { throw new Error('rich denied') }, writeText: async text => { copied = text } }, async () => {
      const editor = fixture()
      key(across(editor), 'x', { ctrlKey: true, code: 'KeyX' })
      await pause(20)
      assert(copied.includes('ha one') && copied.includes('Bravo'))
      equal(texts(editor), ['Alp two'])
    })
  })
  for (const change of ['input', 'render', 'selection', 'destroy']) {
    test(`pending Cut is cancelled by ${change}`, async () => {
      let finish
      const pending = new Promise(resolve => { finish = resolve })
      await withClipboard({ write: () => pending }, async () => {
        const editor = fixture()
        const p = across(editor)
        key(p, 'x', { ctrlKey: true, code: 'KeyX' })
        if (change === 'input') input(p, 'Changed')
        if (change === 'render') editor.render({ version: '1', blocks: [para('new', 'Other document')] })
        if (change === 'selection') document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        if (change === 'destroy') editor.destroy()
        finish()
        await pause(20)
        if (change === 'input') equal(texts(editor), ['Changed', 'Bravo two'])
        if (change === 'render') equal(texts(editor), ['Other document'])
        if (change === 'selection') equal(texts(editor), ['Alpha one', 'Bravo two'])
        if (change === 'destroy') equal(editor.isReady, false)
      })
    })
  }
  test('native Cut without writable clipboardData does not delete selected blocks', () => {
    const editor = fixture()
    editor.blocks.selectBlocks(['a', 'b'])
    editor.blocks.getBlockByIndex(0).contentElement.dispatchEvent(new ClipboardEvent('cut', { bubbles: true, cancelable: true }))
    equal(texts(editor), ['Alpha one', 'Bravo two'])
  })
}
