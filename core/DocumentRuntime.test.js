import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentRuntime } from './DocumentRuntime.js'
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
import { InstanceScope } from './InstanceScope.js'
import { createTablePlugin } from '../plugins/table/index.js'

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

test('new and omitted-data inserted Tables use the three-by-three default and one whole insertion history action', () => {
  const table = createTablePlugin({ injectStyles: false })
  const runtime = new DocumentRuntime({ registry: registry([table]) })
  try {
    const initial = runtime.save().blocks
    assert.equal(initial.length, 1)
    assert.equal(initial[0].type, 'table')
    assert.equal(initial[0].dataVersion, 2)
    assert.deepEqual(initial[0].data.rows.map(row => row.cells.map(cell => cell.text)),
      [['', '', ''], ['', '', ''], ['', '', '']])
    assert.equal(runtime.canUndo, false)
    const insertedId = runtime.insert('table')
    const inserted = runtime.save().blocks
    assert.notEqual(insertedId, initial[0].id)
    assert.deepEqual(inserted.map(record => record.data), [initial[0].data, initial[0].data])
    assert.equal(runtime.undo(), true)
    assert.deepEqual(runtime.save().blocks, initial)
    assert.equal(runtime.canUndo, false)
    assert.equal(runtime.redo(), true)
    assert.deepEqual(runtime.save().blocks, inserted)
    assert.equal(runtime.canRedo, false)
  } finally { runtime.destroy() }
})

test('Table text conversion remains an explicit one-cell payload independent of its new-document default', () => {
  const definition = createTablePlugin({ injectStyles: false })
  const converted = definition.capabilities.conversion.import({ kind: 'rich-text', data: { text: '<b>Only cell</b>' } })
  assert.deepEqual(converted, {
    withHeadings: false,
    rows: [{ id: 'row-0', cells: [{ id: 'cell-0-0', text: '<b>Only cell</b>' }] }],
  })
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    data: { version: '2.0.0', blocks: [{ id: 'explicit-single', type: 'table', dataVersion: 2, data: converted }] },
  })
  try {
    assert.deepEqual(runtime.get('explicit-single').data, converted)
    assert.equal(runtime.canUndo, false)
  } finally { runtime.destroy() }
})

test('clipboard handles expose only detached deeply frozen transfer data and reject foreign/forged handles', () => {
  const options={registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}}
  const runtime=new DocumentRuntime(options), other=new DocumentRuntime(options)
  const handle=runtime.prepareLogicalClipboardSlice(null,['a'])
  assert.deepEqual(Object.keys(handle).sort(),['bookmark','focus','parts'])
  assert.equal(Object.isFrozen(handle.parts[0].block.data),true)
  assert.throws(()=>{handle.parts[0].block.data.text='tampered'},TypeError)
  assert.throws(()=>other.applyPreparedClipboardCut(handle),TypeError)
  assert.throws(()=>runtime.applyPreparedClipboardCut({...handle}),TypeError)
  assert.deepEqual(runtime.ids(),['a','b'])
  assert.deepEqual(other.ids(),['a','b'])
  runtime.destroy();other.destroy()
})

test('clipboard handle checks staged source identity and order before any capability call', () => {
  let defaults=0
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition({createDefault:()=>{defaults++;return {text:''}}})]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}})
  const handle=runtime.prepareLogicalClipboardSlice(null,['a'])
  const before=defaults
  assert.throws(()=>runtime.interact('stale cut',()=>{
    runtime.update('a',()=>({data:{text:'changed'}}))
    runtime.applyPreparedClipboardCut(handle)
  }),/stale/)
  assert.equal(defaults,before)
  assert.equal(runtime.get('a').data.text,'a')
  assert.throws(()=>runtime.interact('reordered cut',()=>{
    runtime.move('b',0)
    runtime.applyPreparedClipboardCut(handle)
  }),/stale/)
  assert.deepEqual(runtime.ids(),['a','b'])
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('clipboard handle permits unrelated staged data and returns the actual surviving target', () => {
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}})
  const handle=runtime.prepareLogicalClipboardSlice(null,['a'])
  let result
  runtime.interact('cut with unrelated edit',()=>{
    runtime.update('b',()=>({data:{text:'kept'}}))
    result=runtime.applyPreparedClipboardCut(handle)
    assert.equal(result.blockId,'b')
    assert.equal(result.focus,undefined)
  })
  assert.deepEqual(runtime.ids(),['b'])
  assert.equal(runtime.get('b').data.text,'kept')
  assert.throws(()=>runtime.applyPreparedClipboardCut(handle),/stale/)
  runtime.undo();assert.deepEqual(runtime.ids(),['a','b'])
  runtime.destroy()
})

test('whole-block removal uses the active draft and does not replace a staged survivor with a default', () => {
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a')]}})
  let survivor
  runtime.interact('insert then remove selected',()=>{
    survivor=runtime.insert('paragraph',{text:'survivor'})
    assert.equal(runtime.removeBlocks(['a']),survivor)
  })
  assert.deepEqual(runtime.ids(),[survivor])
  assert.equal(runtime.get(survivor).data.text,'survivor')
  runtime.undo();assert.deepEqual(runtime.ids(),['a'])
  runtime.destroy()
})

test('clipboard handle prepared from an aborted draft cannot delete the restored committed source',()=>{
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}})
  let handle
  assert.throws(()=>runtime.interact('aborted export',()=>{
    runtime.update('a',()=>({data:{text:'draft'}}))
    handle=runtime.prepareLogicalClipboardSlice(null,['a'])
    assert.equal(handle.parts[0].block.data.text,'draft')
    throw new Error('abort')
  }),/abort/)
  assert.throws(()=>runtime.applyPreparedClipboardCut(handle),/stale/)
  assert.deepEqual(runtime.ids(),['a','b'])
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('clipboard application validates private preconditions before reading incoming payload accessors',()=>{
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a')]}})
  const handle=runtime.prepareLogicalClipboardSlice(null,['a'])
  let reads=0
  const parts=[{get kind(){reads++;return 'local-block'},type:'paragraph',data:{text:'replacement'}}]
  runtime.update('a',()=>({data:{text:'changed'}}))
  assert.throws(()=>runtime.replacePreparedClipboardSlice(handle,parts),/stale/)
  assert.equal(reads,0)
  assert.throws(()=>runtime.replacePreparedClipboardSlice({...handle},parts),TypeError)
  assert.equal(reads,0)
  assert.equal(runtime.get('a').data.text,'changed')
  runtime.destroy()
})

