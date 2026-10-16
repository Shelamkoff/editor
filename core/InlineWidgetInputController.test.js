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
  const selection={
    setCaret(...args) {writes.push(['caret',...args])},
    capture() {return {anchor:{blockId:'a',fieldKey:'text',offset:5},
      focus:{blockId:'a',fieldKey:'text',offset:5}}},
  }
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
    emit,field,foreign,widget,root,runtime,projection,registry,selection,controller,writes,diagnostics,
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

test('missing-range word deletion snapshots every editable widget when one occurrence opts in',()=>{
  const state=fixture()
  state.runtime.get=()=>({type:'paragraph'})
  state.projection.captureNativeField=()=>({
    blockId:'a',fieldKey:'text',fieldElement:state.field,
    occurrences:[{
      id:'mention-1',type:'mention',fieldKey:'text',element:state.widget,
      beforeText:'@Ada',data:{id:'ada',name:'Ada'},
      optedIn:true,instance:{},
    }],
  })
  const original={target:state.field,inputType:'deleteWordBackward',defaultPrevented:false,isTrusted:false}
  const snapshot=state.controller.captureNativeDeletion(
    {blockId:'a',fieldKey:'text',mode:'rich-text',element:state.field},
    original,state.root.ownerDocument.defaultView.getSelection())
  assert.equal(snapshot?.blockType,'paragraph')
  assert.equal(snapshot?.occurrences.length,1)
  assert.equal(snapshot?.originalEvent,original)
  assert.equal(snapshot?.trusted,false)
  assert.equal(snapshot?.fieldElement,state.field)
})

test('changed native label prepares one sidecar update and then delivers a retained notice',()=>{
  const state=fixture()
  const events=[]
  state.runtime.get=()=>({type:'paragraph'})
  const instance={}
  const occurrence={id:'mention-1',type:'mention',fieldKey:'text',element:state.widget,
    beforeText:'@Ada',data:{id:'ada',name:'Ada'},optedIn:true,instance}
  state.projection.captureNativeField=()=>({blockId:'a',fieldKey:'text',
    fieldElement:state.field,occurrences:[occurrence]})
  state.projection.isCurrentNativeOccurrence=()=>true
  state.projection.applyNativeInlineChanges=(...args)=>events.push(['apply',args[2]])
  state.projection.retireNativeInlineChanges=()=>events.push(['retire'])
  state.projection.notifyNativeInlineEdit=(blockId,id,notice)=>{
    events.push(['notice',blockId,id,notice.labelChanged,notice.text])
  }
  state.runtime.observeExtension=fn=>fn()
  state.runtime.reconcileNativeInlineInput=(snapshot,prepare)=>{
    const actions=state.runtime.prepareExtensionValue(prepare)
    assert.equal(actions.length,1)
    snapshot.applyChanges(actions)
    snapshot.settle(actions,'committed')
    return {status:'committed'}
  }
  state.registry.getInlineDefinition=()=>({editing:{
    handle:()=>null,
    reconcileNative(input,data){
      assert.equal(state.runtime.preparing,true)
      assert.equal(input.beforeText,'@Ada')
      assert.equal(input.text,'@Ad')
      return {kind:'update',data:{...data,name:'Ad'}}
    },
  }})
  const event={target:state.field,inputType:'deleteWordBackward',defaultPrevented:false,isTrusted:false}
  const snapshot=state.controller.captureNativeDeletion(
    {blockId:'a',fieldKey:'text',mode:'rich-text',element:state.field},
    event,state.root.ownerDocument.defaultView.getSelection())
  assert.ok(snapshot)
  state.widget.textContent='@Ad'
  const result=state.controller.completeNativeDeletion(snapshot,{target:state.field})
  assert.equal(result.status,'committed')
  assert.deepEqual(events.map(row=>row[0]),['apply','retire','notice'])
  assert.equal(events[0][1][0].action.data.name,'Ad')
  assert.deepEqual(state.diagnostics,[])
})

test('native reconciliation refuses label drift in a surviving non-opted widget',()=>{
  const state=fixture()
  state.runtime.get=()=>({type:'paragraph'})
  const snapshot={
    blockId:'a',fieldKey:'text',blockType:'paragraph',fieldElement:state.field,
    generation:state.runtime.generation,revision:state.runtime.revision,
    occurrences:[{id:'plain-1',type:'plain',fieldKey:'text',element:state.widget,
      beforeText:'@Ada',data:{id:'ada'},optedIn:false,instance:{}}],
    selectionBefore:null,applyChanges(){},
  }
  state.projection.isCurrentNativeOccurrence=()=>true
  state.runtime.reconcileNativeInlineInput=(_capture,prepare)=>
    state.runtime.prepareExtensionValue(prepare)
  state.widget.textContent='@Ad'
  assert.throws(()=>state.controller.completeNativeDeletion(snapshot,{}),/Non-opted inline/)
  assert.equal(state.diagnostics.length,1)
})
