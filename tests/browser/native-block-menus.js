import { createParagraphPlugin, createHeadingPlugin, createListPlugin, createCodePlugin } from '../../plugins/index.js'
import ru from '../../locale/ru.js'
import en from '../../locale/en.js'
import { test, make, para, editableField, editorRoot, blockElement, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey } from './native-input-helpers.js'

function mount(blocks = [para('a', 'Alpha'), para('b', 'Bravo')], locale = ru) {
  return make(blocks, { injectStyles: true, locale, plugins: [createParagraphPlugin(), createHeadingPlugin(), createListPlugin(), createCodePlugin()] })
}
async function open(editor, selector) {
  await clickNative(editableField(editor, 'a'))
  await clickNative(editorRoot(editor).querySelector(selector))
}
function item(menu, label) {
  const found = [...menu.querySelectorAll('[role="menuitem"]')].find(element => element.querySelector('[class$="__label"]')?.textContent === label)
  assert(found, `Missing menu item: ${label}`)
  return found
}
async function history(editor, before, after) {
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'menu action created more than one Undo entry')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  assert(editorRoot(editor).contains(document.activeElement), 'Redo left focus outside the editor')
}

test('desktop block buttons sit to the right and both menus keep a bounded width', async () => {
  const editor = mount()
  await open(editor, '.oe-toolbar__drag')
  const root = editorRoot(editor)
  const block = blockElement(editor, 'a').getBoundingClientRect()
  const toolbar = root.querySelector('.oe-toolbar').getBoundingClientRect()
  assert(toolbar.left >= block.right, `Block buttons overlap the left/content edge: ${JSON.stringify({ block: block.toJSON(), toolbar: toolbar.toJSON() })}`)
  for (const selector of ['.oe-settings-menu', '.oe-toolbox']) {
    if (selector === '.oe-toolbox') await clickNative(root.querySelector('.oe-toolbar__btn'))
    const menu = root.querySelector(selector)
    const rect = menu.getBoundingClientRect()
    assert(rect.width >= 180 && rect.width <= 280, `Unexpected ${selector} width: ${rect.width}`)
    assert(Math.abs(rect.right - toolbar.right) <= 1, `${selector} is not aligned with the buttons`)
    assert(rect.left >= 8 && rect.right <= innerWidth - 8, `${selector} escapes the viewport`)
    assert(menu.scrollWidth <= menu.clientWidth + 1, `${selector} has horizontal overflow`)
  }
})

for (const [locale, heading, label] of [[ru, 'Заголовок', 'Заголовок 3'], [en, 'Heading', 'Heading 3']]) {
  test(`native ${heading} toolbox drills into levels and creates a localized empty heading`, async () => {
    const editor = mount(undefined, locale)
    const before = editor.save().blocks
    await open(editor, '.oe-toolbar__btn')
    const menu = editorRoot(editor).querySelector('.oe-toolbox')
    assert(!menu.querySelector('[data-toolbox-item]'), 'toolbox variants leak into the main menu')
    await clickNative(item(menu, heading))
    equal(menu.querySelectorAll('[data-toolbox-item]').length, 5)
    assert(!menu.querySelector('[data-plugin-type="paragraph"]'), 'root items remain beside the variant view')
    await clickNative(menu.querySelector('[data-toolbox-item="h3"]'))
    await pause(30)
    const after = editor.save().blocks
    equal(after.map(block => [block.type, block.data.level]), [['paragraph', undefined], ['heading', 3], ['paragraph', undefined]])
    const field = editableField(editor, after[1].id)
    equal(field.dataset.placeholder, label, 'empty heading shows an unresolved locale template')
    assert(document.activeElement === field && window.getSelection().isCollapsed, 'new heading lost its caret')
    await history(editor, before, after)
  })
}

