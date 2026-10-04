import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentRuntime } from './DocumentRuntime.js'

function schema(options = {}) {
  return {
    currentVersion: options.currentVersion ?? 1,
    createDefault: options.createDefault ?? (() => ({ text: '' })),
    decode(input) {
      if (options.decode) return options.decode(input)
      if (typeof input.data?.text !== 'string') throw new TypeError('text required')
      return { dataVersion: this.currentVersion, data: { text: input.data.text } }
    },
    encode(data) {
      if (options.encode) return options.encode(data)
      if (typeof data?.text !== 'string') throw new TypeError('text required')
      return { dataVersion: this.currentVersion, data: { text: data.text } }
    },
    mapRichText(data, transform) {
      return options.mapRichText ? options.mapRichText(data, transform) : { ...data }
    },
  }
}

function registry(definitions) {
  const map = new Map(definitions.map(definition => [definition.type, definition]))
  return {
    defaultBlockType: definitions[0].type,
    hasBlock(type) { return map.has(type) },
    getBlockDefinition(type) { return map.get(type) },
    getInlineDefinition() { return undefined },
  }
}

function paragraphDefinition(options = {}) {
  return {
    type: 'paragraph',
    schema: schema(options),
    capabilities: {
      empty: { isEmpty: data => !data.text.trim() },
      conversion: {
        export: data => ({ kind: 'rich-text', data: { text: data.text } }),
        canImport: payload => payload.kind === 'rich-text' && typeof payload.data?.text === 'string',
        import: payload => ({ text: payload.data.text }),
      },
    },
  }
}

function block(id, data = { text: id }, extra = {}) {
  return { id, type: 'paragraph', dataVersion: 1, data, ...extra }
}

test('DocumentRuntime emits save/render timing diagnostics through the canonical sink', () => {
  const events = []
  let clock = 100
  const diagnostics = {
    enabled: true,
    now() { return clock++ },
    threshold(name) { return name === 'saveMs' || name === 'renderMs' ? 0 : Infinity },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit(code, details) { events.push({ code, ...details }) },
  }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    diagnostics,
    data: { version: '2.0.0', blocks: [block('a')] },
  })

  runtime.save()
  runtime.render({ version: '2.0.0', blocks: [block('a', { text: 'next' })] })

  assert.equal(events.some(event => event.code === 'save.slow'), true)
  assert.equal(events.some(event => event.code === 'render.slow'), true)
  runtime.destroy()
})

test('DocumentRuntime rejects a known non-current dataVersion before schema decode', () => {
  let decodeCalls = 0
  const definition = paragraphDefinition({
    currentVersion: 2,
    decode(input) {
      decodeCalls++
      return { dataVersion: 2, data: { text: input.data.text } }
    },
  })

  assert.throws(() => new DocumentRuntime({
    registry: registry([definition]),
    data: {
      version: '2.0.0',
      blocks: [block('a', { text: 'A' }, { dataVersion: 1 })],
    },
  }), /Unsupported block "paragraph" data version 1/)
  assert.equal(decodeCalls, 0)

  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    data: {
      version: '2.0.0',
      blocks: [block('a', { text: 'A' }, { dataVersion: 2 })],
    },
  })
  assert.deepEqual(runtime.get('a'), {
    id: 'a',
    type: 'paragraph',
    dataVersion: 2,
    data: { text: 'A' },
  })
  runtime.destroy()
})

test('invalid registered data is rejected while an unregistered current block remains inert', () => {
  assert.throws(() => new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: {
      version: '2.0.0',
      blocks: [{ id: 'bad', type: 'paragraph', dataVersion: 1, data: { nope: true } }],
    },
  }), /text required/)

  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: {
      version: '2.0.0',
      blocks: [{ id: 'future', type: 'future-block', dataVersion: 9, data: { x: 1 } }],
    },
  })
  assert.equal(runtime.activation('future').kind, 'unregistered')
  assert.deepEqual(runtime.get('future').data, { x: 1 })
  runtime.destroy()
})

test('validation observer failures are isolated from current-format rejection', async () => {
  const diagnostics = []
  assert.throws(() => new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    diagnostics: {
      enabled: false,
      errorName(error) { return error?.name ?? 'UnknownError' },
      emit(code, details) { diagnostics.push({ code, ...details }) },
    },
    async onValidationError() {
      throw new TypeError('validation observer failed')
    },
    data: {
      version: '2.0.0',
      blocks: [{ id: 'bad', type: 'paragraph', dataVersion: 1, data: { nope: true } }],
    },
  }), /text required/)

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(diagnostics.some(event => (
    event.code === 'command.failed'
    && event.operation === 'onValidationError'
    && event.errorName === 'TypeError'
  )), true)
})

