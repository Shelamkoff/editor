import { Heading } from '../../../plugins/heading/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, select, assert, equal } from './harness.js'

function fixture() {
  const editor = make([para('a', 'FIRST'), para('b', 'SECOND')], {
    plugins: [new Paragraph(), new Heading()],
  })
  const focus = id => select(editor.blocks.getBlockById(id).contentElement, 0)
  const open = () => {
    const handle = editor.rootElement.querySelector('.oe-toolbar__drag')
    handle.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true, cancelable: true }))
    const menu = editor.rootElement.querySelector('.oe-settings-menu')
    assert(menu && menu.style.display !== 'none', 'settings menu must be open')
    return menu
  }
  const item = (menu, text) => {
    const found = [...menu.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.includes(text))
    assert(found, `missing settings item: ${text}`)
    return found
  }
  focus('a')
  return { editor, focus, open, item }
}

export function register() {
  test('closed block settings items cannot delete the document after reopening', () => {
    const f = fixture(), menu = f.open()
    const oldDelete = menu.querySelector('.oe-settings-menu__item--danger')
    document.body.click()
    const before = f.editor.save().blocks
    oldDelete.click()
    equal(f.editor.save().blocks, before)
    f.focus('a'); const reopened = f.open()
    oldDelete.click()
    equal(f.editor.save().blocks, before)
    f.item(reopened, 'Duplicate').click()
    equal(f.editor.save().blocks.length, 3, 'current settings item must remain functional')
    f.editor.undo()
    equal(f.editor.save().blocks, before)
  })

  test('block settings actions never target a newly focused or reconstructed block', () => {
    const f = fixture(), menu = f.open()
    const oldDuplicate = f.item(menu, 'Duplicate')
    f.focus('b')
    const before = f.editor.save().blocks
    oldDuplicate.click()
    equal(f.editor.save().blocks, before)
    f.focus('a'); const reopened = f.open()
    const retained = f.item(reopened, 'Duplicate')
    f.editor.render({ blocks: before })
    f.focus('a'); retained.click()
    equal(f.editor.save().blocks, before)
  })

  test('settings drilldown retires main-view handlers without breaking conversion or undo', () => {
    const f = fixture(), menu = f.open()
    const oldDelete = menu.querySelector('.oe-settings-menu__item--danger')
    const before = f.editor.save().blocks
    f.item(menu, 'Convert').click()
    oldDelete.click()
    equal(f.editor.save().blocks, before)
    f.item(menu, 'Heading').click()
    equal(f.editor.save().blocks[0].type, 'heading')
    f.editor.undo(); equal(f.editor.save().blocks, before)
    f.editor.redo(); equal(f.editor.save().blocks[0].type, 'heading')
  })

  test('read-only teardown retires block settings controls and queued menu focus', async () => {
    const f = fixture(), menu = f.open()
    const oldDelete = menu.querySelector('.oe-settings-menu__item--danger')
    f.editor.setReadOnly(true); f.editor.setReadOnly(false)
    const before = f.editor.save().blocks
    const sentinel = document.createElement('button')
    document.body.appendChild(sentinel)
    try {
      sentinel.focus(); oldDelete.click()
      await new Promise(resolve => requestAnimationFrame(resolve))
      equal(f.editor.save().blocks, before)
      equal(document.activeElement, sentinel)
    } finally { sentinel.remove() }
  })
}
