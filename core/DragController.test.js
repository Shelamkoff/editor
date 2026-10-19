import test from 'node:test'
import assert from 'node:assert/strict'

import { dragGapAtY, resolveDragGap } from './DragController.js'

test('resolveDragGap uses order without the dragged id for every gap', () => {
  const order=['A','B','C','D']
  const cases=[
    [{beforeId:'B',afterId:null,gap:0},0],
    [{beforeId:'C',afterId:'B',gap:1},1],
    [{beforeId:'D',afterId:'C',gap:2},2],
    [{beforeId:null,afterId:'D',gap:3},3],
  ]
  for(const [placement,expected] of cases){
    assert.equal(resolveDragGap(order,'A',placement),expected)
  }

  // A/B/C/D, drag A into the gap between B and C -> B/A/C/D.
  assert.equal(resolveDragGap(order,'A',{beforeId:'C',afterId:'B',gap:1}),1)
  // Drag C back into its current gap between B and D -> no-op index 2.
  assert.equal(resolveDragGap(order,'C',{beforeId:'D',afterId:'B',gap:2}),2)
})

test('resolveDragGap falls back from missing anchor to the surviving opposite anchor', () => {
  assert.equal(
    resolveDragGap(['A','B','C','D'],'A',{beforeId:'missing',afterId:'B',gap:0}),
    1,
  )
  assert.equal(
    resolveDragGap(['A','B','C','D'],'D',{beforeId:'C',afterId:'missing',gap:0}),
    2,
  )
})

test('dragGapAtY maps controlled geometry to gaps without inspecting payload', () => {
  const rects=new Map([
    ['B',{top:0,height:20}],
    ['C',{top:20,height:20}],
    ['D',{top:40,height:20}],
  ])
  const elementFor=id=>({
    getBoundingClientRect(){return rects.get(id)},
  })
  const ids=['B','C','D']
  assert.equal(dragGapAtY(ids,elementFor,-1),0)
  assert.equal(dragGapAtY(ids,elementFor,9),0)
  assert.equal(dragGapAtY(ids,elementFor,11),1)
  assert.equal(dragGapAtY(ids,elementFor,31),2)
  assert.equal(dragGapAtY(ids,elementFor,100),3)
})


class FakeClassList {
  constructor(){ this.values=new Set() }
  add(value){ this.values.add(value) }
  remove(value){ this.values.delete(value) }
  contains(value){ return this.values.has(value) }
}

class FakeEventTarget {
  constructor(){
    this.listeners=new Map()
    this.classList=new FakeClassList()
    this.parentNode=null
    this.children=[]
  }
  addEventListener(type,listener,options={}){
    const list=this.listeners.get(type)??[]
    list.push({listener,options})
    this.listeners.set(type,list)
    options.signal?.addEventListener?.('abort',()=>this.removeEventListener(type,listener),{once:true})
  }
  removeEventListener(type,listener){
    const list=this.listeners.get(type)??[]
    this.listeners.set(type,list.filter(item=>item.listener!==listener))
  }
  dispatch(type,event={}){
    for(const {listener} of [...(this.listeners.get(type)??[])])listener(event)
  }
  insertBefore(child,before){
    child.parentNode=this
    const current=this.children.indexOf(child)
    if(current>=0)this.children.splice(current,1)
    const index=this.children.indexOf(before)
    if(index<0)this.children.push(child)
    else this.children.splice(index,0,child)
  }
  appendChild(child){
    child.parentNode=this
    const current=this.children.indexOf(child)
    if(current>=0)this.children.splice(current,1)
    this.children.push(child)
  }
}

