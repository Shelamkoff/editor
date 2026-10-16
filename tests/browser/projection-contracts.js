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
  equal(Object.keys(widgetContext).sort(), [
    'id', 'blockId', 'fieldKey', 'signal', 'getData', 'updateData', 'commitDomMutation', 'beginTask', 'isReadOnly',
  ].sort())
  const field = blockElement(editor, 'a').querySelector('[contenteditable="true"]')
  const widget = field.querySelector('[data-inline-plugin="external"]')
  widgetContext.commitDomMutation(() => widget.replaceWith(document.createTextNode('Removed')))
  equal(editor.save().blocks.find(block => block.id === 'a').data.text, 'A Removed Z')
  equal(editor.save().blocks.find(block => block.id === 'a').inline, undefined)
  editor.undo()
  check()
})


test('inline widget reentrant destroyBlock only calls a disposer once', () => {
  const released = []
  let projection
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        const element = document.createElement('span')
        element.textContent = id
        return {
          element,
          setReadOnly() {},
          destroy() {
            released.push(id)
            if (released.length === 1) projection.destroyBlock('a')
          },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const element = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element }]
  try {
    projection.reconcileBlock('a', {
      data: { fields: [{ key: 'text', html: '{{x}}' }] },
      inline: { x: payload },
    }, { schema }, fields, { createInlineWidgetContext: () => ({}) })
    assert(element.querySelector('[data-id="x"]'), 'precondition: inline widget is mounted')
    projection.destroyBlock('a')
    equal(released, ['x'], 'each widget disposer must execute once')
    projection.destroyBlock('a')
    equal(released, ['x'], 'repeat teardown must be inert')
    assert(!element.querySelector('[data-id="x"]'))
  } finally { projection.destroy() }
})

test('inline widget retired widget cleanup only calls a disposer once', () => {
  const released = []
  let projection
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        const element = document.createElement('span')
        element.textContent = id
        return {
          element,
          setReadOnly() {},
          destroy() {
            released.push(id)
            if (released.length === 1) projection.destroyBlock('a')
          },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const element = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element }]
  try {
    projection.reconcileBlock('a', {
      data: { fields: [{ key: 'text', html: '{{x}}' }] },
      inline: { x: payload },
    }, { schema }, fields, { createInlineWidgetContext: () => ({}) })
    assert(element.querySelector('[data-id="x"]'), 'precondition: inline widget is mounted')
    projection.reconcileBlock('a', {
      data: { fields: [{ key: 'text', html: 'Removed' }] }, inline: {},
    }, { schema }, fields, { createInlineWidgetContext: () => ({}) })
    equal(released, ['x'], 'each widget disposer must execute once')
    projection.destroyBlock('a')
    equal(released, ['x'], 'repeat teardown must be inert')
    assert(!element.querySelector('[data-id="x"]'))
  } finally { projection.destroy() }
})



test('failed first inline projection disposes earlier widget claims before retry', () => {
  let failSecond = true
  const created = []
  const released = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        created.push(id)
        if (failSecond && id === 'y') throw new Error('second inline creation failed')
        const element = document.createElement('span')
        element.textContent = id
        return {
          element,
          setReadOnly() {},
          destroy() { released.push(id) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const element = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element }]
  const record = {
    data: { fields: [{ key: 'text', html: '{{x}} {{y}}' }] },
    inline: { x: payload, y: payload },
  }
  try {
    let message = ''
    try {
      projection.reconcileBlock('a', record, { schema }, fields, {
        createInlineWidgetContext: () => ({}),
      })
    } catch (error) { message = error.message }
    equal(message, 'second inline creation failed')
    equal(created, ['x', 'y'])
    equal(released, ['x'], 'first widget owner is released immediately after failure')

    failSecond = false
    projection.reconcileBlock('a', record, { schema }, fields, {
      createInlineWidgetContext: () => ({}),
    })
    equal(created, ['x', 'y', 'x', 'y'], 'retry cannot resurrect partial old state')
    equal(element.querySelectorAll('[data-inline-plugin]').length, 2)
    projection.destroyBlock('a')
    equal(released, ['x', 'x', 'y'], 'retry owners are retired once')
  } finally { projection.destroy() }
})



