// @ts-check

export class InlineTriggerController {
  #root
  #registry
  #reconciler
  #selection
  #commands
  #controller
  #active=null
  #triggers=[]

  constructor({root,registry,reconciler,selection,commands}){
    if(!root?.addEventListener)throw new TypeError('InlineTriggerController requires an editor root')
    this.#root=root
    this.#registry=registry
    this.#reconciler=reconciler
    this.#selection=selection
    this.#commands=commands
    this.#triggers=registry.inlineTypes.flatMap(type=>{
      const definition=registry.getInlineDefinition(type)
      return definition?.trigger?[{type,trigger:definition.trigger,definition,runtime:registry.getInlineRuntime(type)}]:[]
    })

    const Ctor=root.ownerDocument.defaultView?.AbortController??AbortController
    this.#controller=new Ctor()
    const signal=this.#controller.signal
    root.addEventListener('input',event=>this.#onInput(event),{signal})
    root.addEventListener('keydown',event=>this.#onKeyDown(event),{signal,capture:true})
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
    const session={
      blockId:active.blockId,
      fieldKey:active.fieldKey,
      query,
      range:Object.freeze({start:active.logicalStart,end:focusOffset}),
      anchor:active.anchor,
      commit:data=>{
        if(this.#active!==active)return false
        const field=this.#reconciler.getEditableField(active.blockId,active.fieldKey)
        const bookmark=this.#selection.capture()
        const owner=field?{
          blockId:active.blockId,
          fieldKey:field.key,
          element:field.element,
          mode:field.mode,
        }:null
        if(
          field?.element!==active.anchor
          ||!active.anchor.isConnected
          ||!this.#root.contains(active.anchor)
          ||!bookmark
          ||!owner
          ||!this.#collapsedIn(bookmark,owner)
          ||bookmark.focus.offset!==session.range.end
        )return false
        const committed=this.#commands.commitTrigger(active.type,session,data)===true
        if(committed)this.#active=null
        return committed
      },
      cancel:()=>this.#cancel(),
    }
    active.session=session
    active.runtime.onTriggerQuery?.(session)
  }

  #onKeyDown(event){
    const active=this.#active
    if(!active?.session)return
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
    if(!selection?.focusNode||!field.contains(selection.focusNode))return null
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