function dragHarness(){
  const document=new FakeEventTarget()
  document.body=new FakeEventTarget()
  document.defaultView={
    AbortController,
    setTimeout(){ return 1 },
    clearTimeout(){},
  }
  document.createElement=()=>{
    const element=new FakeEventTarget()
    element.setAttribute=()=>{}
    element.remove=()=>{
      if(!element.parentNode)return
      const index=element.parentNode.children.indexOf(element)
      if(index>=0)element.parentNode.children.splice(index,1)
      element.parentNode=null
    }
    return element
  }

  const parent=new FakeEventTarget()
  const elements=new Map()
  const rects={
    A:{top:0,height:20},
    B:{top:20,height:20},
    C:{top:40,height:20},
    D:{top:60,height:20},
  }
  for(const id of ['A','B','C','D']){
    const element=new FakeEventTarget()
    element.getBoundingClientRect=()=>rects[id]
    element.parentNode=parent
    parent.children.push(element)
    elements.set(id,element)
  }

  const handle=new FakeEventTarget()
  handle.ownerDocument=document
  let captured=null
  handle.setPointerCapture=id=>{captured=id}
  handle.hasPointerCapture=id=>captured===id
  handle.releasePointerCapture=id=>{if(captured===id)captured=null}

  let ids=['A','B','C','D']
  let revision=0
  let generation=1
  let readOnly=false
  let modeEpoch=0
  const moves=[]
  const runtime={
    get readOnly(){return readOnly},
    get modeEpoch(){return modeEpoch},
    get revision(){return revision},
    get generation(){return generation},
    has:id=>ids.includes(id),
    ids:()=>[...ids],
    indexOf:id=>ids.indexOf(id),
    move(id,to){
      moves.push([id,to])
      const from=ids.indexOf(id)
      ids.splice(from,1)
      ids.splice(to,0,id)
      revision++
    },
  }
  const focusCalls=[]
  const view={
    currentId:'A',
    element:id=>elements.get(id)??null,
    reconcileInteraction(){},
    setCurrent(id){this.currentId=id},
    focus(id){focusCalls.push(id);return true},
  }
  return {
    document,handle,runtime,view,moves,
    ids:()=>[...ids],
    setRevision:value=>{revision=value},
    setGeneration:value=>{generation=value},
    setReadOnly:value=>{if(value!==readOnly)modeEpoch++;readOnly=value},
    captured:()=>captured,
    focusCalls:()=>[...focusCalls],
  }
}

function pointerEvent(pointerId,clientY,{x=0,button=0,isPrimary=true}={}){
  return {
    pointerId,clientX:x,clientY,button,isPrimary,
    prevented:false,
    preventDefault(){this.prevented=true},
  }
}

test('DragController owns one pointer session and commits exactly one final move', async () => {
  const { DragController } = await import('./DragController.js')
  const h=dragHarness()
  const controller=new DragController({
    runtime:h.runtime,view:h.view,handle:h.handle,threshold:2,
  })

  h.handle.dispatch('pointerdown',pointerEvent(7,5))
  assert.equal(h.captured(),7)

  const foreign=pointerEvent(8,55,{x:10})
  h.document.dispatch('pointermove',foreign)
  assert.equal(foreign.prevented,false)
  assert.deepEqual(h.moves,[])

  const move=pointerEvent(7,55,{x:10})
  h.document.dispatch('pointermove',move)
  assert.equal(move.prevented,true)
  assert.deepEqual(h.moves,[],'pointermove must not mutate document')

  const up=pointerEvent(7,55,{x:10})
  h.document.dispatch('pointerup',up)
  assert.equal(up.prevented,true)
  assert.deepEqual(h.moves,[['A',2]])
  assert.deepEqual(h.ids(),['B','C','A','D'])
  assert.equal(h.captured(),null)

  h.document.dispatch('pointerup',pointerEvent(7,5))
  assert.equal(h.moves.length,1,'late pointerup committed a second move')
  controller.destroy()
})

test('DragController cancels stale sessions on revision, readOnly and source replacement', async () => {
  const { DragController } = await import('./DragController.js')
  for(const mode of ['revision','readOnly','replacement']){
    const h=dragHarness()
    const controller=new DragController({
      runtime:h.runtime,view:h.view,handle:h.handle,threshold:0,
    })
    h.handle.dispatch('pointerdown',pointerEvent(3,5))
    h.document.dispatch('pointermove',pointerEvent(3,35,{x:5}))
    if(mode==='revision')h.setRevision(1)
    if(mode==='readOnly'){
      h.setReadOnly(true)
      controller.setReadOnly(true)
    }
    if(mode==='replacement'){
      const old=h.view.element('A')
      const replacement=new FakeEventTarget()
      replacement.parentNode=old.parentNode
      h.view.element=id=>id==='A'?replacement:null
    }
    h.document.dispatch('pointerup',pointerEvent(3,35,{x:5}))
    assert.deepEqual(h.moves,[],`${mode} stale drag committed a move`)
    assert.equal(h.captured(),null,`${mode} stale drag kept pointer capture`)
    controller.destroy()
  }
})


