import test from 'node:test'
import assert from 'node:assert/strict'

import { KeyboardRouter } from './KeyboardRouter.js'

class FakeRoot {
  listeners = new Map()
  ownerDocument = { defaultView: { AbortController } }
  addEventListener(type, handler) { this.listeners.set(type, handler) }
}

function harness({ reportError } = {}) {
  const root = new FakeRoot()
  const field = { value: '', parentNode: null }
  const owner = { blockId: 'b', fieldKey: 'text', element: field, mode: 'plain-text' }
  const calls = []
  const records = [
    { id: 'a', type: 'paragraph', data: { text: 'A' } },
    { id: 'b', type: 'paragraph', data: { text: 'B' } },
    { id: 'c', type: 'paragraph', data: { text: 'C' } },
  ]
  const runtime = {
    readOnly: false,
    generation: 1, revision: 1, modeEpoch: 0,
    has: id => records.some(record => record.id === id),
    prepareExtensionValue: operation => operation(),
    prepareShortcutAction: () => null,
    interact(_name, operation) { return operation() },
    indexOf: id => records.findIndex(record => record.id === id),
    idAt: index => records[index]?.id,
    ids: () => records.map(record => record.id),
    list: () => records.map(record => ({ ...record })),
    get: id => records.find(record => record.id === id),
    isEmpty: id => id === 'empty',
    splitBlock(id, fieldKey, range) { calls.push(['split', id, fieldKey, range]); return 'new' },
    mergeAdjacent(left, right) { calls.push(['merge', left, right]); return true },
    remove(id) { calls.push(['remove', id]) },
    convert(id, target) { calls.push(['convert', id, target]) },
    insert(type, data, index) { calls.push(['insert', type, data, index]); return 'new' },
    undo() { calls.push(['undo']); return true },
    redo() { calls.push(['redo']); return true },
  }
  const registry = { defaultBlockType: 'paragraph', getBlockDefinition() { return {} } }
  const reconciler = {
    resolveEditableTarget(target) { return target === field ? owner : null },
    getEditableField(blockId, fieldKey) { return blockId === 'b' && fieldKey === 'text' ? owner : null },
    getEditableFields(blockId) {
      if (blockId === 'a') return [
        { key: 'first', element: { nodeType: 3, textContent: 'First' }, mode: 'rich-text' },
        { key: 'last', element: { nodeType: 3, textContent: 'Last' }, mode: 'rich-text' },
      ]
      return blockId === 'b' ? [{ key: owner.fieldKey, element: owner.element, mode: owner.mode }] : []
    },
  }
  let bookmark = {
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  }
  const selection = { capture: () => bookmark }
  const viewCalls = []
  const mounted = new Map()
  const view = {
    currentId: 'b',
    element(id) {
      if (!mounted.has(id)) mounted.set(id, {})
      return mounted.get(id)
    },
    reconcileInteraction() { viewCalls.push(['reconcile']) },
    setCurrent(id) { this.currentId = id; viewCalls.push(['current', id]) },
    focus(id, target) { viewCalls.push(['focus', id, target]); return true },
    indexOf(id) { return records.findIndex(record => record.id === id) },
  }
  const router = new KeyboardRouter({ root, runtime, registry, reconciler, selection, view,
    ...(reportError ? { reportError } : {}),
  })
  const event = (key, extra = {}) => {
    let prevented = false
    return {
      key,
      target: field,
      preventDefault() { prevented = true },
      get prevented() { return prevented },
      ...extra,
    }
  }
  return { router, runtime, calls, viewCalls, event, setBookmark: value => { bookmark = value }, field, records }
}

test('Enter delegates an editable split to one runtime transaction', () => {
  const { router, calls, event } = harness()
  const e = event('Enter')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['split', 'b', 'text', { start: 1, end: 1 }])
  router.destroy()
})

