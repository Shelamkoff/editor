import test from 'node:test'
import assert from 'node:assert/strict'
import { SelectionController } from './SelectionController.js'

// A whole-block IME session survives as a callback value even after its
// projection is retired. Control transitions must revoke that callback.
function harness() {
  const doc={defaultView:{AbortController},addEventListener(){}}
  const root={
    ownerDocument:doc,
    classList:{remove(){},add(){}},
    addEventListener(){},
    contains(){return true},
  }
  const selections=[]
  const view={
    selectedIds:[],
    select(ids){this.selectedIds=[...ids];selections.push([...ids])},
    clearSelection(){this.selectedIds=[]},
    focus(){return true},
  }
  let mutations=0
  const runtime={
    readOnly:false,generation:1,revision:1,modeEpoch:0,health:'ready',
    ids(){return ['a']},
    has(id){return id==='a'},
    interact(){mutations++;return false},
  }
  const reconciler={
    resolveEditableTarget(){return null},
    getEditableFields(){return [{key:'text',mode:'rich-text',element:{}}]},
  }
  const controller=new SelectionController({root,runtime,reconciler,view})
  return {
    runtime,view,controller,reconciler,selections,
    mutations:()=>mutations,
    begin(){
      controller.selectBlocks(['a'])
      const handle=controller.beginComposition()
      assert.ok(handle,'selected blocks did not start a composition')
      return handle
    },
  }
}

test('same-mode whole-block composition cancellation restores the selected block once',()=>{
  const h=harness(),pending=h.begin()
  const before=h.selections.length
  assert.equal(pending.cancel(),true)
  assert.equal(h.selections.length,before+1)
  assert.deepEqual(h.view.selectedIds,['a'])
  assert.equal(pending.cancel(),false,'settled composition restored the selection twice')
  h.controller.destroy()
})

test('read-only round trip retires an old whole-block IME cancellation without selecting old blocks',()=>{
  const h=harness(),pending=h.begin()
  h.runtime.readOnly=true
  h.runtime.modeEpoch++
  h.runtime.readOnly=false
  h.runtime.modeEpoch++
  h.view.clearSelection()
  const before=h.selections.length
  assert.equal(pending.cancel(),false,'old IME cancellation reclaimed a later author selection')
  assert.equal(h.selections.length,before,'old IME session selected blocks after mode transition')
  assert.deepEqual(h.view.selectedIds,[])
  assert.equal(h.runtime.revision,1,'control-mode changes authored a revision')
  h.controller.destroy()
})

test('read-only round trip and destroy both prevent a retained IME commit',()=>{
  for(const retirement of ['mode','destroy']){
    const h=harness(),pending=h.begin()
    if(retirement==='mode'){
      h.runtime.readOnly=true
      h.runtime.modeEpoch++
      h.runtime.readOnly=false
      h.runtime.modeEpoch++
    }else{
      h.controller.destroy()
    }
    const before=h.selections.length
    assert.equal(pending.commit('X'),false,retirement+': old IME accepted a mutation')
    assert.equal(h.mutations(),0,retirement+': retired IME started a transaction')
    assert.equal(h.selections.length,before,retirement+': retired IME selected old blocks')
    if(retirement==='mode')h.controller.destroy()
  }
})

test('queued cross-block focus never overwrites a later caret inside the same replacement block',async()=>{
  for(const moved of [false,true]){
    const node={nodeType:3},selection={
      anchorNode:node,focusNode:node,anchorOffset:1,focusOffset:1,
    }
    const focused={}
    const doc={activeElement:focused,defaultView:{AbortController,getSelection:()=>selection},addEventListener(){}}
    const root={ownerDocument:doc,addEventListener(){},contains(){return true},
      classList:{remove(){},add(){}}}
    const mounted={}
    const calls=[]
    const view={
      currentId:'a',selectedIds:[],
      element(){return mounted},
      select(ids){this.selectedIds=[...ids]},
      clearSelection(){this.selectedIds=[]},
      setCurrent(id){this.currentId=id},
      reconcileInteraction(){},
      focus(id,target){calls.push({id,target});return true},
    }
    const runtime={
      readOnly:false,health:'ready',generation:1,revision:1,modeEpoch:0,
      has:id=>id==='a',ids:()=>['a'],
      replaceWholeDocument:()=>({blockId:'a',fieldKey:'text',offset:3}),
      interact(_name,operation){this.revision++;return operation()},
    }
    const controller=new SelectionController({
      root,runtime,view,reconciler:{resolveEditableTarget:()=>null},
    })
    controller.selectBlocks(['a'])
    assert.equal(controller.replace({kind:'text',text:'XYZ'}),true)
    if(moved){selection.anchorOffset=2;selection.focusOffset=2}
    await Promise.resolve()
    assert.deepEqual(calls,moved?[]:[{id:'a',target:{fieldKey:'text',offset:3}}],
      'retired cross-block focus overwrote a newer native caret')
    controller.destroy()
  }
})