test('invalid late local candidate rejects the entire nested paste before applying any block',()=>{
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a')]}})
  assert.throws(()=>runtime.interact('invalid late paste',()=>{
    runtime.update('a',()=>({data:{text:'staged'}}))
    runtime.insertLocalBlocks('a',[{type:'paragraph',data:{text:'valid'}},{type:'paragraph',data:{wrong:true}}])
  }),/text required/)
  assert.deepEqual(runtime.ids(),['a'])
  assert.equal(runtime.get('a').data.text,'a')
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('local block paste retains an anchor populated earlier in the same interaction', () => {
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a',{text:''})]}})
  runtime.interact('populate then paste',()=>{
    runtime.update('a',()=>({data:{text:'staged'}}))
    const ids=runtime.insertLocalBlocks('a',[{type:'paragraph',data:{text:'pasted'}}],{replaceEmpty:true})
    assert.equal(ids.length,1);assert.notEqual(ids[0],'a')
  })
  assert.equal(runtime.get('a').data.text,'staged')
  assert.equal(runtime.get(runtime.ids()[1]).data.text,'pasted')
  runtime.undo();assert.equal(runtime.ids().length,1)
  runtime.destroy()
})

test('alignment preserves earlier staged author data and undoes the composed action once', () => {
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: { version: '2.0.0', blocks: [block('a')] } })
  runtime.interact('edit and align', () => {
    runtime.update('a', () => ({ data: { text: 'Staged' } }))
    assert.equal(runtime.setTextAlign(['a'], 'center'), true)
  })
  assert.equal(runtime.get('a').data.text, 'Staged')
  assert.deepEqual(runtime.get('a').tunes, { textAlign: 'center' })
  runtime.undo()
  assert.equal(runtime.get('a').data.text, 'a')
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

test('alignment changes only tunes and retains the complete canonical inline map', () => {
  const inline = { orphan: { type: 'unloaded', dataVersion: 9, data: { label: 'Kept' } } }
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: { version: '2.0.0', blocks: [block('a', { text: 'A' }, { inline })] } })
  runtime.setTextAlign(['a'], 'center')
  assert.deepEqual(runtime.get('a').inline, inline)
  runtime.destroy()
})

test('merge checks current staged adjacency and preserves earlier edits and tunes', () => {
  const definition = paragraphDefinition()
  definition.capabilities.merge = { merge: (target, source) => ({ text: target.text + source.text }) }
  const runtime = new DocumentRuntime({ registry: registry([definition]), data: { version: '2.0.0', blocks: [block('a'), block('b'), block('c')] } })
  runtime.interact('move and merge', () => {
    runtime.update('a', () => ({ data: { text: 'Staged' }, tunes: { textAlign: 'right' } }))
    runtime.move('c', 1)
    assert.equal(runtime.mergeAdjacent('a', 'c'), true)
  })
  assert.deepEqual(runtime.ids(), ['a', 'b'])
  assert.equal(runtime.get('a').data.text, 'Stagedc')
  assert.deepEqual(runtime.get('a').tunes, { textAlign: 'right' })
  runtime.undo()
  assert.deepEqual(runtime.ids(), ['a', 'b', 'c'])
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

test('merge rejects a source moved before its target in the current draft',()=>{
  const definition=paragraphDefinition()
  definition.capabilities.merge={merge:(left,right)=>({text:left.text+right.text})}
  const runtime=new DocumentRuntime({registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}})
  runtime.interact('move before',()=>{
    runtime.move('b',0)
    assert.equal(runtime.mergeAdjacent('a','b'),false)
  })
  assert.deepEqual(runtime.ids(),['b','a'])
  assert.equal(runtime.get('a').data.text,'a')
  runtime.destroy()
})

test('toolbox choice uses staged emptiness/order and rejects a stale named anchor',()=>{
  const runtime=new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a',{text:''}),block('b')]}})
  let inserted
  runtime.interact('edit then toolbox',()=>{
    runtime.update('a',()=>({data:{text:'Staged'}}))
    runtime.move('a',1)
    inserted=runtime.insertToolboxBlock('a',{type:'paragraph'})
  })
  assert.deepEqual(runtime.ids(),['b','a',inserted])
  assert.equal(runtime.get('a').data.text,'Staged')
  assert.equal(runtime.insertToolboxBlock('stale',{type:'paragraph'}),false)
  runtime.undo()
  assert.deepEqual(runtime.ids(),['a','b'])
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('final-block default preparation denies nested producers before removal',()=>{
  let runtime,producers=0
  const definition=paragraphDefinition({createDefault(){
    assert.throws(()=>runtime.update('a',()=>{producers++;return {}}),/prepar/)
    return {text:''}
  }})
  runtime=new DocumentRuntime({registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a')]}})
  const replacement=runtime.remove('a')
  assert.equal(producers,0)
  assert.equal(runtime.get(replacement).data.text,'')
  runtime.undo()
  assert.equal(runtime.get('a').data.text,'a')
  runtime.destroy()
})

test('current schema rejection is invalid-data regardless of exception wording or public reason', () => {
  const failure = new RangeError('Plugin data version content constraint')
  failure.reason = 'unsupported-data-version'
  const issues = []
  assert.throws(() => new DocumentRuntime({
    registry: registry([paragraphDefinition({ decode() { throw failure } })]),
    data: { version: '2.0.0', blocks: [block('a')] },
    onValidationError: issue => issues.push(issue),
  }), error => error === failure)
  assert.deepEqual(issues, [{ reason: 'invalid-data', blockId: 'a', type: 'paragraph' }])
  assert.equal(Object.isFrozen(issues[0]), true)
})

test('validation observer cannot run a producer inside a failing nested render', () => {
  let producers = 0
  let notifications = 0
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a')] },
    onValidationError() {
      notifications++
      assert.equal(runtime.get('a').data.text, 'a')
      try { runtime.update('a', () => { producers++; return { data: { text: 'observer' } } }) } catch {}
    },
  })
  assert.throws(() => runtime.interact('outer', () => {
    runtime.update('a', () => ({ data: { text: 'outer' } }))
    try { runtime.render({ version: 'future', blocks: [] }) } catch {}
  }), RangeError)
  assert.equal(notifications, 1)
  assert.equal(producers, 0)
  assert.equal(runtime.get('a').data.text, 'a')
  assert.equal(runtime.canUndo, false)
  runtime.update('a', () => ({ data: { text: 'later' } }))
  assert.equal(runtime.get('a').data.text, 'later')
  runtime.destroy()
})

test('local schema normalization denies nested mutation before its producer', () => {
  let runtime
  let attempted = false
  let producers = 0
  const definition = paragraphDefinition({ encode(data) {
    if (runtime && !attempted) {
      attempted = true
      try { runtime.update('a', () => { producers++; return {} }) } catch {}
    }
    return { dataVersion: 1, data: { text: data.text } }
  } })
  runtime = new DocumentRuntime({ registry: registry([definition]), data: { version: '2.0.0', blocks: [block('a')] } })
  runtime.update('a', () => ({ data: { text: 'Valid' } }))
  assert.equal(producers, 0)
  assert.equal(runtime.get('a').data.text, 'Valid')
  runtime.destroy()
})

test('raw render accessors and injected ID allocation share preparation authority', () => {
  let runtime
  let producers = 0
  let allocated = 0
  const attempt = () => {
    if (!runtime) return
    assert.throws(() => runtime.update('a', () => { producers++; return {} }), /prepar/)
  }
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a')] },
    createId() { attempt(); return 'allocated-' + ++allocated },
  })
  runtime.render({ get version() { attempt(); return '2.0.0' }, blocks: [block('a')] })
  runtime.insert('paragraph', { text: 'Inserted' })
  runtime.createDataId('nested')
  assert.equal(producers, 0)
  assert.equal(allocated, 2)
  runtime.destroy()
})

test('normalization failures notify once, while allocator failures are not validation issues', () => {
  const issues = []
  const normalizationError = new TypeError('Text rejected')
  const allocationError = new Error('ID source failed')
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition({ mapRichText(data, visit) { return { text: visit(data.text, 'text') } } })]),
    data: { version: '2.0.0', blocks: [block('a')] },
    richTextNormalizer(html) { if (html === 'bad') throw normalizationError; return html },
    createId() { throw allocationError },
    onValidationError: issue => issues.push(issue),
  })
  assert.throws(() => runtime.render({ version: '2.0.0', blocks: [block('a', { text: 'bad' })] }), error => error === normalizationError)
  assert.deepEqual(issues, [{ reason: 'invalid-data', blockId: 'a', type: 'paragraph' }])
  assert.throws(() => runtime.render({ version: '2.0.0', blocks: [] }), error => error === allocationError)
  assert.equal(issues.length, 1)
  assert.equal(runtime.get('a').data.text, 'a')
  runtime.destroy()
})

