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

test('whole conversion rejects targets that cannot preserve linked inline data', () => {
  const source=paragraphDefinition()
  const code={
    type:'code',
    schema:{
      currentVersion:1,
      createDefault:()=>({text:''}),
      decode(input){
        if(input.dataVersion!==1)throw new RangeError('unsupported data version')
        return {dataVersion:1,data:{text:String(input.data?.text??'')}}
      },
      encode(data){return {dataVersion:1,data:{text:String(data.text??'')}}},
    },
    capabilities:{
      conversion:{
        export:data=>({kind:'plain-text',data:{text:data.text}}),
        canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
        import:payload=>({text:payload.data.text}),
      },
    },
  }
  const runtime=new DocumentRuntime({
    registry:{
      ...registry([source,code]),
      getInlineDefinition(){return undefined},
    },
    data:{
      version:'2.0.0',
      blocks:[{
        id:'a',
        type:'paragraph',
        dataVersion:1,
        data:{text:'Before {{opaque}} after'},
        inline:{opaque:{type:'future-inline',dataVersion:7,data:{value:1}}},
      }],
    },
  })
  const before=runtime.save().blocks
  assert.throws(
    ()=>runtime.convert('a',{type:'code'}),
    /cannot preserve inline reference "opaque"/,
  )
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.canUndo,false)
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
