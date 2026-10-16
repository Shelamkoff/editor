import test from 'node:test'
import assert from 'node:assert/strict'

import { NativeInputController } from './NativeInputController.js'

function harness(options = {}) {
  const calls = []
  let now = 0
  const field = {
    parentNode: null,
    contains(node) {
      for(let cursor=node;cursor;cursor=cursor.parentNode)if(cursor===this)return true
      return false
    },
  }
  const child = { parentNode: field }
  const reconciler = {
    resolveEditableTarget(target) {
      for (let node = target; node; node = node.parentNode) {
        if (node === field) return {
          blockId: 'b1',
          fieldKey: 'text',
          element: field,
          mode: 'rich-text',
        }
      }
      return null
    },
    getEditableField(id,key) {
      return id === 'b1' && key === 'text' ? {element:field,mode:'rich-text'} : null
    },
  }
  const runtime = {
    readOnly: false,
    undo() { calls.push({ history: 'undo' }); return true },
    redo() { calls.push({ history: 'redo' }); return true },
    syncBlockFromProjection(id, operation, metadata) {
      operation()
      calls.push({ id, metadata })
    },
  }
  const root = {
    ownerDocument: { defaultView: { AbortController, performance: { now: () => now } } },
    addEventListener() {},
  }
  const controller = new NativeInputController({
    root,
    runtime,
    reconciler,
    crossSelection: options.crossSelection ?? null,
    projection: options.projection ?? null,
    inlineWidgetInput: options.inlineWidgetInput ?? null,
    coalesceMs: options.coalesceMs ?? 300,
  })
  return {
    calls,
    field,
    child,
    runtime,
    controller,
    advance(ms) { now += ms },
  }
}

test('beforeinput replaces an active cross-block selection atomically', () => {
  const replacements = []
  const crossSelection = {
    active: true,
    replace(replacement) {
      replacements.push(replacement)
      return true
    },
  }
  const { calls, child, controller } = harness({ crossSelection })
  let prevented = 0
  let stopped = 0

  controller.handleBeforeInput({
    target: child,
    inputType: 'insertText',
    data: 'X',
    isComposing: false,
    preventDefault() { prevented++ },
    stopImmediatePropagation() { stopped++ },
  })

  assert.deepEqual(replacements, [{ kind: 'text', text: 'X' }])
  assert.equal(prevented, 1)
  assert.equal(stopped, 1)
  assert.equal(calls.length, 0)
})

test('beforeinput historyUndo/historyRedo route only for registered document fields', () => {
  const { calls, child, controller } = harness()
  for (const [inputType, expected] of [['historyUndo', 'undo'], ['historyRedo', 'redo']]) {
    let prevented = false
    controller.handleBeforeInput({
      target: child,
      inputType,
      isComposing: false,
      preventDefault() { prevented = true },
    })
    assert.equal(prevented, true)
    assert.equal(calls.at(-1).history, expected)
  }

  const count = calls.length
  let outsidePrevented = false
  controller.handleBeforeInput({
    target: { parentNode: null },
    inputType: 'historyUndo',
    isComposing: false,
    preventDefault() { outsidePrevented = true },
  })
  assert.equal(outsidePrevented, false)
  assert.equal(calls.length, count)
})

test('ordinary beforeinput does not consume a collapsed single-field edit', () => {
  const crossSelection = {
    active: false,
    replace() { throw new Error('inactive cross selection must not replace input') },
  }
  const { child, controller } = harness({ crossSelection })
  let prevented = false

  controller.handleBeforeInput({
    target: child,
    inputType: 'insertText',
    data: 'X',
    isComposing: false,
    preventDefault() { prevented = true },
  })

  assert.equal(prevented, false)
})

test('keyless beforeinput deletion consumes the entire active document range', () => {
  for (const inputType of ['deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward']) {
    const replacements = []
    const { child, controller, calls } = harness({ crossSelection: {
      active: true,
      replace(value) { replacements.push(value); return true },
    } })
    let prevented = false
    controller.handleBeforeInput({ target: child, inputType,
      preventDefault() { prevented = true }, stopImmediatePropagation() {},
    })
    assert.equal(prevented, true, inputType)
    assert.deepEqual(replacements, [{ kind: 'text', text: '' }])
    assert.deepEqual(calls, [])
    controller.destroy()
  }
})