test('own inline keys survive constructor, render and save without ingestion pruning', () => {
  const source = { version: '2.0.0', blocks: [block('a', { text: 'Literal' }, {
    inline: JSON.parse('{"__proto__":{"type":"unloaded","dataVersion":3,"data":{"label":"Own"}}}'), revision: 'unchanged',
  })] }
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: source })
  assert.deepEqual(runtime.save().blocks, source.blocks)
  runtime.render(source)
  assert.deepEqual(runtime.save().blocks, source.blocks)
  assert.equal(runtime.get('a').revision, 'unchanged')
  runtime.destroy()
})

test('preparation rejects callable thenables and throwing then getters and contains later rejection', async () => {
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: { version: '2.0.0', blocks: [block('a')] } })
  const callable = () => {}
  let reads = 0
  Object.defineProperty(callable, 'then', { get() { reads++; return (_resolve, reject) => reject(new Error('Contained')) } })
  assert.throws(() => runtime.prepareExtensionValue(() => callable), /synchronous/)
  assert.equal(reads, 1)
  const failure = new Error('Then getter failed')
  assert.throws(() => runtime.prepareExtensionValue(() => ({ get then() { throw failure } })), error => error === failure)
  await new Promise(resolve => setImmediate(resolve))
  runtime.update('a', () => ({ data: { text: 'After' } }))
  assert.equal(runtime.get('a').data.text, 'After')
  runtime.destroy()
})

test('failed protected projection recovery stops mutation while committed data remains readable', () => {
  let projected = { text: 'Committed' }
  const restoreError = new Error('Cannot restore the invalid plugin projection')
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', projected)] },
    projector: {
      readBlock() { return { data: projected } },
      restore() { throw restoreError },
    },
  })
  const before = runtime.save().blocks
  const revision = runtime.revision
  let failure
  try {
    runtime.syncBlockFromProjection('a', () => { projected = { text: 123 } })
  } catch (error) { failure = error }
  assert.ok(failure)
  assert.equal(runtime.health, 'failed', 'Divergent projection must not retain mutation authority')
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, revision)
  assert.equal(runtime.canUndo, false)
  assert.equal(runtime.canRedo, false)
  assert.ok(failure instanceof AggregateError)
  assert.match(failure.errors[0].message, /text required/)
  assert.equal(failure.errors[1], restoreError)
  let producerCalls = 0
  assert.throws(() => runtime.update('a', () => { producerCalls++; return { data: { text: 'Late' } } }), /failed/)
  assert.equal(producerCalls, 0)
  runtime.destroy()
})

test('protected projection edits reject nested persisted writes before invoking their producer', () => {
  let projected = { text: 'Committed' }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', projected), block('b', { text: 'Untouched' })] },
    projector: {
      readBlock() { return { data: projected } },
      restore(store) { projected = { ...store.get('a').data } },
      prepare({ draft }) {
        const before = projected
        return {
          apply() { projected = { ...draft.get('a').data } },
          recover() { projected = before },
          finalize() {},
          discard() {},
        }
      },
    },
  })
  const before = runtime.save().blocks
  let producerCalls = 0
  assert.throws(() => runtime.syncBlockFromProjection('a', () => {
    projected = { text: 'Uncommitted' }
    runtime.update('b', () => { producerCalls++; return { data: { text: 'Nested write' } } })
  }), /protected projection edit/)
  assert.equal(producerCalls, 0)
  assert.deepEqual(runtime.save().blocks, before)
  assert.deepEqual(projected, before[0].data)
  assert.equal(runtime.revision, 0)
  assert.equal(runtime.canUndo, false)
  assert.equal(runtime.health, 'ready')
  runtime.syncBlockFromProjection('a', () => { projected = { text: 'Accepted' } })
  assert.equal(runtime.get('a').data.text, 'Accepted')
  assert.equal(runtime.undo(), true)
  assert.deepEqual(runtime.save().blocks, before)
  runtime.destroy()
})

test('protected projection edits cannot change read-only mode midway through the operation', () => {
  let projected = { text: 'Committed' }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', projected)] },
    projector: {
      readBlock() { return { data: projected } },
      setReadOnly() {},
      restore(store) { projected = { ...store.get('a').data } },
      prepare() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    },
  })
  const before = runtime.save().blocks
  assert.throws(() => runtime.syncBlockFromProjection('a', () => {
    projected = { text: 'Uncommitted' }
    runtime.setReadOnly(true)
  }), /protected projection edit/)
  assert.equal(runtime.readOnly, false)
  assert.deepEqual(runtime.save().blocks, before)
  assert.deepEqual(projected, before[0].data)
  assert.equal(runtime.canUndo, false)
  runtime.setReadOnly(true)
  assert.equal(runtime.readOnly, true)
  runtime.destroy()
})


test('host update rejects projection and publication reentry before running its producer', () => {
  let runtime
  let producerCalls = 0
  const rejections = []
  const attempt = () => {
    try {
      runtime.update('b', () => { producerCalls++; return { data: { text: 'Forbidden nested write' } } }, 'host')
    } catch (error) { rejections.push(error.message) }
  }
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha' }), block('b', { text: 'Bravo' })] },
    projector: {
      prepare() {
        attempt()
        return { apply: attempt, recover() {}, finalize: attempt, discard() {} }
      },
    },
    onCommit: attempt,
  })
  runtime.update('a', () => ({ data: { text: 'Accepted' } }), 'host')
  assert.equal(producerCalls, 0, 'Forbidden commands must reject before invoking application code')
  assert.deepEqual(rejections, [
    'Cannot mutate document during preparing-projection phase',
    'Cannot mutate document during applying-projection phase',
    'Cannot mutate document during finalizing phase',
    'Cannot mutate document during publishing phase',
  ])
  assert.deepEqual(runtime.save().blocks.map(record => record.data.text), ['Accepted', 'Bravo'])
  assert.equal(runtime.revision, 1)
  assert.equal(runtime.canUndo, true)
  runtime.destroy()
})


