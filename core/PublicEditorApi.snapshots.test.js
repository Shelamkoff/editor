import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentRuntime } from './DocumentRuntime.js'
import { EditorBlocksApi } from './PublicEditorApi.js'
import { EditorViewModel } from './EditorViewModel.js'
import { createVersionedDataSchema } from '../shared/versionedDataSchema.js'

const makeData = label => ({
  label,
  text: '<strong>Rich text</strong> &amp; plain text',
  rows: [{ cells: [{ text: '<em>First cell</em>', metadata: { alignment: 'left' } }] }],
})

function fixture({ inline = true } = {}) {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => makeData('default'),
    normalize: data => data,
  })
  const definition = { type: 'snapshot-test', schema }
  const definitions = new Map([
    [definition.type, definition],
    ['converted-snapshot', { type: 'converted-snapshot', schema }],
  ])
  const events = []
  const runtime = new DocumentRuntime({
    registry: {
      defaultBlockType: definition.type,
      hasBlock: type => definitions.has(type),
      getBlockDefinition: type => definitions.get(type),
      getInlineDefinition: () => undefined,
    },
    data: { version: '2.0.0', blocks: ['a', 'b', 'unknown'].map(id => ({
      id,
      type: id === 'unknown' ? 'not-registered' : definition.type,
      dataVersion: 1,
      data: makeData(id),
      tunes: { textAlign: 'left' },
      ...(inline ? { inline: { opaque: { type: 'future-widget', dataVersion: 7, data: { label: id, nested: { value: 1 } } } } } : {}),
    })) },
    onCommit: event => events.push(event),
  })
  const view = new EditorViewModel({
    runtime,
    reconciler: { getElement: () => null },
    interaction: { reconcile() {} },
    selection: {},
  })
  const api = new EditorBlocksApi({ runtime, view })
  return { runtime, api, events }
}

function observePayloadTraversals(t, operation) {
  let traversals = 0
  const original = Object.getOwnPropertySymbols
  // Count ordinary payload visits at the strict JSON boundary without adding
  // accessors/proxies to the production-owned graph or replacing its owners.
  const spy = t.mock.method(Object, 'getOwnPropertySymbols', value => {
    if (Object.hasOwn(value, 'rows') && Object.hasOwn(value, 'label')) traversals++
    return original(value)
  })
  try {
    const result = operation(() => traversals)
    return { result, traversals }
  } finally { spy.mock.restore() }
}

for (const [name, read, expected] of [
  ['get', api => [api.get('a')], 1],
  ['at', api => [api.at(0)], 1],
  ['list', api => api.list(), 3],
  ['iterator', api => [...api], 3],
]) {
  test(`public ${name} transfers each detached payload once and keeps caller edits isolated`, t => {
    const { runtime, api } = fixture()
    try {
      const observed = observePayloadTraversals(t, () => read(api))
      const records = observed.result
      const another = read(api)
      assert.equal(Object.isFrozen(records[0]), true)
      assert.equal(Object.isFrozen(records[0].data), false)
      assert.equal(Object.isFrozen(records[0].data.rows[0].cells[0].metadata), false)
      if (name === 'list') assert.equal(Object.isFrozen(records), true)
      records[0].data.text = 'caller text'
      records[0].data.rows[0].cells[0].metadata.alignment = 'right'
      records[0].tunes.textAlign = 'center'
      records[0].inline.opaque.data.nested.value = 99
      for (const record of [runtime.get('a'), another[0]]) {
        assert.deepEqual(record.data, makeData('a'))
        assert.deepEqual(record.tunes, { textAlign: 'left' })
        assert.equal(record.inline.opaque.data.nested.value, 1)
      }
      assert.equal(runtime.canUndo, false)
      assert.equal(runtime.revision, 0)
      if (records.length === 3) {
        assert.equal(records[2].status, 'unregistered')
        assert.equal(records[2].inline.opaque.dataVersion, 7)
      }
      assert.equal(observed.traversals, expected,
        'already detached public payloads must not cross the same JSON ownership boundary again')
    } finally { runtime.destroy() }
  })
}

test('the public update producer reuses its detached runtime input without another payload traversal', t => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    let runtimeInputTraversals, publicInputTraversals
    observePayloadTraversals(t, count => runtime.update('a', () => {
      runtimeInputTraversals = count()
      return {}
    }, 'host'))
    let retained
    observePayloadTraversals(t, count => api.update('a', current => {
      publicInputTraversals = count()
      retained = current
      assert.equal(Object.isFrozen(current), true)
      assert.equal(Object.isFrozen(current.data.rows), false)
      current.data.rows[0].cells[0].metadata.alignment = 'right'
      current.tunes.textAlign = 'center'
      return {}
    }))
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.deepEqual(api.get('a').tunes, { textAlign: 'left' })
    assert.equal(runtime.revision, 0)
    assert.equal(runtime.canUndo, false)
    assert.deepEqual(events, [])
    retained.data.text = 'retained caller mutation'
    assert.equal(api.get('a').data.text, '<strong>Rich text</strong> &amp; plain text')
    assert.equal(publicInputTraversals, runtimeInputTraversals,
      'the public adapter must not recapture the detached producer input')
  } finally { runtime.destroy() }
})