test('completed drag restores focus only while its own committed result remains current', async () => {
  const { DragController } = await import('./DragController.js')
  for (const change of ['none', 'revision', 'generation', 'readOnly', 'replacement', 'otherFocus', 'destroy']) {
    const h = dragHarness()
    const controller = new DragController({
      runtime: h.runtime, view: h.view, handle: h.handle, threshold: 2,
    })
    h.handle.dispatch('pointerdown', pointerEvent(7, 5))
    h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
    h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 }))
    assert.deepEqual(h.moves, [['A', 2]], 'fixture must commit a real move')
    assert.deepEqual(h.focusCalls(), [], 'focus must be deferred until the gesture completes')
    if (change === 'revision') h.setRevision(h.runtime.revision + 1)
    if (change === 'generation') h.setGeneration(h.runtime.generation + 1)
    if (change === 'readOnly') {
      h.setReadOnly(true)
      controller.setReadOnly(true)
    }
    if (change === 'replacement') {
      const before = h.view.element.bind(h.view)
      h.view.element = id => id === 'A' ? new FakeEventTarget() : before(id)
    }
    if (change === 'otherFocus') h.view.setCurrent('B')
    if (change === 'destroy') controller.destroy()
    await Promise.resolve()
    assert.deepEqual(h.focusCalls(), change === 'none' ? ['A'] : [],
      change + ': a retired drag focus continuation took focus')
    controller.destroy()
  }
})


test('completed drag does not replay its focus after a read-only round trip without a new author revision', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 2,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 }))
  assert.deepEqual(h.moves, [['A', 2]], 'fixture did not commit the drag')
  const revision = h.runtime.revision
  h.setReadOnly(true)
  controller.setReadOnly(true)
  h.setReadOnly(false)
  controller.setReadOnly(false)
  assert.equal(h.runtime.revision, revision, 'mode change affected author revision')
  await Promise.resolve()
  assert.deepEqual(h.focusCalls(), [], 'retired drag stole focus after read-only → editable')
  controller.destroy()
})

test('drag cancellation cannot remove its drop spacer adopted by another container', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 45, { x: 8 }))
  const parent = h.view.element('A').parentNode
  const spacer = parent.children.find(child => child.className === 'oe-block-drop-gap')
  assert.equal(Boolean(spacer), true, 'drag did not create a spacer')
  const outside = new FakeEventTarget()
  parent.children.splice(parent.children.indexOf(spacer), 1)
  outside.appendChild(spacer)

  h.document.dispatch('pointercancel', pointerEvent(7, 45))
  assert.equal(h.captured(), null)
  assert.equal(spacer.parentNode, outside,
    'stale drag canceled a DOM node that another owner had adopted')
  assert.deepEqual(outside.children, [spacer])
  controller.destroy()
  assert.deepEqual(outside.children, [spacer])
})

test('failed drop gap insertion cleans pointer capture and half-inserted DOM', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const parent = h.view.element('A').parentNode
  const initialChildren = [...parent.children]
  let spacer = null
  const originalCreate = h.document.createElement
  h.document.createElement = name => {
    spacer = originalCreate(name)
    return spacer
  }
  const originalInsert = parent.insertBefore
  parent.insertBefore = function(child, before) {
    originalInsert.call(this, child, before)
    throw new Error('failed after DOM insertion')
  }
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  assert.throws(
    () => h.document.dispatch('pointermove', pointerEvent(7, 45, { x: 8 })),
    /failed after DOM insertion/,
  )
  assert.equal(h.captured(), null,
    'failed projection kept pointer capture after partial DOM insertion')
  assert.deepEqual(parent.children, initialChildren,
    'half-inserted spacer remained in canonical document after drag failure')
  assert.equal(spacer?.parentNode, null)
  assert.equal(h.view.element('A').classList.contains('oe-block--dragging'), false)
  assert.equal(h.document.body.classList.contains('oe-editor-dragging'), false)
  controller.destroy()
})