test('auxiliary beforeinput retains native ownership while a cross-block range is active', () => {
  const replacements = []
  const { calls, controller } = harness({ crossSelection: {
    active: true,
    replace(value) { replacements.push(value) },
  } })
  let prevented = false
  let stopped = false
  controller.handleBeforeInput({
    target: { parentNode: null }, inputType: 'insertText', data: '24',
    preventDefault() { prevented = true },
    stopImmediatePropagation() { stopped = true },
  })
  assert.deepEqual(replacements, [])
  assert.deepEqual(calls, [])
  assert.equal(prevented, false)
  assert.equal(stopped, false)
})

test('plain text input keeps the browser-owned source projection in place', () => {
  const { calls, child, controller } = harness()
  controller.handleBeforeInput({
    target: child,
    inputType: 'insertText',
    isComposing: false,
  })
  controller.handleInput({
    target: child,
    inputType: 'insertText',
    isComposing: false,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    id: 'b1',
    metadata: {
      origin: 'native-input',
      name: 'native-input',
      historyGroup: 'native:b1:text:1',
      coalesce: true,
      preserveSourceProjection: true,
    },
  })
})

test('typing coalesces only inside the configured history window', () => {
  const { calls, child, controller, advance } = harness({ coalesceMs: 300 })

  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  advance(299)
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  advance(301)
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })

  assert.equal(calls[0].metadata.historyGroup, 'native:b1:text:1')
  assert.equal(calls[1].metadata.historyGroup, 'native:b1:text:1')
  assert.equal(calls[2].metadata.historyGroup, 'native:b1:text:2')
})

test('paste and drop never trust the mutated source projection', () => {
  for (const inputType of ['insertFromPaste', 'insertFromDrop']) {
    const { calls, child, controller } = harness()
    controller.handleInput({ target: child, inputType, isComposing: false })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].metadata.preserveSourceProjection, false)
  }
})

test('input without beforeinput still synchronizes the owning field', () => {
  const { calls, child, controller } = harness()
  controller.handleInput({
    target: child,
    inputType: 'deleteContentBackward',
    isComposing: false,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].metadata.preserveSourceProjection, true)
})

test('IME composition commits once after compositionend', async () => {
  const { calls, child, controller } = harness()
  controller.handleCompositionStart({ target: child })
  controller.handleInput({ target: child, inputType: 'insertCompositionText', isComposing: true })
  controller.handleInput({ target: child, inputType: 'insertCompositionText', isComposing: true })
  assert.equal(calls.length, 0)

  controller.handleCompositionEnd({ target: child })
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  await Promise.resolve()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].metadata.historyGroup, 'native:b1:text:composition:1')
  assert.equal(calls[0].metadata.preserveSourceProjection, true)
})

test('events outside registered editable fields are ignored', () => {
  const { calls, controller } = harness()
  controller.handleInput({
    target: { parentNode: null },
    inputType: 'insertText',
    isComposing: false,
  })
  assert.equal(calls.length, 0)
})

test('composition completion is revoked by a read-only epoch', async () => {
  const { calls, child, controller, runtime } = harness()
  controller.handleCompositionStart({ target: child })
  controller.handleCompositionEnd({ target: child, data: '日本' })
  runtime.readOnly = true
  controller.setReadOnly(true)
  runtime.readOnly = false
  controller.setReadOnly(false)
  await Promise.resolve()
  controller.handleCompositionEnd({ target: child, data: 'stale' })
  await Promise.resolve()
  assert.deepEqual(calls, [])
})

test('composition completion cannot commit after the document revision changes', async () => {
  const { calls, child, controller, runtime } = harness()
  runtime.revision = 0
  controller.handleCompositionStart({ target: child })
  controller.handleCompositionEnd({ target: child, data: '日本' })
  runtime.revision = 1
  await Promise.resolve()
  assert.deepEqual(calls, [])
})

