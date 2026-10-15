import { assembleCanonicalRecord, filterCanonicalInline, remapCanonicalInline } from '../../core/CanonicalTransforms.js'
import { InlineProjectionRuntime } from '../../core/InlineProjectionRuntime.js'
import { getTextLength, getTextOffset, findNodeAtOffset, editableTextWalker } from '../../shared/textOffset.js'
import { createPersonPlugin } from '../../plugins/person/index.js'
import { test, assert, equal, make, blockElement, pause, run } from './regressions/harness.js'

const payload = { type: 'unloaded', dataVersion: 3, data: { label: 'kept' } }
const schema = {
  mapRichText(data, visit) {
    return { ...data, fields: data.fields.map(field => ({ ...field, html: visit(field.html, field.key) })) }
  },
}

test('normalization cannot duplicate an owned inline reference across fields', () => {
  let rejected = false
  try {
    assembleCanonicalRecord({
      id: 'a', type: 'probe', definition: { schema },
      data: { fields: [{ key: 'first', html: '{{x}}' }] }, inlineSource: { x: payload },
      ownerDocument: document, normalizeTunes: value => value,
      normalizeData(_definition, data) {
        return { dataVersion: 1, data: { fields: [...data.fields, { key: 'second', html: '{{x}}' }] } }
      },
    })
  } catch (error) {
    assert(/unique|duplicate/i.test(error.message), 'Unexpected rejection: ' + error.message)
    rejected = true
  }
  assert(rejected, 'Assembly accepted two final occurrences of the same owned reference')
})

test('projection carries the full sidecar until normalization determines references', () => {
  const projection = new InlineProjectionRuntime({ registry: {}, ownerDocument: document })
  try {
    const record = { data: { fields: [] }, inline: { x: payload, unused: payload } }
    const candidate = projection.serializeBlock('a', record, { schema }, [], {
      fields: [{ key: 'new', html: 'normalize-me' }],
    })
    const assembled = assembleCanonicalRecord({
      id: 'a', type: 'probe', definition: { schema }, ...candidate,
      inlineSource: candidate.inline, ownerDocument: document, normalizeTunes: value => value,
      normalizeData() { return { dataVersion: 1, data: { fields: [{ key: 'new', html: '{{x}}' }] } } },
    })
    equal(assembled.inline, { x: payload }, 'A normalization-created reference lost its payload')
  } finally { projection.destroy() }
})

test('duplicate candidate rich-field keys reject synchronization before values are exchanged', () => {
  const projection = new InlineProjectionRuntime({ registry: {}, ownerDocument: document })
  try {
    let rejected = false
    try {
      projection.serializeBlock('a', { data: { fields: [] } }, { schema }, [], {
        fields: [{ key: 'same', html: 'Left' }, { key: 'same', html: 'Right' }],
      })
    } catch (error) { rejected = /field.*key|duplicate/i.test(error.message) }
    assert(rejected, 'Synchronization silently accepted duplicate field keys')
  } finally { projection.destroy() }
})

test('marker-free widget has host identity and exactly one field coordinate', () => {
  const inlineDefinition = { schema: { decode: value => value } }
  const runtime = {
    create(_id, data) {
      const element = document.createElement('span')
      const render = next => {
        element.textContent = next.label
        element.removeAttribute('data-inline-plugin')
        element.removeAttribute('data-id')
      }
      render(data)
      return { element, update: render, setReadOnly() { render({ label: element.textContent }) }, destroy() {} }
    },
  }
  const registry = { getInlineDefinition: () => inlineDefinition, getInlineRuntime: () => runtime }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const element = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element }]
  const record = { data: { fields: [{ key: 'text', html: 'A {{x}} Z' }] }, inline: { x: payload } }
  try {
    projection.reconcileBlock('a', record, { schema }, fields, { createInlineWidgetContext: () => ({}) })
    const widget = element.querySelector('span')
    equal(widget.dataset.inlinePlugin, 'unloaded')
    equal(widget.dataset.id, 'x')
    equal(getTextLength(element), 5, 'Widget label must occupy one field unit')
    const after = findNodeAtOffset(element, 3, 'start')
    assert(!widget.contains(after.node), 'Following caret fell inside the widget label')
    projection.setReadOnly(true)
    equal(getTextLength(element), 5, 'Read-only projection lost host identity')
    record.inline.x = { ...payload, data: { label: 'different label' } }
    projection.reconcileBlock('a', record, { schema }, fields, { createInlineWidgetContext: () => ({}) })
    equal(getTextLength(element), 5, 'Update lost host identity')
  } finally { projection.destroy() }
})

test('partial projection preserves hidden values by key, candidate membership and new fields', () => {
  const projection = new InlineProjectionRuntime({ registry: {}, ownerDocument: document })
  const element = document.createElement('div')
  element.innerHTML = '<b>edited</b>'
  const record = { data: { fields: [
    { key: 'visible', html: 'old' }, { key: 'hidden', html: '{{x}}' },
    { key: 'empty', html: '' }, { key: 'removed', html: 'gone' },
  ] }, inline: { x: payload } }
  try {
    const result = projection.serializeBlock('a', record, { schema }, [
      { key: 'visible', mode: 'rich-text', element },
    ], { control: 42, fields: [
      { key: 'hidden', html: 'stale label' }, { key: 'visible', html: 'stale DOM' },
      { key: 'new', html: '<i>initial</i>' }, { key: 'empty', html: 'stale nonempty' },
    ] })
    equal(result.data, { control: 42, fields: [
      { key: 'hidden', html: '{{x}}' }, { key: 'visible', html: '<b>edited</b>' },
      { key: 'new', html: '<i>initial</i>' }, { key: 'empty', html: '' },
    ] })
    equal(result.inline, { x: payload })
    result.inline.x.data.label = 'detached'
    equal(record.inline.x.data.label, 'kept')
  } finally { projection.destroy() }
})