test('retained producer and query payloads cannot mutate committed data, immutable events or history', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    let retained
    const before = runtime.get('a')
    const sibling = runtime.peek('b')
    api.update('a', current => {
      retained = current
      current.data.text = '<em>Authored</em>'
      current.data.rows[0].cells[0].metadata.alignment = 'right'
      current.tunes.textAlign = 'center'
      return { data: current.data, tunes: current.tunes }
    })
    const after = runtime.get('a')
    assert.equal(after.data.text, '<em>Authored</em>')
    assert.equal(after.data.rows[0].cells[0].metadata.alignment, 'right')
    assert.equal(after.tunes.textAlign, 'center')
    assert.equal(runtime.peek('b'), sibling)
    assert.equal(events.length, 1)
    const change = events[0].changes[0]
    assert.equal(Object.isFrozen(change.after.data.rows[0].cells[0].metadata), true)
    assert.throws(() => { change.after.data.rows[0].cells[0].metadata.alignment = 'tampered' }, TypeError)
    retained.data.rows[0].cells[0].metadata.alignment = 'retained caller mutation'
    retained.tunes.textAlign = 'right'
    const queried = api.get('a')
    queried.data.text = 'query caller mutation'
    assert.deepEqual(runtime.get('a'), after)
    assert.deepEqual(change.after.data, after.data)
    assert.equal(runtime.undo(), true)
    assert.deepEqual(runtime.get('a'), before)
    assert.equal(runtime.canUndo, false)
    assert.equal(runtime.redo(), true)
    assert.deepEqual(runtime.get('a'), after)
    assert.equal(runtime.canRedo, false)
  } finally { runtime.destroy() }
})

test('public producers see prior edits in their current draft and commit one whole action', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    runtime.interact('compound public update', () => {
      api.update('a', current => ({ data: { ...current.data, label: 'first staged edit' } }))
      api.update('a', current => {
        assert.equal(current.data.label, 'first staged edit')
        current.data.rows[0].cells[0].metadata.alignment = 'right'
        return { data: current.data }
      })
      assert.deepEqual(events, [])
    })
    assert.equal(events.length, 1)
    assert.equal(api.get('a').data.label, 'first staged edit')
    assert.equal(api.get('a').data.rows[0].cells[0].metadata.alignment, 'right')
    assert.equal(runtime.undo(), true)
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.equal(runtime.canUndo, false)
  } finally { runtime.destroy() }
})

test('a caught falsy producer failure still rolls back the whole draft without leaking its mutable snapshot', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    assert.throws(() => runtime.interact('aborted public update', () => {
      api.update('a', current => ({ data: { ...current.data, label: 'staged' } }))
      try {
        api.update('a', current => {
          current.data.rows[0].cells[0].metadata.alignment = 'discarded'
          throw false
        })
      } catch (error) { assert.equal(error, false) }
    }), error => error === false)
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.equal(runtime.revision, 0)
    assert.equal(runtime.canUndo, false)
    assert.deepEqual(events, [])
  } finally { runtime.destroy() }
})

test('frozen caller data still captures each accessor under preparation and rejects reentrant writes', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    let reads = 0, nestedProducers = 0
    const supplied = makeData('caller')
    const rows = supplied.rows
    Object.defineProperty(supplied, 'rows', {
      enumerable: true,
      get() {
        reads++
        assert.throws(() => api.update('b', () => { nestedProducers++; return {} }), /prepar/)
        assert.deepEqual(api.get('a').data, makeData('a'))
        return rows
      },
    })
    Object.freeze(supplied)
    api.update('a', () => ({ data: supplied }))
    assert.equal(reads, 1)
    assert.equal(nestedProducers, 0)
    assert.equal(events.length, 1)
    rows[0].cells[0].metadata.alignment = 'external mutation'
    assert.deepEqual(api.get('a').data, makeData('caller'))
    assert.deepEqual(api.get('b').data, makeData('b'))
  } finally { runtime.destroy() }
})

test('shallow external freezing cannot bypass strict JSON validation or author a history entry', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    const invalid = Object.freeze({ ...makeData('invalid'), invalid: new Map([['key', 'value']]) })
    assert.throws(() => api.update('a', () => ({ data: invalid })), TypeError)
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.equal(runtime.revision, 0)
    assert.equal(runtime.canUndo, false)
    assert.deepEqual(events, [])
  } finally { runtime.destroy() }
})

test('real view conversion transfers detached results for both same-type and changed-type targets', () => {
  const { runtime, api, events } = fixture({ inline: false })
  try {
    const unchanged = api.convert('a', { type: 'snapshot-test' })
    assert.equal(Object.isFrozen(unchanged), true)
    unchanged.data.rows[0].cells[0].metadata.alignment = 'caller mutation'
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.equal(runtime.canUndo, false)
    const converted = api.convert('a', { type: 'converted-snapshot' })
    assert.equal(converted.type, 'converted-snapshot')
    assert.deepEqual(converted.data, makeData('default'))
    converted.data.rows[0].cells[0].metadata.alignment = 'another caller mutation'
    assert.deepEqual(api.get('a').data, makeData('default'))
    assert.equal(events.length, 1)
    assert.equal(runtime.undo(), true)
    assert.deepEqual(api.get('a').data, makeData('a'))
    assert.equal(runtime.canUndo, false)
  } finally { runtime.destroy() }
})

test('missing public snapshots stay undefined without visiting another block payload', t => {
  const { runtime, api } = fixture()
  try {
    const observed = observePayloadTraversals(t, () => [api.get('missing'), api.at(-1), api.at(99)])
    assert.deepEqual(observed.result, [undefined, undefined, undefined])
    assert.equal(observed.traversals, 0)
  } finally { runtime.destroy() }
})
