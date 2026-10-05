import * as blockPlugins from '../../plugins/index.js'
import { createParagraphPlugin, createListPlugin } from '../../plugins/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { pluginParityFixtures } from './plugin-parity-fixtures.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross } from './native-input-helpers.js'

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

const perBlockTargets = new Set(['paragraph', 'heading', 'list', 'quote', 'checklist', 'code'])
for (const fixture of pluginParityFixtures) {
  for (const menuKind of ['inline', 'tune']) {
    for (const backwards of [false, true]) {
      test('native cross-block grouping ' + fixture.name + ' / ' + menuKind + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
        const target = fixture.factory()
        const list = createListPlugin()
        const editor = make([para('a', 'Alpha'), {
          id: 'b', type: 'list', dataVersion: list.schema.currentVersion,
          data: { style: 'ordered', items: [{ id: 'first', text: 'Bravo' }, { id: 'second', text: 'Charlie' }, { id: 'third', text: 'Delta' }] },
        }, para('tail', 'Tail')], { injectStyles: true, locale: ru, plugins: [createParagraphPlugin(), list, target].filter((plugin, index, all) => all.findIndex(other => other.type === plugin.type) === index) })
        const before = editor.save().blocks
        await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b', '[data-item-id="second"]'), 7, backwards)
        const root = editorRoot(editor)
        let menu
        if (menuKind === 'inline') {
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
        const targets = perBlockTargets.has(target.type) ? [target.type, target.type] : [target.type]
        equal(after.map(block => block.type), ['paragraph', ...targets, 'list', 'paragraph'], 'Wrong number of targets for the selected interval')
        equal(after[0].id, 'a')
        equal(after[0].data.text, 'Al', 'Conversion changed the unselected prefix')
        equal(after.at(-2).id, 'b')
        equal(after.at(-2).data, { style: 'ordered', items: [{ id: 'third', text: 'Delta' }] }, 'Conversion changed unselected List data or item identity')
        equal(after.at(-1), before[2], 'Conversion changed unselected tail')
        if (perBlockTargets.has(target.type)) {
          const texts = after.slice(1, 3).map(block => block.data.text ?? block.data.code ?? block.data.items.map(item => item.text).join('<br>'))
          equal(texts, ['pha', 'Bravo<br>Charlie'], 'Text target discarded selected author text')
        }
        assert(!root.classList.contains('oe-editor--cross-selecting'), 'Conversion retained the previous cross-block highlight')
        assert(!window.getSelection().rangeCount || window.getSelection().isCollapsed, 'Conversion retained the previous native text range')
        equal(root.querySelector('.oe-inline-toolbar').style.display, 'none', 'Conversion retained the previous text toolbar')
        // An empty Embed focuses its auxiliary URL input, whose Undo belongs
        // to that native control. Return to document text for document history.
        if (document.activeElement?.matches('input,select')) await clickNative(editableField(editor, 'a'))
        await dispatchKey('z', 'KeyZ', 90, 2)
        equal(editor.save().blocks, before)
        equal(editor.canUndo, false, 'Conversion was not one history action')
        const selection = window.getSelection()
        const first = editableField(editor, 'a')
        const last = editableField(editor, 'b', '[data-item-id="second"]')
        equal([getTextOffset(backwards ? last : first, selection.anchorNode, selection.anchorOffset), getTextOffset(backwards ? first : last, selection.focusNode, selection.focusOffset)], backwards ? [7, 2] : [2, 7], 'Undo lost the directed cross-block range')
        await dispatchKey('z', 'KeyZ', 90, 2 | 8)
        equal(editor.save().blocks, after)
      })
    }
  }
}

for (const backwards of [false, true]) {
  test('native Image replacement retains unselected inline widgets and restores selected widgets on Undo / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = make([
      para('a', '{{kept}}Alpha{{chosen}}', { inline: {
        kept: { type: 'color', dataVersion: 1, data: { value: '#00ff00' } },
        chosen: { type: 'color', dataVersion: 1, data: { value: '#ff0000' } },
      } }), para('middle', 'Middle'), para('b', 'Bravo'),
    ], { injectStyles: true, locale: ru, plugins: [createParagraphPlugin(), blockPlugins.createImagePlugin()], inlinePlugins: [createColorSwatchPlugin()] })
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 3, editableField(editor, 'b'), 3, backwards)
    const root = editorRoot(editor)
    await clickNative(root.querySelector('.oe-toolbar__drag'))
    const menu = root.querySelector('.oe-settings-menu')
    await clickNative(item(menu, 'Преобразовать в'))
    await clickNative(menu.querySelector('[data-plugin-type="image"]'))
    await pause(260)
    const after = editor.save().blocks
    equal(after.map(block => block.type), ['paragraph', 'image', 'paragraph'])
    equal(after[0].data.text, '{{kept}}Al')
    equal(after[0].inline, { kept: before[0].inline.kept })
    equal(after[2].data.text, 'vo')
    await history(editor, before, after)
  })
}

for (const mode of ['single', 'per-block']) {
  test('native custom caption target obeys explicit conversion grouping / ' + mode, async () => {
    const image = blockPlugins.createImagePlugin()
    const custom = { ...image, type: 'customCaption', capabilities: { ...image.capabilities, conversion: { ...image.capabilities.conversion, selectionMode: mode } } }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true, plugins: [createParagraphPlugin(), custom] })
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3)
    const root = editorRoot(editor)
    await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
    await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="customCaption"]'))
    await pause(260)
    const after = editor.save().blocks
    equal(after.map(block => block.type), mode === 'single' ? ['paragraph', 'customCaption', 'paragraph'] : ['paragraph', 'customCaption', 'customCaption', 'paragraph'])
    if (mode === 'per-block') equal(after.slice(1, 3).map(block => block.data.caption), ['pha', 'Bra'])
    await history(editor, before, after)
  })
}

await run()
