import { DocumentRuntime } from '../../core/DocumentRuntime.js'
import { SelectionController } from '../../core/SelectionController.js'
import { test, assert as check, equal, run, make, blockElement, para, editableField, select } from './regressions/harness.js'
import { CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment } from '../../core/ClipboardFragment.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { createHeadingPlugin } from '../../plugins/heading/index.js'
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


test('inline producer failure rolls back nested host updates without a history step', () => {
  const base = createColorSwatchPlugin()
  let context
  const definition = { ...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(id, data, currentContext) {
      context = currentContext
      return runtime.create(id, data, currentContext)
    } }
  } }
  const editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: {text:'Alpha {{swatch}}'}, inline: {swatch: {type:'color', ...base.schema.encode({value:'#4357b4'})}} },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: {text:'Bravo'} },
  ], {inlinePlugins:[definition]})
  const before = editor.save().blocks
  let events = 0
  editor.on('transaction:committed', () => { events++ })
  assert.throws(() => context.updateData(() => {
    editor.blocks.update('b', () => ({data:{text:'Nested'}}))
    throw new Error('Inline producer failed')
  }), /Inline producer failed/)
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(events, 0)
  assert.equal(editor.canUndo, false)
  context.updateData(current => ({...current, value:'#123456'}))
  assert.equal(editor.save().blocks[0].inline.swatch.data.value, '#123456')
  assert.equal(events, 1)
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.save().blocks, before)
})


test('public host updates commit together and a caught nested error aborts the outer action', () => {
  const editor = make([
    {id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}},
    {id:'b',type:'paragraph',dataVersion:2,data:{text:'Bravo'}},
  ])
  const before = editor.save().blocks
  let events = 0
  editor.on('transaction:committed', () => {events++})
  editor.blocks.update('a', () => {
    editor.blocks.update('b', () => ({data:{text:'Nested'}}))
    return {data:{text:'Outer'}}
  })
  assert.deepEqual(editor.save().blocks.map(block => block.data.text), ['Outer','Nested'])
  assert.equal(events, 1)
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(editor.canUndo, false)
  const eventsBeforeFailure = events
  assert.throws(() => editor.blocks.update('a', () => {
    try { editor.blocks.update('b', () => ({type:'heading'})) } catch {}
    return {data:{text:'Must not commit'}}
  }), /cannot change id, type/)
  assert.deepEqual(editor.save().blocks, before)
  assert.equal(events, eventsBeforeFailure)
  assert.equal(editor.canUndo, false)
  assert.equal(editor.canRedo, true)
})

test('mounted data task executes its producer once despite recursive commit', () => {
  const base = createParagraphPlugin()
  let context
  const definition = {...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return {...runtime, create(data, currentContext) {context=currentContext;return runtime.create(data,currentContext)}}
  }}
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}], {plugins:[definition]})
  const before = editor.save().blocks
  const task = context.beginTask()
  let nestedCalls = 0
  let events = 0
  editor.on('transaction:committed', () => {events++})
  assert.equal(task.commit(current => {
    assert.equal(task.commit(() => {nestedCalls++;return {text:'Forbidden'}}), false)
    return {...current,text:'Completed'}
  }), true)
  assert.equal(nestedCalls, 0)
  assert.equal(events, 1)
  assert.equal(task.signal.aborted, false)
  assert.equal(editor.save().blocks[0].data.text, 'Completed')
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.save().blocks, before)
})

test('conversion and undo never revive an old task while a fresh task uses latest author data', async () => {
  const base = createParagraphPlugin()
  const contexts = []
  const definition = {...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return {...runtime, create(data, context) {contexts.push(context);return runtime.create(data,context)}}
  }}
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}], {plugins:[definition,createHeadingPlugin()]})
  const before = editor.save().blocks
  const task = contexts[0].beginTask()
  editor.blocks.convert('a', {type:'heading',toolboxItemId:'h3'})
  assert.equal(editor.save().blocks[0].type, 'heading')
  assert.equal(task.signal.aborted, true)
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.save().blocks, before)
  await Promise.resolve()
  let staleCalls = 0
  assert.equal(task.commit(() => {staleCalls++;return {text:'Late'}}), false)
  assert.equal(staleCalls, 0)
  const fresh = contexts.at(-1).beginTask()
  editor.blocks.update('a', () => ({data:{text:'Latest'}}))
  assert.equal(fresh.commit(current => ({...current,text:current.text+' result'})), true)
  assert.equal(editor.save().blocks[0].data.text, 'Latest result')
})


test('inline producer preserves a nested update of its containing author text', () => {
  const base = createColorSwatchPlugin()
  let context
  const definition = {...base,setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return {...runtime,create(id,data,currentContext) {context=currentContext;return runtime.create(id,data,currentContext)}}
  }}
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha {{swatch}}'},inline:{swatch:{type:'color',...base.schema.encode({value:'#4357b4'})}}}],{inlinePlugins:[definition]})
  const before = editor.save().blocks
  context.updateData(current => {
    editor.blocks.update('a', () => ({data:{text:'Latest {{swatch}}'}}))
    return {...current,value:'#123456'}
  })
  assert.equal(editor.save().blocks[0].data.text,'Latest {{swatch}}')
  assert.equal(editor.save().blocks[0].inline.swatch.data.value,'#123456')
  assert.equal(editor.undo(),true)
  assert.deepEqual(editor.save().blocks,before)
  assert.equal(editor.canUndo,false)
})


test('public producer cannot overwrite a block it converted during building', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}],{plugins:[createParagraphPlugin(),createHeadingPlugin()]})
  const before = editor.save().blocks
  assert.throws(() => editor.blocks.update('a', () => {
    editor.blocks.convert('a',{type:'heading',toolboxItemId:'h3'})
    return {data:{text:'Stale'}}
  }), /target changed during its producer/)
  assert.deepEqual(editor.save().blocks,before)
  assert.equal(blockElement(editor,'a').querySelector('.oe-paragraph').textContent,'Alpha')
  assert.equal(editor.canUndo,false)
})


for (const kind of ['block','inline']) test(`recoverable ${kind} AggregateError does not revoke healthy mutation authority`, () => {
  const base = kind === 'block' ? createParagraphPlugin() : createColorSwatchPlugin()
  let failOnce = true
  const original = new AggregateError([new Error('Provider A'),new Error('Provider B')], 'Plugin control failed')
  const definition = {...base,setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    const wrap = instance => ({...instance,setReadOnly(next) {
      instance.setReadOnly(next)
      if(next && failOnce) {failOnce=false;throw original}
    }})
    return {...runtime,create(...args) {return wrap(runtime.create(...args))}}
  }}
  const color = createColorSwatchPlugin()
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha {{swatch}}'},inline:{swatch:{type:'color',...color.schema.encode({value:'#4357b4'})}}}],{
    plugins:[kind === 'block' ? definition : createParagraphPlugin()],inlinePlugins:[kind === 'inline' ? definition : color],
  })
  const before = editor.save().blocks
  let failure
  try {editor.setReadOnly(true)} catch(error) {failure=error}
  assert.equal(failure,original)
  assert.equal(editor.readOnly,false)
  assert.equal(blockElement(editor,'a').querySelector('.oe-paragraph').contentEditable,'true')
  assert.equal(blockElement(editor,'a').querySelector('.oe-ip--color').tabIndex,0)
  assert.deepEqual(editor.save().blocks,before)
  editor.blocks.update('a',() => ({data:{text:'Still editable {{swatch}}'}}))
  assert.equal(editor.save().blocks[0].data.text,'Still editable {{swatch}}')
  assert.equal(editor.undo(),true)
  assert.deepEqual(editor.save().blocks,before)
})