test('local update remains schema-strict', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a')] },
  })

  assert.throws(
    () => runtime.update('a', () => ({ data: { nope: true } })),
    /text required/,
  )
  assert.deepEqual(runtime.get('a').data, { text: 'a' })
  assert.equal(runtime.activation('a').kind, 'active')
  runtime.destroy()
})

test('unregistered blocks may move and remove but cannot be updated internally', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: {
      version: '2.0.0',
      blocks: [
        { id: 'future', type: 'future', dataVersion: 9, data: { x: 1 } },
        block('a'),
      ],
    },
  })

  assert.throws(
    () => runtime.update('future', () => ({ data: { x: 2 } })),
    /Unregistered block cannot be updated: future/,
  )

  runtime.move('future', 1)
  assert.deepEqual(runtime.list().map(item => item.id), ['a', 'future'])
  runtime.remove('future')
  assert.deepEqual(runtime.list().map(item => item.id), ['a'])
  runtime.destroy()
})

test('editable empty documents and final-block removal materialize one default block', () => {
  let seq = 0
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    createId: prefix => `${prefix}-${++seq}`,
    data: { version: '2.0.0', blocks: [] },
  })

  assert.equal(runtime.list().length, 1)
  const initial = runtime.list()[0]
  assert.equal(initial.type, 'paragraph')
  assert.deepEqual(initial.data, { text: '' })

  runtime.remove(initial.id)
  assert.equal(runtime.list().length, 1)
  assert.notEqual(runtime.list()[0].id, initial.id)
  runtime.destroy()
})

test('failed render of a non-current document is atomic and keeps history', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a')] },
  })
  runtime.update('a', () => ({ data: { text: 'changed' } }))
  assert.equal(runtime.canUndo, true)

  assert.throws(() => runtime.render({
    version: 'future-9',
    blocks: [{ id: 'future', type: 'future', dataVersion: 9, data: { x: 1 } }],
  }), /Unsupported document version/)

  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [['a', 'changed']])
  assert.equal(runtime.canUndo, true)
  runtime.destroy()
})

// Rich-text conversion and clipboard contract cases run with a real ownerDocument
// in tests/browser/runtime-contracts.js.

test('mergeAdjacent commits data merge and source removal as one undoable transaction', () => {
  const definition = paragraphDefinition()
  definition.capabilities.merge = {
    merge(target, source) {
      return { text: target.text + source.text }
    },
  }
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    data: {
      version: '2.0.0',
      blocks: [block('a', { text: 'A' }), block('b', { text: 'B' })],
    },
  })

  assert.equal(runtime.mergeAdjacent('a', 'b'), true)
  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [['a', 'AB']])
  assert.equal(runtime.canUndo, true)

  assert.equal(runtime.undo(), true)
  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [['a', 'A'], ['b', 'B']])
  assert.equal(runtime.canRedo, true)

  assert.equal(runtime.redo(), true)
  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [['a', 'AB']])
  runtime.destroy()
})

test('unrecoverable read-only transition fails runtime but preserves committed save', () => {
  let fail = false
  const projector = {
    mount() {},
    prepare() {
      return { apply() {}, recover() {}, finalize() {}, discard() {} }
    },
    setReadOnly() {
      if (fail) throw new AggregateError([new Error('apply'), new Error('recover')], 'readOnly recovery failed')
    },
    destroy() {},
  }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    projector,
    data: { version: '2.0.0', blocks: [block('a')] },
  })

  fail = true
  assert.throws(() => runtime.setReadOnly(true), /readOnly recovery failed/)
  assert.equal(runtime.health, 'failed')
  assert.equal(runtime.save().blocks[0].data.text, 'a')
  assert.throws(
    () => runtime.update('a', () => ({ data: { text: 'later' } })),
    /DocumentRuntime is failed/,
  )
  runtime.destroy()
})

test('discarding projection edits preserves canonical data, revision and history in read-only mode', () => {
  let restored = null
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Committed' })] },
    projector: { restore(store) { restored = store.get('a').data.text } },
  })
  const before = runtime.save().blocks
  const revision = runtime.revision
  const generation = runtime.generation
  runtime.setReadOnly(true)
  runtime.discardProjectionEdits()
  assert.equal(restored, 'Committed')
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, revision)
  assert.equal(runtime.generation, generation)
  runtime.setReadOnly(false)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

test('failed discard of projection edits stops interactions and preserves committed save', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Committed' })] },
    projector: { restore() { throw new Error('Cannot restore the preedit projection') } },
  })
  assert.throws(() => runtime.discardProjectionEdits(), /Cannot restore/)
  assert.equal(runtime.health, 'failed')
  assert.equal(runtime.save().blocks[0].data.text, 'Committed')
  assert.throws(() => runtime.update('a', () => ({ data: { text: 'Later' } })), /DocumentRuntime is failed/)
  runtime.destroy()
})
