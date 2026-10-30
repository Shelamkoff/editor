import { createQuotePlugin } from '../../../plugins/quote/index.js'
import { createWarningPlugin } from '../../../plugins/warning/index.js'
import { createImagePlugin } from '../../../plugins/image/index.js'
import { createEmbedPlugin } from '../../../plugins/embed/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { dispatchKey, printable } from '../native-input-helpers.js'
import { test, make, blockElement, assert, equal } from './harness.js'
import { pixel } from '../plugin-parity-fixtures.js'

const richText = '<b>Alpha</b> {{mention}} {{color}} tail'
const sidecar = {
  mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
  color: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
}

function caret(field, offset) {
  equal(document.activeElement, field, 'An unrelated update moved author focus')
  const selection = getSelection()
  assert(selection.isCollapsed && field.contains(selection.anchorNode), 'The author caret left its field')
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset)
}

const scenarios = [
  { name: 'Quote text', definition: createQuotePlugin(), field: 'text', selector: '.oe-quote__text',
    data: { text: richText, caption: 'Original caption' }, sibling: 'caption', value: 'Changed caption' },
  { name: 'Quote caption', definition: createQuotePlugin(), field: 'caption', selector: '.oe-quote__caption',
    data: { text: 'Original quote', caption: richText }, sibling: 'text', value: 'Changed quote' },
  { name: 'Warning title', definition: createWarningPlugin(), field: 'title', selector: '.oe-warning__title',
    data: { title: richText, message: 'Original message' }, sibling: 'message', value: 'Changed message' },
  { name: 'Warning message', definition: createWarningPlugin(), field: 'message', selector: '.oe-warning__message',
    data: { title: 'Original title', message: richText }, sibling: 'title', value: 'Changed title' },
  { name: 'Image caption', definition: createImagePlugin(), field: 'caption', selector: '.oe-image__caption',
    data: { file: { url: pixel }, caption: richText, withBorder: false, expanded: false, withBackground: false, styles: {} },
    sibling: 'withBorder', value: true },
  { name: 'Embed caption', definition: createEmbedPlugin({ resolvePreview: false }), field: 'caption', selector: '.oe-embed__caption',
    data: { service: 'vimeo', videoId: '12345', caption: richText, cover: pixel, title: 'Original title', duration: '' },
    sibling: 'title', value: 'Changed title' },
]

function fixture(scenario) {
  const { definition } = scenario
  const input = [{ id: 'subject', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: structuredClone(scenario.data), inline: structuredClone(sidecar) }]
  const caller = structuredClone(input)
  let searches = 0
  const editor = make(input, {
    plugins: [definition], defaultBlock: definition.type,
    inlinePlugins: [createMentionPlugin({ searchFunction: async () => { searches++; return [] } }), createColorSwatchPlugin()],
  })
  equal(editor.save().blocks, input)
  return { editor, input, caller, searches: () => searches }
}

for (const scenario of scenarios) test(`${scenario.name} rich sibling update retains native text nodes and widgets through keyboard history`, async () => {
  const { field: fieldKey, selector, sibling, value } = scenario
  const { editor, input, caller, searches } = fixture(scenario)
  assert(editor.blocks.focus('subject', { fieldKey, offset: 2 }))
  const field = blockElement(editor, 'subject').querySelector(selector)
  const text = field.querySelector('b').firstChild
  const widgets = [...field.querySelectorAll('[data-inline-plugin][data-id]')]
  equal(widgets.length, 2)
  await printable('X')
  const edited = structuredClone(input)
  edited[0].data[fieldKey] = richText.replace('Alpha', 'AlXpha')
  equal(editor.save().blocks, edited)
  caret(field, 3)

  editor.blocks.update('subject', current => ({ data: { ...current.data, [sibling]: value } }))
  const changed = structuredClone(edited)
  changed[0].data[sibling] = value
  equal(editor.save().blocks, changed)
  equal(blockElement(editor, 'subject').querySelector(selector), field, 'An unchanged rich field replaced its editing host')
  equal(field.querySelector('b').firstChild, text, 'An unchanged rich field replaced its native Text node')
  equal([...field.querySelectorAll('[data-inline-plugin][data-id]')], widgets, 'An unchanged rich field recreated its widgets')
  caret(field, 3)
  await printable('Y')
  const continued = structuredClone(changed)
  continued[0].data[fieldKey] = richText.replace('Alpha', 'AlXYpha')
  equal(editor.save().blocks, continued)
  caret(field, 4)

  for (const expected of [changed, edited, input]) {
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, expected, 'Keyboard Undo did not preserve the three independent actions')
  }
  assert(!editor.canUndo)
  for (const expected of [edited, changed, continued]) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, expected, 'Keyboard Redo did not preserve the three independent actions')
  }
  assert(!editor.canRedo)
  equal(input, caller, 'Projection changed the caller document')
  equal(searches(), 0)
})