test('read-only transition rejects nested host mutation before its producer', () => {
  let runtime
  let producerCalls = 0
  const failures = []
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha' })] },
    projector: {
      setReadOnly(value) {
        if (!value) return
        for (const operation of [
          () => runtime.update('a', () => { producerCalls++; return { data: { text: 'Unexpected' } } }, 'host'),
          () => runtime.setReadOnly(false),
        ]) {
          try { operation() } catch (error) { failures.push(error.message) }
        }
      },
      prepare() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    },
  })
  const before = runtime.save().blocks
  runtime.setReadOnly(true)
  assert.equal(producerCalls, 0, 'Plugin control hooks must not persist during a mode transition')
  assert.equal(failures.length, 2)
  assert.ok(failures.every(message => /read-only transition/.test(message)))
  assert.equal(runtime.readOnly, true)
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, 0)
  assert.equal(runtime.canUndo, false)
  runtime.setReadOnly(false)
  runtime.update('a', () => ({ data: { text: 'Accepted after transition' } }), 'host')
  assert.equal(runtime.get('a').data.text, 'Accepted after transition')
  runtime.destroy()
})

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
      if (fail) throw new ReadOnlyRecoveryError([new Error('apply'), new Error('recover')], 'readOnly recovery failed')
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


test('host producer failure rolls back nested building writes as one atomic action', () => {
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: { version: '2.0.0', blocks: [block('a'), block('b')] } })
  const before = runtime.save().blocks
  assert.throws(() => runtime.update('a', () => {
    runtime.update('b', () => ({ data: { text: 'Nested' } }), 'host')
    throw new Error('Outer producer failed')
  }, 'host'), /Outer producer failed/)
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, 0)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

test('successive building updates read the current draft and undo together', () => {
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]), data: { version: '2.0.0', blocks: [block('a', {text:'A'})] } })
  const before = runtime.save().blocks
  runtime.interact('combined', () => {
    runtime.update('a', current => ({ data: { text: current.data.text + 'B' } }), 'host')
    runtime.update('a', current => ({ data: { text: current.data.text + 'C' } }), 'host')
  })
  assert.equal(runtime.get('a').data.text, 'ABC')
  assert.equal(runtime.revision, 1)
  assert.equal(runtime.undo(), true)
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})


test('caught nested producer validation failure still aborts the outer action', () => {
  const runtime = new DocumentRuntime({registry:registry([paragraphDefinition()]), data:{version:'2.0.0', blocks:[block('a'),block('b')]}})
  const before = runtime.save().blocks
  assert.throws(() => runtime.update('a', () => {
    try { runtime.update('b', () => ({data:{text:123}}), 'host') } catch {}
    return {data:{text:'Outer'}}
  }, 'host'), /text required/)
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, 0)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})


test('outer partial update preserves author data changed by a nested update of the same block', () => {
  const runtime = new DocumentRuntime({registry:registry([paragraphDefinition()]), data:{version:'2.0.0',blocks:[block('a',{text:'Alpha'})]}})
  const before = runtime.save().blocks
  runtime.update('a', () => {
    runtime.update('a', () => ({data:{text:'Nested author text'}}), 'host')
    return {tunes:{textAlign:'center'}}
  }, 'host')
  assert.equal(runtime.get('a').data.text, 'Nested author text')
  assert.deepEqual(runtime.get('a').tunes, {textAlign:'center'})
  assert.equal(runtime.revision, 1)
  runtime.undo()
  assert.deepEqual(runtime.save().blocks, before)
  runtime.destroy()
})


test('producer cannot overwrite a target it removed', () => {
  const runtime = new DocumentRuntime({registry:registry([paragraphDefinition()]), data:{version:'2.0.0',blocks:[block('a')]}})
  const before = runtime.save().blocks
  assert.throws(() => runtime.update('a', () => {
    runtime.remove('a','host')
    return {data:{text:'Stale target'}}
  },'host'), /target changed during its producer/)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.revision,0)
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})


test('read-only mode accepts booleans only and keeps the requested state on invalid input', () => {
  const runtime = new DocumentRuntime({registry:registry([paragraphDefinition()]),readOnly:true,data:{version:'2.0.0',blocks:[block('a')]}})
  for(const value of [undefined,null,0,1,'false','true',{},[]]) {
    assert.throws(() => runtime.setReadOnly(value), /requires a boolean/)
    assert.equal(runtime.readOnly,true)
  }
  runtime.setReadOnly(false)
  assert.equal(runtime.readOnly,false)
  runtime.destroy()
})