test('failed inline control rollback can recover by recreating committed widgets', () => {
  const base = createColorSwatchPlugin()
  let first = true
  let transitionFailed = false
  let rollbackFailed = false
  const definition = {...base,setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return {...runtime,create(...args) {
      const faulty = first
      first = false
      const instance = runtime.create(...args)
      return {...instance,setReadOnly(next) {
        instance.setReadOnly(next)
        if(!faulty) return
        if(next && !transitionFailed) {transitionFailed=true;throw new Error('Inline apply failed')}
        if(!next && transitionFailed && !rollbackFailed) {rollbackFailed=true;throw new Error('Inline in-place rollback failed')}
      }}
    }}
  }}
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha {{swatch}}'},inline:{swatch:{type:'color',...base.schema.encode({value:'#4357b4'})}}}],{inlinePlugins:[definition]})
  const before = editor.save().blocks
  const oldWidget = blockElement(editor,'a').querySelector('.oe-ip--color')
  assert.throws(() => editor.setReadOnly(true), /Inline apply failed/)
  assert.ok(transitionFailed && rollbackFailed)
  assert.ok(oldWidget !== blockElement(editor,'a').querySelector('.oe-ip--color'),'Inline recovery did not recreate the failed widget')
  assert.equal(editor.readOnly,false)
  assert.equal(blockElement(editor,'a').querySelector('.oe-ip--color').tabIndex,0)
  assert.deepEqual(editor.save().blocks,before)
  editor.blocks.update('a',() => ({data:{text:'Fresh {{swatch}}'}}))
  assert.equal(editor.save().blocks[0].data.text,'Fresh {{swatch}}')
})

test('same-value read-only calls do not publish phantom state or history changes', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}])
  const modes = []
  const histories = []
  editor.on('readOnly:changed',event => {modes.push(event.readOnly)})
  editor.on('history:changed',event => {histories.push(event)})
  editor.setReadOnly(false)
  assert.deepEqual(modes,[])
  assert.deepEqual(histories,[])
  editor.setReadOnly(true)
  editor.setReadOnly(true)
  editor.setReadOnly(false)
  editor.setReadOnly(false)
  assert.deepEqual(modes,[true,false])
  assert.equal(histories.length,2)
})

test('public read-only transition rejects nonboolean values without unlocking authoring', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}],{readOnly:true})
  let changes = 0
  editor.on('readOnly:changed',() => {changes++})
  for(const value of [undefined,null,0,1,'false','true',{},[]]) {
    assert.throws(() => editor.setReadOnly(value), /boolean/)
    assert.equal(editor.readOnly,true)
  }
  assert.equal(changes,0)
  assert.equal(blockElement(editor,'a').querySelector('.oe-paragraph').contentEditable,'false')
})


test('irrecoverable inline controls stop producers but preserve the committed document and failure causes', () => {
  const base = createColorSwatchPlugin()
  let transitionFailed = false
  let remountFails = false
  const remountError = new Error('Inline remount failed')
  const definition = {...base,setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return {...runtime,create(...args) {
      if(remountFails) throw remountError
      const instance = runtime.create(...args)
      return {...instance,setReadOnly(next) {
        instance.setReadOnly(next)
        if(next) {transitionFailed=true;throw new Error('Inline apply failed')}
        if(transitionFailed) {remountFails=true;throw new Error('Inline rollback failed')}
      }}
    }}
  }}
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha {{swatch}}'},inline:{swatch:{type:'color',...base.schema.encode({value:'#4357b4'})}}}],{inlinePlugins:[definition]})
  const before = editor.save().blocks
  let failure
  try {editor.setReadOnly(true)} catch(error) {failure=error}
  assert.ok(failure instanceof AggregateError)
  assert.deepEqual(failure.errors[0].errors.map(error => error.message),['Inline apply failed','Inline rollback failed'])
  assert.ok(failure.errors.at(-1) === remountError)
  assert.equal(editor.readOnly,false)
  assert.deepEqual(editor.save().blocks,before)
  let calls = 0
  assert.throws(() => editor.blocks.update('a',() => {calls++;return {data:{text:'Late'}}}), /failed/)
  assert.equal(calls,0)
  assert.equal(editor.canUndo,false)
})

test('read-only observations reject synchronous commands before producers and allow queued commands', async () => {
  let context;
  const base = createParagraphPlugin();
  const plugin = {...base,setup(runtimeContext) {
    const runtime = base.setup(runtimeContext);
    return {...runtime,create(data,blockContext) {context=blockContext;return runtime.create(data,blockContext)}};
  }};
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}],{plugins:[plugin]});
  const before = editor.save().blocks;
  let producerCalls = 0;
  const modes = [];
  const histories = [];
  const rejected = [];
  const rejectedTasks = [];
  let inspecting = false;
  for (const type of ['readOnly:changed','history:changed']) editor.on(type, () => {
    if (inspecting) return;
    inspecting = true;
    if (!editor.readOnly) {
      try {context.beginTask()} catch (error) {rejectedTasks.push(String(error))}
    }
    try {editor.blocks.update('a', () => {producerCalls++;return {data:{text:'Reentered'}}})}
    catch (error) {rejected.push(String(error))}
    try {editor.setReadOnly(!editor.readOnly)}
    catch (error) {rejected.push(String(error))}
    inspecting = false;
  });
  editor.on('readOnly:changed', event => {modes.push([event.readOnly,editor.readOnly])});
  editor.on('history:changed', event => {histories.push([event.canUndo,event.canRedo,editor.readOnly])});
  editor.setReadOnly(true);
  assert.equal(producerCalls,0);
  assert.equal(rejected.length,4);
  assert.ok(rejected.every(error => /read-only transition/.test(error)));
  assert.deepEqual(modes,[[true,true]]);
  assert.deepEqual(histories,[[false,false,true]]);
  assert.deepEqual(editor.save().blocks,before);
  assert.equal(blockElement(editor,'a').querySelector('.oe-paragraph').contentEditable,'false');
  await Promise.resolve().then(() => editor.setReadOnly(false));
  assert.deepEqual(modes,[[true,true],[false,false]]);
  assert.equal(producerCalls,0);
  assert.equal(rejected.length,8);
  assert.equal(rejectedTasks.length,2);
  assert.ok(rejectedTasks.every(error => /read-only-transition/.test(error)));
  editor.blocks.update('a', () => ({data:{text:'Queued authoring'}}));
  assert.equal(editor.save().blocks[0].data.text,'Queued authoring');
  assert.equal(editor.canUndo,true);
});

test('nested whole-block conversion uses author fields from the shared draft and undoes once', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}},{id:'b',type:'paragraph',dataVersion:2,data:{text:'Original Beta'}}], {plugins:[createParagraphPlugin(),createHeadingPlugin()]});
  const before = editor.save().blocks;
  let commits = 0;
  editor.on('transaction:committed', () => {commits++});
  editor.blocks.update('a', () => {
    editor.blocks.update('b', () => ({data:{text:'Authored Beta'},tunes:{textAlign:'center'}}));
    editor.blocks.convert('b', {type:'heading',toolboxItemId:'h3'});
    return {data:{text:'Edited Alpha'}};
  });
  assert.equal(commits,1);
  assert.equal(editor.blocks.get('b').type,'heading');
  assert.equal(editor.blocks.get('b').data.text,'Authored Beta');
  assert.equal(editor.blocks.get('b').data.level,3);
  assert.deepEqual(editor.blocks.get('b').tunes,{textAlign:'center'});
  assert.equal(blockElement(editor,'b').querySelector('h3').textContent,'Authored Beta');
  assert.equal(editor.undo(),true);
  assert.deepEqual(editor.save().blocks,before);
  assert.equal(editor.canUndo,false);
  assert.equal(editor.redo(),true);
  assert.equal(editor.blocks.get('b').data.text,'Authored Beta');
});