test('destroyed SelectionController cannot reselect blocks through retained public authority', () => {
  const h = harness()
  h.controller.destroy()
  assert.deepEqual(h.view.selectedIds, [])
  assert.equal(h.controller.selectBlocks(['a']), false)
  assert.deepEqual(h.view.selectedIds, [],
    'retired selection controller republished selected block IDs')
})

test('destroyed SelectionController rejects stale range restoration before probing DOM ownership', () => {
  const h = harness()
  let ownershipReads = 0
  h.reconciler.getEditableField = () => {
    ownershipReads++
    throw new Error('destroyed reconciler must not be consulted')
  }
  const bookmark = {
    anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'a', fieldKey: 'text', offset: 0 },
  }
  h.controller.destroy()
  assert.equal(h.controller.restore(bookmark), false)
  assert.equal(ownershipReads, 0)
})

test('destroyed SelectionController cannot extend or activate a detached author selection', () => {
  const h = harness()
  let touched = 0
  h.reconciler.resolveEditableTarget = () => {
    touched++
    throw new Error('stale ownership read')
  }
  h.controller.destroy()
  assert.equal(h.controller.extend('forward'), false)
  assert.equal(h.controller.activate({
    collapsed: false, startContainer: {}, endContainer: {},
    startOffset: 0, endOffset: 0,
  }), false)
  assert.equal(touched, 0)
})

test('a captured selection mousedown callback is inert after editor destruction', () => {
  const handlers = new Map()
  let hitTests = 0
  const doc = {
    defaultView: { AbortController },
    addEventListener() {},
    caretPositionFromPoint() {
      hitTests++
      return null
    },
  }
  const root = {
    ownerDocument: doc,
    addEventListener(type, listener) { handlers.set(type, listener) },
    classList: { add() {}, remove() {} },
    contains() { return true },
  }
  const controller = new SelectionController({
    root,
    runtime: { readOnly: false, generation: 1, ids: () => ['a'] },
    reconciler: { resolveEditableTarget: () => null },
    view: { clearSelection() {} },
  })
  const retained = handlers.get('mousedown')
  assert.equal(typeof retained, 'function')
  controller.destroy()
  retained({ button: 0, target: {}, clientX: 1, clientY: 2 })
  assert.equal(hitTests, 0, 'retired selection owner still performed DOM hit testing')
  assert.equal(controller.dragging, false)
})


for (const action of ['removeWholeBlocks', 'replace']) {
  test(`whole-block ${action} skips detached DOM after synchronous commit observer destruction`, () => {
    const h = harness()
    h.controller.selectBlocks(['a'])
    let reconciled = 0
    let focused = 0
    h.view.reconcileInteraction = () => { reconciled++; throw new Error('retired view reconciled') }
    h.view.setCurrent = () => { focused++; throw new Error('retired view focused') }
    h.runtime.interact = () => {
      h.controller.destroy()
      return action === 'replace' ? { blockId: 'a', fieldKey: 'text', offset: 1 } : 'a'
    }
    const commit = () => action === 'replace'
      ? h.controller.replace({ kind: 'text', text: 'X' })
      : h.controller.removeWholeBlocks()
    assert.equal(commit(), true, 'completed canonical action was incorrectly reported as failed')
    assert.equal(reconciled, 0)
    assert.equal(focused, 0)
    assert.deepEqual(h.view.selectedIds, [], 'destruction did not clear the previous logical selection')
  })
}