test('caught nested clear default failure aborts the outer action', () => {
  let fail = false
  const definition = paragraphDefinition({createDefault: () => {
    if (fail) throw new Error('Default preparation failed')
    return {text:''}
  }})
  const runtime = new DocumentRuntime({registry:registry([definition]),data:{version:'2.0.0',blocks:[block('a')]}})
  const before = runtime.save().blocks
  fail = true
  assert.throws(() => runtime.update('a', () => {
    try {runtime.clear()} catch {}
    return {data:{text:'Outer write'}}
  }, 'host'), /Default preparation failed/)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.revision,0)
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('successive draft removals preserve the default block when the last authored block is removed', () => {
  const runtime = new DocumentRuntime({registry:registry([paragraphDefinition()]),data:{version:'2.0.0',blocks:[block('a'),block('b')]}})
  const before = runtime.save().blocks
  runtime.interact('remove authored blocks', () => {
    runtime.remove('a','host')
    runtime.remove('b','host')
  })
  assert.equal(runtime.size,1)
  assert.equal(runtime.list()[0].data.text,'')
  assert.ok(!['a','b'].includes(runtime.ids()[0]))
  assert.equal(runtime.revision,1)
  assert.equal(runtime.undo(),true)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('read-only cleanup restores committed preedit without granting nested mutation authority', () => {
  let runtime
  let calls = 0
  let restores = 0
  runtime = new DocumentRuntime({
    registry:registry([paragraphDefinition()]),
    data:{version:'2.0.0',blocks:[block('a')]},
    projector:{setReadOnly(){},prepare(){return {apply(){},recover(){},finalize(){},discard(){}}},restore(){
      restores++
      assert.throws(() => runtime.update('a', () => {calls++;return {data:{text:'Reentry'}}}, 'host'), /protected projection edit/)
    }},
  })
  const before = runtime.save().blocks
  runtime.setReadOnly(true, discard => {discard();assert.equal(runtime.readOnly,true)})
  assert.equal(restores,1)
  assert.equal(calls,0)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.revision,0)
  runtime.setReadOnly(false)
  runtime.update('a', () => ({data:{text:'Resumed'}}), 'host')
  assert.equal(runtime.get('a').data.text,'Resumed')
  runtime.destroy()
})

test('same-type conversion without configuration is an immutable no-op', () => {
  let exports = 0
  const definition = paragraphDefinition({
    createDefault: () => ({ text: '', authorMode: 'default' }),
    encode: data => ({ dataVersion: 1, data: { ...data } }),
    decode: input => ({ dataVersion: 1, data: { ...input.data } }),
  })
  definition.capabilities.conversion.export = data => { exports++; return { kind: 'rich-text', data: { text: data.text } } }
  const runtime = new DocumentRuntime({ registry: registry([definition]), data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha', authorMode: 'kept' })] } })
  const before = runtime.save().blocks
  runtime.convert('a', { type: 'paragraph' })
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, 0)
  assert.equal(runtime.canUndo, false)
  assert.equal(exports, 0)
  runtime.destroy()
})

test('same-type toolbox configuration preserves unrelated author data and one Undo', () => {
  const definition = paragraphDefinition({
    createDefault: () => ({ text: '', authorMode: 'default' }),
    encode: data => ({ dataVersion: 1, data: { ...data } }),
    decode: input => ({ dataVersion: 1, data: { ...input.data } }),
  })
  definition.capabilities.conversion.export = data => ({ kind: 'plain-text', data: { text: data.text } })
  definition.toolbox = [{ id: 'changed', configure: data => ({ ...data, authorMode: 'changed' }) }]
  const runtime = new DocumentRuntime({ registry: registry([definition]), data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha', authorMode: 'kept', authorLabel: 'Author' })] } })
  const before = runtime.save().blocks
  runtime.convert('a', { type: 'paragraph', toolboxItemId: 'changed' })
  assert.deepEqual(runtime.get('a').data, { text: 'Alpha', authorMode: 'changed', authorLabel: 'Author' })
  assert.equal(runtime.canUndo, true)
  runtime.undo()
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

/** Minimal ownerDocument for this test's flat text-only rich field.
 * Production rich-text markup is exercised in the registered browser suites.
 * Unlike a missing ownerDocument, this uses the actual scanner/normalizer.
 */
function flatTextOwnerDocument(){
  return {
    createElement(tag){
      if(tag!=='template')throw new TypeError('Flat rich-text fixture only supports template nodes')
      let html=''
      const content={
        childNodes:[],
        firstChild:null,
        querySelectorAll(){return []},
      }
      return {
        content,
        get innerHTML(){return html},
        set innerHTML(value){
          html=String(value)
          if(/[<>]/.test(html))throw new TypeError('Markup needs a browser DOM test')
          const node=html?{nodeType:3,data:html,textContent:html,nextSibling:null}:null
          content.childNodes=node?[node]:[]
          content.firstChild=node
        },
      }
    },
    createTreeWalker(root){
      const texts=root.childNodes.filter(node=>node.nodeType===3)
      let at=0
      return {nextNode(){return texts[at++]??null}}
    },
  }
}

test('native inline reconciliation synchronizes normalized sidecar before one commit',()=>{
  const plugin=registry([paragraphDefinition({
    mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')}),
  })])
  plugin.getInlineDefinition=type=>type==='mention'?{schema:{
    currentVersion:1,
    encode(data){return {dataVersion:1,data:{id:data.id,name:data.name.trim()}}},
    decode(input){return {dataVersion:1,data:{id:input.data.id,name:input.data.name}}},
  }}:null
  const field={isConnected:true}
  let projected={text:'{{person}}'}
  let applied=0,finalized=0
  const projector={
    getEditableField:(id,key)=>id==='a'&&key==='text'?{element:field}:null,
    readBlock(){return {data:projected}},
    restore(store){projected={...store.get('a').data}},
    prepare({draft}){
      return {
        apply(){projected={...draft.get('a').data}},
        recover(){},
        finalize(){},
        discard(){},
      }
    },
  }
  const runtime=new DocumentRuntime({
    registry:plugin,
    ownerDocument:flatTextOwnerDocument(),
    projector,
    data:{version:'2.0.0',blocks:[block('a',{text:'{{person}}'},
      {inline:{person:{type:'mention',dataVersion:1,data:{id:'ada',name:'Ada'}}}})]},
  })
  const before=runtime.save().blocks
  const source={id:'person',type:'mention',element:{},instance:{}}
  const makeSnapshot=()=>({
    blockId:'a',fieldKey:'text',blockType:'paragraph',fieldElement:field,
    generation:runtime.generation,revision:runtime.revision,
    occurrences:[source],
    selectionBefore:null,
    applyChanges(changes){applied+=changes.length},
    finalizeChanges(changes,canonicalInline){
      finalized++
      assert.equal(changes.length,1)
      assert.equal(canonicalInline.person.data.name,'Ada')
    },
  })
  const unchanged=runtime.reconcileNativeInlineInput(makeSnapshot(),()=>[{
    ...source,action:{kind:'update',data:{id:'ada',name:' Ada '}},
  }])
  assert.deepEqual(unchanged,{status:'unchanged'})
  assert.equal(runtime.revision,0)
  assert.equal(runtime.canUndo,false)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(applied,1)
  assert.equal(finalized,1)

  const changedSnapshot=makeSnapshot()
  changedSnapshot.finalizeChanges=(changes,canonicalInline)=>{
    assert.equal(canonicalInline.person.data.name,'Grace')
  }
  const changed=runtime.reconcileNativeInlineInput(changedSnapshot,()=>[{
    ...source,action:{kind:'update',data:{id:'ada',name:' Grace '}},
  }])
  assert.deepEqual(changed,{status:'committed'})
  assert.equal(runtime.save().blocks[0].inline.person.data.name,'Grace')
  assert.equal(runtime.canUndo,true)
  runtime.undo()
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})

test('native inline preparation rejection cannot partially change current canonical data',()=>{
  const plugin=registry([paragraphDefinition({
    mapRichText:(data,visit)=>({...data,text:visit(data.text,'text')}),
  })])
  plugin.getInlineDefinition=type=>type==='mention'?{schema:{
    currentVersion:1,
    encode:data=>({dataVersion:1,data:{id:data.id,name:data.name}}),
    decode:input=>({dataVersion:1,data:input.data}),
  }}:null
  const field={}
  let restored=0,producerCalls=0
  const runtime=new DocumentRuntime({
    registry:plugin,
    ownerDocument:flatTextOwnerDocument(),
    data:{version:'2.0.0',blocks:[block('a',{text:'{{person}}'},
      {inline:{person:{type:'mention',dataVersion:1,data:{id:'ada',name:'Ada'}}}})]},
    projector:{
      getEditableField:()=>({element:field}),
      readBlock:()=>({data:{text:'{{person}}'}}),
      restore(){restored++},
      prepare(){return {apply(){},recover(){},finalize(){},discard(){}}},
    },
  })
  const before=runtime.save().blocks
  const source={id:'person',type:'mention',element:{},instance:{}}
  const snapshot={
    blockId:'a',fieldKey:'text',blockType:'paragraph',fieldElement:field,
    generation:runtime.generation,revision:runtime.revision,
    occurrences:[source],selectionBefore:null,
    applyChanges(){producerCalls++},
  }
  assert.throws(()=>runtime.reconcileNativeInlineInput(snapshot,()=>[
    {...source,action:{kind:'update',data:{id:'ada',name:'Changed'}}},
    {...source,action:{kind:'remove'}},
  ]),/another occurrence/)
  assert.equal(producerCalls,0)
  assert.equal(restored,1)
  assert.deepEqual(runtime.save().blocks,before)
  assert.equal(runtime.revision,0)
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})


test('read-only round trips revoke control epochs without changing the author revision', () => {
  const runtime = new DocumentRuntime({ registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a')] } })
  const revision = runtime.revision, generation = runtime.generation
  const initial = runtime.modeEpoch
  assert.equal(initial, 0)
  runtime.setReadOnly(true)
  assert.equal(runtime.modeEpoch, initial + 1)
  runtime.setReadOnly(true)
  assert.equal(runtime.modeEpoch, initial + 1, 'redundant mode call issued a new epoch')
  runtime.setReadOnly(false)
  assert.equal(runtime.modeEpoch, initial + 2)
  assert.equal(runtime.revision, revision, 'presentation mode authored a document edit')
  assert.equal(runtime.generation, generation, 'presentation mode replaced the document')
  assert.deepEqual(runtime.save().blocks, [block('a')])
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})


test('empty capability cannot issue an author update while keyboard eligibility is prepared',()=>{
  const definition=paragraphDefinition()
  let runtime
  let nestedProducerCalls=0
  definition.capabilities.empty.isEmpty=()=>{
    runtime.update('a',()=>{
      nestedProducerCalls++
      return {data:{text:'INJECTED'}}
    })
    return true
  }
  runtime=new DocumentRuntime({
    registry:registry([definition]),
    data:{version:'2.0.0',blocks:[block('a',{text:''})]},
  })
  assert.throws(()=>runtime.isEmpty('a'),/prepar/,
    'empty eligibility allowed a plugin to reenter and mutate the editor')
  assert.equal(nestedProducerCalls,0,'empty capability executed a nested author producer')
  assert.equal(runtime.get('a').data.text,'','empty callback modified the persisted document')
  assert.equal(runtime.canUndo,false,'empty callback added author history')
  runtime.destroy()
})

test('empty capability requires synchronous boolean eligibility without history effects',()=>{
  for(const [label,decision,expected] of [
    ['thenable',()=>Promise.resolve(true),/synchronous/],
    ['invalid',()=>({value:true}),/boolean/],
  ]){
    const definition=paragraphDefinition()
    definition.capabilities.empty.isEmpty=decision
    const runtime=new DocumentRuntime({
      registry:registry([definition]),
      data:{version:'2.0.0',blocks:[block('a',{text:'Some text'})]},
    })
    assert.throws(()=>runtime.isEmpty('a'),expected,label+' decision was accepted')
    assert.equal(runtime.get('a').data.text,'Some text')
    assert.equal(runtime.canUndo,false)
    runtime.destroy()
  }
})

test('toolbox must reject an asynchronous empty-block decision before inserting a block',()=>{
  const definition=paragraphDefinition()
  definition.capabilities.empty.isEmpty=()=>Promise.resolve(true)
  const runtime=new DocumentRuntime({
    registry:registry([definition]),
    data:{version:'2.0.0',blocks:[block('a',{text:''})]},
  })
  assert.throws(()=>runtime.insertToolboxBlock('a',{type:'paragraph'}),/synchronous/,
    'toolbox silently treated an uncompleted empty decision as false')
  assert.deepEqual(runtime.ids(),['a'])
  assert.equal(runtime.get('a').data.text,'')
  assert.equal(runtime.canUndo,false)
  runtime.destroy()
})


test('public block update ignores JSON object insertion order without a history entry', () => {
  const definition = {
    type: 'semantic-json',
    schema: {
      currentVersion: 1,
      createDefault: () => ({ nested: { left: 1, right: 2 }, list: [{ a: 1, b: 2 }] }),
      encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
      decode: ({ dataVersion, data }) => ({ dataVersion, data: structuredClone(data) }),
    },
  }
  const initial = {
    nested: { left: 1, right: 2 },
    list: [{ a: 1, b: 2 }],
  }
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    data: { version: '2.0.0', blocks: [{ id: 'entry', type: definition.type, dataVersion: 1, data: initial }] },
  })
  try {
    const baseline = runtime.revision
    runtime.update('entry', () => ({
      data: {
        list: [{ b: 2, a: 1 }],
        nested: { right: 2, left: 1 },
      },
    }), 'host')
    assert.equal(runtime.revision, baseline, 'object key order created a phantom author revision')
    assert.equal(runtime.canUndo, false, 'object key order created a phantom history entry')
    assert.deepEqual(runtime.get('entry').data, initial)

    runtime.update('entry', () => ({
      data: {
        list: [{ b: 2, a: 1 }],
        nested: { right: 3, left: 1 },
      },
    }), 'host')
    assert.equal(runtime.revision, baseline + 1, 'genuine payload change did not commit')
    assert.equal(runtime.canUndo, true)
    assert.equal(runtime.undo(), true)
    assert.deepEqual(runtime.get('entry').data, initial)
  } finally {
    runtime.destroy()
  }
})


test('projection sync ignores JSON property insertion order but commits genuine edits', () => {
  const definition = {
    type: 'semantic-json',
    schema: {
      currentVersion: 1,
      createDefault: () => ({ nested: { left: 1, right: 2 }, list: [{ a: 1, b: 2 }] }),
      encode: data => ({ dataVersion: 1, data: structuredClone(data) }),
      decode: ({ dataVersion, data }) => ({ dataVersion, data: structuredClone(data) }),
    },
  }
  const initial = { nested: { left: 1, right: 2 }, list: [{ a: 1, b: 2 }] }
  let projected = { list: [{ b: 2, a: 1 }], nested: { right: 2, left: 1 } }
  const projector = {
    readBlock: () => ({ data: projected }),
    prepare: () => ({ apply() {}, recover() {}, finalize() {}, discard() {} }),
    restore() {},
  }
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    projector,
    data: { version: '2.0.0', blocks: [{ id: 'entry', type: definition.type, dataVersion: 1, data: initial }] },
  })
  try {
    const revision = runtime.revision
    runtime.syncBlockFromProjection('entry', () => {})
    assert.equal(runtime.revision, revision, 'reordered object keys created a phantom native edit')
    assert.equal(runtime.canUndo, false)
    assert.deepEqual(runtime.get('entry').data, initial)

    projected = { list: [{ b: 2, a: 1 }], nested: { right: 3, left: 1 } }
    runtime.syncBlockFromProjection('entry', () => {})
    assert.equal(runtime.revision, revision + 1)
    assert.equal(runtime.canUndo, true)
    assert.deepEqual(runtime.get('entry').data.nested, { right: 3, left: 1 })
    assert.equal(runtime.undo(), true)
    assert.deepEqual(runtime.get('entry').data, initial)
  } finally {
    runtime.destroy()
  }
})


test('guarded URL-style async continuation replays the complete authored state together', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Before' })] },
  })
  const initial = runtime.get('a')
  runtime.update('a', () => ({ data: { text: 'After' } }), 'interaction', {
    pluginOrigin: true,
  })
  const baseRevision = runtime.revision
  runtime.update('a', () => ({ tunes: { textAlign: 'center' } }), 'interaction', {
    historyContinuation: { baseRevision, fieldKey: 'text' },
  })
  assert.equal(runtime.get('a').data.text, 'After')
  assert.equal(runtime.get('a').tunes.textAlign, 'center')
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('a').data.text, initial.data.text)
  assert.deepEqual(runtime.get('a').tunes, initial.tunes)
  assert.equal(runtime.canUndo, false)
  assert.equal(runtime.redo(), true)
  assert.equal(runtime.get('a').data.text, 'After')
  assert.equal(runtime.get('a').tunes.textAlign, 'center')
  runtime.destroy()
})

test('revision lease keeps delayed extension metadata distinct after host activity', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [
      block('a', { text: 'Before' }),
      block('b', { text: 'Another block' }),
    ] },
  })
  runtime.update('a', () => ({ data: { text: 'After' } }), 'interaction', {
    pluginOrigin: true,
  })
  const baseRevision = runtime.revision
  runtime.update('b', () => ({ data: { text: 'Host changed' } }), 'host')
  runtime.update('a', () => ({ tunes: { textAlign: 'center' } }), 'interaction', {
    historyContinuation: { baseRevision, fieldKey: 'text' },
  })
  assert.equal(runtime.get('a').tunes.textAlign, 'center')
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('a').data.text, 'After')
  assert.equal(runtime.get('a').tunes, undefined)
  assert.equal(runtime.get('b').data.text, 'Host changed')
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('b').data.text, 'Another block')
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('a').data.text, 'Before')
  runtime.destroy()
})

