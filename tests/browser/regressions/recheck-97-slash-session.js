import { test, make, para, select, key, assert, equal, texts } from './harness.js'

export function register() {
  test('moving focus away from a slash session cannot erase the next block on Enter', () => {
    const editor = make([para('a', '/'), para('b', 'KEEP')])
    const first = editor.blocks.getBlockById('a').contentElement
    const second = editor.blocks.getBlockById('b').contentElement
    select(first, 1)
    first.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    const menu = editor.rootElement.querySelector('.oe-slash-menu')
    assert(menu.style.display !== 'none', 'slash session must open first')
    select(second, 4)
    equal(menu.style.display, 'none', 'focus change must close the old menu')
    key(second, 'Enter')
    equal(texts(editor), ['/', 'KEEP', ''])
    editor.undo(); equal(texts(editor), ['/', 'KEEP'])
  })

  test('retained slash menu items cannot convert a replacement with the same block id', () => {
    const editor = make([para('a', '/')])
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 1)
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    const item = editor.rootElement.querySelector('.oe-slash-menu__item')
    assert(item)
    editor.render({ version: '1', blocks: [para('a', 'replacement')] }, undefined, { focus: false })
    const before = editor.save().blocks
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    equal(editor.save().blocks, before)
  })

  for (const change of ['reopen', 'filter', 'keyboard redraw']) {
    test(`retained slash pointer item is inert after ${change}`, () => {
      const editor = make([para('a', '/')])
      const field = editor.blocks.getBlockById('a').contentElement
      const notify = () => field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      select(field, 1); notify()
      const menu = editor.rootElement.querySelector('.oe-slash-menu')
      const oldItem = menu.querySelector('.oe-slash-menu__item')
      assert(oldItem)
      if (change === 'reopen') {
        key(field, 'Escape')
        field.textContent = '/'; select(field, 1); notify()
      } else if (change === 'filter') {
        field.textContent = '/para'; select(field, 5); notify()
      } else key(field, 'ArrowDown')
      const currentItem = menu.querySelector('.oe-slash-menu__item')
      assert(currentItem && currentItem !== oldItem)
      const before = editor.save().blocks
      oldItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      equal(editor.save().blocks, before)
      assert(menu.style.display !== 'none', 'stale action must not close the live menu')
      currentItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      equal(texts(editor), [''])
      equal(menu.style.display, 'none')
      editor.undo(); equal(editor.save().blocks, before)
    })
  }

}
