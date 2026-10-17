import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineTriggerController } from './InlineTriggerController.js'

function harness() {
  const events = new Map()
  let readOnly = true
  let captures = 0
  let inputRoutes = 0
  const root = {
    ownerDocument: {
      defaultView: { AbortController },
      addEventListener() {},
    },
    addEventListener(type, listener) {
      const current = events.get(type) ?? []
      current.push(listener)
      events.set(type, current)
    },
  }
  const controller = new InlineTriggerController({
    root,
    registry: { inlineTypes: [] },
    reconciler: { resolveEditableTarget: () => null },
    selection: { capture() { captures++; return null } },
    commands: {},
    isComposing: () => false,
    isReadOnly: () => readOnly,
    nativeInputRoute() { inputRoutes++; return null },
  })
  return {
    controller,
    captures: () => captures,
    inputRoutes: () => inputRoutes,
    input: () => {
      for (const listener of events.get('input') ?? []) {
        listener({ target: {}, isComposing: false })
      }
    },
    setReadOnly(value) { readOnly = value; controller.setReadOnly(value) },
  }
}

test('deferred inline trigger refresh and input never reactivate after read-only or destruction', () => {
  const h = harness()
  // This is also the initial read-only case, before an external transition.
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 0)
  assert.equal(h.inputRoutes(), 0)

  h.setReadOnly(false)
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'editable refresh should remain available')
  assert.equal(h.inputRoutes(), 1, 'editable input routing should remain available')

  h.setReadOnly(true)
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'read-only refresh probed stale selection')
  assert.equal(h.inputRoutes(), 1, 'read-only input entered trigger dispatch')

  h.setReadOnly(false)
  h.controller.destroy()
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'destroyed refresh probed stale selection')
  assert.equal(h.inputRoutes(), 1, 'destroyed input entered trigger dispatch')
})

function triggerScenario(query,keydown,commitTrigger=()=>false) {
  const events=new Map(),calls=[],errors=[]
  let readOnly=false
  const label={nodeType:3,textContent:'@'}
  const field={
    isConnected:true,textContent:'@',
    contains(node){return node===label},
  }
  const document={
    defaultView:{AbortController,getSelection(){return {focusNode:label,focusOffset:1}}},
    createRange(){return {
      selectNodeContents(){},setEnd(){},toString(){return '@'},
    }},
    addEventListener(){},
  }
  const root={
    ownerDocument:document,
    contains(node){return node===field},
    addEventListener(type,listener){events.set(type,listener)},
  }
  const runtime={
    onTriggerQuery(session){calls.push('query');return query?.(session)},
    onTriggerKeydown(event,session){calls.push('keydown');return keydown?.(event,session)},
    onTriggerCancel(){calls.push('cancel')},
  }
  const point={blockId:'a',fieldKey:'text',offset:1}
  const controller=new InlineTriggerController({
    root,
    registry:{
      inlineTypes:['probe'],
      getInlineDefinition(){return {trigger:'@'}},
      getInlineRuntime(){return runtime},
    },
    reconciler:{
      getEditableField(){return {mode:'rich-text',element:field}},
      resolveEditableTarget(){return {mode:'rich-text',element:field,blockId:'a',fieldKey:'text'}},
    },
    selection:{capture(){return {anchor:point,focus:{...point}}}},
    commands:{commitTrigger},
    isReadOnly:()=>readOnly,
    reportError(error){errors.push(error)},
  })
  const press=(key='Enter')=>{
    let prevented=false,stopped=false
    events.get('keydown')({
      key,target:field,
      preventDefault(){prevented=true},
      stopPropagation(){stopped=true},
    })
    return {prevented,stopped}
  }
  return {
    controller,calls,errors,press,events,
    setReadOnly(value){
      readOnly=value
      controller.setReadOnly(value)
    },
  }
}

for (const [name,decision] of [
  ['throw',()=>{throw new Error('Trigger keydown failed')}],
  ['invalid',()=>({unexpected:true})],
]) {
  test('invalid inline trigger '+name+' consumes the owned key and retires exactly one query',()=>{
    const h=triggerScenario(null,decision)
    assert.equal(h.controller.refresh(),true)
    assert.equal(h.controller.isActive,true)
    const event=h.press()
    assert.deepEqual(event,{prevented:true,stopped:true},
      'failed trigger was allowed to reach ordinary Enter editing')
    assert.equal(h.controller.isActive,false)
    assert.equal(h.calls.filter(call=>call==='cancel').length,1)
    assert.equal(h.errors.length,1,'failed trigger was not reported')
    h.controller.destroy()
    assert.equal(h.calls.filter(call=>call==='cancel').length,1)
  })
}