test('native toolbox back navigation restores its parent and ordered List is one action', async () => {
  const editor = mount()
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__btn')
  const menu = editorRoot(editor).querySelector('.oe-toolbox')
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
  await clickNative(item(menu, 'Назад'))
  assert(document.activeElement === menu.querySelector('[data-plugin-type="heading"]'), 'back lost its parent menu focus')
  await clickNative(menu.querySelector('[data-plugin-type="list"]'))
  await clickNative(menu.querySelector('[data-toolbox-item="ordered"]'))
  await pause(30)
  const after = editor.save().blocks
  equal(after[1].type, 'list')
  equal(after[1].data.style, 'ordered')
  await history(editor, before, after)
})

test('native settings conversion drills down, goes back and converts atomically', async () => {
  const editor = mount()
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__drag')
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  assert(!menu.querySelector('[data-plugin-type]'), 'conversion targets leak into the main settings menu')
  await clickNative(item(menu, 'Преобразовать в'))
  assert(menu.querySelector('[data-plugin-type="heading"]'), 'conversion view did not open')
  assert(!menu.textContent.includes('Переместить вниз'), 'conversion view still contains main actions')
  await clickNative(item(menu, 'Назад'))
  assert(menu.textContent.includes('Переместить вниз'), 'back did not restore main settings')
  await clickNative(item(menu, 'Преобразовать в'))
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
  await pause(30)
  const after = editor.save().blocks
  equal(after[0].id, 'a')
  equal(after[0].type, 'heading')
  equal(after[0].data.text, 'Alpha')
  await history(editor, before, after)
})

test('native keyboard enters menus and returns from a drill-down to its parent', async () => {
  const editor = mount()
  await open(editor, '.oe-toolbar__btn')
  const root = editorRoot(editor)
  const menu = root.querySelector('.oe-toolbox')
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  equal(document.activeElement?.dataset.pluginType, 'paragraph', 'keyboard did not enter the open menu')
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  equal(document.activeElement?.dataset.pluginType, 'heading')
  await dispatchKey('ArrowRight', 'ArrowRight', 39)
  equal(document.activeElement?.dataset.menuBack, 'true')
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37)
  equal(document.activeElement?.dataset.pluginType, 'heading')
  await dispatchKey('Escape', 'Escape', 27)
  equal(menu.style.display, 'none')
  assert(document.activeElement === root.querySelector('.oe-toolbar__btn'), 'closing the menu lost its trigger focus')
})

test('native responsive menus keep controls with the focused block and fit the phone viewport', async () => {
  const editor = mount()
  await clickNative(editableField(editor, 'a'))
  try {
    await window.__testInput('Viewport.set', { width: 390, height: 844 })
    await pause(40)
    const root = editorRoot(editor)
    assert(root.classList.contains('oe-editor--mobile'), 'real viewport resize did not enable mobile mode')
    const toolbar = root.querySelector('.oe-toolbar')
    assert(toolbar.parentElement === blockElement(editor, 'a'), 'mobile buttons are placed after the document instead of the focused block')
    await clickNative(toolbar.querySelector('.oe-toolbar__drag'))
    const menu = root.querySelector('.oe-settings-menu')
    const rect = menu.getBoundingClientRect()
    equal(Math.round(rect.width), 390)
    equal(Math.round(rect.bottom), 844)
    assert(menu.scrollWidth <= menu.clientWidth + 1, 'mobile menu has horizontal overflow')
    await window.__testInput('Viewport.reset', {})
    await pause(40)
    assert(!root.classList.contains('oe-editor--mobile'), 'desktop mode was not restored')
    assert(toolbar.parentElement === root, 'desktop toolbar stayed inside the block after resize')
  } finally {
    await window.__testInput('Viewport.reset', {})
  }
})

test('an obsolete variant item cannot insert after native back navigation', async () => {
  const editor = mount()
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__btn')
  const menu = editorRoot(editor).querySelector('.oe-toolbox')
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
  const oldVariant = menu.querySelector('[data-toolbox-item="h3"]')
  await clickNative(item(menu, 'Назад'))
  oldVariant.click()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

await run()