test('async plugin completion never consumes an unrelated host-authored URL history step', () => {
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Before' })] },
  })
  runtime.update('a', () => ({ data: { text: 'Host supplied URL' } }), 'host')
  const baseRevision = runtime.revision

  runtime.update('a', () => ({ tunes: { textAlign: 'center' } }), 'interaction', {
    pluginOrigin: true,
    historyContinuation: { baseRevision, fieldKey: 'text' },
  })
  assert.equal(runtime.get('a').tunes.textAlign, 'center')
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('a').data.text, 'Host supplied URL',
    'undoing metadata unexpectedly reverted a prior host URL change')
  assert.equal(runtime.get('a').tunes, undefined)
  assert.equal(runtime.canUndo, true)
  assert.equal(runtime.undo(), true)
  assert.equal(runtime.get('a').data.text, 'Before')
  runtime.destroy()
})

test('block data authority and public host updates publish distinct event origins', () => {
  const events = []
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Before' })] },
    onCommit: event => events.push(event),
  })
  runtime.update('a', () => ({ data: { text: 'Host change' } }), 'host')
  runtime.update('a', () => ({ data: { text: 'Extension change' } }), 'interaction', {
    pluginOrigin: true,
  })
  assert.equal(events.length, 2)
  assert.equal(events[0].origin, 'external')
  assert.equal(events[1].origin, 'plugin')
  runtime.destroy()
})


