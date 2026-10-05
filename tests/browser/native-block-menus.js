import { createParagraphPlugin, createHeadingPlugin, createListPlugin, createCodePlugin } from '../../plugins/index.js'
import * as blockPlugins from '../../plugins/index.js'
import { pluginParityFixtures } from './plugin-parity-fixtures.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import en from '../../locale/en.js'
import { test, make, para, editableField, editorRoot, blockElement, pause, select, assert, equal, expectError, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross } from './native-input-helpers.js'

function mount(blocks = [para('a', 'Alpha'), para('b', 'Bravo')], locale = ru) {
  return make(blocks, { injectStyles: true, locale, plugins: [createParagraphPlugin(), createHeadingPlugin(), createListPlugin(), createCodePlugin()] })
}
function panelEditor(render) {
  const paragraph = createParagraphPlugin()
  return make([para('a', 'Alpha')], { injectStyles: true, plugins: [{
    ...paragraph, capabilities: { ...paragraph.capabilities, settings: { kind: 'panel', render } },
  }, createHeadingPlugin()] })
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

test('native moved block keeps add and tune buttons beside it after animation and history', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')])
  const root = editorRoot(editor)
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__drag')
  await clickNative(item(root.querySelector('.oe-settings-menu'), 'Переместить вниз'))
  await pause(260)
  equal(editor.save().blocks.map(block => block.id), ['b', 'a', 'c'])
  function checkButtons() {
    const block = blockElement(editor, 'a').getBoundingClientRect()
    const toolbar = root.querySelector('.oe-toolbar').getBoundingClientRect()
    assert(Math.abs(toolbar.top - block.top) <= 2, 'Moved block buttons stayed at the previous position: ' + JSON.stringify({ block: block.toJSON(), toolbar: toolbar.toJSON() }))
    assert(toolbar.left >= block.right - 1, 'Buttons overlap block content')
  }
  checkButtons()
  await dispatchKey('z', 'KeyZ', 90, 2)
  await pause(260)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  checkButtons()
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  await pause(260)
  equal(editor.save().blocks.map(block => block.id), ['b', 'a', 'c'])
  checkButtons()
})

test('native tune conversion acts on the selected fragment instead of the whole block', async () => {
  const editor = mount([para('a', 'Alpha bravo'), para('b', 'Tail')])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 2, 5)
  await pause(30)
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const menu = root.querySelector('.oe-settings-menu')
  await clickNative(item(menu, 'Преобразовать в'))
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
  await pause(260)
  const after = editor.save().blocks
  equal(after.map(block => [block.type, block.data.text]), [['paragraph', 'Al'], ['heading', 'pha'], ['paragraph', ' bravo'], ['paragraph', 'Tail']], 'Tune converted unselected author text')
  await history(editor, before, after)
})

test('native whole block conversion offers a non-text Delimiter target and one Undo', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Tail')], {
    injectStyles: true, locale: ru,
    plugins: [createParagraphPlugin(), blockPlugins.createDelimiterPlugin()],
  })
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__drag')
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  await clickNative(item(menu, 'Преобразовать в'))
  await clickNative(menu.querySelector('[data-plugin-type="delimiter"]'))
  await pause(260)
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type]), [['a', 'delimiter'], ['b', 'paragraph']], 'A visible conversion target did not convert the block')
  await history(editor, before, after)
})

test('native tune conversion follows its focused shell rather than a caret in another block', async () => {
  const editor = mount()
  await clickNative(editableField(editor, 'a'))
  const shell = blockElement(editor, 'b')
  shell.tabIndex = -1
  shell.focus()
  assert(window.getSelection().anchorNode && blockElement(editor, 'a').contains(window.getSelection().anchorNode), 'Fixture lost the previous text caret')
  await pause(30)
  const before = editor.save().blocks
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  await clickNative(item(menu, 'Преобразовать в'))
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
  await pause(260)
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type, block.data.text]), [['a', 'paragraph', 'Alpha'], ['b', 'heading', 'Bravo']], 'Tune converted the previous caret owner')
  await history(editor, before, after)
})

