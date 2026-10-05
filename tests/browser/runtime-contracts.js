import { DocumentRuntime } from '../../core/DocumentRuntime.js'
import { test, assert as check, equal, run, make, blockElement } from './regressions/harness.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'

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


function protectedParagraph({ edit, failed, beforeCreate = () => {}, beforeRead = () => {} }) {
  const definition = createParagraphPlugin()
  return {
    ...definition,
    setup(runtimeContext) {
      const runtime = definition.setup(runtimeContext)
      return {
        ...runtime,
        create(initial, context) {
          beforeCreate()
          const instance = runtime.create(initial, context)
          const wrapper = document.createElement('div')
          const control = document.createElement('button')
          control.type = 'button'
          control.textContent = 'Protected edit'
          control.addEventListener('click', () => {
            try {
              context.commitDomMutation(() => { instance.element.textContent = 'Uncommitted'; edit() })
            } catch (error) { failed(error) }
          }, { signal: context.signal })
          wrapper.append(instance.element, control)
          return { ...instance, element: wrapper, read() { beforeRead(); return instance.read() } }
        },
      }
    },
  }
}

test('mounted plugin protected edit cannot persist a nested host write or alter history', () => {
  let editor
  let failure
  let producerCalls = 0
  const definition = protectedParagraph({
    edit() { editor.blocks.update('b', () => { producerCalls++; return { data: { text: 'Nested write' } } }) },
    failed(error) { failure = error },
  })
  editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo' } },
  ], { plugins: [definition] })
  const before = editor.save().blocks
  blockElement(editor, 'a').querySelector('button').click()
  assert.ok(/protected projection edit/.test(String(failure)))
  assert.equal(producerCalls, 0)
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(blockElement(editor, 'a').querySelector('.oe-paragraph').textContent, 'Alpha')
  assert.equal(editor.canUndo, false)
  editor.blocks.update('b', current => ({ data: { ...current.data, text: 'Accepted' } }))
  assert.equal(editor.save().blocks[1].data.text, 'Accepted')
})

test('mounted plugin protected edit cannot switch the editor to read-only midway', () => {
  let editor
  let failure
  const definition = protectedParagraph({
    edit() { editor.setReadOnly(true) },
    failed(error) { failure = error },
  })
  editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }], { plugins: [definition] })
  const before = editor.save().blocks
  blockElement(editor, 'a').querySelector('button').click()
  assert.ok(/protected projection edit/.test(String(failure)))
  assert.equal(editor.readOnly, false)
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(blockElement(editor, 'a').querySelector('.oe-paragraph').textContent, 'Alpha')
  assert.equal(editor.canUndo, false)
  editor.setReadOnly(true)
  assert.equal(editor.readOnly, true)
})

test('failed recovery of a mounted plugin projection preserves save and blocks future producers', () => {
  let failProjection = false
  let failure
  const definition = protectedParagraph({
    edit() { failProjection = true },
    failed(error) { failure = error },
    beforeRead() { if (failProjection) throw new Error('Plugin read failed') },
    beforeCreate() { if (failProjection) throw new Error('Plugin recovery mount failed') },
  })
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }], { plugins: [definition] })
  const before = editor.save().blocks
  blockElement(editor, 'a').querySelector('button').click()
  assert.ok(failure instanceof AggregateError)
  assert.equal(failure.errors[0].message, 'Plugin read failed')
  assert.equal(failure.errors[1].message, 'Plugin recovery mount failed')
  assert.deepEqual(editor.save().blocks, before)
  let producerCalls = 0
  assert.throws(() => editor.blocks.update('a', () => { producerCalls++; return { data: { text: 'Late' } } }), /failed/)
  assert.equal(producerCalls, 0)
  assert.equal(editor.canUndo, false)
})


test('failed read-only transition restores even the plugin that threw after changing its controls', () => {
  const base = createParagraphPlugin()
  let failOnce = true
  const definition = {
    ...base,
    setup(runtimeContext) {
      const runtime = base.setup(runtimeContext)
      return {
        ...runtime,
        create(data, context) {
          const instance = runtime.create(data, context)
          return {
            ...instance,
            setReadOnly(next) {
              instance.setReadOnly(next)
              if (next && data.text === 'Bravo' && failOnce) {
                failOnce = false
                throw new Error('Control transition failed after applying')
              }
            },
          }
        },
      }
    },
  }
  const editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo' } },
  ], { plugins: [definition] })
  const before = editor.save().blocks
  assert.throws(() => editor.setReadOnly(true), /Control transition failed after applying/)
  assert.equal(editor.readOnly, false)
  assert.equal(blockElement(editor, 'a').querySelector('.oe-paragraph').contentEditable, 'true')
  assert.equal(blockElement(editor, 'b').querySelector('.oe-paragraph').contentEditable, 'true')
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(editor.canUndo, false)
  editor.setReadOnly(true)
  assert.equal(editor.readOnly, true)
  editor.setReadOnly(false)
  editor.blocks.update('b', current => ({ data: { ...current.data, text: 'Still editable' } }))
  assert.equal(editor.save().blocks[1].data.text, 'Still editable')
})