test('successive nested appends retain their authored order and form one undo step', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}]);
  const before = editor.save().blocks;
  let first, second;
  editor.blocks.update('a', () => {
    first = editor.blocks.insert({type:'paragraph',data:{text:'First'}});
    second = editor.blocks.insert({type:'paragraph',data:{text:'Second'}});
    return {data:{text:'Edited Alpha'}};
  });
  assert.deepEqual(editor.blocks.list().map(block => block.id),['a',first,second]);
  assert.deepEqual([...document.querySelectorAll('.oe-paragraph')].map(field => field.textContent),['Edited Alpha','First','Second']);
  assert.equal(editor.undo(),true);
  assert.deepEqual(editor.save().blocks,before);
  assert.equal(editor.canUndo,false);
});

test('nested removal accepts a block inserted earlier in the same authoring action', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}}]);
  const before = editor.save().blocks;
  editor.blocks.update('a', () => {
    const temporary = editor.blocks.insert({type:'paragraph',data:{text:'Temporary'}});
    editor.blocks.remove(temporary);
    return {data:{text:'Final author text'}};
  });
  assert.deepEqual(editor.blocks.list().map(block => block.id),['a']);
  assert.equal(editor.blocks.get('a').data.text,'Final author text');
  assert.equal(blockElement(editor,'a').querySelector('.oe-paragraph').textContent,'Final author text');
  assert.equal(editor.undo(),true);
  assert.deepEqual(editor.save().blocks,before);
  assert.equal(editor.canUndo,false);
});

test('caught nested render rejection aborts all authoring changes and preserves the live document', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}},{id:'b',type:'paragraph',dataVersion:2,data:{text:'Beta'}}]);
  const before = editor.save().blocks;
  const originalElement = blockElement(editor,'a');
  assert.throws(() => editor.blocks.update('a', () => {
    editor.blocks.update('b', () => ({data:{text:'Nested change'}}));
    try {editor.render({version:'1.0.0',blocks:[]})} catch {}
    return {data:{text:'Outer change'}};
  }), /document version/i);
  assert.deepEqual(editor.save().blocks,before);
  assert.ok(blockElement(editor,'a') === originalElement);
  assert.equal(blockElement(editor,'b').querySelector('.oe-paragraph').textContent,'Beta');
  assert.equal(editor.canUndo,false);
});

test('async host patch is rejected and cannot commit synchronous nested writes', () => {
  const editor = make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Alpha'}},{id:'b',type:'paragraph',dataVersion:2,data:{text:'Beta'}}]);
  const before = editor.save().blocks;
  assert.throws(() => editor.blocks.update('a', () => {
    editor.blocks.update('b', () => ({data:{text:'Nested write'}}));
    return Promise.resolve({data:{text:'Async patch'}});
  }), /synchronous/);
  assert.deepEqual(editor.save().blocks,before);
  assert.equal(editor.canUndo,false);
  assert.equal(blockElement(editor,'b').querySelector('.oe-paragraph').textContent,'Beta');
});

test('schema preparation rejects public controls and scoped tasks while preserving owner projection', () => {
  const base = createParagraphPlugin()
  let editor, context, armed = false, attempted = false
  const rejected = []
  const definition = { ...base, schema: { ...base.schema, encode(data) {
    if (armed && !attempted) {
      attempted = true
      for (const [name, operation] of [
        ['current', () => editor.blocks.setCurrent('b')],
        ['select', () => editor.blocks.select(['b'])],
        ['clear', () => editor.blocks.clearSelection()],
        ['block focus', () => editor.blocks.focus('b')],
        ['editor focus', () => editor.focus()],
        ['destroy', () => editor.destroy()],
        ['task', () => context.beginTask()],
        ['DOM', () => context.commitDomMutation(() => { throw new Error('DOM callback must not run') })],
      ]) {
        try { operation() } catch (error) {
          check(/prepar/.test(error.message), name + ': ' + error.message)
          rejected.push(name)
        }
      }
      equal(editor.save().blocks[0].data.text, 'A')
    }
    return base.schema.encode(data)
  } }, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(data, value) { if (!context) context = value; return runtime.create(data, value) } }
  } }
  editor = make([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'A' } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'B' } },
  ], { plugins: [definition] })
  editor.blocks.setCurrent('a')
  const readyBefore = editor.isReady
  armed = true
  editor.blocks.update('a', () => ({ data: { text: 'Updated' } }))
  equal(rejected, ['current', 'select', 'clear', 'block focus', 'editor focus', 'destroy', 'task', 'DOM'])
  equal(editor.blocks.currentId, 'a')
  equal(editor.blocks.selectedIds(), [])
  equal(editor.isReady, readyBefore)
  equal(editor.save().blocks[0].data.text, 'Updated')
  editor.undo()
  equal(editor.save().blocks[0].data.text, 'A')
})

test('ordinary async block update rejects before commit and restores the committed projection', () => {
  const base = createParagraphPlugin()
  let asyncOnce = true
  const definition = { ...base, setup(context) {
    const runtime = base.setup(context)
    return { ...runtime, create(data, instanceContext) {
      const instance = runtime.create(data, instanceContext)
      return { ...instance, update(next, previous) {
        instance.update(next, previous)
        if (asyncOnce) { asyncOnce = false; return Promise.reject(new Error('Late update rejection')) }
      } }
    } }
  } }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Before' } }], { plugins: [definition] })
  const before = editor.save().blocks
  assert.throws(() => editor.blocks.update('a', () => ({ data: { text: 'After' } })), /synchronous/)
  equal(editor.save().blocks, before)
  equal(blockElement(editor, 'a').querySelector('.oe-paragraph').textContent, 'Before')
  equal(editor.canUndo, false)
})

function popupEditor() {
  const contexts = {}
  const definition = type => ({
    type, icon: '', label: { key: type, fallback: type }, schema: createColorSwatchPlugin().schema,
    setup(context) { contexts[type] = context; return { create() { throw new Error('Unused widget') }, destroy() {} } },
  })
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Anchor' } }], {
    inlinePlugins: [definition('external-a'), definition('external-b')],
  })
  const anchor = blockElement(editor, 'a').querySelector('.oe-paragraph')
  const content = label => { const element = document.createElement('div'); element.textContent = label; return element }
  return { editor, anchor, content, a: contexts['external-a'], b: contexts['external-b'] }
}

test('popup close handles cannot close a later presentation from another runtime', () => {
  const { a, b, anchor, content } = popupEditor()
  let aClosed = 0, bClosed = 0
  const first = a.showPopup(anchor, content('A'), () => aClosed++)
  check(first && typeof first.close === 'function', 'Popup request returned no close handle')
  equal(Object.isFrozen(first), true)
  const current = b.showPopup(anchor, content('B'), () => bClosed++)
  first.close()
  equal(document.querySelector('.oe-ip-popup').textContent, 'B')
  equal(aClosed, 1)
  equal(bClosed, 0)
  current.close()
  current.close()
  first.close()
  equal(document.querySelector('.oe-ip-popup'), null)
  equal(bClosed, 1)
  equal('hidePopup' in a, false)
})

