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


function mountedRestoreFixture({ onFocus, onSelection, blocks = ['a','b'] } = {}) {
  const calls = { native: 0, selection: 0, focus: 0, selected: 0 }
  const fields = new Map()
  const native = {
    anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0,
    rangeCount: 0,
    setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset) {
      calls.native++
      this.anchorNode = anchorNode
      this.anchorOffset = anchorOffset
      this.focusNode = focusNode
      this.focusOffset = focusOffset
      this.rangeCount = 1
      onSelection?.(context)
    },
    removeAllRanges() { this.rangeCount = 0 },
    addRange(range) {
      calls.native++
      this.anchorNode = range.startContainer
      this.anchorOffset = range.startOffset
      this.focusNode = range.endContainer
      this.focusOffset = range.endOffset
      this.rangeCount = 1
      onSelection?.(context)
    },
  }
  const document = {
    activeElement: null,
    defaultView: { AbortController, getSelection: () => native },
    addEventListener() {},
    createRange() {
      const range = {
        startContainer: null, endContainer: null,
        startOffset: 0, endOffset: 0,
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset },
        cloneRange() { return { ...this, cloneRange: this.cloneRange } },
        toString() { return 'selected' },
      }
      return range
    },
  }
  function field(id) {
    const element = {
      nodeType: 1, tagName: 'DIV', childNodes: [],
      hasAttribute() { return false },
      textContent: 'Alpha',
      contains(node) { return node === this || node === this.childNodes[0] },
      focus() {
        calls.focus++
        document.activeElement = this
        onFocus?.(context, id, this)
      },
    }
    const child = {
      nodeType: 3, textContent: 'Alpha', data: 'Alpha',
      parentNode: element,
    }
    element.childNodes = [child]
    return { key: 'text', mode: 'rich-text', element, child }
  }
  for (const id of blocks) fields.set(id, field(id))
  document.activeElement = fields.get('a').element
  const selections = []
  const view = {
    selectedIds: [],
    select(ids) {
      calls.selected++
      this.selectedIds = [...ids]
      selections.push([...ids])
    },
    clearSelection() { this.selectedIds = [] },
    setCurrent(id) { this.currentId = id; calls.current = (calls.current ?? 0) + 1 },
  }
  const runtime = {
    generation: 1, revision: 1, modeEpoch: 0, health: 'ready',
    readOnly: false,
    indexOf(id) { return blocks.indexOf(id) },
    ids() { return [...blocks] },
    has(id) { return blocks.includes(id) },
  }
  const reconciler = {
    getEditableField(id, key) {
      const current = fields.get(id)
      return current?.key === key ? current : null
    },
    getEditableFields(id) { return fields.has(id) ? [fields.get(id)] : [] },
    resolveEditableTarget(node) {
      for (const [blockId, candidate] of fields) {
        if (candidate.element.contains(node)) {
          return { blockId, fieldKey: candidate.key, mode: candidate.mode, element: candidate.element }
        }
      }
      return null
    },
  }
  const root = {
    ownerDocument: document,
    addEventListener() {},
    classList: { add() {}, remove() {} },
    contains() { return true },
  }
  const controller = new SelectionController({ root, runtime, reconciler, view })
  const context = {
    controller, document, runtime, reconciler, view, fields, native, selections, calls,
    replace(id) { fields.set(id, field(id)); return fields.get(id) },
  }
  const point = (id, offset) => ({ blockId: id, fieldKey: 'text', offset })
  return { ...context, point }
}

test('cross-block restore never uses text nodes after focus remount', () => {
  let retire = false
  const h = mountedRestoreFixture({
    onFocus(ctx, id) {
      if (id === 'a' && retire) ctx.replace('a')
    },
  })
  h.document.activeElement = h.fields.get('b').element
  retire = true
  const original = h.fields.get('a').child
  assert.equal(h.controller.restore({
    anchor: h.point('a', 2), focus: h.point('b', 3),
  }), false, 'old cross-block range was accepted after a focus remounted its anchor field')
  assert.equal(h.calls.native, 0, 'old text node was passed into native selection')
  assert.notEqual(h.fields.get('a').child, original)
  assert.equal(h.calls.selected, 0, 'stale selection published selected blocks')
  h.controller.destroy()
})

