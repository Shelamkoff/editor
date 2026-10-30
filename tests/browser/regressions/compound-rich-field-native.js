import { createListPlugin } from '../../../plugins/list/index.js'
import { createChecklistPlugin } from '../../../plugins/checklist/index.js'
import { createTogglePlugin } from '../../../plugins/toggle/index.js'
import { createSpoilerPlugin } from '../../../plugins/spoiler/index.js'
import { createColumnsPlugin } from '../../../plugins/columns/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { printable, dispatchKey } from '../native-input-helpers.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { test, make, blockElement, assert, equal } from './harness.js'

const rich = '<b>Alpha</b> <i>{{mention}}</i> <mark>{{swatch}}</mark> tail'
const sidecars = () => ({
  mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
  swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
})

function observe(definition, occurrences) {
  return { ...definition, setup(context) {
    const runtime = definition.setup(context)
    return { ...runtime, create(...args) {
      const instance = Reflect.apply(runtime.create, runtime, args)
      occurrences.push({ instance, context: args.at(-1) })
      return instance
    } }
  } }
}

const fixtures = [
  {
    name: 'List', create: createListPlugin, fieldKey: 'item:active', selector: '[data-item-id="active"]',
    data: (text, sibling = 'Sibling') => ({ style: 'unordered', items: [{ id: 'first', text: sibling }, { id: 'active', text }] }),
  },
  {
    name: 'Checklist', create: createChecklistPlugin, fieldKey: 'item:active', selector: '[data-item-id="active"] .oe-checklist__text',
    data: (text, sibling = 'Sibling') => ({ items: [{ id: 'first', text: sibling, checked: true }, { id: 'active', text, checked: false }] }),
  },
  {
    name: 'Toggle', create: createTogglePlugin, fieldKey: 'title', selector: '.oe-toggle__title',
    data: (text, sibling = 'Sibling') => ({ title: text, content: sibling, open: true }),
  },
  {
    name: 'Spoiler', create: createSpoilerPlugin, fieldKey: 'label', selector: '.oe-spoiler__label',
    data: (text, sibling = 'Sibling') => ({ label: text, content: sibling }),
  },
  {
    name: 'Columns', create: createColumnsPlugin, fieldKey: 'column:active', selector: '[data-column-id="active"]',
    data: (text, sibling = 'Sibling') => ({ layout: '1-1', columns: [{ id: 'first', content: sibling }, { id: 'active', content: text }] }),
  },
]

for (const fixture of fixtures) for (const direction of ['caret', 'backward range']) {
test(`${fixture.name} compound rich field retains native ${direction} and widgets through a sibling edit`, async () => {
  const occurrences = [], searches = []
  const definition = fixture.create({ injectStyles: false })
  const original = { id: 'compound', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: fixture.data(rich), inline: sidecars() }
  const originalCopy = structuredClone(original)
  const editor = make([original], { defaultBlock: definition.type, plugins: [definition], inlineTools: [],
    inlinePlugins: [
      observe(createMentionPlugin({ searchFunction: async value => { searches.push(value); return [] } }), occurrences),
      observe(createColorSwatchPlugin(), occurrences),
    ],
  })
  const before = editor.save().blocks
  equal(before, [original])
  assert(editor.blocks.focus('compound', { fieldKey: fixture.fieldKey, offset: 'end' }))
  const field = blockElement(editor, 'compound').querySelector(fixture.selector)
  const tail = field.lastChild
  const widgets = occurrences.map(item => item.instance.element)
  equal(widgets.length, 2)
  await printable('X')
  const afterInput = structuredClone(before)
  afterInput[0].data = fixture.data(rich + 'X')
  equal(editor.save().blocks, afterInput)
  const selection = getSelection()
  if (direction === 'backward range') selection.setBaseAndExtent(tail, 5, tail, 1)
  editor.blocks.update('compound', () => ({ data: fixture.data(rich + 'X', '<b>Changed sibling</b>') }))
  const afterSibling = structuredClone(afterInput)
  afterSibling[0].data = fixture.data(rich + 'X', '<b>Changed sibling</b>')
  equal(editor.save().blocks, afterSibling)
  equal(document.activeElement, field, 'Sibling edit moved the active rich field focus')
  equal(field.lastChild, tail, 'Sibling edit replaced unchanged author text')
  assert(widgets.every(element => field.contains(element)), 'Sibling edit retired an unchanged inline widget')
  equal(occurrences.length, 2, 'Sibling edit acquired replacement inline widgets')
  assert(occurrences.every(item => !item.context.signal.aborted), 'Sibling edit revoked an unchanged widget owner')
  equal(selection.anchorNode, tail)
  equal(selection.focusNode, tail)
  equal([selection.anchorOffset, selection.focusOffset], direction === 'backward range' ? [5, 1] : [6, 6])
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), direction === 'backward range' ? 14 : 15)
  await printable('Y')
  const afterContinuation = structuredClone(afterSibling)
  afterContinuation[0].data = fixture.data(direction === 'backward range' ? rich.slice(0, -4) + 'YX' : rich + 'XY', '<b>Changed sibling</b>')
  equal(editor.save().blocks, afterContinuation)
  for (const expected of [afterSibling, afterInput, before]) {
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, expected)
  }
  assert(!editor.canUndo && editor.canRedo)
  for (const expected of [afterInput, afterSibling, afterContinuation]) {
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, expected)
  }
  assert(editor.canUndo && !editor.canRedo)
  equal(searches, [])
  equal(original, originalCopy, 'Editing changed the caller-owned record')
})
}