test('DragController cannot commit after releasing pointer capture retires its owner', async () => {
  const { DragController } = await import('./DragController.js')
  for (const retirement of ['destroy', 'readOnly', 'generation', 'replacement', 'modeRoundTrip']) {
    const h = dragHarness()
    const controller = new DragController({
      runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
    })
    h.handle.dispatch('pointerdown', pointerEvent(7, 5))
    h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
    const release = h.handle.releasePointerCapture.bind(h.handle)
    let releases = 0
    h.handle.releasePointerCapture = id => {
      releases++
      release(id)
      // Browsers synchronously dispatch lostpointercapture here, and host
      // subscribers may destroy the editor or change the author document.
      if (retirement === 'destroy') controller.destroy()
      if (retirement === 'readOnly') {
        h.setReadOnly(true)
        controller.setReadOnly(true)
      }
      if (retirement === 'generation') h.setGeneration(h.runtime.generation + 1)
      if (retirement === 'modeRoundTrip') {
        h.setReadOnly(true)
        h.setReadOnly(false)
      }
      if (retirement === 'replacement') {
        const prior = h.view.element.bind(h.view)
        const replacement = new FakeEventTarget()
        h.view.element = id => id === 'A' ? replacement : prior(id)
      }
    }
    h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 }))
    assert.equal(releases, 1, retirement + ': pointer capture was never released')
    assert.deepEqual(h.moves, [],
      retirement + ': drag committed after its owner was retired synchronously during capture release')
    assert.equal(h.captured(), null, retirement + ': stale pointer still captured')
    await Promise.resolve()
    assert.deepEqual(h.focusCalls(), [], retirement + ': canceled drag stole focus')
    controller.destroy()
  }
})

test('DragController cannot reacquire click suppression or commit after a reentrant timer callback destroys it', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  let timers = 0
  h.document.defaultView.setTimeout = () => {
    timers++
    controller.destroy()
    return timers
  }
  h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 }))
  assert.equal(timers, 1)
  assert.deepEqual(h.moves, [],
    'destroying the editor during click-suppression setup still committed a block move')
  const click = pointerEvent(7, 55)
  h.handle.dispatch('click', click)
  assert.equal(click.prevented, false,
    'retired drag left an orphan click suppression listener on its old handle')
  assert.equal(h.captured(), null)
  await Promise.resolve()
  assert.deepEqual(h.focusCalls(), [])
  controller.destroy()
})

test('drag commit observer can destroy editor without post-commit presentation on detached DOM', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  let reconciled = 0, changedFocus = 0
  h.view.reconcileInteraction = () => {
    reconciled++
    throw new Error('destroyed view must not be reconciled')
  }
  h.view.setCurrent = () => {
    changedFocus++
    throw new Error('destroyed view must not be focused')
  }
  const move = h.runtime.move.bind(h.runtime)
  h.runtime.move = (id, to) => {
    move(id, to)
    controller.destroy()
  }
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  assert.doesNotThrow(
    () => h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 })),
    'canonical drag completion published an operation into an editor already destroyed by its commit',
  )
  assert.deepEqual(h.moves, [['A', 2]], 'reentrant teardown undid the completed drag')
  assert.equal(reconciled, 0)
  assert.equal(changedFocus, 0)
  await Promise.resolve()
  assert.deepEqual(h.focusCalls(), [])
})
test('pointerdown cannot create a new drag after old capture release destroys the controller', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  assert.equal(h.captured(), 7)
  const release = h.handle.releasePointerCapture.bind(h.handle)
  h.handle.releasePointerCapture = id => {
    release(id)
    controller.destroy()
  }

  h.handle.dispatch('pointerdown', pointerEvent(8, 5))
  assert.equal(h.captured(), null,
    'new pointerdown reacquired a pointer capture after synchronous controller destruction')
  assert.deepEqual(h.document.listeners.get('pointermove') ?? [], [],
    'retired pointerdown attached new listeners after controller teardown')
  h.document.dispatch('pointermove', pointerEvent(8, 55, { x: 10 }))
  h.document.dispatch('pointerup', pointerEvent(8, 55, { x: 10 }))
  assert.deepEqual(h.moves, [])
})