test('cross-block restore cannot publish range after native selection retires owner', () => {
  let h
  h = mountedRestoreFixture({
    onSelection() { h.controller.destroy() },
  })
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2),
  }), false)
  assert.equal(h.calls.native, 1)
  assert.equal(h.calls.selected, 0, 'destroyed selection published selected blocks')
  assert.equal(h.controller.active, false)
})

test('cross-block focus error rejects restoration without throwing to the editor host', () => {
  const h = mountedRestoreFixture({
    onFocus() { throw new Error('plugin focus failed on a detached host') },
  })
  h.document.activeElement = h.fields.get('b').element
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2),
  }), false)
  assert.equal(h.calls.native, 0)
  assert.equal(h.calls.selected, 0)
  h.controller.destroy()
})

test('ordinary cross-block range restores the owned native endpoints once', () => {
  const h = mountedRestoreFixture()
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 4),
  }), true)
  assert.equal(h.calls.native, 1)
  assert.equal(h.native.anchorNode, h.fields.get('a').child)
  assert.equal(h.native.focusNode, h.fields.get('b').child)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [1, 4])
  assert.deepEqual(h.view.selectedIds, ['a', 'b'])
  h.controller.destroy()
})


test('cross-block backward restore preserves native anchor with collapse and extend', () => {
  const h = mountedRestoreFixture()
  h.native.setBaseAndExtent = undefined
  h.native.collapse = (node, offset) => {
    h.native.anchorNode = node
    h.native.focusNode = node
    h.native.anchorOffset = offset
    h.native.focusOffset = offset
    h.native.rangeCount = 1
  }
  h.native.extend = (node, offset) => {
    h.native.focusNode = node
    h.native.focusOffset = offset
  }
  assert.equal(h.controller.restore({
    anchor: h.point('b', 4), focus: h.point('a', 1),
  }), true)
  assert.equal(h.native.anchorNode, h.fields.get('b').child)
  assert.equal(h.native.focusNode, h.fields.get('a').child)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [4, 1])
  h.controller.destroy()
})

test('unsupported backward cross-block Range fallback preserves prior native selection', () => {
  const h = mountedRestoreFixture()
  const originalNode = h.fields.get('a').child
  h.native.anchorNode = originalNode
  h.native.focusNode = originalNode
  h.native.anchorOffset = 1
  h.native.focusOffset = 3
  h.native.setBaseAndExtent = undefined
  h.native.collapse = undefined
  h.native.extend = undefined
  let clearCount = 0
  let rangeApplicationCount = 0
  h.native.removeAllRanges = () => { clearCount++ }
  h.native.addRange = () => { rangeApplicationCount++ }
  assert.equal(h.controller.restore({
    anchor: h.point('b', 4), focus: h.point('a', 1),
  }), false, 'Range-only browser cannot represent an inverted native anchor')
  assert.equal(clearCount, 0, 'failed direction restoration destroyed earlier selection')
  assert.equal(rangeApplicationCount, 0)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [1, 3])
  h.controller.destroy()
})

test('forward cross-block Range fallback remains usable without direction-specific methods', () => {
  const h = mountedRestoreFixture()
  h.native.setBaseAndExtent = undefined
  h.native.collapse = undefined
  h.native.extend = undefined
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 4),
  }), true)
  assert.equal(h.native.anchorNode, h.fields.get('a').child)
  assert.equal(h.native.focusNode, h.fields.get('b').child)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [1, 4])
  h.controller.destroy()
})


test('cross-block native setter that silently ignores restore cannot publish selection', () => {
  const h = mountedRestoreFixture()
  h.native.setBaseAndExtent = () => { h.calls.native++ }
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 3),
  }), false, 'a rejected DOM selection was incorrectly published')
  assert.equal(h.calls.native, 1)
  assert.equal(h.calls.selected, 0)
  assert.equal(h.controller.active, false)
  h.controller.destroy()
})

test('cross-block native selection callback changing offsets supersedes old restoration', () => {
  let h
  h = mountedRestoreFixture({
    onSelection() {
      h.native.anchorOffset = 4
      h.native.focusOffset = 4
    },
  })
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2),
  }), false, 'an old selection command reported success after a newer native caret')
  assert.equal(h.calls.selected, 0)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [4,4])
  h.controller.destroy()
})