test('auxiliary IME keys do not prepare a retained document selection', () => {
  const { controller } = harness({ crossSelection: {
    active: true,
    beginComposition() { throw new Error('auxiliary input cannot consume the document range') },
  } })
  controller.handleCompositionKey({ target: { parentNode: null }, keyCode: 229 })
})

test('read-only runtime ignores native input', () => {
  const { calls, child, runtime, controller } = harness()
  runtime.readOnly = true
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  assert.equal(calls.length, 0)
})

test('matching native inline input settles once and never enters ordinary field serialization',()=>{
  const handled=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){
      return {blockId:owner.blockId,fieldKey:owner.fieldKey,
        eventHost:owner.element,inputType:event.inputType,
        trusted:false,originalEvent:event,
        generation:1,revision:2}
    },
    completeNativeDeletion(snapshot,event){handled.push(['settled',snapshot.inputType,event.inputType])},
    discardStaleNativeDeletion(){handled.push(['stale'])},
  }
  const {controller,runtime,field,child,calls}=harness({inlineWidgetInput})
  runtime.generation=1
  runtime.revision=2
  const event={target:child,inputType:'deleteWordBackward',isComposing:false,defaultPrevented:false}
  controller.handleBeforeInput(event)
  controller.handleInput({target:field,inputType:'deleteWordBackward',isTrusted:false})
  assert.deepEqual(handled,[['settled','deleteWordBackward','deleteWordBackward']])
  assert.deepEqual(calls,[])
})

test('read-only retirement keeps a matching inline input inert instead of using generic persistence',()=>{
  const results=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){
      return {blockId:owner.blockId,fieldKey:owner.fieldKey,
        eventHost:owner.element,inputType:event.inputType,
        trusted:false,originalEvent:event,generation:1,revision:2}
    },
    completeNativeDeletion(){results.push('settled')},
    discardStaleNativeDeletion(){results.push('stale')},
  }
  const {controller,runtime,field,child,calls}=harness({inlineWidgetInput})
  runtime.generation=1
  runtime.revision=2
  controller.handleBeforeInput({target:child,inputType:'deleteWordBackward',defaultPrevented:false})
  runtime.readOnly=true
  controller.setReadOnly(true,()=>{})
  runtime.readOnly=false
  controller.handleInput({target:field,inputType:'deleteWordBackward',isTrusted:false})
  assert.deepEqual(results,['stale'])
  assert.deepEqual(calls,[])
})

test('native input from a different field retires an inline envelope and uses its ordinary route',()=>{
  const events=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){return {
      blockId:owner.blockId,fieldKey:owner.fieldKey,eventHost:owner.element,
      inputType:event.inputType,trusted:false,originalEvent:event}},
    completeNativeDeletion(){events.push('settled')},
  }
  const {controller,runtime,child,calls}=harness({inlineWidgetInput})
  controller.handleBeforeInput({target:child,inputType:'deleteWordBackward',defaultPrevented:false})
  // Different type cannot complete the earlier inline branch.
  controller.handleInput({target:child,inputType:'insertText',isTrusted:false})
  assert.deepEqual(events,[])
  assert.equal(calls.length,1)
})

test('late preventDefault cancels inline settlement without reserializing its projection',()=>{
  const handled=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){return {
      blockId:owner.blockId,fieldKey:owner.fieldKey,eventHost:owner.element,
      inputType:event.inputType,trusted:false,originalEvent:event}},
    completeNativeDeletion(){handled.push('settled')},
    discardStaleNativeDeletion(){handled.push('stale')},
  }
  const {controller,field,child,calls}=harness({inlineWidgetInput})
  const event={target:child,inputType:'deleteContentBackward',defaultPrevented:false}
  controller.handleBeforeInput(event)
  event.defaultPrevented=true
  controller.handleInput({target:field,inputType:'deleteContentBackward',isTrusted:false})
  assert.deepEqual(handled,['stale'])
  assert.deepEqual(calls,[])
})