test('block instance DataTask inherits plugin authoring provenance through DocumentRuntime', () => {
  let contextFactory
  const events = []
  const definition = {
    type: 'linkPreview',
    schema: {
      currentVersion: 1,
      createDefault: () => ({ url: '', title: '' }),
      decode: input => ({ dataVersion: 1, data: input.data }),
      encode: data => ({ dataVersion: 1, data }),
      mapRichText: data => data,
    },
    capabilities: { empty: { isEmpty: data => !data.url } },
  }
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    data: {
      version: '2.0.0',
      blocks: [{ id: 'a', type: 'linkPreview', dataVersion: 1,
        data: { url: 'https://old.example', title: '' } }],
    },
    onCommit: event => events.push(event),
    projectorFactory({ contextFactory: createContext }) {
      contextFactory = createContext
      return {
        mount() {},
        prepare() {
          return { apply() {}, recover() {}, finalize() {}, discard() {} }
        },
        destroy() {},
      }
    },
  })

  const owner = new AbortController()
  const scope = new InstanceScope({ generation: runtime.generation })
  const context = contextFactory('a', 'linkPreview', owner.signal,
    () => runtime.get('a'), scope)
  const before = runtime.get('a')
  context.updateData(current => ({ ...current, url: 'https://plugin.example' }))
  assert.equal(events[0].origin, 'plugin',
    'block-scoped update was misclassified as a host mutation')

  const task = context.beginTask()
  assert.equal(task.commit(current => ({ ...current, title: 'Fetched title' }), {
    mergeWithPreviousField: 'url',
  }), true)
  assert.equal(events[1].origin, 'plugin')
  assert.equal(runtime.get('a').data.title, 'Fetched title')
  assert.equal(runtime.undo(), true)
  assert.deepEqual(runtime.get('a'), before)
  assert.equal(runtime.canUndo, false)
  assert.equal(runtime.redo(), true)
  assert.equal(runtime.get('a').data.url, 'https://plugin.example')
  assert.equal(runtime.get('a').data.title, 'Fetched title')
  owner.abort()
  scope.revoke()
  runtime.destroy()
})

test('shortcut capability receives the owning editor document rather than ambient document', () => {
  const ownerDocument = Object.freeze({ kind: 'owning-editor-realm' })
  let received = null
  const definition = paragraphDefinition()
  definition.capabilities.shortcuts = {
    handle(_input, _data, context) {
      received = context.ownerDocument
      assert.ok(Object.isFrozen(context), 'capability context is not a frozen authority')
      return null
    },
  }
  const runtime = new DocumentRuntime({
    registry: registry([definition]),
    ownerDocument,
    data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha' })] },
  })
  try {
    runtime.interact('test.shortcut-owner', tx => {
      runtime.prepareShortcutAction(tx, 'a', {
        key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
        fieldKey: 'text', selection: { start: 0, end: 0 }, fieldLength: 5,
      }, new Map([['text', 5]]))
    })
    assert.strictEqual(received, ownerDocument)
  } finally { runtime.destroy() }
})

test('destroying runtime after Undo prevents deferred selection restoration into a retired editor', async () => {
  const point = { anchor: { blockId: 'a', fieldKey: 'text', offset: 2 },
    focus: { blockId: 'a', fieldKey: 'text', offset: 2 } }
  const restored = []
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Alpha' })] },
    selection: { capture: () => point, restore(value) { restored.push(value) } },
  })
  runtime.update('a', () => ({ data: { text: 'AlXpha' } }), 'host')
  assert.equal(runtime.undo(), true)
  const immediate = restored.length
  assert.ok(immediate > 0, 'Undo did not perform its immediate restore')
  runtime.destroy()
  await Promise.resolve()
  assert.equal(restored.length, immediate,
    'queued Undo replay restored selection after DocumentRuntime destruction')
  assert.equal(runtime.health, 'destroyed')
})