for (const kind of ['committed duplicate', 'empty key', 'duplicate across modes', 'element alias', 'orphan rich field']) {
  test('projection rejects ' + kind + ' without mutating canonical input', () => {
    const projection = new InlineProjectionRuntime({ registry: {}, ownerDocument: document })
    const first = document.createElement('div'), second = document.createElement('div')
    const record = { data: { fields: [{ key: 'a', html: 'A' }, { key: 'b', html: 'B' }] } }
    const candidate = structuredClone(record.data)
    let fields = []
    if (kind === 'committed duplicate') record.data.fields[1].key = 'a'
    if (kind === 'empty key') candidate.fields[0].key = ''
    if (kind === 'duplicate across modes') fields = [
      { key: 'a', element: first, mode: 'rich-text' }, { key: 'a', element: second, mode: 'plain-text' },
    ]
    if (kind === 'element alias') fields = [
      { key: 'a', element: first, mode: 'rich-text' }, { key: 'b', element: first, mode: 'rich-text' },
    ]
    if (kind === 'orphan rich field') fields = [{ key: 'absent', element: first, mode: 'rich-text' }]
    const before = structuredClone(record)
    try {
      let rejected = false
      try { projection.serializeBlock('a', record, { schema }, fields, candidate) }
      catch (error) { rejected = error instanceof TypeError }
      assert(rejected, 'Invalid projection was accepted')
      equal(record, before)
    } finally { projection.destroy() }
  })
}

test('final text-node occurrence interpretation keeps own keys and ignores attributes and literals', () => {
  const inline = JSON.parse('{"__proto__":{"type":"unloaded","dataVersion":3,"data":{"label":"own"}},"x":{"type":"unloaded","dataVersion":3,"data":{"label":"kept"}}}')
  const data = { fields: [
    { key: 'a', html: '<a title="{{x}}">&#123;&#123;__proto__&#125;&#125;</a> {{literal}} {{literal}}' },
    { key: 'b', html: '{{x}}' },
  ] }
  equal(filterCanonicalInline({ schema }, data, inline, document), inline)
  const remapped = remapCanonicalInline(inline, new Map([['x', 'constructor']]))
  assert(Object.hasOwn(remapped, '__proto__'))
  assert(Object.hasOwn(remapped, 'constructor'))
  equal(Object.getPrototypeOf(remapped), Object.prototype)
  const removed = assembleCanonicalRecord({
    id: 'a', type: 'probe', definition: { schema }, data, inlineSource: inline,
    ownerDocument: document, normalizeTunes: value => value,
    normalizeData() { return { dataVersion: 1, data: { fields: [{ key: 'a', html: 'normalized away' }] } } },
  })
  equal(removed.inline, undefined)
})

test('Person flushes a pending mounted author edit before switching tabs', async () => {
  const definition = createPersonPlugin()
  const editor = make([{ id: 'person', type: 'person', dataVersion: definition.schema.currentVersion, data: { persons: [
    { id: 'first', avatar: '', name: '{{x}}', role: '', bio: '', links: [] },
    { id: 'second', avatar: '', name: 'Second', role: '', bio: '', links: [] },
  ] }, inline: { x: payload } }], { plugins: [definition], defaultBlock: 'person' })
  blockElement(editor, 'person').querySelector('.oe-person__name').innerHTML = 'Pending {{x}}'
  blockElement(editor, 'person').querySelector('[data-person-id="second"] .oe-person__tab-select').click()
  await pause()
  equal(editor.save().blocks[0].data.persons[0].name, 'Pending {{x}}')
  equal(editor.save().blocks[0].inline, { x: payload })
  assert(editor.canUndo)
  editor.undo()
  equal(editor.save().blocks[0].data.persons[0].name, '{{x}}')
  equal(editor.canUndo, false)
})

test('public editor preserves marker-free widget coordinates through updates, moves and history', () => {
  let widgetContext
  const widgetSchema = {
    currentVersion: 1, createDefault: () => ({ label: '' }),
    decode: value => ({ dataVersion: 1, data: { label: value.data.label } }),
    encode: data => ({ dataVersion: 1, data: { label: data.label } }),
  }
  const definition = {
    type: 'external', label: { key: 'external', fallback: 'External' }, icon: '', schema: widgetSchema,
    setup() {
      return {
        create(_id, data, context) {
          widgetContext = context
          const element = document.createElement('span')
          element.contentEditable = 'false'
          element.textContent = data.label
          return { element, update(next) { element.textContent = next.label }, setReadOnly() {}, destroy() {} }
        },
        destroy() {},
      }
    },
  }
  const editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'A {{x}} Z' },
      inline: { x: { type: 'external', dataVersion: 1, data: { label: 'long label' } } } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Other' } },
  ], { inlinePlugins: [definition] })
  const check = () => {
    const field = blockElement(editor, 'a').querySelector('[contenteditable="true"]')
    const widget = field.querySelector('[data-inline-plugin="external"]')
    assert(widget)
    equal(getTextLength(field), 5)
    editor.blocks.focus('a', { fieldKey: 'text', offset: 3 })
    const selection = document.getSelection()
    equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), 3)
    assert(!widget.contains(selection.anchorNode))
    const walker = editableTextWalker(field)
    let text = ''
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent
    equal(text, 'A  Z', 'Formatting walker entered a widget label')
  }
  check()
  widgetContext.updateData(() => ({ label: 'updated' }))
  check()
  editor.blocks.move('a', 1)
  check()
  editor.undo()
  check()
  editor.undo()
  check()
  editor.redo()
  check()
})

await run()