test('popup validates before replacement and unavailable requests close once', () => {
  const { a, b, anchor, content } = popupEditor()
  let cleaned = 0
  const current = a.showPopup(anchor, content('Current'))
  assert.throws(() => b.showPopup(anchor, content('Invalid'), 42), /Popup requires/)
  const foreign = document.implementation.createHTMLDocument('foreign').createElement('div')
  assert.throws(() => b.showPopup(anchor, foreign), /Popup requires/)
  equal(document.querySelector('.oe-ip-popup').textContent, 'Current')
  const unavailable = b.showPopup(document.createElement('div'), content('Unavailable'), () => cleaned++)
  unavailable.close()
  unavailable.close()
  equal(cleaned, 1)
  equal(document.querySelector('.oe-ip-popup').textContent, 'Current')
  current.close()
})

test('popup cleanup cannot mutate canonical or control state and newer reentrant show wins', () => {
  const { editor, a, b, anchor, content } = popupEditor()
  let producers = 0, newer, outerCleaned = 0
  const before = editor.save().blocks
  const old = a.showPopup(anchor, content('Old'), () => {
    assert.throws(() => editor.blocks.update('a', () => { producers++; return {} }), /observation/)
    assert.throws(() => editor.destroy(), /observation/)
    newer = a.showPopup(anchor, content('Newer'))
  })
  const outer = b.showPopup(anchor, content('Superseded'), () => outerCleaned++)
  old.close()
  outer.close()
  equal(document.querySelector('.oe-ip-popup').textContent, 'Newer')
  equal(outerCleaned, 1)
  equal(producers, 0)
  equal(editor.save().blocks, before)
  newer.close()
})

test('throwing or asynchronous popup cleanup cannot stop the next presentation', () => {
  const { a, b, anchor, content } = popupEditor()
  a.showPopup(anchor, content('First'), () => { throw new Error('Expected cleanup throw') })
  b.showPopup(anchor, content('Second'), () => Promise.reject(new Error('Expected cleanup rejection')))
  const current = a.showPopup(anchor, content('Final'))
  equal(document.querySelector('.oe-ip-popup').textContent, 'Final')
  current.close()
})

test('terminal trigger cancellation is observed and cannot interrupt read-only completion', () => {
  let editor, notices = 0, producers = 0
  const definition = {
    type: 'terminal', trigger: '@', icon: '', label: { key: 'terminal', fallback: 'Terminal' }, schema: createColorSwatchPlugin().schema,
    setup(runtime) { return {
      create() { throw new Error('Unused') }, destroy() {},
      onTriggerQuery(session) { runtime.showPopup(session.anchor, document.createElement('div')) },
      onTriggerCancel() {
        notices++
        assert.throws(() => editor.blocks.update('a', () => { producers++; return {} }), /observation|read-only/)
        throw new Error('Expected terminal failure')
      },
    } },
  }
  editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '@' } }], { inlinePlugins: [definition] })
  editor.blocks.focus('a', { fieldKey: 'text', offset: 1 })
  blockElement(editor, 'a').querySelector('.oe-paragraph').dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '@' }))
  check(document.querySelector('.oe-ip-popup'))
  editor.setReadOnly(true)
  equal(notices, 1)
  equal(producers, 0)
  equal(editor.readOnly, true)
  equal(document.querySelector('.oe-ip-popup'), null)
  check(blockElement(editor, 'a').closest('.oe-editor').classList.contains('oe-editor--read-only'))
})

test('successive inline insertions prepare from the current draft and undo together', () => {
  const paragraph = paragraphDefinition({ mapRichText: (data, visit) => ({ text: visit(data.text, 'text') }) })
  const inlineDefinition = createColorSwatchPlugin()
  const definitions = registry([paragraph])
  definitions.getInlineDefinition = type => type === 'color' ? inlineDefinition : undefined
  const runtime = new DocumentRuntime({ ownerDocument: document, registry: definitions,
    data: { version: '2.0.0', blocks: [block('a', { text: 'AB' })] } })
  let first, second
  try {
    runtime.interact('two inline insertions', () => {
      first = runtime.insertInlineWidget('a', 'text', { start: 1, end: 1 }, 'color', { value: '#112233' })
      second = runtime.insertInlineWidget('a', 'text', { start: 2, end: 2 }, 'color', { value: '#445566' })
    })
    equal(runtime.get('a').data.text, 'A{{' + first + '}}{{' + second + '}}B')
    equal(Object.keys(runtime.get('a').inline), [first, second])
    runtime.undo()
    equal(runtime.get('a').data.text, 'AB')
    equal(runtime.canUndo, false)
  } finally { runtime.destroy() }
})

test('shortcut split callbacks keep the captured staged field and reject producer reentry', () => {
  const base=createParagraphPlugin()
  let editor, retained, producers=0
  const definition={...base,capabilities:{...base.capabilities,shortcuts:{handle(input,data,context){
    if(input.key!=='F2')return null
    retained=context
    assert.throws(()=>editor.blocks.update('a',()=>{producers++;return {}}),/prepar/)
    const parts=context.splitField('text',{start:2,end:2})
    return {kind:'update',data:{text:parts.before+'|'+parts.after},focus:{fieldKey:'text',offset:3}}
  }}}}
  editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Before'}}],{plugins:[definition]})
  editor.blocks.focus('a',{fieldKey:'text',offset:1})
  const event=new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true})
  editor.blocks.update('a',()=>{
    editor.blocks.update('a',()=>({data:{text:'Staged'}}))
    blockElement(editor,'a').querySelector('.oe-paragraph').dispatchEvent(event)
    return {}
  })
  equal(event.defaultPrevented,true)
  equal(producers,0)
  equal(editor.save().blocks[0].data.text,'St|aged')
  editor.blocks.update('a',()=>({data:{text:'Later'}}))
  equal(retained.splitField('text',{start:2,end:2}),{before:'St',after:'aged'})
  equal(retained.fieldLength('missing'),0)
})

for(const decision of ['throw','thenable','invalid','accessor'])test('failed owned shortcut cancels native fallback: '+decision,()=>{
  const base=createParagraphPlugin()
  const definition={...base,capabilities:{...base.capabilities,shortcuts:{handle(){
    if(decision==='throw')throw new Error('Expected shortcut failure')
    if(decision==='thenable')return Promise.reject(new Error('Contained shortcut rejection'))
    if(decision==='accessor')return {get kind(){throw new Error('Expected action accessor failure')}}
    return {kind:'unsupported'}
  }}}}
  const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'Before'}}],{plugins:[definition]})
  editor.blocks.focus('a',{fieldKey:'text',offset:2})
  const before=editor.save().blocks
  const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})
  blockElement(editor,'a').querySelector('.oe-paragraph').dispatchEvent(event)
  equal(event.defaultPrevented,true)
  equal(editor.save().blocks,before)
  equal(editor.canUndo,false)
})

test('nested conversion returns its prepared active snapshot for a newly inserted block',()=>{
  const editor=make([{id:'a',type:'paragraph',dataVersion:2,data:{text:'A'}}],{plugins:[createParagraphPlugin(),createHeadingPlugin()]})
  let id
  editor.blocks.update('a',()=>{
    id=editor.blocks.insert({type:'paragraph',data:{text:'Draft'}})
    const converted=editor.blocks.convert(id,{type:'heading'})
    equal(converted.type,'heading')
    equal(converted.status,'active')
    equal(converted.data.text,'Draft')
    editor.blocks.update(id,current=>{
      equal(current.status,'active')
      return {data:{...current.data,text:'Updated draft'}}
    })
    return {}
  })
  equal(editor.blocks.get(id).type,'heading')
  equal(editor.blocks.get(id).data.text,'Updated draft')
  editor.undo()
  equal(editor.save().blocks.map(block=>block.id),['a'])
  equal(editor.canUndo,false)
})