test('destroy during Undo publication prevents its deferred selection callback', async () => {
  const point = { anchor: { blockId: 'a', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'a', fieldKey: 'text', offset: 1 } }
  const restored = []
  let runtime
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'A' })] },
    selection: { capture: () => point, restore(value) { restored.push(value) } },
    onCommit(event) {
      if (event.action === 'undo') runtime.destroy()
    },
  })
  runtime.update('a', () => ({ data: { text: 'B' } }), 'host')
  assert.equal(runtime.undo(), true)
  const immediate = restored.length
  assert.ok(immediate > 0)
  await Promise.resolve()
  assert.equal(restored.length, immediate,
    'deferred Undo callback ran after reentrant editor teardown')
  assert.equal(runtime.health, 'destroyed')
})


test('read-only selection capture cannot reenter host mutation or mode transition', () => {
  let runtime
  let armed = false
  let producers = 0
  let projectionTransitions = 0
  const failures = []
  const selection = {
    capture() {
      if (!armed) return null
      armed = false
      for (const operation of [
        () => runtime.update('a', () => {
          producers++
          return { data: { text: 'Unexpected selection callback edit' } }
        }, 'host'),
        () => runtime.setReadOnly(true),
      ]) {
        try { operation() } catch (error) { failures.push(error.message) }
      }
      return null
    },
    restore() {},
  }
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Committed' })] },
    selection,
    projector: {
      setReadOnly() { projectionTransitions++ },
      prepare() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    },
  })
  const before = runtime.save().blocks
  const revision = runtime.revision
  const initialTransitions = projectionTransitions
  armed = true
  runtime.setReadOnly(true)
  assert.equal(producers, 0, 'selection capture authored a host update before the transition was guarded')
  assert.deepEqual(failures, [
    'Cannot mutate document during read-only transition',
    'Cannot mutate document during read-only transition',
  ])
  assert.equal(projectionTransitions - initialTransitions, 1,
    'one mode request recursively executed projector transitions')
  assert.equal(runtime.readOnly, true)
  assert.deepEqual(runtime.save().blocks, before)
  assert.equal(runtime.revision, revision)
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})

test('read-only selection capture keeps committed queries available and leaves no stuck guard', () => {
  let runtime
  let armed = false
  let capturedText = null
  const selection = {
    capture() {
      if (armed) capturedText = runtime.get('a')?.data.text
      return null
    },
    restore() {},
  }
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    data: { version: '2.0.0', blocks: [block('a', { text: 'Visible' })] },
    selection,
  })
  armed = true
  runtime.setReadOnly(true)
  assert.equal(capturedText, 'Visible')
  assert.equal(runtime.readOnly, true)
  runtime.setReadOnly(false)
  runtime.update('a', () => ({ data: { text: 'Writable again' } }), 'host')
  assert.equal(runtime.get('a').data.text, 'Writable again')
  runtime.destroy()
})
test('save and render telemetry failures never replace canonical operations', () => {
  for (const failureStage of ['clock', 'threshold', 'emit']) {
    let tick = 0
    const telemetryError = new Error('synthetic diagnostic ' + failureStage)
    const diagnostics = {
      now() {
        if (failureStage === 'clock') throw telemetryError
        return ++tick
      },
      threshold() {
        if (failureStage === 'threshold') throw telemetryError
        return 0
      },
      emit() {
        if (failureStage === 'emit') throw telemetryError
      },
      errorName(error) { return error?.name ?? 'UnknownError' },
    }
    const runtime = new DocumentRuntime({
      registry: registry([paragraphDefinition()]),
      diagnostics,
      data: { version: '2.0.0', blocks: [block('a', { text: 'Initial' })] },
    })
    try {
      assert.equal(runtime.save().blocks[0].data.text, 'Initial', failureStage + ' save')
      assert.doesNotThrow(() => runtime.render({
        version: '2.0.0',
        blocks: [block('a', { text: 'Updated' })],
      }), failureStage + ' render')
      assert.equal(runtime.get('a').data.text, 'Updated', failureStage + ' persisted document')
      assert.equal(runtime.health, 'ready')
    } finally { runtime.destroy() }
  }
})

test('save and render diagnostic callbacks cannot author a second transaction', () => {
  let runtime
  let clock = 0
  let attempts = 0
  let unauthorizedWrites = 0
  const denials = []
  const attempt = () => {
    if (!runtime) return
    attempts++
    try {
      runtime.update('a', () => {
        unauthorizedWrites++
        return { data: { text: 'Unwanted diagnostic edit' } }
      }, 'host')
    } catch (error) { denials.push(error) }
  }
  const diagnostics = {
    now() { attempt(); return ++clock },
    threshold() { attempt(); return 0 },
    emit() { attempt() },
    errorName(error) { return error?.name ?? 'UnknownError' },
  }
  runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    diagnostics,
    data: { version: '2.0.0', blocks: [block('a', { text: 'Initial' })] },
  })
  try {
    assert.equal(runtime.save().blocks[0].data.text, 'Initial')
    assert.equal(runtime.get('a').data.text, 'Initial')
    runtime.render({ version: '2.0.0', blocks: [block('a', { text: 'Updated' })] })
    assert.equal(runtime.get('a').data.text, 'Updated')
    assert.ok(attempts >= 3, 'actual diagnostic callbacks were invoked')
    assert.equal(unauthorizedWrites, 0, 'diagnostic callbacks authored a nested command')
    assert.equal(denials.length, attempts, 'each diagnostic attempt was rejected')
    assert.ok(denials.every(error => /diagnostic[- ]observation/i.test(String(error))))
  } finally { runtime.destroy() }
})
test('save and render diagnostics accept a valid zero-valued clock origin', () => {
  const events = []
  let clock = 0
  const diagnostics = {
    now() { const result = clock; clock += 5; return result },
    threshold() { return 1 },
    emit(code, metadata) { events.push({ code, ...metadata }) },
    errorName(error) { return error?.name ?? 'UnknownError' },
  }
  const runtime = new DocumentRuntime({
    registry: registry([paragraphDefinition()]),
    diagnostics,
    data: { version: '2.0.0', blocks: [block('a')] },
  })
  try {
    runtime.save()
    runtime.render({ version: '2.0.0', blocks: [block('a', { text: 'Changed' })] })
    assert.equal(events.filter(event => event.code === 'save.slow').length, 1,
      'monotonic clock starting at zero still qualifies for timing')
    assert.equal(events.filter(event => event.code === 'render.slow').length, 1)
    assert.ok(events.every(event => Number.isFinite(event.durationMs)))
  } finally { runtime.destroy() }
})