test('native paragraph and part of a List convert to one Image block', async () => {
  const list = createListPlugin()
  const editor = make([para('a', 'Alpha'), {
    id: 'b', type: 'list', dataVersion: list.schema.currentVersion,
    data: { style: 'ordered', items: [{ id: 'first', text: 'Bravo' }, { id: 'second', text: 'Charlie' }, { id: 'third', text: 'Delta' }] },
  }, para('tail', 'Tail')], { injectStyles: true, locale: ru, plugins: [createParagraphPlugin(), list, blockPlugins.createImagePlugin()] })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b', '[data-item-id="second"]'), 7)
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="image"]'))
  await pause(260)
  const after = editor.save().blocks
  equal(after.map(block => block.type), ['paragraph', 'image', 'list', 'paragraph'], 'Cross-block conversion created one image for each source block')
  equal(after[0].data.text, 'Al')
  equal(after[2].data, { style: 'ordered', items: [{ id: 'third', text: 'Delta' }] })
  equal(after[3], before[2], 'Conversion changed unselected tail')
  assert(!root.classList.contains('oe-editor--cross-selecting'), 'Converted Image retained the previous cross-block highlight')
  assert(!window.getSelection().rangeCount || window.getSelection().isCollapsed, 'Converted Image retained a native text range')
  equal(root.querySelector('.oe-inline-toolbar').style.display, 'none', 'Converted Image retained a text toolbar')
  await history(editor, before, after)
})

for (const [name, factory] of [['Gallery', blockPlugins.createGalleryPlugin], ['Carousel', blockPlugins.createCarouselPlugin]]) {
test('native cross-block tune conversion to ' + name + ' inserts one non-text target', async () => {
  const editor = make([para('a', 'Alpha'), para('middle', 'Middle'), para('b', 'Bravo')], {
    injectStyles: true, locale: ru,
    plugins: [createParagraphPlugin(), factory()],
  })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3)
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  await clickNative(item(menu, 'Преобразовать в'))
  const type = factory().type
  await clickNative(menu.querySelector('[data-plugin-type="' + type + '"]'))
  await pause(260)
  const after = editor.save().blocks
  equal(after.map(block => [block.type, block.data.text]), [['paragraph', 'Al'], [type, undefined], ['paragraph', 'vo']], 'Non-text conversion created one empty target per selected block')
  await history(editor, before, after)
})
}

for (const fixture of pluginParityFixtures) {
  for (const mode of ['whole', 'tune fragment', 'inline fragment']) {
    test('native every conversion target ' + fixture.name + ' / ' + mode + ' preserves unselected content and atomic history', async () => {
      const target = fixture.factory()
      const sourceType = target.type === 'paragraph' ? 'heading' : 'paragraph'
      const text = mode === 'whole' ? 'Alpha' : 'Alpha bravo'
      const definition = sourceType === 'heading' ? createHeadingPlugin() : createParagraphPlugin()
      const editor = make([
        { id: 'a', type: sourceType, dataVersion: definition.schema.currentVersion, data: { ...definition.schema.createDefault(), text } },
        para('b', 'Tail'),
      ], { injectStyles: true, locale: ru, plugins: [definition, target] })
      const before = editor.save().blocks
      if (mode === 'whole') await clickNative(editableField(editor, 'a'))
      else { select(editableField(editor, 'a'), 2, 5); await pause(30) }
      const root = editorRoot(editor)
      let menu
      if (mode === 'inline fragment') {
        await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
        menu = root.querySelector('.oe-inline-toolbar__type-dropdown')
      } else {
        await clickNative(root.querySelector('.oe-toolbar__drag'))
        menu = root.querySelector('.oe-settings-menu')
        await clickNative(item(menu, 'Преобразовать в'))
      }
      await clickNative(menu.querySelector('[data-plugin-type="' + target.type + '"]'))
      await pause(260)
      const after = editor.save().blocks
      equal(after.at(-1), before[1], 'Conversion changed the unselected tail block')
      if (mode === 'whole') {
        equal(after.map(block => [block.id, block.type]), [['a', target.type], ['b', 'paragraph']])
      } else {
        equal(after.map(block => block.type), [sourceType, target.type, sourceType, 'paragraph'])
        equal([after[0].data.text, after[2].data.text], ['Al', ' bravo'], 'Conversion changed unselected prefix/suffix')
        if (target.type === 'paragraph' || target.type === 'heading') equal(after[1].data.text, 'pha')
      }
      assert(root.contains(document.activeElement), 'Conversion lost editor focus')
      await history(editor, before, after)
    })
  }
}

