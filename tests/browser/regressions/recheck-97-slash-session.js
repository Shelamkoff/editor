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
}
