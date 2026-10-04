import { DocumentRuntime } from '../../core/DocumentRuntime.js'
import { test, assert as check, equal, run } from './regressions/harness.js'

const assert = {
  equal,
  deepEqual: equal,
  ok: check,
  throws(operation, pattern) {
    let error
    try { operation() } catch (caught) { error = caught }
    check(error, 'Expected operation to throw')
    check(pattern.test(String(error)), `Unexpected error: ${error}`)
  },
}

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
    ownerDocument: document,
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
    ownerDocument: document,
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

test('prepared cross-block cut merges endpoint residuals through the declared merge contract', () => {
  const definition = paragraphDefinition({
    mapRichText(data, transform) {
      return { ...data, text: transform(data.text, 'text') }
    },
  })
  definition.capabilities.merge = {
    merge(target, source) {
      return { text: target.text + source.text }
    },
  }
  const runtime = new DocumentRuntime({
    ownerDocument: document,
    registry: registry([definition]),
    data: {
      version: '2.0.0',
      blocks: [
        block('a', { text: 'Alpha one' }),
        block('b', { text: 'Bravo two' }),
        block('c', { text: 'Charlie three' }),
      ],
    },
  })
  const bookmark = {
    anchor: { blockId: 'a', fieldKey: 'text', offset: 6 },
    focus: { blockId: 'c', fieldKey: 'text', offset: 7 },
  }
  const plan = runtime.prepareLogicalClipboardSlice(bookmark)
  assert.ok(plan)
  assert.deepEqual(plan.parts.map(part => part.kind), ['rich-text', 'block', 'rich-text'])

  const result = runtime.applyPreparedClipboardCut(plan)
  assert.equal(result.blockId, 'a')
  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [['a', 'Alpha  three']])
  assert.equal(runtime.canUndo, true)

  assert.equal(runtime.undo(), true)
  assert.deepEqual(runtime.list().map(item => [item.id, item.data.text]), [
    ['a', 'Alpha one'],
    ['b', 'Bravo two'],
    ['c', 'Charlie three'],
  ])
  runtime.destroy()
})


await run()