for (const backwards of [false, true]) {
  test('native tune ' + (backwards ? 'backward' : 'forward') + ' cross-block conversion restores the directed range on Undo', async () => {
    const editor = mount([para('a', 'Alpha'), para('middle', 'Middle'), para('b', 'Bravo')])
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backwards)
    const root = editorRoot(editor)
    await clickNative(root.querySelector('.oe-toolbar__drag'))
    const menu = root.querySelector('.oe-settings-menu')
    await clickNative(item(menu, 'Преобразовать в'))
    await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
    await pause(260)
    const after = editor.save().blocks
    equal(after.map(block => [block.type, block.data.text]), [['paragraph', 'Al'], ['heading', 'pha'], ['heading', 'Middle'], ['heading', 'Bra'], ['paragraph', 'vo']])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    const selection = window.getSelection()
    const anchor = editableField(editor, backwards ? 'b' : 'a')
    const focus = editableField(editor, backwards ? 'a' : 'b')
    assert(anchor.contains(selection.anchorNode) && focus.contains(selection.focusNode), 'Undo restored another range owner/direction')
    equal([getTextOffset(anchor, selection.anchorNode, selection.anchorOffset), getTextOffset(focus, selection.focusNode, selection.focusOffset)], backwards ? [3, 2] : [2, 3])
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
  })
}

for (const moveMs of [0, 500]) {
  test('native block buttons track every visual animation frame and repeated moves / ' + moveMs + 'ms', async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')], { injectStyles: true, locale: ru, blockMoveAnimationMs: moveMs })
    const root = editorRoot(editor)
    await clickNative(editableField(editor, 'a'))
    for (const [label, order] of [['Переместить вниз', ['b', 'a', 'c']], ['Переместить вверх', ['a', 'b', 'c']]]) {
      if (!root.querySelector('.oe-settings-menu').checkVisibility()) await clickNative(root.querySelector('.oe-toolbar__drag'))
      await clickNative(item(root.querySelector('.oe-settings-menu'), label))
      equal(editor.save().blocks.map(block => block.id), order)
      for (let frame = 0; frame < 16; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        const block = blockElement(editor, 'a').getBoundingClientRect()
        const toolbar = root.querySelector('.oe-toolbar').getBoundingClientRect()
        assert(Math.abs(block.top - toolbar.top) <= 2, 'Buttons detached during animation: ' + JSON.stringify({ frame, block: block.top, toolbar: toolbar.top }))
      }
      await pause(moveMs + 20)
    }
    editor.setReadOnly(true)
    equal(root.querySelector('.oe-toolbar').style.display, 'none')
    editor.setReadOnly(false)
    await clickNative(editableField(editor, 'a'))
    equal(Math.round(root.querySelector('.oe-toolbar').getBoundingClientRect().top), Math.round(blockElement(editor, 'a').getBoundingClientRect().top))
  })
}

for (const backwards of [false, true]) {
  test('native tune mixed selection can choose the current owner type / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = mount([
      { id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha', level: 3 } },
      para('middle', 'Middle'), para('b', 'Bravo'),
    ])
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backwards)
    const root = editorRoot(editor)
    await clickNative(root.querySelector('.oe-toolbar__drag'))
    const menu = root.querySelector('.oe-settings-menu')
    await clickNative(item(menu, 'Преобразовать в'))
    const type = backwards ? 'paragraph' : 'heading'
    const choice = menu.querySelector('[data-plugin-type="' + type + '"]')
    assert(choice.getAttribute('aria-disabled') !== 'true', 'Current owner type is disabled for a mixed cross-block selection')
    await clickNative(choice)
    await pause(260)
    const after = editor.save().blocks
    equal(after.map(block => [block.type, block.data.text]), [['heading', 'Al'], [type, 'pha'], [type, 'Middle'], [type, 'Bra'], ['paragraph', 'vo']])
    await history(editor, before, after)
  })
}