test('ArrowUp from block start focuses the previous block last editable field', () => {
  const { router, viewCalls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('ArrowUp')
  router.handleKeydown(e)

  assert.equal(e.prevented, true)
  assert.deepEqual(viewCalls.slice(-2), [
    ['current', 'a'],
    ['focus', 'a', { fieldKey: 'last', offset: 'end' }],
  ])
  router.destroy()
})

test('Backspace at field start merges with the preceding block', () => {
  const { router, calls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('Backspace')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'a', 'b'])
  router.destroy()
})

test('Delete at field end merges the following block', () => {
  const { router, calls, event, setBookmark, field } = harness()
  field.value = 'B'
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  })
  const e = event('Delete')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'b', 'c'])
  router.destroy()
})

test('Ctrl/Meta Z, Shift+Z and Y route exclusively through canonical history', () => {
  const { router, calls, event } = harness()
  const ctrlUndo = event('z', { ctrlKey: true })
  router.handleKeydown(ctrlUndo)
  const ctrlRedo = event('z', { ctrlKey: true, shiftKey: true })
  router.handleKeydown(ctrlRedo)
  const metaUndo = event('z', { metaKey: true })
  router.handleKeydown(metaUndo)
  const yRedo = event('y', { ctrlKey: true })
  router.handleKeydown(yRedo)

  for (const handled of [ctrlUndo, ctrlRedo, metaUndo, yRedo]) {
    assert.equal(handled.prevented, true)
  }
  assert.deepEqual(calls.slice(0, 4), [['undo'], ['redo'], ['undo'], ['redo']])
  router.destroy()
})

test('already handled plugin keydown events never execute generic structural logic', () => {
  const { router, calls, event } = harness()
  router.handleKeydown(event('Enter', { defaultPrevented: true }))
  assert.deepEqual(calls, [])
  router.destroy()
})


test('auxiliary controls keep native history ownership; editor chrome owns document history', () => {
  const calls=[]
  const root={
    ownerDocument:{defaultView:{AbortController}},
    addEventListener(){},
    contains(target){return target?.inside===true},
  }
  const runtime={
    readOnly:false,
    prepareExtensionValue:operation=>operation(),
    splitBlock(){throw new Error('auxiliary ownership must not split')},
    mergeAdjacent(){throw new Error('auxiliary ownership must not merge')},
    undo(){calls.push('undo');return true},
    redo(){calls.push('redo');return true},
  }
  const registry={defaultBlockType:'paragraph',getBlockDefinition(){return null}}
  const reconciler={
    resolveEditableTarget(){return null},
    getEditableFields(){return []},
    resolveBlockTarget(){return null},
  }
  const selection={capture:()=>null}
  const view={
    currentId:null,
    element(){return null},
    reconcileInteraction(){},
    setCurrent(){},
    focus(){return false},
  }
  const router=new KeyboardRouter({root,runtime,registry,reconciler,selection,view})

  const target=(selector,inside=true)=>({
    inside,
    closest(query){
      if(selector==='outside')return null
      return query.split(',').map(value=>value.trim()).includes(selector)?this:null
    },
  })
  const event=targetNode=>{
    let prevented=false
    return {
      key:'z',
      ctrlKey:true,
      target:targetNode,
      composedPath(){return [targetNode]},
      preventDefault(){prevented=true},
      get prevented(){return prevented},
    }
  }

  for(const selector of ['input','textarea','select','[data-inline-plugin]']){
    const current=event(target(selector))
    router.handleKeydown(current)
    assert.equal(current.prevented,false,`${selector} shortcut was claimed by editor history`)
  }
  const outside=event(target('outside',false))
  router.handleKeydown(outside)
  assert.equal(outside.prevented,false)
  assert.deepEqual(calls,[])
  for(const selector of ['.oe-toolbar','.oe-inline-toolbar','.oe-toolbox','.oe-settings-menu','.oe-slash-menu']){
    const current=event(target(selector))
    router.handleKeydown(current)
    assert.equal(current.prevented,true,`${selector} did not route document history`)
  }
  assert.deepEqual(calls,Array(5).fill('undo'))
  const nestedInput = target('input')
  nestedInput.closest = query => /input|\.oe-toolbar/.test(query) ? nestedInput : null
  const nestedEvent = event(nestedInput)
  router.handleKeydown(nestedEvent)
  assert.equal(nestedEvent.prevented, false, 'native input inside editor chrome lost native history ownership')
  assert.equal(calls.length, 5)
  router.destroy()
})


