import { Paragraph, Columns, Image } from '../../../plugins/index.js'
import { selectAcross } from './cross-input-fixture.js'
import { test, make, para, select, paste, pause, assert, equal } from './harness.js'

export function register() {
  for (const stored of [false, true]) for (const backward of [false, true]) for (const html of [false, true]) {
    test(`Columns ${stored ? 'mouse' : 'native'} ${backward ? 'backward' : 'forward'} ${html ? 'HTML' : 'text'} paste replaces the same complete range`, async () => {
      const data = { layout: '1-1', columns: [{ content: 'Alpha' }, { content: 'Safe' }] }
      const editor = make([{ id: 'col', type: 'columns', data }, para('b', 'Bravo')], { plugins: [new Paragraph(), new Columns()] })
      const a = editor.blocks.getBlockById('col').contentElement.querySelector('.oe-columns__col')
      const b = editor.blocks.getBlockById('b').contentElement
      let target
      if (stored) target = selectAcross(editor, a, 2, b, 3, backward)
      else {
        target = backward ? b : a; target.focus()
        window.getSelection().setBaseAndExtent(backward ? b.firstChild : a.firstChild, backward ? 3 : 2, backward ? a.firstChild : b.firstChild, backward ? 2 : 3)
      }
      const before = editor.save().blocks
      await paste(target, html ? { 'text/html': '<p>X</p>' } : { 'text/plain': 'X' })
      equal(editor.save().blocks.map(b => b.type), ['columns'])
      equal(editor.save().blocks[0].data.columns, [{ content: 'AlXvo' }, { content: '' }])
      editor.undo(); equal(editor.save().blocks, before); equal(editor.canUndo, false)
      editor.redo(); equal(editor.save().blocks[0].data.columns, [{ content: 'AlXvo' }, { content: '' }])
    })
  }
  test('a nested inline target in a Column has its nearest editable host honored', async () => {
    const editor = make([{ id: 'col', type: 'columns', data: { layout: '1-1', columns: [{ content: '<b>Alpha</b>' }, { content: 'Safe' }] } }], { plugins: [new Paragraph(), new Columns()] })
    const column = editor.blocks.getBlockById('col').contentElement.querySelector('.oe-columns__col')
    column.focus(); const bold = column.querySelector('b'); const range = document.createRange()
    range.setStart(bold.firstChild, 2); range.collapse(true); window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    await paste(bold, { 'text/plain': 'X' })
    equal(editor.save().blocks[0].data.columns, [{ content: '<b>AlXpha</b>' }, { content: 'Safe' }])
  })
  test('nested noneditable widget content is not treated as an authored paste host', async () => {
    const editor = make([para('a', 'Keep')]); const p = editor.blocks.getBlockById('a').contentElement
    select(p, 2)
    const lock = document.createElement('span'); lock.contentEditable = 'false'; lock.textContent = 'UI'; p.appendChild(lock)
    const before = p.innerHTML
    const data = new DataTransfer(); data.setData('text/plain', 'X')
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); lock.dispatchEvent(event)
    await pause(); equal(p.innerHTML, before); equal(event.defaultPrevented, false)
  })
  test('Image URL draft input retains native paste even inside a block', async () => {
    const editor = make([{ id: 'im', type: 'image', data: {} }], { plugins: [new Paragraph(), new Image()] })
    const block = editor.blocks.getBlockById('im').contentElement
    const trigger = [...block.querySelectorAll('button,a')].find(node => /URL/i.test(node.textContent))
    assert(trigger, 'actual Image URL source action exists'); trigger.click(); await pause(10)
    const input = block.querySelector('.oe-source-editor__field')
    assert(input && !input.closest('[inert]'), 'actual Image URL field is visible'); input.focus()
    const data = new DataTransfer(); data.setData('text/plain', 'https://example.test/image.png')
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); input.dispatchEvent(event)
    await pause(); equal(event.defaultPrevented, false); equal(editor.canUndo, false)
  })
}

export function registerNative() {
  for (const backward of [false, true]) {
    test(`native Columns Ctrl+V replaces the ${backward ? 'backward' : 'forward'} range`, async () => {
      const { copyTestText, nativeClipboardShortcut } = await import('./nativeClipboard.js')
      await copyTestText('X')
      const editor = make([{ id: 'col', type: 'columns', data: { layout: '1-1', columns: [{ content: 'Alpha' }, { content: 'Safe' }] } }, para('b', 'Bravo')], { plugins: [new Paragraph(), new Columns()] })
      const a = editor.blocks.getBlockById('col').contentElement.querySelector('.oe-columns__col'), b = editor.blocks.getBlockById('b').contentElement
      selectAcross(editor, a, 2, b, 3, backward)
      let pastes = 0; editor.rootElement.addEventListener('paste', () => pastes++, { once: true })
      await nativeClipboardShortcut('v', 86)
      equal(pastes, 1)
      equal(editor.save().blocks.map(b => b.type), ['columns'])
      equal(editor.save().blocks[0].data.columns, [{ content: 'AlXvo' }, { content: '' }])
    })
  }
}