test('rich and inline replacement compose against staged text without restoring removed occurrences',()=>{
  const paragraph=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const inline={x:{type:'unloaded',dataVersion:1,data:{label:'X'}},y:{type:'unloaded',dataVersion:1,data:{label:'Y'}}}
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([paragraph]),
    data:{version:'2.0.0',blocks:[block('a',{text:'A{{x}}B{{y}}C'},{inline})]}})
  try{
    runtime.interact('composed fields',()=>{
      runtime.replaceInlineWidgetWithText('a','x','X')
      runtime.removeInlineWidget('a','y')
      runtime.replaceRichText('a','text',{start:0,end:1},{kind:'text',text:'Start'})
    })
    equal(runtime.get('a').data.text,'StartXBC')
    equal(runtime.get('a').inline,undefined)
    runtime.undo()
    equal(runtime.get('a').data.text,'A{{x}}B{{y}}C')
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('slash choice removes a query from staged text at the staged insertion position',()=>{
  const source=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const target={...source,type:'heading'}
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([source,target]),
    data:{version:'2.0.0',blocks:[block('a',{text:'/heading'}),block('b',{text:'B'})]}})
  let id
  try{
    runtime.interact('edit and slash',()=>{
      runtime.update('a',()=>({data:{text:'Prefix /heading'}}))
      runtime.move('a',1)
      id=runtime.applySlashBlockCommand('a','text',{start:7,end:15},{type:'heading'})
    })
    equal(runtime.ids(),['b','a',id])
    equal(runtime.get('a').data.text,'Prefix ')
    equal(runtime.get(id).type,'heading')
    runtime.undo()
    equal(runtime.ids(),['a','b'])
    equal(runtime.get('a').data.text,'/heading')
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('split reserves current draft IDs after a nested document replacement',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const values=['draft','allocated']
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),createId:()=>values.shift(),
    data:{version:'2.0.0',blocks:[block('a',{text:'Before'})]}})
  let id
  try{
    runtime.interact('render and split',()=>{
      runtime.render({version:'2.0.0',blocks:[block('draft',{text:'After'})]})
      id=runtime.splitBlock('draft','text',{start:2,end:2})
    })
    equal(id,'allocated')
    equal(runtime.ids(),['draft','allocated'])
    equal(runtime.get('draft').data.text,'Af')
    equal(runtime.get('allocated').data.text,'ter')
    runtime.undo()
    equal(runtime.ids(),['a'])
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('range and resolved Paste preserve staged text and return a successful no-change caret without history',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a',{text:'Original'},{revision:'producer'})]}})
  const bookmark={anchor:{blockId:'a',fieldKey:'text',offset:0},focus:{blockId:'a',fieldKey:'text',offset:8}}
  try{
    const before=runtime.revision
    const result=runtime.replaceLogicalRangeWithClipboardParts(bookmark,[{kind:'rich-text',html:'Original'}])
    equal(result,{blockId:'a',inserted:[],focus:{fieldKey:'text',offset:8}})
    equal(runtime.revision,before);equal(runtime.get('a').revision,'producer');equal(runtime.canUndo,false)
    runtime.interact('compose range and resolved Paste',()=>{
      runtime.update('a',()=>({data:{text:'Staged'}}))
      equal(runtime.replaceLogicalRange({anchor:{blockId:'a',fieldKey:'text',offset:1},focus:{blockId:'a',fieldKey:'text',offset:2}},{kind:'text',text:'X'}),{blockId:'a',fieldKey:'text',offset:2})
      const pasted=runtime.applyPasteResults('a','text',{start:2,end:3},[{type:'paragraph',result:{kind:'rich-text',replacement:{kind:'text',text:'Y'}}}])
      equal(pasted,{blockId:'a',inserted:[],focus:{fieldKey:'text',offset:3}})
    })
    equal(runtime.get('a').data.text,'SXYged')
    runtime.undo();equal(runtime.get('a').data.text,'Original');equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('whole-selection replacement keeps unselected staged blocks and omitted IDs resolve from the draft',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a'),block('b'),block('c')]}})
  try{
    let staged,point
    runtime.interact('insert gap and replace',()=>{
      staged=runtime.insert('paragraph',{text:'gap'},1)
      point=runtime.replaceWholeDocument({kind:'text',text:'replacement'},['a','c'])
    })
    equal(runtime.ids(),[point.blockId,staged,'b'])
    equal(runtime.get(staged).data.text,'gap')
    runtime.undo()
    runtime.interact('replace current document',()=>{
      runtime.insert('paragraph',{text:'new'})
      point=runtime.replaceWholeDocument({kind:'text',text:'all'})
    })
    equal(runtime.ids(),[point.blockId]);equal(runtime.get(point.blockId).data.text,'all')
  }finally{runtime.destroy()}
})

test('Cut targets a surviving residual and never carries a removed source block identity in focus',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  definition.capabilities.merge={merge:(left,right)=>({text:left.text+right.text})}
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a',{text:'First'}),block('b',{text:'Last'})]}})
  try{
    const handle=runtime.prepareLogicalClipboardSlice({anchor:{blockId:'a',fieldKey:'text',offset:0},focus:{blockId:'b',fieldKey:'text',offset:2}})
    let result
    runtime.interact('cut',()=>{result=runtime.applyPreparedClipboardCut(handle)})
    equal(runtime.ids(),['b']);equal(runtime.get('b').data.text,'st')
    equal(result,{blockId:'b'})
    runtime.undo();equal(runtime.ids(),['a','b']);equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('public no-change Paste collapses to the prepared caret without creating history',async()=>{
  const editor=make([para('a','Original',{revision:'author'})])
  const field=editableField(editor,'a')
  select(field,0,8)
  const transfer=new DataTransfer()
  transfer.setData(CLIPBOARD_FRAGMENT_MIME,encodeClipboardFragment([{kind:'rich-text',html:'Original'}]))
  const event=new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true})
  field.dispatchEvent(event)
  await new Promise(resolve=>setTimeout(resolve,0))
  check(event.defaultPrevented)
  equal(editor.canUndo,false);equal(editor.save().blocks[0].revision,'author')
  const selection=window.getSelection()
  equal(selection.isCollapsed,true)
  equal(getTextOffset(field,selection.anchorNode,selection.anchorOffset),8)
})

test('Paste focus continuation is retired when a current-block observer replaces the document',async()=>{
  const editor=make([para('a','Anchor')])
  const field=editableField(editor,'a')
  select(field,2)
  let replacementId=null
  const stop=editor.on('currentBlock:changed',event=>{
    if(!event.currentId||event.currentId==='a'||replacementId)return
    replacementId=event.currentId
    editor.render({version:'2.0.0',blocks:[para(replacementId,'Replacement')]})
    editor.blocks.focus(replacementId,{fieldKey:'text',offset:0})
  })
  const transfer=new DataTransfer()
  transfer.setData(CLIPBOARD_FRAGMENT_MIME,encodeClipboardFragment([{kind:'block',block:para('ignored','Pasted')}]))
  field.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}))
  await new Promise(resolve=>setTimeout(resolve,0))
  stop()
  check(replacementId,'current-block observer did not run')
  const live=editableField(editor,replacementId),selection=window.getSelection()
  equal(getTextOffset(live,selection.anchorNode,selection.anchorOffset),0)
})

