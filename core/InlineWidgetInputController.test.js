import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineWidgetInputController } from './InlineWidgetInputController.js'

function fixture(handle = () => null) {
  const events = {}
  const writes = []
  const diagnostics = []
  const scheduled = []
  const field = {
    isConnected: true,
    contentEditable: 'true',
    contains(node) { return node === this || node === widget || node === label },
    closest(selector) { return selector === '[contenteditable="true"]' ? this : null },
  }
  const label = { nodeType: 3, textContent:'@Ada', parentElement: null }
  const widget = {
    isConnected: true, isContentEditable: true,
    textContent:'@Ada', firstChild:label,
    contains(node) { return node === this || node === label },
  }
  label.parentElement = widget
  const foreign = {closest(selector) {return selector === '[contenteditable="true"]' ? this : null}}
  const root = {
    ownerDocument: { defaultView: {
      AbortController,
      getSelection() { return {isCollapsed:true,anchorNode:label,anchorOffset:3} },
    } },
    addEventListener(type, fn) { events[type] = fn },
    contains(node) { return node === field || field.contains(node) || node === foreign },
  }
  const runtime = {
    readOnly:false, generation:1, revision:2, health:'ready',
    preparing:false,
    canAccessFormattingSelection() { return !this.readOnly },
    prepareExtensionValue(fn) {
      this.preparing=true
      try{return fn()}finally{this.preparing=false}
    },
    interact(_name, producer) { producer();this.revision++;return true },
    updateInlineWidget(blockId,id,producer) { writes.push(['update',blockId,id,producer()]) },
    removeInlineWidget(blockId,id) { writes.push(['remove',blockId,id]) },
    replaceInlineWidgetWithText(blockId,id,text) { writes.push(['plain',blockId,id,text]) },
  }
  let invokes=0
  const registry={getInlineDefinition:()=>({editing:{handle(input,data) {invokes++;return handle(input,data,runtime)}}})}
  const projection={
    resolveWidgetInputTarget:()=>({
      blockId:'a',fieldKey:'text',inlineId:'mention-1',type:'mention',
      element:widget,data:{id:'ada',name:'Ada'},position:'inside',offset:3,logicalOffset:5,
    }),
    resolveWidgetElement:node=>node===widget?widget:null,
  }
  const reconciler={getEditableField:()=>({key:'text',mode:'rich-text',element:field})}
  const selection={setCaret(...args) {writes.push(['caret',...args])}}
  const controller=new InlineWidgetInputController({
    root,runtime,registry,reconciler,projection,selection,
    diagnostics:{emit:(code,metadata)=>diagnostics.push([code,metadata]),
      errorName:error=>error?.name||'UnknownError'},
  })
  const emit=(target=field,options={})=>{
    let canceled=false,stopped=false
    const event={
      target,inputType:'deleteContentBackward',isComposing:false,
      cancelable:true,defaultPrevented:false,data:null,
      preventDefault(){this.defaultPrevented=true;canceled=true},
      stopImmediatePropagation(){stopped=true},
      getTargetRanges:()=>[],
      ...options,
    }
    events.beforeinput(event)
    return {event,get canceled(){return canceled},get stopped(){return stopped}}
  }
  return {
    emit,field,foreign,widget,root,runtime,projection,controller,writes,diagnostics,
    get invokes(){return invokes},
  }
}

test('a proven-owned edit runs under the shared preparation guard and commits once',()=>{
  const state=fixture((input,data,runtime)=>{
    assert.equal(runtime.preparing,true)
    assert.equal(input.offset,3)
    assert.deepEqual(data,{id:'ada',name:'Ada'})
    return {kind:'update',data:{id:'ada',name:'Aa'},caret:2}
  })
  const own=state.emit()
  assert.equal(own.canceled,true)
  assert.equal(own.stopped,true)
  assert.deepEqual(state.writes[0],['update','a','mention-1',{id:'ada',name:'Aa'}])
  assert.equal(state.invokes,1)
  assert.equal(state.runtime.revision,3)
  assert.deepEqual(state.diagnostics,[])
})

test('null is a true pass and keeps native event untouched',()=>{
  const state=fixture(()=>null)
  const own=state.emit()
  assert.equal(own.canceled,false)
  assert.equal(own.stopped,false)
  assert.equal(state.writes.length,0)
  assert.equal(state.runtime.revision,2)
  assert.equal(state.invokes,1)
})

test('a foreign field with retained Mention selection cannot invoke the capability',()=>{
  const state=fixture(()=>{throw new Error('must not run')})
  const own=state.emit(state.foreign)
  assert.equal(own.canceled,false)
  assert.equal(state.invokes,0)
  assert.deepEqual(state.writes,[])
})

test('a widget-targeted controlled event is recognized as belonging to that occurrence',()=>{
  const state=fixture(()=>({kind:'remove',caret:0}))
  const own=state.emit(state.widget)
  assert.equal(own.canceled,true)
  assert.deepEqual(state.writes[0],['remove','a','mention-1'])
})

test('a rejected or invalid owned action is canceled and reported without model changes',()=>{
  const cases=[
    ()=>({kind:'foreign'}),
    ()=>({kind:'update',data:null}),
    ()=>Promise.resolve({kind:'remove'}),
    ()=>{throw new Error('extension error')},
  ]
  for(const decide of cases){
    const state=fixture(decide)
    const own=state.emit()
    assert.equal(own.canceled,true)
    assert.equal(own.stopped,true)
    assert.equal(state.writes.length,0)
    assert.equal(state.diagnostics.length,1)
    assert.equal(state.diagnostics[0][0],'command.failed')
  }
})

test('noncancelable and composing beforeinput do not invoke an extension producer',()=>{
  const state=fixture(()=>({kind:'remove'}))
  assert.equal(state.emit(state.field,{cancelable:false}).canceled,false)
  assert.equal(state.emit(state.field,{isComposing:true}).canceled,false)
  assert.equal(state.invokes,0)
})

test('missing-range word deletion passes when the definition declines to guess a boundary',()=>{
  const state=fixture(()=>null)
  const event=state.emit(state.field,{inputType:'deleteWordBackward'})
  assert.equal(event.canceled,false)
  assert.equal(state.invokes,1)
  assert.deepEqual(state.writes,[])
})

test('a browser deletion crossing a widget boundary skips immediate editing',()=>{
  const state=fixture(()=>{throw new Error('unexpected handle')})
  const own=state.emit(state.field,{
    getTargetRanges:()=>[{
      startContainer:state.field,startOffset:0,
      endContainer:state.widget.firstChild,endOffset:2,
    }],
  })
  assert.equal(own.canceled,false)
  assert.equal(state.invokes,0)
  assert.deepEqual(state.writes,[])
})

test('read-only or invalid runtime phases refuse the event before calling handle',()=>{
  const state=fixture(()=>({kind:'remove'}))
  state.runtime.readOnly=true
  assert.equal(state.emit().canceled,false)
  state.runtime.readOnly=false
  state.runtime.canAccessFormattingSelection=()=>false
  assert.equal(state.emit().canceled,false)
  assert.equal(state.invokes,0)
})
