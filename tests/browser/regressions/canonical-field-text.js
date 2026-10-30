import { setSanitizedHtml } from '../../../plugin-kit/index.js'
import { ExtensionRegistry } from '../../../core/ExtensionRegistry.js'
import { DocumentRuntime } from '../../../core/DocumentRuntime.js'
import { BlockReconciler } from '../../../core/BlockReconciler.js'
import { InlineProjectionRuntime } from '../../../core/InlineProjectionRuntime.js'
import { EditorHandle, EditorBlocksApi } from '../../../core/PublicEditorApi.js'
import { test, assert, equal, pause } from './harness.js'

function failure(operation) {
  let threw = false, result
  try { operation() } catch (error) { threw = true; result = error }
  assert(threw, 'The contract operation must reject')
  return result
}

function fixture({ update = true, consumer = true, toText = true, hidden = '<b>Hidden</b> {{ref}}', onText = null, trace = {} } = {}) {
  const state = Object.assign(trace, { entries: [], updates: [], texts: 0, maps: 0, decodes: 0, widgets: 0, destroyed: 0,
    onText, onMap: null, onDecode: null, transactions: [] })
  const schema = {
    currentVersion: 1, createDefault: () => ({ front: '', hidden: '' }),
    encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
    decode: input => ({ dataVersion: 1, data: structuredClone(input.data) }),
    mapRichText(data, visit) {
      state.maps++; state.onMap?.()
      return { front: visit(data.front, 'front'), hidden: visit(data.hidden, 'hidden') }
    },
  }
  const inline = {
    type: 'text-badge', icon: '', label: { key: 'title', fallback: 'Text badge' },
    schema: { currentVersion: 1, createDefault: () => ({ nested: { label: 'Default' } }),
      encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
      decode(input) { state.decodes++; state.onDecode?.(); return { dataVersion: 1, data: structuredClone(input.data) } },
    },
    ...(toText ? { toText(data) {
      state.texts++
      assert(this === inline, 'Text derivation lost its captured definition receiver')
      assert(Object.isFrozen(data) && Object.isFrozen(data.nested), 'Decoded text payload must be deeply frozen')
      return state.onText ? state.onText(data) : data.nested.label
    } } : {}),
    setup(context) { return {
      create(_id, data) {
        state.widgets++
        const element = context.ownerDocument.createElement('span')
        element.textContent = data.nested.label
        return { element, setReadOnly() {}, destroy() {} }
      }, destroy() {},
    } },
  }
  const block = { type: 'field-text-block', icon: '', label: { key: 'title', fallback: 'Field text' }, schema,
    setup(runtime) { return {
      create(initial, context) {
        const root = runtime.ownerDocument.createElement('section')
        const front = runtime.ownerDocument.createElement('div')
        const label = runtime.ownerDocument.createElement('span')
        front.contentEditable = 'true'
        setSanitizedHtml(front, initial.front)
        root.append(front, label)
        let data = structuredClone(initial)
        const entry = { root, front, label, context }
        state.entries.push(entry)
        const derive = () => { if (consumer) label.textContent = context.getFieldText('hidden') }
        derive()
        return { element: root, read: () => structuredClone(data),
          ...(update ? { update(next, previous) {
            state.updates.push({ next: structuredClone(next), previous: structuredClone(previous),
              accepted: state.editor?.save().blocks[0]?.inline.ref.data.nested.label })
            data = structuredClone(next); derive()
          } } : {}),
          editableFields: () => [{ key: 'front', mode: 'rich-text', element: front }],
          setReadOnly(value) { front.contentEditable = String(!value); derive() },
          destroy() { state.destroyed++ },
        }
      }, destroy() {},
    } },
  }
  const records = [{ id: 'a', type: block.type, dataVersion: 1, data: { front: 'Front tail', hidden },
    inline: { ref: { type: inline.type, dataVersion: 1, data: { nested: { label: 'Badge' } } } },
  }]
  const holder = document.createElement('section')
  document.body.append(holder)
  const registry = new ExtensionRegistry({ ownerDocument: document, blocks: [block], inline: [inline], acquireStyles: false })
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  let runtime, destroyed = false
  const dispose = () => {
    if (destroyed) return
    destroyed = true
    try { runtime?.destroy() } finally { projection.destroy(); registry.destroy(); holder.remove() }
  }
  try {
    runtime = new DocumentRuntime({ registry, ownerDocument: document, data: { version: '2.0.0', blocks: records },
      onCommit: event => state.transactions.push(event),
      projectorFactory: ports => new BlockReconciler({ container: holder, registry, inlineProjection: projection, ...ports }),
    })
    const view = { focus() { throw new Error('Unauthorized focus') }, reconcileInteraction() {} }
    state.editor = new EditorHandle({ runtime, view, destroy: dispose, isDestroyed: () => destroyed,
      setReadOnly: value => runtime.setReadOnly(value), blocks: new EditorBlocksApi({ runtime, view }) })
  } catch (error) { dispose(); throw error }
  state.current = () => state.entries.findLast(entry => entry.root.isConnected && !entry.context.signal.aborted)
  // The real canonical inline-update owner is the seam for hidden sidecars;
  // public blocks.update intentionally cannot author the inline map.
  state.change = label => runtime.updateInlineWidget('a', 'ref', () => ({ nested: { label } }), { fieldKey: 'hidden' })
  return state
}