for (const mode of ['protected edit', 'read-only transition']) {
test(`instance data task cannot begin during ${mode}`, () => {
  const base = createParagraphPlugin()
  let context
  let rejection
  const probe = () => {
    try { context.beginTask().cancel() } catch (error) { rejection = error }
  }
  const definition = {
    ...base,
    setup(runtimeContext) {
      const runtime = base.setup(runtimeContext)
      return {
        ...runtime,
        create(data, currentContext) {
          context = currentContext
          const instance = runtime.create(data, currentContext)
          return {
            ...instance,
            setReadOnly(next) {
              instance.setReadOnly(next)
              if (next && mode === 'read-only transition') probe()
            },
          }
        },
      }
    },
  }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }], { plugins: [definition] })
  const before = editor.save().blocks
  if (mode === 'protected edit') context.commitDomMutation(probe)
  else editor.setReadOnly(true)
  assert.ok(rejection, 'A DataTask was allocated inside a guarded operation')
  assert.ok(/Cannot begin a data task during/.test(String(rejection)))
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(editor.canUndo, false)
})
}


test('failed inline read-only transition restores the widget that threw after applying', () => {
  const base = createColorSwatchPlugin()
  let failOnce = true
  const definition = {
    ...base,
    setup(runtimeContext) {
      const runtime = base.setup(runtimeContext)
      return {
        ...runtime,
        create(id, data, context) {
          const instance = runtime.create(id, data, context)
          return {
            ...instance,
            setReadOnly(next) {
              instance.setReadOnly(next)
              if (next && id === 'second' && failOnce) {
                failOnce = false
                throw new Error('Inline transition failed after applying')
              }
            },
          }
        },
      }
    },
  }
  const editor = make([{
    id: 'a', type: 'paragraph', dataVersion: 2,
    data: { text: 'Alpha {{first}} and {{second}}' },
    inline: {
      first: { type: 'color', ...base.schema.encode({ value: '#4357b4' }) },
      second: { type: 'color', ...base.schema.encode({ value: '#123456' }) },
    },
  }], { inlinePlugins: [definition] })
  const before = editor.save().blocks
  assert.throws(() => editor.setReadOnly(true), /Inline transition failed after applying/)
  assert.equal(editor.readOnly, false)
  assert.equal(blockElement(editor, 'a').querySelector('.oe-paragraph').contentEditable, 'true')
  assert.deepEqual([...blockElement(editor, 'a').querySelectorAll('.oe-ip--color')].map(widget => widget.tabIndex), [0, 0])
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(editor.canUndo, false)
  editor.setReadOnly(true)
  assert.deepEqual([...blockElement(editor, 'a').querySelectorAll('.oe-ip--color')].map(widget => widget.tabIndex), [-1, -1])
  editor.setReadOnly(false)
  assert.deepEqual([...blockElement(editor, 'a').querySelectorAll('.oe-ip--color')].map(widget => widget.tabIndex), [0, 0])
})


test('mounted projection and committed observers reject nested host producers', () => {
  const base = createParagraphPlugin()
  let editor
  let producerCalls = 0
  const failures = []
  const attempt = () => {
    try {
      editor.blocks.update('b', () => { producerCalls++; return { data: { text: 'Forbidden' } } })
    } catch (error) { failures.push(error.message) }
  }
  const definition = {
    ...base,
    setup(runtimeContext) {
      const runtime = base.setup(runtimeContext)
      return {
        ...runtime,
        create(data, context) {
          const instance = runtime.create(data, context)
          return { ...instance, update(next) { attempt(); instance.update(next) } }
        },
      }
    },
  }
  editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo' } },
  ], { plugins: [definition] })
  editor.on('transaction:committed', attempt)
  editor.blocks.update('a', current => ({ data: { ...current.data, text: 'Accepted' } }))
  assert.equal(producerCalls, 0)
  assert.deepEqual(failures, [
    'Cannot mutate document during applying-projection phase',
    'Cannot mutate document during publishing phase',
  ])
  assert.deepEqual(editor.save().blocks.map(record => record.data.text), ['Accepted', 'Bravo'])
  assert.equal(editor.canUndo, true)
})

await run()
