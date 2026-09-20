import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Heading } from '../../../plugins/heading/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, select, key, assert, equal } from './harness.js'

function setup(withFilter = false) {
  const editor = make([para('a', 'Keep')], {
    plugins: [new Paragraph(), new Heading()],
    inlinePlugins: [createColorSwatchPlugin()],
    tuning: {
      undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
      animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
      toolbar: { filterThreshold: withFilter ? 0 : 7 }, mobileBreakpoint: 1,
    },
  })
  select(editor.blocks.getBlockById('a').contentElement, 0)
  editor.rootElement.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)').click()
  const menu = editor.rootElement.querySelector('.oe-toolbox')
  assert(menu && menu.style.display !== 'none')
  return { editor, menu }
}

export function register() {
  test('toolbox focused block items activate by Enter and Space with Undo and Redo', () => {
    for (const activation of ['Enter', ' ']) {
      const { editor, menu } = setup()
      const before = editor.save().blocks
      const item = menu.querySelector('[data-plugin-type="heading"]')
      item.focus()
      equal(key(item, activation).defaultPrevented, true)
      equal(editor.save().blocks.map(block => block.type), ['paragraph', 'heading'])
      assert(editor.undo())
      equal(editor.save().blocks, before)
      assert(editor.redo())
      equal(editor.save().blocks.map(block => block.type), ['paragraph', 'heading'])
    }
  })

  test('toolbox search keeps Space as text but Enter chooses the visible result', () => {
    const { editor, menu } = setup(true)
    const field = menu.querySelector('input')
    assert(field)
    field.focus()
    equal(key(field, ' ').defaultPrevented, false)
    field.value = 'heading'
    field.dispatchEvent(new InputEvent('input', { bubbles: true }))
    equal(key(field, 'Enter').defaultPrevented, true)
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'heading'])
  })

  test('toolbox inline item activates by keyboard and remains undoable', () => {
    const { editor, menu } = setup()
    const before = editor.save().blocks
    const item = menu.querySelector('[data-plugin-type="color"]')
    item.focus()
    equal(key(item, 'Enter').defaultPrevented, true)
    equal(editor.blocks.getBlockById('a').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
    assert(editor.undo())
    equal(editor.save().blocks, before)
    assert(editor.redo())
    equal(editor.blocks.getBlockById('a').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
  })
}