test('inline plugin cannot steal DOM already mounted in another UI', () => {
  const external = document.createElement('div')
  const shared = document.createElement('span')
  external.appendChild(shared)
  document.body.appendChild(external)
  let disposed = 0
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create() {
      return { element: shared, setReadOnly() {}, destroy() { disposed++ } }
    } }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  try {
    let error = ''
    try {
      projection.reconcileBlock('a', {
        data: { fields: [{ key: 'text', html: '{{x}}' }] }, inline: { x: payload },
      }, { schema }, [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext: () => ({}) })
    } catch (cause) { error = cause.message }
    assert(/must return a detached HTMLElement/.test(error))
    assert(external.contains(shared), 'the application must retain its original DOM')
    equal(disposed, 1)
  } finally { projection.destroy(); external.remove() }
})

test('inline plugin cannot mount one DOM element for two live widget identities', () => {
  const shared = document.createElement('span')
  const destroyed = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create(id) {
      return { element: shared, setReadOnly() {}, destroy() { destroyed.push(id) } }
    } }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  try {
    let error = ''
    try {
      projection.reconcileBlock('a', {
        data: { fields: [{ key: 'text', html: '{{x}} {{y}}' }] },
        inline: { x: payload, y: payload },
      }, { schema }, [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext: () => ({}) })
    } catch (cause) { error = cause.message }
    assert(/must return a fresh HTMLElement/.test(error))
    equal(destroyed, ['x'], 'rejecting a borrower must not destroy the first owner twice')
  } finally { projection.destroy() }
})

test('detached but owned inline widget root cannot be borrowed by another projection', () => {
  const shared = document.createElement('span')
  const releases = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create(id) {
      return { element: shared, setReadOnly() {}, destroy() { releases.push(id) } }
    } }),
  }
  const first = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const second = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const record = id => ({
    data: { fields: [{ key: 'text', html: '{{' + id + '}}' }] },
    inline: { [id]: payload },
  })
  try {
    const field = document.createElement('div')
    first.reconcileBlock('a', record('x'), { schema },
      [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext: () => ({}) })
    shared.remove()
    assert(!shared.parentNode)
    let error = ''
    try {
      second.reconcileBlock('b', record('y'), { schema },
        [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }],
        { createInlineWidgetContext: () => ({}) })
    } catch (cause) { error = cause.message }
    assert(/must return a fresh HTMLElement/.test(error))
    equal(releases, [], 'the rejected borrower has no destruction authority')
    first.destroyBlock('a')
    equal(releases, ['x'])
  } finally { first.destroy(); second.destroy() }
})