test('invalid resolved replacement rejects before applying an earlier prepared block',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a',{text:'Original'})]}})
  try{
    assert.throws(()=>runtime.applyPasteResults('a','text',{start:0,end:1},[
      {type:'paragraph',result:{kind:'block',data:{text:'prepared'}}},
      {type:'paragraph',result:{kind:'rich-text',replacement:{kind:'text',text:42}}},
    ]),/replacement/)
    equal(runtime.ids(),['a']);equal(runtime.get('a').data.text,'Original');equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('clipboard capability focus cannot replace the host-owned block identity',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({text:visit(data.text,'text')})})
  definition.capabilities.clipboard={slice:data=>({parts:[{kind:'rich-text',html:'A'}],remaining:{text:data.text.slice(1)},focus:{blockId:'foreign',fieldKey:'text',offset:0}})}
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a',{text:'ABC'})]}})
  try{
    const handle=runtime.prepareLogicalClipboardSlice({anchor:{blockId:'a',fieldKey:'text',offset:0},focus:{blockId:'a',fieldKey:'text',offset:1}})
    equal(handle.focus,{blockId:'a',fieldKey:'text',offset:0})
    equal(runtime.applyPreparedClipboardCut(handle),{blockId:'a',focus:{fieldKey:'text',offset:0}})
    equal(runtime.get('a').data.text,'BC')
  }finally{runtime.destroy()}
})


test('file Paste rejects a non-boolean accepts result without native fallback', () => {
  const base = createParagraphPlugin()
  let resolutionCalls = 0
  const definition = {
    ...base,
    capabilities: {
      ...base.capabilities,
      paste: {
        accepts() { return 'yes' },
        resolve() { resolutionCalls++; return null },
      },
    },
  }
  const editor = make([para('a', 'Original')], { plugins: [definition] })
  const field = editableField(editor, 'a')
  select(field, 3)
  const data = new DataTransfer()
  data.items.add(new File(['hello'], 'document.txt', { type: 'text/plain' }))
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  check(event.defaultPrevented, 'invalid matching must cancel native Paste')
  equal(resolutionCalls, 0)
  equal(editor.save().blocks[0].data.text, 'Original')
  equal(editor.canUndo, false)
})

test('read-only round trip revokes a pending file Paste before it can commit or focus', async () => {
  const base = createParagraphPlugin()
  let resolvePaste = null
  const definition = {
    ...base,
    capabilities: {
      ...base.capabilities,
      paste: {
        accepts: input => input.kind === 'file',
        resolve() { return new Promise(resolve => { resolvePaste = resolve }) },
      },
    },
  }
  const editor = make([para('a', 'Original')], { plugins: [definition] })
  const field = editableField(editor, 'a')
  select(field, 3)
  const data = new DataTransfer()
  data.items.add(new File(['hello'], 'document.txt', { type: 'text/plain' }))
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  check(event.defaultPrevented, 'file Paste must be owned')
  check(typeof resolvePaste === 'function', 'resolver was not invoked')
  editor.setReadOnly(true)
  editor.setReadOnly(false)
  resolvePaste({ kind: 'rich-text', replacement: { kind: 'text', text: 'Late' } })
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  equal(editor.save().blocks[0].data.text, 'Original')
  equal(editor.canUndo, false)
})

test('HTML import matcher returning a Promise consumes owned Paste without text fallback', () => {
  const base = createParagraphPlugin()
  const definition = {
    ...base,
    capabilities: {
      ...base.capabilities,
      htmlImport: {
        matchesRoot(element) {
          return element.tagName === 'P' ? Promise.resolve(true) : false
        },
        importRoot: base.capabilities.htmlImport.importRoot,
      },
    },
  }
  const editor = make([para('a', 'Original')], { plugins: [definition] })
  const field = editableField(editor, 'a')
  select(field, 0, 8)
  const data = new DataTransfer()
  data.setData('text/html', '<p>Replacement</p>')
  data.setData('text/plain', 'fallback')
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  check(event.defaultPrevented, 'invalid HTML matching must cancel native Paste')
  equal(editor.save().blocks[0].data.text, 'Original')
  equal(editor.canUndo, false)
})


test('selection conversion sees a staged source edit and undoes with its outer action',()=>{
  const source=paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})})
  const target={...paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})}),type:'heading'}
  target.capabilities.conversion.import=payload=>({text:payload.data.text})
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([source,target]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'})]}})
  const bookmark={anchor:{blockId:'a',fieldKey:'text',offset:2},focus:{blockId:'a',fieldKey:'text',offset:5}}
  const before=runtime.save().blocks
  try{
    let result
    runtime.interact('edit then convert',()=>{
      runtime.update('a',()=>({data:{text:'ALPHAX'}}))
      result=runtime.convertLogicalSelection(bookmark,{type:'heading'})
    })
    equal(result.convertedIds.length,1)
    equal(result.focusId,result.convertedIds[0])
    equal(runtime.list().map(record=>[record.type,record.data.text]),
      [['paragraph','AL'],['heading','PHA'],['paragraph','X']])
    equal(runtime.revision,1)
    equal(runtime.undo(),true)
    equal(runtime.save().blocks,before)
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('selection conversion uses staged block order and preserves both endpoint residuals',()=>{
  const source=paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})})
  const target={...paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})}),type:'heading'}
  target.capabilities.conversion.selectionMode='per-block'
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([source,target]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'}),block('b',{text:'Beta'}),block('c',{text:'Charlie'})]}})
  const before=runtime.save().blocks
  try{
    let result
    runtime.interact('reorder then convert',()=>{
      runtime.move('c',1)
      result=runtime.convertLogicalSelection({
        anchor:{blockId:'a',fieldKey:'text',offset:2},
        focus:{blockId:'b',fieldKey:'text',offset:2},
      },{type:'heading'})
    })
    equal(result.convertedIds.length,3)
    equal(result.focusId,result.convertedIds[2])
    equal(runtime.list().map(record=>[record.type,record.data.text]),
      [['paragraph','Al'],['heading','pha'],['heading','Charlie'],['heading','Be'],['paragraph','ta']])
    equal(runtime.undo(),true)
    equal(runtime.save().blocks,before)
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('joined selection conversion includes a block inserted earlier in the same transaction',()=>{
  const source=paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})})
  const code={
    ...paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})}),
    type:'code',
    capabilities:{
      conversion:{
        selectionMode:'single',
        export:data=>({kind:'rich-text',data:{text:data.text}}),
        joinSelection:parts=>({kind:'rich-text',data:{text:parts.map(part=>part.data.text).join('\n')}}),
        canImport:payload=>payload.kind==='rich-text',
        import:payload=>({text:payload.data.text}),
      },
    },
  }
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([source,code]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'}),block('b',{text:'Bravo'})]}})
  const before=runtime.save().blocks
  try{
    let result
    runtime.interact('insert then join',()=>{
      runtime.insert('paragraph',{text:'Inserted'},1)
      result=runtime.convertLogicalSelection({
        anchor:{blockId:'a',fieldKey:'text',offset:2},
        focus:{blockId:'b',fieldKey:'text',offset:3},
      },{type:'code'})
    })
    equal(result.convertedIds.length,1)
    equal(runtime.list().map(record=>[record.type,record.data.text]),
      [['paragraph','Al'],['code','pha\nInserted\nBra'],['paragraph','vo']])
    equal(runtime.undo(),true)
    equal(runtime.save().blocks,before)
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})


test('same-type logical selection without configuration is a true no-op',()=>{
  const definition=paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})})
  let exports=0
  definition.capabilities.conversion.export=data=>{exports++;return {kind:'rich-text',data:{text:data.text}}}
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'})]}})
  try{
    const before=runtime.save().blocks
    const result=runtime.convertLogicalSelection({
      anchor:{blockId:'a',fieldKey:'text',offset:1},
      focus:{blockId:'a',fieldKey:'text',offset:4},
    },{type:'paragraph'})
    equal(result,false)
    equal(exports,0)
    equal(runtime.revision,0)
    equal(runtime.canUndo,false)
    equal(runtime.save().blocks,before)
  }finally{runtime.destroy()}
})

