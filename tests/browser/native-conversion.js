import { createParagraphPlugin, createHeadingPlugin, createListPlugin, createCodePlugin } from '../../plugins/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dragAcross, dispatchKey } from './native-input-helpers.js'

function mount(blocks, options = {}) {
  return make(blocks, {
    injectStyles: true,
    plugins: [createParagraphPlugin(), createHeadingPlugin(), createListPlugin(), createCodePlugin()],
    ...options,
  })
}

async function chooseType(editor, type) {
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  const dropdown = root.querySelector('.oe-inline-toolbar__type-dropdown')
  assert(dropdown instanceof HTMLElement && getComputedStyle(dropdown).display !== 'none', 'native type dropdown did not open')
  await clickNative(dropdown.querySelector(`[data-plugin-type="${type}"]`))
  await pause(35)
}

async function checkHistory(editor, before, after) {
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'native conversion Undo changed original identity, content or order')
  equal(editor.canUndo, false, 'conversion created more than one history entry')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after, 'native conversion Redo changed converted identity, content or order')
}

for (const backwards of [false, true]) {
  test(`native mouse ${backwards ? 'backward' : 'forward'} cross-block conversion preserves unselected edges and one Undo`, async () => {
    const editor = mount([para('a', 'Alpha'), para('middle', 'Middle'), para('b', 'Bravo')])
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, backwards)
    await chooseType(editor, 'heading')
    const after = editor.save().blocks
    equal(after.map(block => [block.type, block.data.text]), [
      ['paragraph', 'Al'], ['heading', 'pha'], ['heading', 'Middle'], ['heading', 'Bra'], ['paragraph', 'vo'],
    ])
    const field = editableField(editor, after[3].id)
    assert(document.activeElement === field, 'native conversion focus escaped the last converted block')
    const selection = window.getSelection()
    assert(selection.isCollapsed, 'native conversion did not leave a caret')
    equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 0)
    await checkHistory(editor, before, after)
  })
}

for (const type of ['list', 'code']) {
  test(`native cross-block conversion to ${type} preserves all selected pieces and one Undo`, async () => {
    const editor = mount([para('a', 'Alpha'), para('middle', 'Middle'), para('b', 'Bravo')])
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, type === 'code')
    await chooseType(editor, type)
    const after = editor.save().blocks
    equal(after.map(block => [block.type, block.data.text ?? block.data.code ?? block.data.items.map(item => item.text).join('\n')]), [
      ['paragraph', 'Al'], [type, 'pha'], [type, 'Middle'], [type, 'Bra'], ['paragraph', 'vo'],
    ])
    if (type === 'list') {
      equal(after.slice(1, 4).map(block => block.data.style), ['unordered', 'unordered', 'unordered'])
    }
    const field = editableField(editor, after[3].id, type === 'code' ? 'textarea' : '[contenteditable="true"]')
    assert(document.activeElement === field, 'native conversion lost focus in the last selected piece')
    if (type === 'code') equal([field.selectionStart, field.selectionEnd], [0, 0])
    else equal(getTextOffset(field, window.getSelection().anchorNode, window.getSelection().anchorOffset), 0)
    await checkHistory(editor, before, after)
  })
}

test('native mixed Heading/Paragraph/List conversion preserves unselected heading and list data', async () => {
  const editor = mount([
    { id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha', level: 3 } },
    para('middle', 'Middle'),
    { id: 'b', type: 'list', dataVersion: 2, data: { style: 'ordered', items: [{ id: 'first', text: 'Bravo' }, { id: 'tail', text: 'Tail' }] } },
  ])
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 3, true)
  await chooseType(editor, 'paragraph')
  const after = editor.save().blocks
  equal(after.map(block => block.type), ['heading', 'paragraph', 'paragraph', 'paragraph', 'list'])
  equal(after[0].data, { text: 'Al', level: 3 })
  equal(after.slice(1, 4).map(block => block.data.text), ['pha', 'Middle', 'Bra'])
  equal(after[4].data.style, 'ordered')
  equal(after[4].data.items.map(item => item.text), ['vo', 'Tail'])
  equal(after[4].data.items[1], { id: 'tail', text: 'Tail' }, 'conversion changed the untouched list item')
  await checkHistory(editor, before, after)
})

test('native whole cross-block conversion preserves author marks and atomic widget payloads', async () => {
  const editor = mount([
    para('a', 'A<b>B</b>{{color-a}}C', { inline: { 'color-a': { type: 'color', dataVersion: 1, data: { value: '#ff0000' } } } }),
    para('b', 'D{{color-b}}EF', { inline: { 'color-b': { type: 'color', dataVersion: 1, data: { value: '#00ff00' } } } }),
  ], { inlinePlugins: [createColorSwatchPlugin()] })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 4, true)
  await chooseType(editor, 'heading')
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type, block.data.text, block.inline]), before.map(block => [block.id, 'heading', block.data.text, block.inline]))
  equal(editableField(editor, 'a').querySelector('b')?.textContent, 'B')
  equal([...editorRoot(editor).querySelectorAll('[data-inline-plugin="color"]')].map(widget => [widget.dataset.value, widget.contentEditable]), [
    ['#ff0000', 'false'], ['#00ff00', 'false'],
  ])
  await checkHistory(editor, before, after)
})

test('native cross-block conversion to Code rejects loss of inline widgets without partial changes', async () => {
  const editor = mount([
    para('a', 'A{{color-a}}BC', { inline: { 'color-a': { type: 'color', dataVersion: 1, data: { value: '#ff0000' } } } }),
    para('b', 'DEFG'),
  ], { inlinePlugins: [createColorSwatchPlugin()] })
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 4)
  await chooseType(editor, 'code')
  equal(editor.save().blocks, before, 'rejected native conversion changed part of the document')
  equal(editor.canUndo, false, 'rejected conversion created history')
  equal(editableField(editor, 'a').querySelector('[data-inline-plugin="color"]')?.contentEditable, 'false')
})

await run()