for (const scenario of scenarios) test(`${scenario.name} rich sibling update preserves a backward range and its replacement`, async () => {
  const { field: fieldKey, selector, sibling, value } = scenario
  const { editor, input, caller, searches } = fixture(scenario)
  assert(editor.blocks.focus('subject', { fieldKey, offset: 1 }))
  const field = blockElement(editor, 'subject').querySelector(selector)
  const text = field.querySelector('b').firstChild
  const widgets = [...field.querySelectorAll('[data-inline-plugin][data-id]')]
  const selection = getSelection()
  selection.setBaseAndExtent(text, 4, text, 1)
  editor.blocks.update('subject', current => ({ data: { ...current.data, [sibling]: value } }))
  const changed = structuredClone(input)
  changed[0].data[sibling] = value
  equal(editor.save().blocks, changed)
  equal(document.activeElement, field)
  equal([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset], [text, 4, text, 1],
    'A sibling update replaced or collapsed a backward author range')
  equal([...field.querySelectorAll('[data-inline-plugin][data-id]')], widgets)
  await printable('Z')
  const replaced = structuredClone(changed)
  replaced[0].data[fieldKey] = richText.replace('Alpha', 'AZa')
  equal(editor.save().blocks, replaced)
  caret(field, 2)
  for (const expected of [changed, input]) {
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, expected)
  }
  assert(!editor.canUndo)
  for (const expected of [changed, replaced]) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, expected)
  }
  assert(!editor.canRedo)
  equal(input, caller)
  equal(searches(), 0)
})

for (const scenario of scenarios.filter(item => ['image', 'embed'].includes(item.definition.type))) {
  test(`${scenario.name} rich field retains native text and widget owners across read-only modes`, async () => {
    const { field: fieldKey, selector } = scenario
    const { editor, input, searches } = fixture(scenario)
    assert(editor.blocks.focus('subject', { fieldKey, offset: 2 }))
    const field = blockElement(editor, 'subject').querySelector(selector)
    const text = field.querySelector('b').firstChild
    const widgets = [...field.querySelectorAll('[data-inline-plugin][data-id]')]
    await printable('X')
    const edited = structuredClone(input)
    edited[0].data[fieldKey] = richText.replace('Alpha', 'AlXpha')
    equal(editor.save().blocks, edited)
    for (const readOnly of [true, false]) {
      editor.setReadOnly(readOnly)
      equal(editor.readOnly, readOnly)
      equal(editor.save().blocks, edited, 'A mode transition changed canonical author text')
      equal(blockElement(editor, 'subject').querySelector(selector), field, 'A mode transition replaced the caption host')
      equal(field.querySelector('b').firstChild, text, 'A mode transition replaced the unchanged author Text node')
      equal([...field.querySelectorAll('[data-inline-plugin][data-id]')], widgets, 'A mode transition replaced the caption widgets')
    }
    assert(editor.blocks.focus('subject', { fieldKey, offset: 3 }))
    await printable('Y')
    const continued = structuredClone(edited)
    continued[0].data[fieldKey] = richText.replace('Alpha', 'AlXYpha')
    equal(editor.save().blocks, continued)
    for (const expected of [edited, input]) {
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, expected, 'A mode transition authored an unexpected history action')
    }
    assert(!editor.canUndo)
    equal(searches(), 0)
  })
}
