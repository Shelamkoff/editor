// @ts-check

export class InlineTriggerController {
  #root
  #registry
  #reconciler
  #selection
  #commands
  #isComposing
  #projection
  #controller
  #active=null
  #triggers=[]

  constructor({root,registry,reconciler,selection,commands,isComposing=()=>false,projection=null}){
    if(!root?.addEventListener)throw new TypeError('InlineTriggerController requires an editor root')
    this.#root=root
    this.#registry=registry
    this.#reconciler=reconciler
    this.#selection=selection
    this.#commands=commands
    this.#isComposing=isComposing
    this.#projection=projection
    this.#triggers=registry.inlineTypes.flatMap(type=>{
      const definition=registry.getInlineDefinition(type)
      return definition?.trigger?[{type,trigger:definition.trigger,definition,runtime:registry.getInlineRuntime(type)}]:[]
    })

    const Ctor=root.ownerDocument.defaultView?.AbortController??AbortController
    this.#controller=new Ctor()
    const signal=this.#controller.signal
    root.addEventListener('compositionstart',()=>this.#cancel(),{signal})
    root.addEventListener('compositionend',event=>{
      if(event.data)queueMicrotask(()=>{if(!signal.aborted)this.refresh()})
    },{signal})
    root.addEventListener('input',event=>this.#onInput(event),{signal})
    root.addEventListener('keydown',event=>this.#onKeyDown(event),{signal,capture:true})
    root.ownerDocument.addEventListener('selectionchange',()=>this.#onSelectionChange(),{signal})
    root.addEventListener('focusout',()=>queueMicrotask(()=>{
      if(this.#active&&!this.#root.contains(this.#root.ownerDocument.activeElement))this.#cancel()
    }),{signal})
  }

  get isActive(){return !!this.#active}

  destroy(){
    this.#controller.abort()
    this.#cancel()
  }

  refresh(){
    if(this.#isComposing()){
      this.#cancel()
      return false
    }
    const bookmark=this.#selection.capture()
    const point=bookmark?.focus
    if(!bookmark||!point){
      this.#cancel()
      return false
    }
    const field=this.#reconciler.getEditableField(point.blockId,point.fieldKey)
    if(!field||field.mode!=='rich-text'){
      this.#cancel()
      return false
    }
    const owner={
      blockId:point.blockId,
      fieldKey:point.fieldKey,
      element:field.element,
      mode:field.mode,
    }
    if(!this.#collapsedIn(bookmark,owner)){
      this.#cancel()
      return false
    }
    this.#refreshOwner(owner,bookmark)
    return this.#active!==null
  }

  #onInput(event){
    if(event.isComposing||this.#isComposing()){
      this.#cancel()
      return
    }
    const owner=this.#reconciler.resolveEditableTarget(event.target)
    if(!owner||owner.mode!=='rich-text'){
      this.#cancel()
      return
    }
    const bookmark=this.#selection.capture()
    if(!bookmark||!this.#collapsedIn(bookmark,owner)){
      this.#cancel()
      return
    }
    this.#refreshOwner(owner,bookmark)
  }

  #refreshOwner(owner,bookmark){
    const text=this.#textBeforeCaret(owner.element)
    if(text===null){
      this.#cancel()
      return
    }

    if(this.#active){
      if(this.#active.blockId!==owner.blockId||this.#active.fieldKey!==owner.fieldKey){
        this.#cancel()
        return
      }
      const triggerIndex=text.lastIndexOf(this.#active.trigger)
      if(triggerIndex<0||triggerIndex!==this.#active.textStart||/\s/.test(text.slice(triggerIndex+this.#active.trigger.length))){
        this.#cancel()
        return
      }
      const query=text.slice(triggerIndex+this.#active.trigger.length)
      this.#publish(this.#active,query,bookmark.focus.offset)
      return
    }

    let candidate=null
    for(const entry of this.#triggers){
      const index=text.lastIndexOf(entry.trigger)
      if(index<0)continue
      const query=text.slice(index+entry.trigger.length)
      if(/\s/.test(query))continue
      const previous=index>0?text.slice(0,index).at(-1):''
      if(previous&&!/\s|\u00a0/.test(previous))continue
      if(!candidate||index>candidate.index)candidate={...entry,index,query}
    }
    if(!candidate?.runtime)return

    this.#active={
      type:candidate.type,
      trigger:candidate.trigger,
      definition:candidate.definition,
      runtime:candidate.runtime,
      blockId:owner.blockId,
      fieldKey:owner.fieldKey,
      textStart:candidate.index,
      logicalStart:bookmark.focus.offset-candidate.query.length-candidate.trigger.length,
      anchor:owner.element,
      session:null,
    }
    this.#publish(this.#active,candidate.query,bookmark.focus.offset)
  }

  #publish(active,query,focusOffset){
    active.textPrefix=this.#textBeforeCaret(active.anchor)
    const session={
      blockId:active.blockId,
      fieldKey:active.fieldKey,
      query,
      range:Object.freeze({start:active.logicalStart,end:focusOffset}),
      anchor:active.anchor,
      commit:data=>{
        if(this.#active!==active||active.session!==session)return false
        const range=this.#liveRange(active)
        if(!range)return false
        const committed=this.#commands.commitTrigger(active.type,{...session,range},data)===true
        if(committed)this.#active=null
        return committed
      },
      cancel:()=>{if(this.#active===active&&active.session===session)this.#cancel()},
    }
    active.session=session
    active.runtime.onTriggerQuery?.(session)
  }

  #onKeyDown(event){
    if(event.defaultPrevented||event.isComposing||event.keyCode===229||this.#isComposing())return
    const active=this.#active
    if(!active?.session)return
    if(!this.#liveRange(active)){
      this.#cancel()
      return
    }
    const result=active.runtime.onTriggerKeydown?.(event,active.session)??'pass'
    if(result==='handled'){
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if(event.key==='Escape'){
      event.preventDefault()
      event.stopPropagation()
      this.#cancel()
    }
  }

  #onSelectionChange(){
    if(this.#active&&!this.#liveRange(this.#active))this.#cancel()
  }

  #liveRange(active){
    const field=this.#reconciler.getEditableField(active.blockId,active.fieldKey)
    if(field?.element!==active.anchor||!active.anchor.isConnected||!this.#root.contains(active.anchor)
      ||active.textPrefix===null||!(active.anchor.textContent??'').startsWith(active.textPrefix))return null
    const bookmark=this.#selection.capture()
    const owner={blockId:active.blockId,fieldKey:active.fieldKey}
    if(!bookmark?.anchor||!bookmark?.focus||!this.#collapsedIn(bookmark,owner))return null
    const text=this.#textBeforeCaret(active.anchor)
    if(text===null)return null
    const index=text.lastIndexOf(active.trigger)
    if(index!==active.textStart
      ||bookmark.focus.offset<active.logicalStart+active.trigger.length
      ||/\s/.test(text.slice(index+active.trigger.length)))return null
    return Object.freeze({start:active.logicalStart,end:bookmark.focus.offset})
  }

  #cancel(){
    const active=this.#active
    this.#active=null
    if(active)active.runtime.onTriggerCancel?.()
  }

  #collapsedIn(bookmark,owner){
    return bookmark.anchor.blockId===owner.blockId
      &&bookmark.focus.blockId===owner.blockId
      &&bookmark.anchor.fieldKey===owner.fieldKey
      &&bookmark.focus.fieldKey===owner.fieldKey
      &&bookmark.anchor.offset===bookmark.focus.offset
  }

  #textBeforeCaret(field){
    const document=this.#root.ownerDocument
    const selection=document.defaultView?.getSelection()??null
    if(!selection?.focusNode||!field.contains(selection.focusNode)
      ||this.#projection?.resolveWidgetElement(selection.focusNode))return null
    try{
      const range=document.createRange()
      range.selectNodeContents(field)
      range.setEnd(selection.focusNode,selection.focusOffset)
      return range.toString()
    }catch{
      return null
    }
  }
}