test('conversion caret collapse failure does not publish a partially owned selection', () => {
  const h = mountedRestoreFixture()
  h.native.collapse = () => { throw new Error('native collapse no longer available') }
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2), conversionCaret: true,
  }), false)
  assert.equal(h.calls.selected, 0,
    'failed conversion caret published cross-block logical selection before native collapse')
  assert.equal(h.controller.active, false)
  assert.equal(h.view.selectedIds.length, 0)
  assert.equal(h.calls.current ?? 0, 0)
  h.controller.destroy()
})

test('conversion caret focus remount cannot leave a stale selected range behind', () => {
  let replacing = false
  const h = mountedRestoreFixture({
    onFocus(ctx,id) {
      if (id === 'b' && replacing) ctx.replace('b')
    },
  })
  replacing = true
  h.native.collapse = () => { throw Error('old focus field should not reach collapse') }
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2), conversionCaret: true,
  }), false)
  assert.equal(h.calls.selected, 0)
  assert.equal(h.controller.active, false)
  assert.equal(h.calls.current ?? 0, 0)
  h.controller.destroy()
})

test('a live conversion caret is published only after native collapse succeeds', () => {
  const h = mountedRestoreFixture()
  let collapseCount = 0
  h.native.collapse = (node, offset) => {
    collapseCount++
    h.native.anchorNode = node
    h.native.focusNode = node
    h.native.anchorOffset = offset
    h.native.focusOffset = offset
    h.native.rangeCount = 1
  }
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2), conversionCaret: true,
  }), true)
  assert.equal(collapseCount, 1)
  assert.deepEqual(h.view.selectedIds, ['a','b'])
  assert.equal(h.view.currentId, 'b')
  assert.equal(h.controller.bookmark.conversionCaret, true)
  h.controller.destroy()
})


test('conversion caret silent native collapse failure cannot publish selected blocks', () => {
  const h = mountedRestoreFixture()
  h.native.collapse = () => {}
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2), conversionCaret: true,
  }), false)
  assert.equal(h.calls.selected, 0)
  assert.equal(h.calls.current ?? 0, 0)
  assert.equal(h.controller.active, false)
  h.controller.destroy()
})

test('conversion caret transferred native focus cannot claim stale current block', () => {
  let h
  const outsideFocus = { name: 'a newer author focus' }
  h = mountedRestoreFixture()
  h.native.collapse = (node, offset) => {
    h.native.anchorNode = node
    h.native.focusNode = node
    h.native.anchorOffset = offset
    h.native.focusOffset = offset
    h.document.activeElement = outsideFocus
  }
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 2), conversionCaret: true,
  }), false)
  assert.equal(h.calls.selected, 0)
  assert.equal(h.calls.current ?? 0, 0)
  assert.equal(h.document.activeElement, outsideFocus)
  h.controller.destroy()
})


test('whole-block IME staging refuses failed plugin focus without losing selected blocks', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  let focusCalls = 0
  h.view.focus = () => { focusCalls++; return false }
  assert.equal(h.controller.beginComposition(), null)
  assert.equal(focusCalls, 1)
  assert.deepEqual(h.view.selectedIds, ['a'],
    'refused IME staging discarded the previously selected blocks')
  assert.equal(h.mutations(), 0)
  h.controller.destroy()
})

test('whole-block IME staging contains a throwing focus without clearing selection', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => { throw Error('stale native focus') }
  assert.equal(h.controller.beginComposition(), null)
  assert.deepEqual(h.view.selectedIds, ['a'])
  assert.equal(h.mutations(), 0)
  h.controller.destroy()
})

test('whole-block IME staging revokes a focus callback that round-trips edit mode', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => {
    h.runtime.readOnly = true
    h.runtime.modeEpoch++
    h.runtime.readOnly = false
    h.runtime.modeEpoch++
    return true
  }
  assert.equal(h.controller.beginComposition(), null)
  assert.deepEqual(h.view.selectedIds, ['a'])
  assert.equal(h.mutations(), 0)
  h.controller.destroy()
})