test('canonical field text derives a custom widget without reparsing returned HTML, entities or tokens', () => {
  const h = fixture()
  try {
    const before = h.editor.save().blocks
    const expected = '<b>plain</b> &lt;entity&gt; {{ref}}'
    h.onText = () => expected
    equal(h.current().context.getFieldText('hidden'), 'Hidden ' + expected)
    equal(h.widgets, 0)
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.transactions.length === 0)
  } finally { h.editor.destroy() }
})

test('canonical field text leaves registered widgets without toText as opaque token text', () => {
  const h = fixture({ toText: false })
  try {
    equal(h.current().label.textContent, 'Hidden {{ref}}')
    equal(h.widgets, 0)
    const reads = h.decodes
    equal(h.current().context.getFieldText('hidden'), 'Hidden {{ref}}')
    equal(h.decodes, reads, 'A missing text capability must not acquire or decode a widget')
  } finally { h.editor.destroy() }
})

test('canonical field text sidecar delivery uses prospective data before acceptance without updating healthy field DOM', () => {
  const h = fixture()
  try {
    const before = h.editor.save().blocks, current = h.current(), node = current.front.firstChild
    const selection = getSelection()
    current.front.focus(); selection.setBaseAndExtent(node, 8, node, 3)
    h.change('Next')
    equal(h.current(), current)
    equal(current.label.textContent, 'Hidden Next')
    equal(h.updates, [{ next: before[0].data, previous: before[0].data, accepted: 'Badge' }])
    equal([current.front.firstChild === node, selection.anchorNode === node, selection.anchorOffset,
      selection.focusNode === node, selection.focusOffset, document.activeElement === current.front], [true, true, 8, true, 3, true])
    const after = h.editor.save().blocks
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); equal(current.label.textContent, 'Hidden Badge')
    assert(h.editor.redo()); equal(h.editor.save().blocks, after); equal(current.label.textContent, 'Hidden Next')
    equal(h.widgets, 0)
    equal(h.transactions.length, 3)
    const count = h.updates.length
    for (let index = 0; index < 3; index++) current.context.getFieldText('hidden')
    equal(h.updates.length, count, 'A healthy text read must not manufacture an update')
  } finally { h.editor.destroy() }
})

test('canonical field text consumer without update uses existing replacement and history ownership', () => {
  const h = fixture({ update: false })
  try {
    const before = h.editor.save().blocks, old = h.current()
    h.change('Next')
    const after = h.editor.save().blocks, next = h.current()
    assert(next !== old && !old.root.isConnected && old.context.signal.aborted)
    equal(next.label.textContent, 'Hidden Next')
    equal(h.destroyed, 1)
    const callbacks = [h.maps, h.texts, h.decodes]
    failure(() => old.context.getFieldText('hidden'))
    equal([h.maps, h.texts, h.decodes], callbacks)
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); equal(h.current().label.textContent, 'Hidden Badge')
    assert(h.editor.redo()); equal(h.editor.save().blocks, after); equal(h.current().label.textContent, 'Hidden Next')
    equal([h.widgets, h.transactions.length], [0, 3])
  } finally { h.editor.destroy() }
})

test('canonical field text opt-in preserves sidecar-only delivery for blocks that never query text', () => {
  const h = fixture({ consumer: false })
  try {
    h.change('Next')
    equal(h.updates.length, 0)
    equal(h.current().context.getFieldText('hidden'), 'Hidden Next')
    h.change('After query')
    equal(h.updates.length, 1)
  } finally { h.editor.destroy() }
})

test('canonical field text rejects malformed or absent keys before inline callbacks', () => {
  const h = fixture()
  try {
    const context = h.current().context, calls = [h.maps, h.texts, h.decodes]
    for (const key of ['', null, {}, 1]) assert(failure(() => context.getFieldText(key)) instanceof TypeError)
    equal([h.maps, h.texts, h.decodes], calls)
    assert(failure(() => context.getFieldText('not-a-field')) instanceof RangeError)
    equal([h.texts, h.decodes], calls.slice(1))
  } finally { h.editor.destroy() }
})