test('failed repeat inline reconciliation retires old owners instead of retaining a partial update', () => {
  const created = []
  const destroyed = []
  let failSecond = true
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create(id, data) {
        if (id === 'y' && failSecond) throw new Error('second widget failed')
        const element = document.createElement('span')
        element.textContent = data.label
        created.push({ id, element })
        return {
          element,
          update(next) { element.textContent = next.label },
          setReadOnly() {},
          destroy() { destroyed.push(id) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element: field }]
  const record = (text, refs) => ({
    data: { fields: [{ key: 'text', html: text }] },
    inline: refs,
  })
  const ref = label => ({ type: 'unloaded', dataVersion: 3, data: { label } })
  const original = record('{{x}}', { x: ref('old') })
  const changed = record('{{x}} {{y}}', { x: ref('new'), y: ref('Y') })
  try {
    projection.reconcileBlock('a', original, { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    const previous = created[0].element

    let message = ''
    try {
      projection.reconcileBlock('a', changed, { schema }, fields,
        { createInlineWidgetContext: () => ({}) })
    } catch (error) { message = error.message }
    equal(message, 'second widget failed')
    equal(destroyed, ['x'], 'the existing widget is retired after failed in-place projection')

    failSecond = false
    projection.reconcileBlock('a', original, { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    equal(created.map(item => item.id), ['x', 'x'])
    assert(created[1].element !== previous, 'retry must acquire a clean owner')
    equal(created[1].element.textContent, 'old')
    projection.destroyBlock('a')
    equal(destroyed, ['x', 'x'])
  } finally { projection.destroy() }
})

test('a failed existing inline widget update revokes its mutated instance before retry', () => {
  const created = []
  const destroyed = []
  let failUpdate = true
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create(id, data) {
        const element = document.createElement('span')
        element.textContent = data.label
        created.push(element)
        return {
          element,
          update(next) {
            element.textContent = next.label
            if (failUpdate) throw new Error('partial widget update')
          },
          setReadOnly() {},
          destroy() { destroyed.push(id) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element: field }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  try {
    projection.reconcileBlock('a', record('old'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    assert.throws(() => projection.reconcileBlock('a', record('new'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) }), /partial widget update/)
    equal(destroyed, ['x'], 'a partially updated live owner cannot remain cached')

    failUpdate = false
    projection.reconcileBlock('a', record('old'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    equal(created.length, 2, 'retry must not reuse the partially updated instance')
    equal(created[1].textContent, 'old')
    projection.destroyBlock('a')
    equal(destroyed, ['x', 'x'])
  } finally { projection.destroy() }
})



test('inline owner revoked during widget update cannot reattach a disposed root', () => {
  let projection
  const released = []
  let lastRoot = null
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create(id, data) {
        const element = document.createElement('span')
        element.textContent = data.label
        lastRoot = element
        return {
          element,
          update(next) {
            element.textContent = next.label
            projection.destroyBlock('a')
          },
          setReadOnly() {},
          destroy() { released.push(id) },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element: field }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  try {
    projection.reconcileBlock('a', record('old'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    const originalRoot = lastRoot
    let message = ''
    try {
      projection.reconcileBlock('a', record('new'), { schema }, fields,
        { createInlineWidgetContext: () => ({}) })
    } catch (error) { message = error.message }
    assert(/owner was revoked/.test(message), 'callback cannot complete a revoked projection')
    equal(released, ['x'])
    assert(!field.contains(originalRoot), 'revoked instance may not be reattached')
    projection.destroyBlock('a')
    equal(released, ['x'])
  } finally { projection.destroy() }
})

test('recursive same-block reconciliation is rejected before a nested widget update', () => {
  let projection
  const released = []
  const attempted = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create(id, data) {
        const element = document.createElement('span')
        element.textContent = data.label
        return {
          element,
          update(next) {
            attempted.push('outer')
            let message = ''
            try {
              projection.reconcileBlock('a', {
                data: { fields: [{ key: 'text', html: '{{x}}' }] },
                inline: { x: { type: 'unloaded', dataVersion: 3, data: { label: 'nested' } } },
              }, { schema }, fields, { createInlineWidgetContext: () => ({}) })
            } catch (error) { message = error.message }
            assert(/Cannot reenter inline projection/.test(message))
            element.textContent = next.label
          },
          setReadOnly() {},
          destroy() { released.push(id) },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element: field }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  try {
    projection.reconcileBlock('a', record('old'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    projection.reconcileBlock('a', record('new'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) })
    equal(attempted, ['outer'])
    equal(field.querySelector('[data-id="x"]').textContent, 'new')
    equal(released, [], 'denied nested request must not dispose the active owner')
    projection.destroyBlock('a')
    equal(released, ['x'])
  } finally { projection.destroy() }
})

test('prepared inline creation denies same-block reentry and survives a declined nested call', () => {
  let projection
  let attempts = 0
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        if(attempts++===0) {
          let message = ''
          try {
            projection.prepareBlock('a', {
              data: { fields: [{ key: 'text', html: '{{x}}' }] },
              inline: { x: payload },
            }, { schema }, fields, { createInlineWidgetContext: () => ({}) }, 1)
          } catch (error) { message = error.message }
          assert(/Cannot reenter inline projection/.test(message))
        }
        return { element: document.createElement('span'), setReadOnly() {}, destroy() {} }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const fields = [{ key: 'text', mode: 'rich-text', element: field }]
  const record = {
    data: { fields: [{ key: 'text', html: '{{x}}' }] }, inline: { x: payload },
  }
  try {
    const prepared = projection.prepareBlock('a', record, { schema }, fields,
      { createInlineWidgetContext: () => ({}) }, 1)
    equal(attempts, 1)
    prepared.discard()
  } finally { projection.destroy() }
})



test('prepared inline widget owners are released when runtime is destroyed before apply', () => {
  let created = 0
  const released = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create(id) {
      created++
      return {
        element: document.createElement('span'),
        setReadOnly() {},
        destroy() { released.push(id) },
      }
    } }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  const prepared = projection.prepareBlock('a', {
    data: { fields: [{ key: 'text', html: '{{x}}' }] }, inline: { x: payload },
  }, { schema }, [{ key: 'text', mode: 'rich-text', element: field }],
  { createInlineWidgetContext: () => ({}) }, 1)

  equal(created, 1)
  equal(released, [])
  projection.destroy()
  equal(released, ['x'], 'unpublished widget must be owned and retired by runtime destroy')
  let applyError = '', finalizeError = ''
  try { prepared.apply() } catch (error) { applyError = error.message }
  try { prepared.finalize() } catch (error) { finalizeError = error.message }
  assert(/destroyed/.test(applyError))
  assert(/destroyed/.test(finalizeError))
  equal(released, ['x'], 'stale handle must not reacquire or re-dispose revoked widget')
})

test('destroying a runtime with applied but unfinalized inline state releases both owners', () => {
  const created = []
  const released = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create(id, data) {
      created.push(data.label)
      return {
        element: document.createElement('span'),
        setReadOnly() {},
        destroy() { released.push(data.label) },
      }
    } }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  projection.reconcileBlock('a', record('old'), { schema }, fields,
    { createInlineWidgetContext: () => ({}) })
  const prepared = projection.prepareBlock('a', record('candidate'), { schema }, fields,
    { createInlineWidgetContext: () => ({}) }, 2)
  prepared.apply()
  projection.destroy()
  equal(created, ['old', 'candidate'])
  equal([...released].sort(), ['candidate', 'old'])
  let finalizeError = ''
  try { prepared.finalize() } catch (error) { finalizeError = error.message }
  assert(/destroyed/.test(finalizeError))
  prepared.recover()
  equal(released.length, 2, 'retired preparation cannot revive the previous owner')
})

test('an old prepared inline handle cannot overwrite a newer applied block state', () => {
  const releases = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({ create(id, data) {
      return {
        element: document.createElement('span'),
        setReadOnly() {},
        destroy() { releases.push(data.label) },
      }
    } }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  try {
    const first = projection.prepareBlock('a', record('first'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) }, 1)
    const stale = projection.prepareBlock('a', record('stale'), { schema }, fields,
      { createInlineWidgetContext: () => ({}) }, 1)
    first.apply()
    let message = ''
    try { stale.apply() } catch (error) { message = error.message }
    assert(/owner is stale/.test(message))
    equal(releases, ['stale'], 'rejected candidate is disposed without displacing first')
    first.finalize()
    projection.destroyBlock('a')
    equal(releases, ['stale', 'first'])
  } finally { projection.destroy() }
})



test('stale inline recover keeps its candidate alive for successor recovery', () => {
  const released = []
  const instances = new Map()
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id, data) {
        const element = document.createElement('span')
        element.textContent = data.label
        instances.set(data.label, element)
        return {
          element, setReadOnly() {},
          destroy() { released.push(data.label) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const freshFields = () => [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  const context = { createInlineWidgetContext: () => ({}) }
  try {
    projection.reconcileBlock('a', record('base'), { schema }, freshFields(), context)
    const first = projection.prepareBlock('a', record('first'), { schema }, freshFields(), context, 1)
    first.apply()
    const successor = projection.prepareBlock('a', record('second'), { schema }, freshFields(), context, 1)
    successor.apply()

    first.recover()
    equal(released, ['base'], 'stale recovery may release its old base, not successor predecessor')
    successor.recover()
    assert(projection.resolveWidgetElement(instances.get('first')) === instances.get('first'),
      'restored predecessor must remain a valid owned occurrence')
    equal(released, ['base', 'second'])
    projection.destroyBlock('a')
    equal(released, ['base', 'second', 'first'])
  } finally { projection.destroy() }
})

test('stale inline finalize cannot destroy a successor recoverable predecessor', () => {
  const released = []
  const instances = new Map()
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id, data) {
        const element = document.createElement('span')
        element.textContent = data.label
        instances.set(data.label, element)
        return {
          element, setReadOnly() {},
          destroy() { released.push(data.label) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = () => [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  const context = { createInlineWidgetContext: () => ({}) }
  try {
    projection.reconcileBlock('a', record('base'), { schema }, fields(), context)
    const first = projection.prepareBlock('a', record('first'), { schema }, fields(), context, 1)
    first.apply()
    const successor = projection.prepareBlock('a', record('second'), { schema }, fields(), context, 1)
    successor.apply()

    let staleError = ''
    try { first.finalize() } catch (error) { staleError = error.message }
    assert(/owner is stale/.test(staleError))
    equal(released, ['base'], 'stale finalize cannot retire a borrowed predecessor')
    successor.recover()
    assert(projection.resolveWidgetElement(instances.get('first')) === instances.get('first'))
    projection.destroy()
    equal(released, ['base', 'second', 'first'])
  } finally { projection.destroy() }
})



test('destroyBlock revokes a detached prepared inline candidate before apply', () => {
  const released = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        return {
          element: document.createElement('span'),
          setReadOnly() {},
          destroy() { released.push(id) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = {
    data: { fields: [{ key: 'text', html: '{{x}}' }] }, inline: { x: payload },
  }
  try {
    const prepared = projection.prepareBlock('a', record, { schema }, fields,
      { createInlineWidgetContext: () => ({}) }, 1)
    equal(released, [])
    projection.destroyBlock('a')
    equal(released, ['x'], 'remove retires the staged owner even without a live state')
    let staleError = ''
    try { prepared.apply() } catch (error) { staleError = error.message }
    assert(/cannot be applied twice/.test(staleError))
    prepared.finalize()
    projection.destroyBlock('a')
    equal(released, ['x'])
  } finally { projection.destroy() }
})

test('destroyBlock invoked during prepare create invalidates the in-flight candidate', () => {
  const released = []
  let projection
  let revokeInCreate = true
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id) {
        if (revokeInCreate) projection.destroyBlock('a')
        return {
          element: document.createElement('span'),
          setReadOnly() {},
          destroy() { released.push(id) },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = {
    data: { fields: [{ key: 'text', html: '{{x}}' }] }, inline: { x: payload },
  }
  try {
    let revokeError = ''
    try {
      projection.prepareBlock('a', record, { schema }, fields,
        { createInlineWidgetContext: () => ({}) }, 1)
    } catch (error) { revokeError = error.message }
    assert(/owner was revoked during preparation/.test(revokeError))
    equal(released, ['x'])
    revokeInCreate = false
    const fresh = projection.prepareBlock('a', record, { schema }, fields,
      { createInlineWidgetContext: () => ({}) }, 1)
    fresh.discard()
    equal(released, ['x', 'x'], 'revocation does not poison a future new preparation')
  } finally { projection.destroy() }
})

test('destroyBlock retires both mounted and waiting inline owners once', () => {
  const released = []
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: value => value } }),
    getInlineRuntime: () => ({
      create(id, data) {
        return {
          element: document.createElement('span'),
          setReadOnly() {},
          destroy() { released.push(data.label) },
        }
      },
    }),
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const fields = () => [{ key: 'text', mode: 'rich-text', element: document.createElement('div') }]
  const record = label => ({
    data: { fields: [{ key: 'text', html: '{{x}}' }] },
    inline: { x: { type: 'unloaded', dataVersion: 3, data: { label } } },
  })
  const ctx = { createInlineWidgetContext: () => ({}) }
  try {
    projection.reconcileBlock('a', record('mounted'), { schema }, fields(), ctx)
    const staged = projection.prepareBlock('a', record('waiting'), { schema }, fields(), ctx, 1)
    projection.destroyBlock('a')
    equal([...released].sort(), ['mounted', 'waiting'])
    assert.throws(() => staged.apply(), /cannot be applied twice/)
    projection.destroy()
    equal(released.length, 2)
  } finally { projection.destroy() }
})



test('inline custom-element attribute callback cannot reattach a destroyed widget', () => {
  let projection
  let destroyed = 0
  const tag = 'rector-reentrant-inline-root'
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      static get observedAttributes() { return ['data-inline-plugin'] }
      attributeChangedCallback() { projection?.destroyBlock('a') }
    })
  }
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create() {
        return {
          element: document.createElement(tag),
          setReadOnly() {},
          destroy() { destroyed++ },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  field.textContent = '{{x}}'
  try {
    let message = ''
    try {
      projection.reconcileBlock('a', {
        data: { fields: [{ key: 'text', html: '{{x}}' }] },
        inline: { x: payload },
      }, { schema }, [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext: () => ({}) }, { preserveSourceProjection: true })
    } catch (error) { message = error.message }
    assert(/owner was revoked during reconciliation/.test(message))
    equal(destroyed, 1)
    equal(field.textContent, '{{x}}', 'revoked widget cannot be reinserted after attributeChangedCallback')
    assert(!field.querySelector(tag))
  } finally { projection.destroy() }
})

test('attribute-triggered block teardown during inline preparation does not publish its root', () => {
  let projection
  let destroyed = 0
  const tag = 'rector-preparing-inline-root'
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      static get observedAttributes() { return ['data-inline-plugin'] }
      attributeChangedCallback() { projection?.destroyBlock('a') }
    })
  }
  const registry = {
    getInlineDefinition: () => ({ schema: { decode: input => input } }),
    getInlineRuntime: () => ({
      create() {
        return {
          element: document.createElement(tag),
          setReadOnly() {},
          destroy() { destroyed++ },
        }
      },
    }),
  }
  projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const field = document.createElement('div')
  let message = ''
  try {
    try {
      projection.prepareBlock('a', {
        data: { fields: [{ key: 'text', html: '{{x}}' }] },
        inline: { x: payload },
      }, { schema }, [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext: () => ({}) }, 1)
    } catch (error) { message = error.message }
    assert(/owner was revoked during reconciliation/.test(message))
    equal(destroyed, 1)
    assert(!field.querySelector(tag), 'unpublished candidate must remain detached')
  } finally { projection.destroy() }
})

await run()
