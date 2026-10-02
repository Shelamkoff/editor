import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentRuntime } from './DocumentRuntime.js'

function schema(options = {}) {
  return {
    currentVersion: options.currentVersion ?? 1,
    legacyVersion: 1,
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
  return { id, type: 'paragraph', data, ...extra }
}

test('DocumentRuntime decodes known external blocks into current canonical schema data', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition({ currentVersion: 2 })]),
    data: {
      version: '2.0.0',
      blocks: [block('a', { text: 'A' }, { dataVersion: 1 })],
    },
  })

  assert.equal(runtime.documentMode, 'editable')
  assert.deepEqual(runtime.get('a'), {
    id: 'a',
    type: 'paragraph',
    dataVersion: 2,
    data: { text: 'A' },
  })
  runtime.destroy()
})

test('preserve ingestion keeps invalid known and unknown blocks inert without rewriting opaque payloads', () => {
  const issues = []
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    validationMode: 'preserve',
    onValidationError: issue => issues.push(issue),
    data: {
      version: '2.0.0',
      blocks: [
        { id: 'bad', type: 'paragraph', data: { nope: true }, dataVersion: 1 },
        { id: 'future', type: 'future-block', data: { html: '<img onerror=bad()>' }, dataVersion: 9 },
      ],
    },
  })

  assert.equal(runtime.activation('bad').kind, 'preserved')
  assert.equal(runtime.activation('future').kind, 'preserved')
  assert.deepEqual(runtime.get('bad').data, { nope: true })
  assert.deepEqual(runtime.get('future').data, { html: '<img onerror=bad()>' })
  assert.equal(issues.length, 1)
  runtime.destroy()
})

test('strict ingestion rejects invalid known data but still preserves unknown types inertly', () => {
  assert.throws(() => new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    validationMode: 'strict',
    data: {
      version: '2.0.0',
      blocks: [{ id: 'bad', type: 'paragraph', data: { nope: true } }],
    },
  }), /Invalid block data for "paragraph"/)

  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    validationMode: 'strict',
    data: {
      version: '2.0.0',
      blocks: [{ id: 'future', type: 'future-block', data: { x: 1 } }],
    },
  })
  assert.equal(runtime.activation('future').kind, 'preserved')
  runtime.destroy()
})

test('local update is always strict even when external validation mode is preserve', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    validationMode: 'preserve',
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

test('preserved blocks may move and remove but cannot be updated', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: {
      version: '2.0.0',
      blocks: [
        { id: 'future', type: 'future', data: { x: 1 } },
        block('a'),
      ],
    },
  })

  assert.throws(
    () => runtime.update('future', () => ({ data: { x: 2 } })),
    /Preserved block cannot be updated: future/,
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

test('unsupported document versions enter preserved-document mode and form a history reset boundary', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    documentVersionPolicy: 'preserve',
    data: {
      version: 'future-9',
      time: 123,
      blocks: [{ id: 'future', type: 'future', data: { x: 1 } }],
    },
  })

  assert.equal(runtime.documentMode, 'preserved')
  assert.equal(runtime.readOnly, true)
  assert.throws(() => runtime.insert('paragraph'), /Preserved documents are not writable/)
  assert.deepEqual(runtime.save(), {
    version: 'future-9',
    time: 123,
    blocks: [{ id: 'future', type: 'future', data: { x: 1 } }],
  })

  runtime.render({ version: '2.0.0', blocks: [block('a')] })
  assert.equal(runtime.documentMode, 'editable')
  assert.equal(runtime.canUndo, false)
  assert.equal(runtime.get('a').data.text, 'a')
  runtime.destroy()
})

test('convert uses source and target capabilities instead of arbitrary data merge', () => {
  const heading = {
    type: 'heading',
    schema: schema({
      createDefault: () => ({ text: '', level: 2 }),
      decode(input) {
        if (typeof input.data?.text !== 'string') throw new TypeError('heading text required')
        if (input.data?.level !== 2) throw new TypeError('heading level required')
        return { dataVersion: 1, data: { text: input.data.text, level: 2 } }
      },
      encode(data) {
        if (typeof data?.text !== 'string' || data.level !== 2) throw new TypeError('heading invalid')
        return { dataVersion: 1, data: { text: data.text, level: 2 } }
      },
    }),
    capabilities: {
      conversion: {
        export: data => ({ kind: 'rich-text', data: { text: data.text } }),
        canImport: payload => payload.kind === 'rich-text',
        import: payload => ({ text: payload.data.text, level: 2 }),
      },
    },
  }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition(), heading]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Hello' })] },
  })

  runtime.convert('a', { type: 'heading' })
  const converted = runtime.get('a')
  assert.equal(converted.type, 'heading')
  assert.deepEqual(converted.data, { text: 'Hello', level: 2 })
  runtime.destroy()
})

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