test('native tune moves keep the menu usable, preserve the caret and update boundary arrows like v1', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')])
  select(editableField(editor, 'a'), 2)
  await pause(30)
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const menu = root.querySelector('.oe-settings-menu')
  await clickNative(item(menu, 'Переместить вниз'))
  await pause(260)
  assert(menu.checkVisibility(), 'Move closed the tune menu instead of keeping the v1 move controls available')
  equal(editor.save().blocks.map(block => block.id), ['b', 'a', 'c'])
  await clickNative(item(menu, 'Переместить вниз'))
  await pause(260)
  equal(editor.save().blocks.map(block => block.id), ['b', 'c', 'a'])
  equal(item(menu, 'Переместить вниз').getAttribute('aria-disabled'), 'true', 'Move did not refresh the bottom boundary')
  await dispatchKey('Escape', 'Escape', 27)
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  // Reopening from its chrome preserves the command caret, rather than zeroing it.
  await dispatchKey('Escape', 'Escape', 27)
  const selection = window.getSelection()
  const field = editableField(editor, 'a')
  assert(selection.isCollapsed && field.contains(selection.anchorNode), 'Move lost the original caret owner')
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 2, 'Tune Move reset the author caret')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks.map(block => block.id), ['b', 'a', 'c'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks.map(block => block.id), ['a', 'b', 'c'])
  equal(editor.canUndo, false)
})

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

test('native inline conversion menu stays outside its toolbar', async () => {
  const editor = mount([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 2 } }])
  const root = editorRoot(editor)
  root.style.marginTop = '260px'
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  const toolbar = root.querySelector('.oe-inline-toolbar').getBoundingClientRect()
  const menu = root.querySelector('.oe-inline-toolbar__type-dropdown').getBoundingClientRect()
  assert(menu.top >= toolbar.bottom + 3 || menu.bottom <= toolbar.top - 3,
    'Conversion menu overlaps its toolbar: ' + JSON.stringify({ toolbar: toolbar.toJSON(), menu: menu.toJSON() }))
  equal(window.getSelection().toString(), 'Alpha', 'opening conversion menu lost selection')
  equal(editor.canUndo, false)
})

for (const menuKind of ['type', 'level']) {
  for (const [position, top, left] of [['top', 40, 8], ['right', 120, 94], ['bottom', 240, 8]]) {
    test('native inline menu fits viewport without covering toolbar: ' + menuKind + ' / ' + position, async () => {
      try {
        await window.__testInput('Viewport.set', { width: 390, height: 340 })
        const editor = make([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 2 } }], {
          injectStyles: true, locale: ru, plugins: Object.values(blockPlugins).map(create => create()),
        })
        const root = editorRoot(editor)
        Object.assign(root.style, { position: 'fixed', top: top + 'px', left: left + 'px', width: '288px' })
        select(editableField(editor, 'a'), 0, 5)
        await pause(30)
        const trigger = root.querySelector(menuKind === 'type' ? '.oe-inline-toolbar__type-select' : '.oe-inline-toolbar__level-select')
        await clickNative(trigger)
        const menu = root.querySelector(menuKind === 'type' ? '.oe-inline-toolbar__type-dropdown' : '.oe-inline-toolbar__level-dropdown')
        function checkBounds() {
          const rect = menu.getBoundingClientRect()
          const toolbar = root.querySelector('.oe-inline-toolbar').getBoundingClientRect()
          assert(rect.top >= toolbar.bottom + 3 || rect.bottom <= toolbar.top - 3, 'Menu covers toolbar')
          assert(rect.left >= 7 && rect.right <= innerWidth - 7 && rect.top >= 7 && rect.bottom <= innerHeight - 7,
            'Menu escapes viewport: ' + JSON.stringify(rect.toJSON()))
          assert(menu.scrollWidth <= menu.clientWidth + 1, 'Menu overflows horizontally')
        }
        checkBounds()
        if (position === 'bottom') assert(menu.getBoundingClientRect().bottom < trigger.getBoundingClientRect().top, 'Menu did not flip above')
        if (position === 'top') assert(menu.getBoundingClientRect().top > trigger.getBoundingClientRect().bottom, 'Menu did not prefer below')
        if (menuKind === 'type') {
          const options = [...menu.querySelectorAll('[role="menuitem"]')]
          equal(options.length, 21, 'Conversion menu lost a plugin')
          options[0].focus()
          await dispatchKey('End', 'End', 35)
          assert(document.activeElement === options.at(-1), 'Last plugin is unreachable')
          checkBounds()
          const filter = menu.querySelector('input')
          await clickNative(filter)
          await window.__testInput('Input.insertText', { text: 'Заголовок' })
          await pause(30)
          checkBounds()
          equal(options.filter(option => option.style.display !== 'none').map(option => option.dataset.pluginType), ['heading'])
        }
        menu.querySelector('[role^="menuitem"]:not([style*="display: none"])').focus()
        await dispatchKey('Escape', 'Escape', 27)
        equal(trigger.getAttribute('aria-expanded'), 'false')
        equal(window.getSelection().toString(), 'Alpha', 'Menu navigation lost author selection')
        equal(editor.canUndo, false, 'Menu geometry/navigation changed the document')
      } finally {
        await window.__testInput('Viewport.reset', {})
      }
    })
  }
}