test('keyboard split focus is revoked across a read-only round trip without a document change', async () => {
  const h = harness()
  const e = h.event('Enter')
  h.router.handleKeydown(e)
  assert.equal(e.prevented, true)
  h.records.push({ id: 'new', type: 'paragraph', data: { text: '' } })
  // Control-mode changes do not advance document revision; the old command
  // must not regain focus merely because editing was reenabled immediately.
  const revision = h.runtime.revision
  h.runtime.readOnly = true
  h.runtime.modeEpoch++
  h.runtime.readOnly = false
  h.runtime.modeEpoch++
  assert.equal(h.runtime.revision, revision)
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call => call[0] === 'focus'), [])
  h.router.destroy()
})

test('keyboard split still gives the new block focus with unchanged author and mode ownership', async () => {
  const h = harness()
  h.router.handleKeydown(h.event('Enter'))
  h.records.push({ id: 'new', type: 'paragraph', data: { text: '' } })
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call => call[0] === 'focus'),
    [['focus', 'new', { blockId: 'new', offset: 'start' }]])
  h.router.destroy()
})

test('queued keyboard split never overwrites a later user caret inside the new block',async()=>{
  const h=harness()
  assert.equal(h.router.split('b','text',{start:1,end:1}),true)
  h.records.push({id:'new',type:'paragraph',data:{text:'pha'}})
  h.setBookmark({
    anchor:{blockId:'new',fieldKey:'text',offset:2},
    focus:{blockId:'new',fieldKey:'text',offset:2},
  })
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call=>call[0]==='focus'),[],
    'old split focus stole the later author caret')
  h.router.destroy()
})

for(const key of ['Enter','Backspace','Delete']){
  test('failed empty-block eligibility consumes '+key+' without native or history fallback',()=>{
    const reported=[]
    const h=harness({reportError:error=>reported.push(error.message)})
    if(key==='Backspace'){
      h.setBookmark({
        anchor:{blockId:'b',fieldKey:'text',offset:0},
        focus:{blockId:'b',fieldKey:'text',offset:0},
      })
    }
    if(key==='Delete'){
      h.field.value='B'
      h.setBookmark({
        anchor:{blockId:'b',fieldKey:'text',offset:1},
        focus:{blockId:'b',fieldKey:'text',offset:1},
      })
    }
    h.runtime.isEmpty=()=>{throw new TypeError('Invalid empty block result')}
    const event=h.event(key)
    assert.doesNotThrow(()=>h.router.handleKeydown(event),
      'owned '+key+' leaked a plug-in capability exception')
    assert.equal(event.prevented,true,key+' was allowed to fall through to native editing')
    assert.deepEqual(h.calls,[],key+' mutated the canonical model after failed eligibility')
    assert.deepEqual(reported,['Invalid empty block result'],'error was not reported once')
    h.router.destroy()
  })
}

test('retired KeyboardRouter ignores captured editor shortcuts and does not intercept native keys', () => {
  const { router, calls, event } = harness()
  router.destroy()
  const history = event('z', { ctrlKey: true })
  const split = event('Enter')
  router.handleKeydown(history)
  router.handleKeydown(split)
  assert.equal(history.prevented, false)
  assert.equal(split.prevented, false)
  assert.deepEqual(calls, [], 'destroyed key listener mutated or replayed canonical history')
})

test('retired KeyboardRouter public structural entry points cannot modify document', () => {
  const { router, calls } = harness()
  router.destroy()
  assert.equal(router.split('b', 'text', { start: 0, end: 0 }), false)
  assert.equal(router.exit('b'), false)
  assert.equal(router.appendDefault(), false)
  assert.deepEqual(calls, [])
})
