import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'

import { NativeInputController } from './NativeInputController.js'

function fixture(transfer,AbortControllerCtor=AbortController) {
  const source={textContent:'alpha'},keep={},outside={}
  const document=Object.assign(new EventTarget(),{
    activeElement:source,defaultView:{AbortController:AbortControllerCtor},
  })
  const state={text:'alpha',currentId:'source',commits:[],carets:[]}
  const focus=element=>{
    document.activeElement=element
    if(element===source)state.currentId='source'
    if(element===keep)state.currentId='keep'
    document.dispatchEvent(new Event('focusin'))
  }
  const point={blockId:'source',fieldKey:'text',offset:2}
  const selection={
    capture:()=>({anchor:point,focus:{...point}}),
    setCaret(blockId,target){
      state.carets.push({blockId,...target})
      focus(source)
      return true
    },
    restore(bookmark){
      state.carets.push({...bookmark.focus})
      focus(source)
      return true
    },
  }
  const publish=name=>{
    state.commits.push(name)
    if(transfer==='outside')focus(outside)
    if(transfer==='block')focus(keep)
  }
  const runtime={
    readOnly:false,health:'ready',generation:1,revision:0,modeEpoch:0,
    syncBlockFromProjection(_id,operation,metadata){
      operation()
      state.text=source.textContent
      this.revision++
      publish(metadata.name)
    },
    replaceLogicalRange(bookmark,replacement){
      assert.deepEqual(bookmark,{anchor:point,focus:{...point}})
      assert.deepEqual(replacement,{kind:'html',html:'<br>'})
      state.text='al<br>pha'
      return {blockId:'source',fieldKey:'text',offset:3}
    },
    interact(name,operation){
      const result=operation()
      this.revision++
      publish(name)
      return result
    },
  }
  const root={ownerDocument:document,addEventListener(){},contains:element=>element===source||element===keep}
  const reconciler={resolveEditableTarget:target=>target===source
    ?{blockId:'source',fieldKey:'text',mode:'rich-text',element:source}:null}
  const controller=new NativeInputController({root,runtime,reconciler,selection})
  const event=inputType=>({
    type:'beforeinput',target:source,inputType,cancelable:true,
    prevented:false,stopped:false,
    preventDefault(){this.prevented=true},
    stopImmediatePropagation(){this.stopped=true},
  })
  return {controller,document,state,source,keep,outside,event,point}
}

for(const [inputType,text,offset] of [
  ['insertFromDrop','alDROPpha',6],
  ['insertFromPaste','alPASTEpha',7],
  ['deleteByCut','aha',1],
]){
  for(const transfer of ['none','outside','block']){
    test(`${inputType} normalization preserves ${transfer} native focus after its committed edit`,()=>{
      const h=fixture(transfer)
      // The browser's edit has already changed its field and native caret.
      h.source.textContent=text
      h.point.offset=offset
      h.controller.handleInput({type:'input',target:h.source,inputType})
      assert.deepEqual(h.state.commits,['native-input'])
      assert.equal(h.state.text,text,'focus handoff must retain the accepted native edit')
      if(transfer==='none'){
        assert.deepEqual(h.state.carets,[{blockId:'source',fieldKey:'text',offset}])
        assert.equal(h.document.activeElement,h.source)
      }else{
        assert.deepEqual(h.state.carets,[],'native projection normalization reclaimed a newer focus owner')
        assert.equal(h.document.activeElement,transfer==='block'?h.keep:h.outside)
        assert.equal(h.state.currentId,transfer==='block'?'keep':'source')
      }
      h.controller.destroy()
    })
  }
}

test('native-input focus observation is released even when the owner AbortController throws',()=>{
  class ThrowingAbortController extends AbortController {
    abort(){throw new Error('host abort failed')}
  }
  const h=fixture('none',ThrowingAbortController)
  assert.throws(()=>h.controller.destroy(),/host abort failed/)
  assert.equal(getEventListeners(h.document,'focusin').length,0,
    'the owner document retained a native-input focus listener after teardown')
})

test('failed native-input focus cleanup cannot retain input command authority',()=>{
  const h=fixture('none')
  const remove=h.document.removeEventListener.bind(h.document)
  let first=true
  h.document.removeEventListener=(...args)=>{
    if(first){first=false;throw new Error('host focus cleanup failed')}
    remove(...args)
  }
  assert.doesNotThrow(()=>h.controller.destroy())
  h.controller.handleBeforeInput(h.event('insertLineBreak'))
  assert.deepEqual(h.state.commits,[])
  assert.equal(getEventListeners(h.document,'focusin').length,0)
})

for(const inputType of ['insertLineBreak','insertParagraph']){
  for(const transfer of ['none','outside','block']){
    test(`${inputType} preserves ${transfer} native focus after its committed edit`,()=>{
      const h=fixture(transfer)
      const event=h.event(inputType)
      h.controller.handleBeforeInput(event)
      assert.equal(event.prevented,true)
      assert.equal(event.stopped,true)
      assert.deepEqual(h.state.commits,['input.line-break'])
      assert.equal(h.state.text,'al<br>pha','focus handoff must retain the authored line break')
      if(transfer==='none'){
        assert.deepEqual(h.state.carets,[{blockId:'source',fieldKey:'text',offset:3}])
        assert.equal(h.document.activeElement,h.source)
      }else{
        assert.deepEqual(h.state.carets,[],'line-break completion reclaimed a newer native focus owner')
        assert.equal(h.document.activeElement,transfer==='block'?h.keep:h.outside)
        assert.equal(h.state.currentId,transfer==='block'?'keep':'source')
      }
      h.controller.destroy()
    })
  }
}