test('native Heading ArrowDown opens levels, preserves selection and applies one history action', async () => {
  const editor = mount([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 2 } }])
  const before = editor.save().blocks
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  const root = editorRoot(editor)
  const trigger = root.querySelector('.oe-inline-toolbar__level-select')
  assert(!trigger.hidden, 'Heading level control is missing')
  trigger.focus()
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  equal(trigger.getAttribute('aria-expanded'), 'true', 'ArrowDown did not open Heading levels')
  equal(document.activeElement?.dataset.level, '2', 'ArrowDown did not focus the first level')
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  equal(document.activeElement?.dataset.level, '3')
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].data, { text: 'Alpha bravo', level: 3 })
  equal(window.getSelection().toString(), 'Alpha', 'level change lost the selected text')
  equal(trigger.getAttribute('aria-expanded'), 'false')
  await history(editor, before, after)
})

for (const [locale, label] of [[ru, 'Уровень заголовка'], [en, 'Heading level']]) {
  test('native Heading level menu has localized name, selected option and upward keyboard entry: ' + label, async () => {
    const editor = mount([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 3 } }], locale)
    const before = editor.save().blocks
    select(editableField(editor, 'a'), 0, 5)
    await pause(30)
    const root = editorRoot(editor)
    const trigger = root.querySelector('.oe-inline-toolbar__level-select')
    equal(trigger.getAttribute('aria-label'), label, 'Heading level control lost its localized name')
    assert(trigger.querySelector('svg'), 'Heading level control lost its dropdown arrow')
    trigger.focus()
    await dispatchKey('ArrowUp', 'ArrowUp', 38)
    equal(document.activeElement?.dataset.level, '6', 'ArrowUp did not enter the last level')
    const options = [...root.querySelectorAll('.oe-inline-toolbar__level-dropdown [role="menuitemradio"]')]
    equal(options.length, 5, 'levels are not exposed as exclusive menu options')
    equal(options.filter(option => option.getAttribute('aria-checked') === 'true').map(option => option.dataset.level), ['3'])
    await dispatchKey('Home', 'Home', 36)
    equal(document.activeElement?.dataset.level, '2')
    await dispatchKey('End', 'End', 35)
    equal(document.activeElement?.dataset.level, '6')
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    equal(document.activeElement?.dataset.level, '2', 'level navigation did not wrap')
    await dispatchKey('Escape', 'Escape', 27)
    equal(trigger.getAttribute('aria-expanded'), 'false')
    assert(document.activeElement === trigger, 'Escape did not return focus to the level control')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'level navigation changed author data')
    await dispatchKey('ArrowUp', 'ArrowUp', 38)
    await dispatchKey('Enter', 'Enter', 13)
    equal(editor.save().blocks[0].data.level, 6)
    equal(window.getSelection().toString(), 'Alpha', 'Escape/reopen lost the original selection')
  })
}