test('pointer capture callbacks cannot retain a canceled drag session', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  const capture = h.handle.setPointerCapture.bind(h.handle)
  h.handle.setPointerCapture = id => {
    capture(id)
    h.setReadOnly(true)
    controller.setReadOnly(true)
  }
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  assert.equal(h.captured(), null,
    'canceled drag kept browser pointer capture')
  assert.deepEqual(h.document.listeners.get('pointermove') ?? [], [],
    'a canceled pointer capture still installed document listeners')
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  assert.deepEqual(h.moves, [])
  controller.destroy()
})

test('drag activation cannot insert its spacer after a class callback destroys the editor', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  const source = h.view.element('A')
  const parent = source.parentNode
  const originalChildren = [...parent.children]
  const add = source.classList.add.bind(source.classList)
  source.classList.add = name => {
    add(name)
    if (name === 'oe-block--dragging') controller.destroy()
  }
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  assert.equal(h.captured(), null)
  assert.deepEqual(parent.children, originalChildren,
    'retired drag inserted a spacer after its owner had been destroyed')
  assert.equal(h.document.body.classList.contains('oe-editor-dragging'), false)
  assert.equal(source.classList.contains('oe-block--dragging'), false)
  assert.deepEqual(h.moves, [])
})
test('drag drop-gap insertion cannot leave a spacer after insertion callback destroys its owner', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  const parent = h.view.element('A').parentNode
  const before = [...parent.children]
  const insert = parent.insertBefore.bind(parent)
  let injected = 0
  parent.insertBefore = (node, next) => {
    insert(node, next)
    if (node.className === 'oe-block-drop-gap' && ++injected === 1) {
      controller.destroy()
    }
  }
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  assert.equal(injected, 1, 'host insertion callback was not exercised')
  assert.equal(h.captured(), null)
  assert.deepEqual(parent.children, before,
    'a spacer inserted by a callback outlived its destroyed drag owner')
  assert.equal(h.document.body.classList.contains('oe-editor-dragging'), false)
  assert.deepEqual(h.moves, [])
})

test('newer pointerdown during capture release supersedes an old pending drag commit', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  h.handle.dispatch('pointerdown', pointerEvent(7, 5))
  h.document.dispatch('pointermove', pointerEvent(7, 55, { x: 10 }))
  const release = h.handle.releasePointerCapture.bind(h.handle)
  let successor = 0
  h.handle.releasePointerCapture = id => {
    release(id)
    if (++successor === 1) h.handle.dispatch('pointerdown', pointerEvent(8, 5))
  }
  h.document.dispatch('pointerup', pointerEvent(7, 55, { x: 10 }))
  assert.equal(successor, 1, 'new pointer gesture was not acquired during capture release')
  assert.equal(h.captured(), 8,
    'retired drag released its newer successor pointer capture')
  assert.deepEqual(h.moves, [],
    'retired pointer session committed a block move after its successor was acquired')
  const click = pointerEvent(7, 55)
  h.handle.dispatch('click', click)
  assert.equal(click.prevented, false,
    'superseded pointer session installed stale click suppression')
  controller.destroy()
})
test('partial drag listener registration failure retires the pointer and all listeners', async () => {
  const { DragController } = await import('./DragController.js')
  const h = dragHarness()
  const controller = new DragController({
    runtime: h.runtime, view: h.view, handle: h.handle, threshold: 0,
  })
  const add = h.document.addEventListener.bind(h.document)
  h.document.addEventListener = (type, listener, options) => {
    add(type, listener, options)
    if (type === 'pointerup') throw new Error('synthetic pointer listener host failure')
  }
  assert.throws(
    () => h.handle.dispatch('pointerdown', pointerEvent(7, 5)),
    /synthetic pointer listener host failure/,
  )
  assert.equal(h.captured(), null,
    'partly installed document listeners kept a pointer capture after setup failed')
  for (const eventType of ['pointermove', 'pointerup', 'pointercancel']) {
    assert.deepEqual(h.document.listeners.get(eventType) ?? [], [],
      eventType + ' listener survived aborted pointer setup')
  }
  const after = pointerEvent(7, 55, { x: 10 })
  h.document.dispatch('pointermove', after)
  h.document.dispatch('pointerup', after)
  assert.deepEqual(h.moves, [])
  controller.destroy()
})