test('collapsed same-type selection configures staged author data and preserves one Undo',()=>{
  const definition=paragraphDefinition({
    createDefault:()=>({text:'',authorMode:'default'}),
    decode:input=>({dataVersion:1,data:{...input.data}}),
    encode:data=>({dataVersion:1,data:{...data}}),
    mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')}),
  })
  definition.toolbox=[{id:'mode',configure:data=>({...data,authorMode:'configured'})}]
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([definition]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha',authorMode:'kept',custom:{label:'author'}})]}})
  const before=runtime.save().blocks
  try{
    let outcome
    runtime.interact('edit and configure',()=>{
      runtime.update('a',()=>({data:{text:'Authored',authorMode:'kept',custom:{label:'author'}}}))
      outcome=runtime.convertLogicalSelection({
        anchor:{blockId:'a',fieldKey:'text',offset:2},
        focus:{blockId:'a',fieldKey:'text',offset:2},
      },{type:'paragraph',toolboxItemId:'mode'})
    })
    equal(outcome,{focusId:'a',convertedIds:['a']})
    equal(runtime.get('a').data,{text:'Authored',authorMode:'configured',custom:{label:'author'}})
    equal(runtime.undo(),true)
    equal(runtime.save().blocks,before)
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})


test('per-block conversion reads and invokes target acceptance once per selected piece',()=>{
  const source=paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})})
  const target={...paragraphDefinition({mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')})}),type:'heading'}
  let reads=0,invocations=0
  const conversion={
    selectionMode:'per-block',
    import:payload=>({text:payload.data.text}),
  }
  Object.defineProperty(conversion,'canImport',{get(){
    reads++
    return function(payload){
      invocations++
      return payload?.kind==='rich-text'
    }
  }})
  target.capabilities.conversion=conversion
  const runtime=new DocumentRuntime({ownerDocument:document,registry:registry([source,target]),
    data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'}),block('b',{text:'Beta'})]}})
  try{
    const outcome=runtime.convertLogicalSelection({
      anchor:{blockId:'a',fieldKey:'text',offset:0},
      focus:{blockId:'b',fieldKey:'text',offset:4},
    },{type:'heading'})
    equal(outcome.convertedIds.length,2)
    equal(reads,2)
    equal(invocations,2)
    equal(runtime.list().map(record=>[record.type,record.data.text]),
      [['heading','Alpha'],['heading','Beta']])
    equal(runtime.undo(),true)
    equal(runtime.canUndo,false)
  }finally{runtime.destroy()}
})

test('clearing an old cross-selection controller cannot delete another editor highlight',()=>{
  const registry=window.CSS?.highlights
  if (!registry || typeof window.Highlight !== 'function') return
  const controllers=[]
  const roots=[]
  const createOwner=id=>{
    const root=document.createElement('div')
    const field=document.createElement('p')
    field.contentEditable='true'
    field.textContent='Alpha'
    root.append(field)
    document.body.append(root)
    roots.push(root)
    const runtime={generation:0,readOnly:false,ids:()=>[id],indexOf:name=>name===id?0:-1}
    const record={key:'text',mode:'rich-text',element:field}
    const reconciler={
      getEditableField:(blockId,key)=>blockId===id&&key==='text'?record:null,
      getEditableFields:blockId=>blockId===id?[record]:[],
      resolveEditableTarget:node=>field.contains(node)?{blockId:id,fieldKey:'text',element:field}:null,
    }
    const view={selectedIds:[],select(){},clearSelection(){},setCurrent(){}}
    const controller=new SelectionController({root,runtime,reconciler,view})
    controllers.push(controller)
    return {controller,id}
  }
  try{
    const first=createOwner('a')
    const second=createOwner('b')
    const bookmark=id=>({
      anchor:{blockId:id,fieldKey:'text',offset:0},
      focus:{blockId:id,fieldKey:'text',offset:3},
    })
    check(first.controller.restore(bookmark(first.id)),'first range should restore')
    const old=registry.get('oe-cross-select-v2')
    check(old,'first highlight should exist')
    check(second.controller.restore(bookmark(second.id)),'second range should restore')
    const current=registry.get('oe-cross-select-v2')
    check(current&&current!==old,'second editor should own the active highlight')
    first.controller.clear()
    equal(registry.get('oe-cross-select-v2'),current,'old owner cleared successor highlight')
    second.controller.clear()
    equal(registry.has('oe-cross-select-v2'),false)
  } finally {
    controllers.forEach(controller=>controller.destroy())
    roots.forEach(root=>root.remove())
  }
})


test('inline presentation failure is contained and other tool remains usable',async()=>{
  let editor
  let producerCalls=0
  const diagnostics=[]
  const failing={
    type:'failing-format',title:'Failing',icon:'<b>F</b>',
    isActive(){
      editor.blocks.update('a',()=>{
        producerCalls++
        return {data:{text:'should not commit'}}
      })
      return false
    },
    toggle(){},
  }
  const working={
    type:'working-format',title:'Working',icon:'<b>W</b>',
    isActive(){return true},
    toggle(){},
  }
  editor=make([para('a','Alpha')],{
    inlineTools:[failing,working],
    onDiagnostic:value=>diagnostics.push(value),
  })
  const field=editableField(editor,'a')
  select(field,0,3)
  await new Promise(resolve=>setTimeout(resolve,0))
  const root=editorRoot(editor)
  const invalid=root.querySelector('[data-tool="failing-format"]')
  const valid=root.querySelector('[data-tool="working-format"]')
  check(invalid&&valid,'Both toolbar controls must be mounted')
  equal(invalid.hidden,true)
  equal(invalid.disabled,true)
  equal(valid.hidden,false)
  equal(valid.disabled,false)
  check(valid.classList.contains('oe-inline-tool--active'),'Healthy tool was not refreshed')
  equal(producerCalls,0)
  equal(editor.save().blocks[0].data.text,'Alpha')
  equal(editor.canUndo,false)
  check(diagnostics.some(value=>value.code==='command.failed'),'Failed tool was not reported')
})

test('inline mount failure cleans every started tool and allows reuse of its object',()=>{
  const events=[]
  let fail=true
  const makeTool=(type,throws=false)=>({
    type,title:type,icon:'<b>F</b>',
    isActive(){return false},
    toggle(){},
    bindSelectionPort(port){events.push(type+(port?' bind':' unbind'))},
    onMount(){events.push(type+' mount');if(throws&&fail)throw new Error('mount failed')},
    destroy(){events.push(type+' destroy')},
  })
  const first=makeTool('first')
  const second=makeTool('second',true)
  let error
  try{make([para('a','Alpha')],{inlineTools:[first,second]})}
  catch(caught){error=caught}
  check(error&&/mount failed/.test(String(error)),'Expected mount failure was swallowed')
  equal(events,[
    'first bind','first mount','second bind','second mount',
    'second unbind','second destroy','first unbind','first destroy',
  ])
  fail=false
  const editor=make([para('a','Alpha')],{inlineTools:[first,second]})
  check(editor.isReady!==false,'Tool ownership was not released after failed initialization')
  editor.destroy()
  check(events.includes('second destroy'))
})


test('inline alignment panel can continue its own revisions but rejects an unrelated commit',async()=>{
  let panelContext=null
  const tool={
    type:'panel-lease-test',icon:'<b>P</b>',title:'Panel',
    isActive(){return false},
    toggle(){},
    renderActions(context){
      panelContext=context
      const panel=document.createElement('div')
      const button=document.createElement('button')
      button.textContent='Apply'
      panel.append(button)
      return panel
    },
  }
  const editor=make([para('a','Alpha')],{inlineTools:[tool]})
  select(editableField(editor,'a'),0,3)
  await new Promise(resolve=>setTimeout(resolve,0))
  const button=editorRoot(editor).querySelector('[data-tool="panel-lease-test"]')
  check(button&&!button.hidden&&!button.disabled,'Panel tool did not mount')
  button.click()
  check(panelContext,'Panel action context was not acquired')

  equal(panelContext.setTextAlign('center'),true)
  equal(panelContext.setTextAlign('right'),true)
  equal(editor.blocks.get('a').tunes.textAlign,'right')
  editor.blocks.update('a',()=>({data:{text:'Changed externally'}}))
  equal(panelContext.setTextAlign('justify'),false)
  equal(panelContext.getTextAlign(),'mixed')
  equal(editor.blocks.get('a').tunes.textAlign,'right')
})


test('mounted inline mutation actions are unavailable during initialization and after destroy',()=>{
  let retained=null
  let producers=0
  const tool={
    type:'mount-context-probe',title:'Probe',icon:'<b>P</b>',
    isActive(){return false},toggle(){},
    onMount(_button,context){
      retained=context
      assert.throws(()=>context.mutate(null,()=>{producers++}),/not active/)
      equal(context.restoreSelection(),false)
    },
  }
  const editor=make([para('a','Alpha')],{inlineTools:[tool]})
  check(retained,'Mounted action context missing')
  editor.destroy()
  assert.throws(()=>retained.mutate(null,()=>{producers++}),/not active/)
  equal(retained.restoreSelection(),false)
  equal(producers,0)
})



test('inline panel logical rights expire on unrelated canonical revision',async()=>{
  const contexts=[]
  const tool={
    type:'scoped-selection-probe',icon:'<b>S</b>',title:'Scoped selection',
    isActive(){return false},toggle(){},
    renderActions(ctx){
      contexts.push(ctx)
      const panel=document.createElement('div')
      panel.appendChild(document.createElement('button'))
      return panel
    },
  }
  const editor=make([para('a','Alpha')],{inlineTools:[tool]})
  const field=editableField(editor,'a')
  select(field,0,3)
  await new Promise(resolve=>setTimeout(resolve,0))
  const control=editorRoot(editor).querySelector('[data-tool="scoped-selection-probe"]')
  check(control&&!control.hidden&&!control.disabled,'Scoped tool did not mount')
  control.click()
  const ctx=contexts.at(-1)
  check(ctx?.range,'Fresh panel must expose an authorized selection range')
  editor.blocks.update('a',()=>({data:{text:'Externally changed'}}))
  equal(ctx.range,null)
  equal(ctx.setTextAlign('center'),false)
  equal(ctx.getTextAlign(),'mixed')
  equal(ctx.restoreSelection(),false)
  equal(editor.blocks.get('a').data.text,'Externally changed')
  equal(editor.blocks.get('a').tunes?.textAlign,undefined)
})


test('scoped mounted tool can mutate only with its own fresh bookmark and loses authority after commit',async()=>{
  let port=null, mutations=null, calls=0
  const tool={
    type:'scoped-mounted-regression',title:'Scoped',icon:'<b>S</b>',
    isActive(){return false},toggle(){},
    bindSelectionPort(next){if(next)port=next},
    onMount(_button,context){
      mutations=context
      equal(port?.range,null)
      equal(port?.capture(),null)
    },
  }
  const editor=make([para('a','Alpha')],{inlineTools:[tool]})
  const field=editableField(editor,'a')
  select(field,0,3)
  await new Promise(resolve=>setTimeout(resolve,0))
  const token=port?.capture()
  check(token,'Active mounted port failed to issue a bookmark')
  check(port.range,'Active mounted port did not expose its current range')
  const outcome=mutations.mutate(token,range=>{
    calls++
    check(range&&!range.collapsed,'Fresh formatting range was not supplied')
    return 'applied'
  })
  equal(outcome,'applied')
  equal(calls,1)
  editor.blocks.update('a',()=>({data:{text:'Changed outside'}}))
  equal(port.restore(token),false)
  equal(mutations.mutate(token,()=>{calls++}),undefined)
  equal(calls,1)
  editor.destroy()
  equal(port.range,null)
  equal(port.restore(token),false)
})



test('queued selectionchange matching a completed formatting restore keeps its active lease',()=>{
  let port=null
  const tool={
    type:'expected-selection-probe',title:'Expected range',icon:'<b>E</b>',
    isActive(){return false},
    bindSelectionPort(value){if(value)port=value},
    toggle(selection){
      const token=port.capture(selection.range)
      check(token,'Formatting action could not capture its selection')
      check(port.restore(token),'Formatting action could not restore its own selection')
    },
  }
  const editor=make([para('a','Alpha')],{inlineTools:[tool]})
  const field=editableField(editor,'a')
  select(field,0,3)
  const root=editorRoot(editor)
  const button=root.querySelector('[data-tool="expected-selection-probe"]')
  button.click()
  const token=port.capture()
  check(token,'Completed formatting action has no current continuation')
  document.dispatchEvent(new Event('selectionchange'))
  check(port.restore(token),'Expected selectionchange revoked the completed action')
  const range=document.createRange()
  range.selectNodeContents(field)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  equal(port.restore(token),false)
})



test('queued inline widget caret cannot steal a user selection moved to another block',async()=>{
  const definition={
    type:'inline-caret-regression',
    label:{key:'probe',fallback:'Caret probe'},
    icon:'',
    schema:{
      currentVersion:1,
      createDefault(){return {label:'@Ada'}},
      decode(input){
        if(input.dataVersion!==1||typeof input.data?.label!=='string')throw new TypeError('Invalid label')
        return {dataVersion:1,data:{label:input.data.label}}
      },
      encode(data){
        if(typeof data?.label!=='string')throw new TypeError('Invalid label')
        return {dataVersion:1,data:{label:data.label}}
      },
    },
    editing:{
      handle(input,data){
        if(input.inputType!=='deleteContentBackward')return null
        return {kind:'update',data:{label:data.label.slice(0,-1)},caret:3}
      },
    },
    setup(runtime){
      return {
        create(_id,initial){
          const element=runtime.ownerDocument.createElement('span')
          element.textContent=initial.label
          return {
            element,
            update(next){element.textContent=next.label},
            setReadOnly(){},
            destroy(){element.remove()},
          }
        },
        destroy(){},
      }
    },
  }
  const editor=make([
    para('a','{{owned}}',{inline:{owned:{
      type:'inline-caret-regression',dataVersion:1,data:{label:'@Ada'},
    }}}),
    para('b','Elsewhere'),
  ],{inlinePlugins:[definition]})
  const first=editableField(editor,'a')
  const pill=first.querySelector('[data-inline-plugin="inline-caret-regression"]')
  check(pill&&pill.firstChild?.nodeType===3,'Owned editable inline widget was not mounted')
  const native=window.getSelection()
  first.focus()
  native.setBaseAndExtent(pill.firstChild,3,pill.firstChild,3)
  const event=new InputEvent('beforeinput',{
    bubbles:true,cancelable:true,inputType:'deleteContentBackward',
  })
  first.dispatchEvent(event)
  check(event.defaultPrevented,'Immediate inline edit was not claimed')
  equal(editor.save().blocks[0].inline.owned.data.label,'@Ad')
  const second=editableField(editor,'b')
  check(second.firstChild?.nodeType===3,'Second authored field has no native text node')
  second.focus()
  native.setBaseAndExtent(second.firstChild,2,second.firstChild,2)
  await Promise.resolve()
  equal(native.anchorNode,second.firstChild,'Deferred edit stole a later native anchor')
  equal(native.focusNode,second.firstChild,'Deferred edit stole a later native focus')
  equal(native.focusOffset,2)
  equal(editor.save().blocks[1].data.text,'Elsewhere')
})


await run()
