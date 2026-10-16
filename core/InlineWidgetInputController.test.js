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

test('native sidecar cache is finalized only after the normalized canonical record is assembled',()=>{
  const state=fixture()
  state.runtime.get=()=>({type:'paragraph'})
  const calls=[]
  const instance={}
  const source={id:'mention-1',type:'mention',fieldKey:'text',element:state.widget,
    beforeText:'@Ada',data:{id:'ada',name:'Ada'},optedIn:true,instance}
  state.projection.captureNativeField=()=>({blockId:'a',fieldKey:'text',
    fieldElement:state.field,occurrences:[source]})
  state.projection.isCurrentNativeOccurrence=()=>true
  state.projection.applyNativeInlineChanges=()=>calls.push('DOM')
  state.projection.finalizeNativeInlineUpdates=(blockId,fieldKey,changes,inline)=>{
    calls.push(['finalize',inline['mention-1'].data.name,changes.length])
  }
  state.projection.retireNativeInlineChanges=()=>calls.push('retire')
  state.projection.notifyNativeInlineEdit=()=>true
  state.runtime.observeExtension=fn=>fn()
  state.runtime.reconcileNativeInlineInput=(snapshot,prepare)=>{
    const changes=state.runtime.prepareExtensionValue(prepare)
    snapshot.applyChanges(changes)
    snapshot.finalizeChanges(changes,{'mention-1':{
      type:'mention',dataVersion:1,data:{id:'ada',name:'Ada'},
    }})
    snapshot.settle(changes,'unchanged')
    return {status:'unchanged'}
  }
  state.registry.getInlineDefinition=()=>({editing:{
    reconcileNative:()=>({kind:'update',data:{id:'ada',name:'  Ada '}}),
  }})
  const event={target:state.field,inputType:'deleteWordBackward',defaultPrevented:false,isTrusted:false}
  const snapshot=state.controller.captureNativeDeletion({
    blockId:'a',fieldKey:'text',mode:'rich-text',element:state.field,
  },event,state.root.ownerDocument.defaultView.getSelection())
  state.widget.textContent='@Ad'
  const settled=state.controller.completeNativeDeletion(snapshot,{target:state.field})
  assert.deepEqual(settled.status,'unchanged')
  assert.deepEqual(calls,['DOM',['finalize','Ada',1],'retire'])
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

test('failed native reconciliation restores the same Mention occurrence and label-local selection',()=>{
  const state=fixture()
  const applied=[]
  state.runtime.get=()=>({type:'paragraph',inline:{'mention-1':{type:'mention'}}})
  state.runtime.observeExtension=fn=>fn()
  state.widget.firstChild={
    nodeType:3,textContent:'@Ada',length:4,
    parentElement:{focus(){applied.push('focus')}},
  }
  state.projection.captureNativeField=()=>({
    occurrences:[{id:'mention-1',type:'mention',element:state.widget}],
  })
  state.root.ownerDocument.defaultView.getSelection=()=>({
    setBaseAndExtent(node,a,other,b){applied.push([node,a,other,b])},
  })
  state.runtime.reconcileNativeInlineInput=()=>{
    throw new Error('Native payload update failed')
  }
  const snapshot={
    blockId:'a',fieldKey:'text',blockType:'paragraph',
    fieldElement:state.field,generation:1,revision:2,
    occurrences:[{id:'mention-1',type:'mention'}],
    beforeLabelSelection:{
      anchor:{id:'mention-1',offset:2},
      focus:{id:'mention-1',offset:3},
    },
  }
  assert.throws(()=>state.controller.completeNativeDeletion(snapshot,{}),/Native payload update failed/)
  assert.equal(applied[0],'focus')
  assert.deepEqual(applied[1],[state.widget.firstChild,2,state.widget.firstChild,3])
  assert.equal(state.diagnostics.length,1)
})

test('failure recovery never redirects a revoked or mixed-field snapshot into a label',()=>{
  const state=fixture()
  let focused=0
  state.runtime.get=()=>({type:'paragraph',inline:{'mention-1':{type:'mention'}}})
  state.projection.captureNativeField=()=>{
    focused++
    return {occurrences:[{id:'mention-1',type:'mention',element:state.widget}]}
  }
  state.runtime.reconcileNativeInlineInput=()=>{
    state.runtime.revision++
    throw new Error('Recover failed')
  }
  const snapshot={
    blockId:'a',fieldKey:'text',blockType:'paragraph',
    fieldElement:state.field,generation:1,revision:2,
    occurrences:[{id:'mention-1',type:'mention'}],
    beforeLabelSelection:{anchor:{id:'mention-1',offset:1},focus:{id:'mention-1',offset:3}},
  }
  assert.throws(()=>state.controller.completeNativeDeletion(snapshot,{}),/Recover failed/)
  assert.equal(focused,0)
  assert.equal(state.diagnostics.length,1)
})

test('native capture rejects a noncollapsed selection whose focus belongs to another field',()=>{
  const state=fixture()
  state.runtime.get=()=>({type:'paragraph'})
  state.projection.captureNativeField=()=>({blockId:'a',fieldKey:'text',
    fieldElement:state.field,
    occurrences:[{id:'mention-1',type:'mention',element:state.widget,
      optedIn:true,beforeText:'@Ada',data:{id:'ada',name:'Ada'},instance:{}}]})
  const native={
    anchorNode:state.widget.firstChild,
    focusNode:{nodeType:3,textContent:'Unrelated'},
    isCollapsed:false,rangeCount:1,
    getRangeAt:()=>({startContainer:state.widget.firstChild,startOffset:0,
      endContainer:state.widget.firstChild,endOffset:4}),
  }
  const input={target:state.field,inputType:'deleteWordBackward',
    defaultPrevented:false,isTrusted:false,getTargetRanges:()=>[]}
  assert.equal(state.controller.captureNativeDeletion({
    blockId:'a',fieldKey:'text',mode:'rich-text',element:state.field,
  },input,native),null)
})

test('crossing a non-opted widget does not borrow an unrelated opted-in occurrence',()=>{
  const state=fixture()
  state.runtime.get=()=>({type:'paragraph'})
  const notOpted={isConnected:true,isContentEditable:true}
  const outside={nodeType:3,textContent:'Before'}
  const inside={nodeType:3,textContent:'Label'}
  notOpted.contains=node=>node===notOpted||node===inside
  state.field.contains=node=>node===state.field||node===outside
    ||node===inside||node===notOpted||node===state.widget
    ||node===state.widget.firstChild
  state.projection.captureNativeField=()=>({blockId:'a',fieldKey:'text',
    fieldElement:state.field,
    occurrences:[
      {id:'other',type:'mention',element:state.widget,optedIn:true,
        beforeText:'@Ada',data:{id:'ada',name:'Ada'},instance:{}},
      {id:'locked',type:'plain',element:notOpted,optedIn:false,
        beforeText:'Label',data:{},instance:{}},
    ]})
  state.field.ownerDocument={
    createRange(){return {
      setStart(node,offset){this.startContainer=node;this.startOffset=offset},
      setEnd(node,offset){this.endContainer=node;this.endOffset=offset},
      intersectsNode(node){return node===notOpted},
    }}
  }
  const input={target:state.field,inputType:'deleteWordBackward',
    defaultPrevented:false,isTrusted:false,
    getTargetRanges:()=>[{
      startContainer:outside,startOffset:0,endContainer:inside,endOffset:2,
    }]}
  assert.equal(state.controller.captureNativeDeletion({
    blockId:'a',fieldKey:'text',mode:'rich-text',element:state.field,
  },input,{isCollapsed:false,anchorNode:outside,focusNode:inside,rangeCount:1}),null)
})