test('whole-block IME staging cannot return an active handle after controller destruction', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => { h.controller.destroy(); return true }
  assert.equal(h.controller.beginComposition(), null)
  assert.deepEqual(h.view.selectedIds, [])
  assert.equal(h.mutations(), 0)
})

test('whole-block IME staging cannot be retained after focus changes the canonical revision', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => { h.runtime.revision++; return true }
  assert.equal(h.controller.beginComposition(), null)
  assert.deepEqual(h.view.selectedIds, ['a'])
  assert.equal(h.mutations(), 0)
  h.controller.destroy()
})


test('cross-block IME staging refuses a throwing native caret setter without losing author selection', () => {
  const h = mountedRestoreFixture()
  const bookmark = { anchor: h.point('a', 1), focus: h.point('b', 3) }
  assert.equal(h.controller.restore(bookmark), true)
  assert.deepEqual(h.view.selectedIds, ['a','b'])
  const before = h.controller.bookmark
  h.native.setBaseAndExtent = () => { throw Error('native IME stage rejected') }
  assert.equal(h.controller.beginComposition(), null,
    'a failed native preedit stage leaked an active composition session')
  assert.deepEqual(h.controller.bookmark, before,
    'failed IME stage dropped an existing author cross-block bookmark')
  assert.deepEqual(h.view.selectedIds, ['a','b'])
  assert.equal(h.controller.active, true)
  h.controller.destroy()
})

test('cross-block IME staging refuses a silent native caret failure without discarding selection', () => {
  const h = mountedRestoreFixture()
  const bookmark = { anchor: h.point('a', 1), focus: h.point('b', 3) }
  assert.equal(h.controller.restore(bookmark), true)
  const nativeBefore = [h.native.anchorNode,h.native.anchorOffset,h.native.focusNode,h.native.focusOffset]
  h.native.setBaseAndExtent = () => {}
  assert.equal(h.controller.beginComposition(), null,
    'a silent no-op native Selection setter cannot start composition')
  assert.equal(h.native.anchorNode,nativeBefore[0])
  assert.equal(h.native.anchorOffset,nativeBefore[1])
  assert.equal(h.native.focusNode,nativeBefore[2])
  assert.equal(h.native.focusOffset,nativeBefore[3])
  assert.deepEqual(h.view.selectedIds, ['a','b'])
  assert.equal(h.controller.active, true)
  h.controller.destroy()
})

test('cross-block IME staging prevents a retained handle if focus remounts its field', () => {
  let armed=false
  const h = mountedRestoreFixture({
    onFocus(ctx,id) {
      if (armed && id === 'a') ctx.replace('a')
    },
  })
  assert.equal(h.controller.restore({
    anchor: h.point('a', 1), focus: h.point('b', 3),
  }), true)
  const beforeNative = h.calls.native
  armed = true
  assert.equal(h.controller.beginComposition(), null)
  assert.equal(h.calls.native, beforeNative,
    'old text node reached IME native Selection after focus remounted anchor field')
  h.controller.destroy()
})

test('successful cross-block IME stage can cancel and restore original selected range', () => {
  const h = mountedRestoreFixture()
  const bookmark = { anchor: h.point('a', 1), focus: h.point('b', 3) }
  assert.equal(h.controller.restore(bookmark), true)
  const handle = h.controller.beginComposition()
  assert.ok(handle)
  assert.equal(handle.blockId,'a')
  assert.equal(handle.fieldKey,'text')
  assert.equal(h.controller.active,false,'IME stage left old cross-block highlight active')
  assert.equal(handle.cancel(),true)
  assert.deepEqual(h.controller.bookmark,bookmark)
  assert.deepEqual(h.view.selectedIds,['a','b'])
  assert.equal(handle.cancel(),false,'settled composition restored old range again')
  h.controller.destroy()
})