test('native open Heading menu cannot change a replacement document with reused block IDs', async () => {
  const editor = mount([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 2 } }])
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  const root = editorRoot(editor)
  const trigger = root.querySelector('.oe-inline-toolbar__level-select')
  trigger.focus()
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  const oldLevel = root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]')
  editor.render({ version: '2.0.0', blocks: [{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Replacement', level: 2 } }] })
  const before = editor.save().blocks
  const undoBefore = editor.canUndo
  oldLevel.click()
  equal(editor.save().blocks, before, 'previous Heading menu changed the replacement document')
  equal(editor.canUndo, undoBefore, 'previous Heading menu changed history availability')
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  await clickNative(trigger)
  await clickNative(root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]'))
  equal(editor.save().blocks[0].data, { text: 'Replacement', level: 3 }, 'fresh Heading menu did not work')
  equal(window.getSelection().toString(), 'Repla')
  editor.undo()
  equal(editor.save().blocks, before, 'fresh level change did not undo in one step')
  editor.undo()
  equal(editor.save().blocks[0].data, { text: 'Alpha bravo', level: 2 }, 'stale menu added an extra history entry')
})

test('native inline conversion menu cannot transform a replacement document with reused block IDs', async () => {
  const editor = mount([para('a', 'Alpha bravo')])
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  const root = editorRoot(editor)
  const trigger = root.querySelector('.oe-inline-toolbar__type-select')
  await clickNative(trigger)
  const oldHeading = root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]')
  oldHeading.focus()
  editor.render({ version: '2.0.0', blocks: [para('a', 'Replacement')] })
  const before = editor.save().blocks
  oldHeading.click()
  equal(editor.save().blocks, before, 'previous conversion menu transformed the replacement document')
  select(editableField(editor, 'a'), 0, 5)
  await pause(30)
  await clickNative(trigger)
  await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
  assert(editor.save().blocks.some(block => block.type === 'heading'), 'fresh conversion menu did not work')
  editor.undo()
  equal(editor.save().blocks, before, 'fresh conversion did not undo in one step')
  editor.undo()
  equal(editor.save().blocks, [para('a', 'Alpha bravo')], 'stale conversion added an extra history entry')
})

test('native closed block settings panel revokes its retained producer', async () => {
  let context
  const paragraph = createParagraphPlugin()
  const plugin = { ...paragraph, capabilities: { ...paragraph.capabilities, settings: {
    kind: 'panel', render(ctx) {
      context = ctx
      const panel = ctx.ownerDocument.createElement('div')
      panel.textContent = 'Custom settings'
      return panel
    },
  } } }
  const editor = make([para('a', 'Alpha')], { injectStyles: true, plugins: [plugin] })
  const before = editor.save().blocks
  await open(editor, '.oe-toolbar__drag')
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  let calls = 0
  context.updateData(data => { calls++; return { ...data, text: 'Retired panel' } })
  equal(calls, 0, 'closed block settings panel still executed its producer')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

for (const [selector, label] of [['.oe-toolbar__drag', 'Удалить'], ['.oe-toolbar__btn', 'Текст']]) {
  for (const transition of ['render', 'conversion and Undo']) {
    test('native previous block menu cannot act on a replacement document: ' + label + ' / ' + transition, async () => {
      const editor = mount()
      await open(editor, selector)
      const root = editorRoot(editor)
      const menu = root.querySelector(selector.endsWith('drag') ? '.oe-settings-menu' : '.oe-toolbox')
      const oldItem = item(menu, label)
      if (transition === 'render') editor.render({ version: '2.0.0', blocks: [para('a', 'Replacement'), para('b', 'Second replacement')] })
      else {
        editor.blocks.convert('a', { type: 'heading' })
        editor.undo()
      }
      const before = editor.save().blocks
      const undoBefore = editor.canUndo
      oldItem.click()
      equal(editor.save().blocks, before, 'previous block menu changed replacement records')
      equal(editor.canUndo, undoBefore, 'previous block menu changed history')
      if (transition === 'render') {
        editor.undo()
        equal(editor.save().blocks, [para('a', 'Alpha'), para('b', 'Bravo')], 'previous block menu created an extra history entry')
      }
    })
  }
}

test('native block settings context cannot read or modify a replacement owner and the successor remains usable', async () => {
  const contexts = []
  const editor = panelEditor(ctx => {
    contexts.push(ctx)
    const panel = ctx.ownerDocument.createElement('div')
    panel.textContent = 'Custom settings'
    return panel
  })
  await open(editor, '.oe-toolbar__drag')
  editor.render({ version: '2.0.0', blocks: [para('a', 'Replacement')] })
  let calls = 0
  contexts[0].updateData(data => { calls++; return { ...data, text: 'Retired panel' } })
  equal(calls, 0)
  equal(contexts[0].getData(), { text: 'Alpha' }, 'previous context read replacement data')
  equal(editor.save().blocks, [para('a', 'Replacement')])
  await open(editor, '.oe-toolbar__drag')
  contexts[1].updateData(data => ({ ...data, text: 'Gamma' }))
  equal(contexts[1].getData(), { text: 'Gamma' }, 'live panel lost access to its own data')
  contexts[0].updateData(() => { calls++; return { text: 'Retired' } })
  equal(calls, 0)
  equal(editor.save().blocks, [para('a', 'Gamma')])
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  equal(contexts[1].getData(), { text: 'Gamma' }, 'closed panel lost its last owned snapshot')
  editor.undo()
  equal(editor.save().blocks, [para('a', 'Replacement')])
  editor.undo()
  equal(editor.save().blocks, [para('a', 'Alpha')])
})

test('native block settings producer stays revoked after readOnly roundtrip and destruction', async () => {
  let context
  const editor = panelEditor(ctx => {
    context = ctx
    const panel = ctx.ownerDocument.createElement('div')
    panel.textContent = 'Custom settings'
    return panel
  })
  await open(editor, '.oe-toolbar__drag')
  context.updateData(data => ({ ...data, text: 'Owned' }))
  const before = editor.save().blocks
  let calls = 0
  const late = () => context.updateData(() => { calls++; return { text: 'Retired' } })
  editor.setReadOnly(true)
  late()
  editor.setReadOnly(false)
  late()
  equal(calls, 0)
  equal(editor.save().blocks, before)
  editor.destroy()
  late()
  equal(calls, 0)
  equal(context.getData(), { text: 'Owned' })
})

test('native failed block settings factory leaves its retained context inert', async () => {
  let context
  let fail = true
  const editor = panelEditor(ctx => {
    context = ctx
    if (fail) throw new Error('Audit settings factory failed')
    return ctx.ownerDocument.createElement('div')
  })
  expectError(/Audit settings factory failed/)
  await open(editor, '.oe-toolbar__drag')
  const failedContext = context
  let calls = 0
  failedContext.updateData(() => { calls++; return { text: 'Failed panel' } })
  equal(calls, 0, 'failed factory retained mutation authority')
  equal(editor.save().blocks, [para('a', 'Alpha')])
  equal(editor.canUndo, false)
  fail = false
  await open(editor, '.oe-toolbar__drag')
  context.updateData(data => ({ ...data, text: 'Success' }))
  failedContext.updateData(() => { calls++; return { text: 'Retired' } })
  equal(calls, 0)
  equal(editor.save().blocks, [para('a', 'Success')])
})

test('native old settings context cannot revive after block conversion and Undo', async () => {
  let context
  const editor = panelEditor(ctx => {
    context = ctx
    return ctx.ownerDocument.createElement('div')
  })
  await open(editor, '.oe-toolbar__drag')
  editor.blocks.convert('a', { type: 'heading' })
  editor.undo()
  let calls = 0
  context.updateData(() => { calls++; return { text: 'Revived' } })
  equal(calls, 0, 'context of a retired block instance revived after Undo')
  equal(editor.save().blocks, [para('a', 'Alpha')])
  equal(editor.canUndo, false)
})

for (const menu of ['type', 'level']) {
  test('native previous inline menu cannot act after conversion and Undo: ' + menu, async () => {
    const editor = mount([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha bravo', level: 2 } }])
    select(editableField(editor, 'a'), 0, 5)
    await pause(30)
    const root = editorRoot(editor)
    await clickNative(root.querySelector(menu === 'type' ? '.oe-inline-toolbar__type-select' : '.oe-inline-toolbar__level-select'))
    const oldItem = root.querySelector(menu === 'type'
      ? '.oe-inline-toolbar__type-dropdown [data-plugin-type="paragraph"]'
      : '.oe-inline-toolbar__level-dropdown [data-level="3"]')
    oldItem.focus()
    editor.blocks.convert('a', { type: 'paragraph' })
    editor.undo()
    const before = editor.save().blocks
    oldItem.click()
    equal(editor.save().blocks, before, 'previous inline menu changed the recreated block')
    equal(editor.canUndo, false)
  })
}

await run()
