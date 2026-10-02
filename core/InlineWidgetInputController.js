// @ts-check

export class InlineWidgetInputController {
  #root
  #runtime
  #registry
  #projection
  #selection
  #controller

  constructor({root,runtime,registry,projection,selection}){
    if(!root?.addEventListener)throw new TypeError('InlineWidgetInputController requires an editor root')
    this.#root=root
    this.#runtime=runtime
    this.#registry=registry
    this.#projection=projection
    this.#selection=selection
    const Ctor=root.ownerDocument.defaultView?.AbortController??AbortController
    this.#controller=new Ctor()
    root.addEventListener('beforeinput',event=>this.#beforeInput(event),{
      capture:true,
      signal:this.#controller.signal,
    })
  }

  destroy(){this.#controller.abort()}

  #beforeInput(event){
    if(this.#runtime.readOnly||event.defaultPrevented||event.isComposing)return
    const inputType=String(event.inputType??'')
    if(!['deleteContentBackward','deleteContentForward','insertText','insertCompositionText'].includes(inputType))return
    const native=this.#root.ownerDocument.defaultView?.getSelection?.()
    const target=this.#projection.resolveWidgetInputTarget(native,inputType)
    if(!target)return
    const definition=this.#registry.getInlineDefinition(target.type)
    const editing=definition?.editing
    if(!editing?.handle)return
    const action=editing.handle({
      inputType,
      position:target.position,
      offset:target.offset,
      text:target.element.textContent??'',
      data:typeof event.data==='string'?event.data:null,
    },target.data)
    if(!action)return

    event.preventDefault()
    event.stopImmediatePropagation?.()

    if(action.kind==='update'){
      this.#runtime.updateInlineWidget(target.blockId,target.inlineId,()=>action.data)
      queueMicrotask(()=>this.#selection.setCaret(target.blockId,{
        fieldKey:target.fieldKey,
        offset:target.logicalOffset+1,
      }))
      return
    }
    if(action.kind==='remove'){
      if(this.#runtime.removeInlineWidget(target.blockId,target.inlineId)){
        queueMicrotask(()=>this.#selection.setCaret(target.blockId,{
          fieldKey:target.fieldKey,
          offset:target.logicalOffset,
        }))
      }
      return
    }
    if(action.kind==='replace-text'){
      if(this.#runtime.replaceInlineWidgetWithText(target.blockId,target.inlineId,action.text)){
        queueMicrotask(()=>this.#selection.setCaret(target.blockId,{
          fieldKey:target.fieldKey,
          offset:target.logicalOffset,
        }))
      }
    }
  }
}