async function queuedFocusBoundaryHarness(retire) {
  const node = { nodeType: 3 }
  const selection = { anchorNode: node, focusNode: node, anchorOffset: 1, focusOffset: 1 }
  const activeElement = {}
  const doc = {
    activeElement,
    defaultView: { AbortController, getSelection() { return selection } },
    addEventListener() {},
  }
  const root = { ownerDocument: doc, addEventListener() {}, contains() { return true },
    classList: { add() {}, remove() {} } }
  const mounted = {}
  const calls = []
  let reads = 0, currentReads = 0, controller
  const runtime = {
    readOnly: false, health: 'ready', generation: 1, revision: 1, modeEpoch: 0,
    has: id => id === 'a', ids: () => ['a'],
    replaceWholeDocument() { return { blockId:'a', fieldKey:'text', offset:3 } },
    interact(_name, operation) { this.revision++; return operation() },
  }
  const view = {
    selectedIds: [],
    get currentId() {
      currentReads++
      if (retire === 'current' && currentReads === 1) controller.destroy()
      return 'a'
    },
    element() {
      reads++
      if (retire === 'element' && reads === 2) {
        // Same mounted block, but it belongs to a replacement edit-mode
        // epoch when the view getter returns.
        runtime.modeEpoch += 2
      }
      return mounted
    },
    select(ids) { this.selectedIds = [...ids] },
    clearSelection() { this.selectedIds = [] },
    reconcileInteraction() {},
    setCurrent() {},
    focus(id,target) { calls.push({id,target}); return true },
  }
  controller = new SelectionController({ root, runtime, view,
    reconciler: { resolveEditableTarget() { return null } } })
  controller.selectBlocks(['a'])
  assert.equal(controller.replace({ kind:'text', text:'Hello' }), true)
  await Promise.resolve()
  return { controller, calls, reads, currentReads, runtime }
}

test('queued focus read of mounted view must not revive a retired edit epoch', async () => {
  const h = await queuedFocusBoundaryHarness('element')
  assert.equal(h.reads, 2)
  assert.deepEqual(h.calls, [], 'old queued focus was applied after mount lookup changed mode epoch')
  h.controller.destroy()
})

test('queued focus read of current block must not call editor focus after destruction', async () => {
  const h = await queuedFocusBoundaryHarness('current')
  assert.equal(h.currentReads, 1)
  assert.deepEqual(h.calls, [], 'queued focus called the view after its currentId lookup destroyed the editor')
  assert.equal(h.controller.active,false)
})


test('whole-block IME staging cannot replace a newer selected-block decision', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => {
    h.view.clearSelection()
    return true
  }
  assert.equal(h.controller.beginComposition(), null,
    'stale whole-block composition started after a newer author selection cleared the old blocks')
  assert.deepEqual(h.view.selectedIds, [])
  assert.equal(h.mutations(), 0)
  h.controller.destroy()
})

test('whole-block IME staging can still return a handle for unchanged selected blocks', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  h.view.focus = () => true
  const pending = h.controller.beginComposition()
  assert.ok(pending, 'valid selected blocks could not start a composition')
  assert.equal(pending.blockId, 'a')
  assert.equal(pending.cancel(), true)
  assert.deepEqual(h.view.selectedIds, ['a'])
  h.controller.destroy()
})


test('whole-block IME focus callback cannot recursively open another composition handle', () => {
  const h = harness()
  h.controller.selectBlocks(['a'])
  let nested = 'not-called', ready = false
  h.view.focus = () => {
    if (!ready) {
      ready = true
      nested = h.controller.beginComposition()
    }
    return true
  }
  const pending = h.controller.beginComposition()
  assert.equal(nested, null,
    'nested focus callback independently opened a second composition session')
  assert.ok(pending, 'outer valid composition lost its focus ownership')
  assert.equal(pending.cancel(), true)
  assert.deepEqual(h.view.selectedIds, ['a'])
  h.controller.destroy()
})

test('cross-block IME focus callback cannot recursively open another composition handle', () => {
  let armed = false, nested = 'not-called'
  const h = mountedRestoreFixture({
    onFocus(context, id) {
      if (id === 'a' && armed) {
        armed = false
        nested = context.controller.beginComposition()
      }
    },
  })
  const bookmark = { anchor: h.point('a',1), focus: h.point('b',3) }
  assert.equal(h.controller.restore(bookmark), true)
  armed = true
  const pending = h.controller.beginComposition()
  assert.equal(nested, null,
    'native focus reentry created another IME session while the first was staging')
  assert.ok(pending)
  assert.equal(pending.cancel(), true)
  assert.deepEqual(h.controller.bookmark, bookmark)
  h.controller.destroy()
})