test('composition takeover invalidates the inline envelope while consuming its late input',()=>{
  const events=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){
      return {blockId:owner.blockId,fieldKey:owner.fieldKey,
        eventHost:owner.element,inputType:event.inputType,
        trusted:false,originalEvent:event,generation:1,revision:2}
    },
    completeNativeDeletion(){events.push('settled')},
    discardStaleNativeDeletion(){events.push('stale')},
  }
  const {controller,runtime,field,child,calls}=harness({inlineWidgetInput})
  runtime.generation=1
  runtime.revision=2
  controller.handleBeforeInput({target:child,inputType:'deleteWordBackward',defaultPrevented:false})
  controller.handleCompositionStart({target:child,isComposing:true,data:''})
  controller.handleInput({target:field,inputType:'deleteWordBackward',isTrusted:false})
  assert.deepEqual(events,['stale'])
  assert.equal(calls.length,0)
})

test('a nonmatching inline event retires its envelope rather than borrowing its authority',()=>{
  const events=[]
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){
      return {blockId:owner.blockId,fieldKey:owner.fieldKey,
        eventHost:owner.element,inputType:event.inputType,
        trusted:true,originalEvent:event,generation:1,revision:2}
    },
    completeNativeDeletion(){events.push('settled')},
  }
  const {controller,runtime,child,calls}=harness({inlineWidgetInput})
  runtime.generation=1
  runtime.revision=2
  controller.handleBeforeInput({target:child,inputType:'deleteWordBackward',
    isTrusted:true,defaultPrevented:false})
  controller.handleInput({target:child,inputType:'deleteWordBackward',isTrusted:false})
  assert.deepEqual(events,[])
  assert.equal(calls.length,1)
})

test('a widget-targeted native word deletion is resolved to its registered owning field',()=>{
  const handled=[]
  const widget={
    parentNode:null,isConnected:true,isContentEditable:true,
    closest(selector){return selector.includes('[data-inline-plugin]')?this:null},
  }
  const projection={resolveWidgetElement:node=>node===widget?widget:null}
  const inlineWidgetInput={
    captureNativeDeletion(owner,event){
      handled.push(['capture',owner.blockId,owner.fieldKey])
      return {
        blockId:owner.blockId,fieldKey:owner.fieldKey,eventHost:owner.element,
        inputType:event.inputType,trusted:false,originalEvent:event,
        generation:1,revision:2,
      }
    },
    completeNativeDeletion(){handled.push(['settle']);return{status:'committed',inside:true}},
    markNativeInputEvent(_event,result){handled.push(['route',result.status,result.inside])},
  }
  const {controller,field,runtime,calls}=harness({projection,inlineWidgetInput})
  widget.parentNode=field
  runtime.generation=1
  runtime.revision=2
  controller.handleBeforeInput({
    target:widget,inputType:'deleteWordBackward',
    defaultPrevented:false,isTrusted:false,
  })
  controller.handleInput({
    target:widget,inputType:'deleteWordBackward',isTrusted:false,
  })
  assert.deepEqual(handled,[
    ['capture','b1','text'],['settle'],['route','committed',true],
  ])
  assert.deepEqual(calls,[])
})

test('an auxiliary button inside a registered widget cannot start a native label deletion',()=>{
  const events=[]
  const widget={parentNode:null,isConnected:true,isContentEditable:true}
  const button={
    parentNode:widget,
    closest(selector){return selector.includes('button')?this:null},
  }
  const projection={resolveWidgetElement:node=>node===button?widget:null}
  const inlineWidgetInput={captureNativeDeletion(){events.push('captured');return {}}}
  const {controller,field,calls}=harness({projection,inlineWidgetInput})
  widget.parentNode=field
  const event={
    target:button,inputType:'deleteWordBackward',
    defaultPrevented:false,preventDefault(){this.defaultPrevented=true},
  }
  controller.handleBeforeInput(event)
  assert.deepEqual(events,[])
  assert.equal(event.defaultPrevented,false)
  assert.deepEqual(calls,[])
})