test('throwing inline query retires its exact session and can start a healthy successor',()=>{
  let fail=true
  const h=triggerScenario(()=>{
    if(fail){fail=false;throw new Error('Failed query')}
  },()=> 'pass')
  assert.equal(h.controller.refresh(),false,'failed query retained its session')
  assert.equal(h.controller.isActive,false)
  assert.equal(h.errors.length,1,'failed query was not reported')
  assert.equal(h.calls.filter(call=>call==='cancel').length,1)
  assert.equal(h.controller.refresh(),true,'a later valid query cannot recover')
  assert.equal(h.controller.isActive,true)
  h.controller.destroy()
  assert.equal(h.calls.filter(call=>call==='cancel').length,2)
})

test('Escape handling cannot cancel a successor query created by the previous keydown',()=>{
  let h
  h=triggerScenario(null,(_event,session)=>{
    session.cancel()
    assert.equal(h.controller.refresh(),true,'successor query was not reopened')
    return 'pass'
  })
  assert.equal(h.controller.refresh(),true)
  assert.deepEqual(h.press('Escape'),{prevented:true,stopped:true})
  assert.equal(h.controller.isActive,true,
    'Escape from the retired query cancelled a fresh successor')
  assert.deepEqual(h.calls,['query','keydown','cancel','query'])
  assert.deepEqual(h.errors,[])
  h.controller.destroy()
  assert.deepEqual(h.calls,['query','keydown','cancel','query','cancel'],
    'successor was not retired exactly once on destruction')
})

test('queued IME trigger refresh is revoked across a read-only round trip',async()=>{
  const h=triggerScenario(null,()=> 'pass')
  h.events.get('compositionend')({data:'@'})
  h.setReadOnly(true)
  h.setReadOnly(false)
  await Promise.resolve()
  assert.equal(h.controller.isActive,false,'stale IME completion revived trigger session')
  assert.deepEqual(h.calls,[],'stale IME completion called an inline plugin')
  assert.equal(h.controller.refresh(),true,'fresh author trigger cannot restart')
  assert.equal(h.controller.isActive,true)
  h.controller.destroy()
  assert.deepEqual(h.calls,['query','cancel'],'fresh query was not retired cleanly')
})

for(const [name,decision] of [
  ['Escape',()=> 'pass'],
  ['failed key',()=>{throw new Error('old key failed')}],
]){
  test('reentrant '+name+' cannot cancel a newly published session with the same query owner',()=>{
    let h
    h=triggerScenario(null,()=>{
      assert.equal(h.controller.refresh(),true,'reentrant query was not published')
      return decision()
    })
    assert.equal(h.controller.refresh(),true)
    const event=h.press('Escape')
    assert.deepEqual(event,{prevented:true,stopped:true})
    assert.equal(h.controller.isActive,true,'old key cancelled the newly published query')
    assert.deepEqual(h.calls,['query','keydown','query'])
    assert.equal(h.errors.length,name==='failed key'?1:0)
    h.controller.destroy()
    assert.deepEqual(h.calls,['query','keydown','query','cancel'])
  })
}

test('successful reentrant inline commit does not clear a successor session',()=>{
  let h,originalSession=null
  h=triggerScenario(session=>{
    originalSession??=session
  },()=> 'pass',()=>{
    originalSession.cancel()
    assert.equal(h.controller.refresh(),true,'new query could not begin during committed callback')
    return true
  })
  assert.equal(h.controller.refresh(),true)
  assert.equal(originalSession.commit({name:'Chosen'}),true)
  assert.equal(h.controller.isActive,true,
    'old successful commit discarded a newer reentrant query')
  assert.deepEqual(h.calls,['query','cancel','query'])
  h.controller.destroy()
  assert.deepEqual(h.calls,['query','cancel','query','cancel'])
})

test('async inline trigger query is rejected and its late failure is contained', async () => {
  let assimilated=0
  const h=triggerScenario(() => ({
    then(_resolve,reject){
      assimilated++
      reject(new Error('late query rejection'))
    },
  }),()=> 'pass')
  assert.equal(h.controller.refresh(),false,
    'asynchronous trigger query remained an active authoring session')
  assert.equal(h.controller.isActive,false)
  assert.equal(h.calls.filter(x=>x==='cancel').length,1)
  assert.equal(h.errors.some(error=>/synchron/i.test(error.message)),true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(assimilated,1,'rejected thenable was not safely consumed')
  assert.equal(h.errors.some(error=>/late query rejection/.test(error.message)),true)
  h.controller.destroy()
})

test('async inline trigger keydown consumes its key and reports its late rejection', async () => {
  let assimilated=0
  const h=triggerScenario(null,()=>({
    then(_resolve,reject){
      assimilated++
      reject(new Error('late keydown rejection'))
    },
  }))
  assert.equal(h.controller.refresh(),true)
  const event=h.press()
  assert.deepEqual(event,{prevented:true,stopped:true},
    'async keydown was allowed to pass into native Enter editing')
  assert.equal(h.controller.isActive,false)
  assert.equal(h.calls.filter(x=>x==='cancel').length,1)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(assimilated,1,'async keydown result was never awaited or contained')
  assert.equal(h.errors.some(error=>/late keydown rejection/.test(error.message)),true)
  h.controller.destroy()
})