test('canonical field text guards schema and formatter against nested writes, control, tasks and recursive reads', () => {
  const h = fixture()
  try {
    const current = h.current(), before = h.editor.save().blocks
    let producers = 0, attempts = 0
    const producer = () => { producers++; return {} }
    const check = () => {
      for (const operation of [
        () => h.editor.blocks.update('a', producer), () => h.editor.setReadOnly(true),
        () => h.editor.focus(), () => h.editor.destroy(), () => current.context.beginTask(),
        () => current.context.updateData(producer), () => current.context.commitDomMutation(producer),
        () => current.context.getFieldText('hidden'),
      ]) { failure(operation); attempts++ }
    }
    for (const boundary of ['onMap', 'onDecode', 'onText']) {
      h[boundary] = data => { check(); return data?.nested.label }
      equal(current.context.getFieldText('hidden'), 'Hidden Badge')
      h[boundary] = null
    }
    equal([producers, attempts], [0, 24])
    equal(h.editor.save().blocks, before)
    assert(!h.editor.readOnly && !h.editor.canUndo)
    h.change('Independent next edit')
    equal(current.label.textContent, 'Hidden Independent next edit')
  } finally { h.editor.destroy() }
})

for (const target of ['root', 'shell']) test(`canonical field text rejects an adopted ${target} before schema or formatter callbacks`, () => {
  const h = fixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const current = h.current(), moved = target === 'root' ? current.root : current.root.parentNode
    foreign.append(moved)
    const calls = [h.maps, h.texts, h.decodes]
    failure(() => current.context.getFieldText('hidden'))
    equal([h.maps, h.texts, h.decodes], calls)
    equal(moved.parentNode, foreign)
  } finally { h.editor.destroy(); foreign.remove() }
})

for (const boundary of ['onMap', 'onDecode', 'onText']) test(`canonical field text revalidates its owner after ${boundary} adoption`, () => {
  const h = fixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const current = h.current(), before = h.editor.save().blocks
    h[boundary] = data => { foreign.append(current.root); return data?.nested.label }
    const texts = h.texts
    failure(() => current.context.getFieldText('hidden'))
    if (boundary !== 'onText') equal(h.texts, texts, 'A prior callback lost the owner before toText')
    equal(current.root.parentNode, foreign)
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo)
  } finally { h.editor.destroy(); foreign.remove() }
})

for (const phase of ['read', 'canonical', 'mode']) for (const kind of ['Error', 'undefined', 'thenable', 'non-string']) {
  test(`canonical field text ${phase} preserves ${kind} failure and its existing recovery owner`, async () => {
    const h = fixture(), fault = new Error('controlled text failure')
    try {
      const before = h.editor.save().blocks
      let armed = true, thenReads = 0, thenCalls = 0
      h.onText = data => {
        if (!armed) return data.nested.label
        armed = false
        if (kind === 'non-string') return null
        if (kind === 'thenable') return Object.defineProperty(() => {}, 'then', { get() {
          thenReads++; return (_resolve, reject) => { thenCalls++; reject(fault) }
        } })
        throw kind === 'Error' ? fault : undefined
      }
      const caught = failure(phase === 'read' ? () => h.current().context.getFieldText('hidden')
        : phase === 'canonical' ? () => h.change('Rejected') : () => h.editor.setReadOnly(true))
      if (kind === 'Error' || kind === 'undefined') assert(caught === (kind === 'Error' ? fault : undefined))
      else assert(caught instanceof TypeError)
      await pause()
      if (kind === 'thenable') equal([thenReads, thenCalls], [1, 1])
      assert(!armed && !h.editor.readOnly && !h.editor.canUndo && h.transactions.length === 0)
      equal(h.editor.save().blocks, before)
      equal(h.current().label.textContent, 'Hidden Badge')
      h.change('Accepted')
      equal(h.current().label.textContent, 'Hidden Accepted')
      equal(h.transactions.length, 1)
    } finally { h.editor.destroy() }
  })
}

for (const kind of ['Error', 'undefined', 'thenable']) test(`canonical field text initial ${kind} failure revokes its unpublished candidate`, async () => {
  const trace = {}, fault = new Error('controlled initial text failure')
  const caught = failure(() => fixture({ trace, onText() {
    if (kind === 'thenable') return Promise.reject(fault)
    throw kind === 'Error' ? fault : undefined
  } }))
  if (kind === 'thenable') assert(caught instanceof TypeError)
  else assert(caught === (kind === 'Error' ? fault : undefined))
  await pause()
  equal(trace.entries.length, 1)
  const candidate = trace.entries[0]
  assert(candidate.context.signal.aborted && !candidate.root.isConnected)
  equal([trace.widgets, trace.transactions.length], [0, 0])
  const calls = [trace.maps, trace.texts, trace.decodes]
  failure(() => candidate.context.getFieldText('hidden'))
  equal([trace.maps, trace.texts, trace.decodes], calls)
})
