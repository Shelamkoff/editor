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
    setTimeout(fn){ fn(); return 1 },
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
  const moves=[]
  const runtime={
    get readOnly(){return readOnly},
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
  const view={
    currentId:'A',
    element:id=>elements.get(id)??null,
    reconcileInteraction(){},
    setCurrent(id){this.currentId=id},
    focus(){return true},
  }
  return {
    document,handle,runtime,view,moves,
    ids:()=>[...ids],
    setRevision:value=>{revision=value},
    setGeneration:value=>{generation=value},
    setReadOnly:value=>{readOnly=value},
    captured:()=>captured,
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
