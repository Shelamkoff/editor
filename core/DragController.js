// @ts-check

function clampGap(value,length){
  return Math.max(0,Math.min(length,Number.isInteger(value)?value:0))
}

/**
 * Resolve one visual gap against the live order with the dragged id removed.
 * beforeId/afterId are stable anchors; numeric gap is only a final fallback.
 *
 * @param {readonly string[]} order
 * @param {string} sourceId
 * @param {{beforeId:string|null,afterId:string|null,gap:number}} placement
 */
export function resolveDragGap(order,sourceId,placement){
  const without=order.filter(id=>id!==sourceId)
  if(placement.beforeId){
    const index=without.indexOf(placement.beforeId)
    if(index>=0)return index
  }
  if(placement.afterId){
    const index=without.indexOf(placement.afterId)
    if(index>=0)return index+1
  }
  return clampGap(placement.gap,without.length)
}

/**
 * @param {readonly string[]} ids order without source id
 * @param {(id:string)=>HTMLElement|null} elementFor
 * @param {number} y
 */
export function dragGapAtY(ids,elementFor,y){
  for(let index=0;index<ids.length;index++){
    const element=elementFor(ids[index])
    if(!element)continue
    const rect=element.getBoundingClientRect()
    if(y<rect.top+rect.height/2)return index
  }
  return ids.length
}

export class DragController {
  #runtime
  #view
  #handle
  #document
  #session=null
  #destroyed=false
  #threshold
  #onPointerDown
  #clickCleanup=null

  constructor({ runtime, view, handle, threshold = 5 }) {
    if (!handle?.addEventListener) throw new TypeError('DragController requires a drag handle')
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new RangeError('Drag threshold must be a finite number greater than or equal to 0')
    }
    this.#runtime=runtime
    this.#view=view
    this.#handle=handle
    this.#threshold=threshold
    this.#document=handle.ownerDocument

    this.#onPointerDown=event=>{
      if(
        this.#destroyed
        ||this.#runtime.readOnly
        ||event.button!==0
        ||event.isPrimary===false
      )return

      const sourceId=this.#view.currentId
      if(!sourceId||!this.#runtime.has(sourceId))return
      const element=this.#view.element(sourceId)
      if(!element)return
      const generation=this.#runtime.generation
      const revision=this.#runtime.revision
      const modeEpoch=this.#runtime.modeEpoch

      // Retiring the previous pointer can synchronously call lostpointercapture
      // listeners, including editor teardown or a *newer* pointerdown.
      this.#cancelSession()
      if(this.#destroyed||this.#session||this.#runtime.readOnly
        ||this.#runtime.generation!==generation
        ||this.#runtime.revision!==revision
        ||this.#runtime.modeEpoch!==modeEpoch
        ||!this.#runtime.has(sourceId)||this.#view.element(sourceId)!==element)return
      const AbortControllerCtor=this.#document.defaultView?.AbortController??AbortController
      const controller=new AbortControllerCtor()
      const pointerId=Number.isInteger(event.pointerId)?event.pointerId:0
      const state={
        pointerId,
        sourceId,
        element,
        generation,
        revision,
        modeEpoch,
        startX:event.clientX,
        startY:event.clientY,
        active:false,
        gap:Math.max(0,this.#runtime.indexOf(sourceId)),
        beforeId:null,
        afterId:null,
        spacer:null,
        spacerParent:null,
        controller,
      }
      // The indexOf() read used while constructing the state is another host
      // callback boundary; never publish a session after it retired the owner.
      if(this.#destroyed||this.#session||this.#runtime.readOnly
        ||this.#runtime.generation!==generation
        ||this.#runtime.revision!==revision
        ||this.#runtime.modeEpoch!==modeEpoch
        ||!this.#runtime.has(sourceId)||this.#view.element(sourceId)!==element)return
      this.#session=state

      try{this.#handle.setPointerCapture?.(pointerId)}catch{}
      // Pointer capture can synchronously dispatch lostpointercapture. A
      // retired owner must not install document listeners after the callback.
      if(!this.#current(state)){this.#cancelSession(state);return}

      try{
        this.#document.addEventListener('pointermove',moveEvent=>this.#move(state,moveEvent),{
          capture:true,
          signal:controller.signal,
        })
        if(!this.#current(state)){this.#cancelSession(state);return}
        this.#document.addEventListener('pointerup',upEvent=>this.#finish(state,upEvent),{
          capture:true,
          signal:controller.signal,
        })
        if(!this.#current(state)){this.#cancelSession(state);return}
        this.#document.addEventListener('pointercancel',cancelEvent=>{
          if(this.#matchesPointer(state,cancelEvent))this.#cancelSession(state)
        },{
          capture:true,
          signal:controller.signal,
        })
        if(!this.#current(state))this.#cancelSession(state)
      }catch(error){
        this.#cancelSession(state)
        throw error
      }
    }

    handle.addEventListener('pointerdown',this.#onPointerDown)
  }

  setReadOnly(value){
    if(value===true)this.#cancelSession()
  }

  destroy(){
    if(this.#destroyed)return
    this.#destroyed=true
    this.#handle.removeEventListener('pointerdown',this.#onPointerDown)
    this.#cancelSession()
    this.#clearClickSuppression()
  }

  #matchesPointer(state,event){
    const pointerId=Number.isInteger(event?.pointerId)?event.pointerId:0
    return pointerId===state.pointerId
  }

  #current(state){
    return (
      !this.#destroyed
      &&this.#session===state
      &&!this.#runtime.readOnly
      &&this.#runtime.generation===state.generation
      &&this.#runtime.revision===state.revision
      &&this.#runtime.modeEpoch===state.modeEpoch
      &&this.#runtime.has(state.sourceId)
      &&this.#view.element(state.sourceId)===state.element
      // Getters above may have synchronously retired or replaced this owner.
      &&!this.#destroyed&&this.#session===state
    )
  }

  #activate(state){
    if(state.active||!this.#current(state))return
    state.active=true
    state.element.classList?.add('oe-block--dragging')
    if(!this.#current(state))return
    this.#document.body?.classList?.add('oe-editor-dragging')
    if(!this.#current(state))return
    const spacer=this.#document.createElement?.('div')??null
    if(!this.#current(state))return
    if(spacer){
      spacer.className='oe-block-drop-gap'
      spacer.setAttribute?.('aria-hidden','true')
      if(!this.#current(state))return
      state.spacer=spacer
    }
    const order=this.#runtime.ids()
    if(!this.#current(state))return
    const without=order.filter(id=>id!==state.sourceId)
    const current=Math.max(0,order.indexOf(state.sourceId))
    this.#setGap(state,Math.min(current,without.length),without)
  }

  #move(state,event){
    if(!this.#matchesPointer(state,event)||this.#session!==state)return
    if(!this.#current(state)){
      this.#cancelSession(state)
      return
    }
    const distance=Math.hypot(event.clientX-state.startX,event.clientY-state.startY)
    if(!state.active&&distance<this.#threshold)return
    try{
      this.#activate(state)
      if(!this.#current(state)){this.#cancelSession(state);return}
      event.preventDefault?.()
      if(!this.#current(state)){this.#cancelSession(state);return}
      const order=this.#runtime.ids()
      if(!this.#current(state)){this.#cancelSession(state);return}
      const without=order.filter(id=>id!==state.sourceId)
      const gap=dragGapAtY(without,id=>this.#view.element(id),event.clientY)
      if(!this.#current(state)){this.#cancelSession(state);return}
      this.#setGap(state,gap,without)
    }catch(error){
      // A renderer/DOM insertion may have thrown after placing the gap node.
      // Release the pointer and remove only the spacer we still own.
      this.#cancelSession(state)
      throw error
    }
  }

  #setGap(state,gap,without){
    const next=clampGap(gap,without.length)
    state.gap=next
    state.beforeId=without[next]??null
    state.afterId=next>0?without[next-1]??null:null

    const spacer=state.spacer
    const parent=state.element.parentNode
    if(!spacer||!parent)return
    const before=state.beforeId?this.#view.element(state.beforeId):null
    const previousOwner=state.spacerParent
    try{
      if(before&&before.parentNode===parent)parent.insertBefore(spacer,before)
      else parent.appendChild(spacer)
    }catch(error){
      // insertBefore/appendChild can fail after partial mutation. An adopted
      // spacer belongs to its new parent; never remove it from that owner.
      if(spacer.parentNode===parent||previousOwner&&spacer.parentNode===previousOwner){
        spacer.remove?.()
      }
      state.spacerParent=null
      throw error
    }
    // DOM insertion can synchronously destroy this drag or install a
    // successor pointer owner without throwing. Its provisional spacer must
    // not survive that callback, nor may we detach an adopted foreign node.
    if(!this.#current(state)){
      state.spacerParent=null
      if(spacer.parentNode===parent){
        try{spacer.remove?.()}catch{}
      }
      return
    }
    state.spacerParent=spacer.parentNode===parent?parent:null
  }

  #finish(state,event){
    if(!this.#matchesPointer(state,event)||this.#session!==state)return
    if(!this.#current(state)){
      this.#cancelSession(state)
      return
    }

    if(!state.active){
      this.#cancelSession(state)
      return
    }

    event.preventDefault?.()
    const order=this.#runtime.ids()
    const targetIndex=resolveDragGap(order,state.sourceId,state)
    const currentIndex=this.#runtime.indexOf(state.sourceId)
    this.#cancelSession(state)
    // The capture-release callback may have opened a newer pointer session.
    // Only that successor owns the drag now: no commit or click suppression
    // may be published by the older pointerup continuation.
    if(this.#session)return
    // Lost pointer capture is dispatched synchronously. A host callback may
    // destroy the editor, change read-only mode, or replace the projected block
    // during releasePointerCapture(). Revalidate before touching canonical data.
    if(this.#destroyed||this.#session||this.#runtime.readOnly
      ||this.#runtime.generation!==state.generation
      ||this.#runtime.revision!==state.revision
      ||this.#runtime.modeEpoch!==state.modeEpoch
      ||!this.#runtime.has(state.sourceId)
      ||this.#view.element(state.sourceId)!==state.element)return
    if(!this.#suppressNextClick())return
    if(this.#session){
      // A new pointerdown during suppression installation replaces the old
      // click owner; do not leave an obsolete listener in front of its click.
      this.#clearClickSuppression()
      return
    }
    // Installing a click suppression listener is itself a host callback seam.
    // Teardown/read-only/projection changes can happen synchronously there.
    if(this.#destroyed||this.#session||this.#runtime.readOnly
      ||this.#runtime.generation!==state.generation
      ||this.#runtime.revision!==state.revision
      ||this.#runtime.modeEpoch!==state.modeEpoch
      ||!this.#runtime.has(state.sourceId)
      ||this.#view.element(state.sourceId)!==state.element){
      this.#clearClickSuppression()
      return
    }

    if(currentIndex<0||targetIndex===currentIndex)return
    this.#runtime.move(state.sourceId,targetIndex)
    // Publishing the completed move can synchronously invoke host callbacks
    // that destroy the editor or focus another block. Canonical commit stays
    // valid, but its old drag owner has no further presentation authority.
    if(this.#destroyed||this.#runtime.readOnly
      ||this.#runtime.generation!==state.generation
      ||this.#runtime.modeEpoch!==state.modeEpoch
      ||!this.#runtime.has(state.sourceId)
      ||this.#view.element(state.sourceId)!==state.element
      ||this.#view.currentId!==state.sourceId)return
    this.#view.reconcileInteraction()
    this.#view.setCurrent(state.sourceId)
    // A drag's deferred caret belongs to this committed revision, mounted
    // block and current focus owner. A replacement or read-only transition
    // must not restore focus into a successor document with the same block id.
    const generation=this.#runtime.generation
    const revision=this.#runtime.revision
    const modeEpoch=this.#runtime.modeEpoch
    const mounted=this.#view.element(state.sourceId)
    const sourceId=state.sourceId
    queueMicrotask(()=>{
      if(this.#destroyed||this.#runtime.readOnly
        ||this.#runtime.generation!==generation||this.#runtime.revision!==revision
        ||this.#runtime.modeEpoch!==modeEpoch||!this.#runtime.has(sourceId)||mounted!==state.element
        ||this.#view.element(sourceId)!==mounted||this.#view.currentId!==sourceId)return
      this.#view.focus(sourceId)
    })
  }

  #cancelSession(expected=null){
    const state=this.#session
    if(!state||(expected&&state!==expected))return
    this.#session=null
    state.controller.abort()
    state.element.classList?.remove('oe-block--dragging')
    if(state.spacerParent&&state.spacer?.parentNode===state.spacerParent){
      state.spacer.remove?.()
    }
    state.spacerParent=null
    this.#document.body?.classList?.remove('oe-editor-dragging')
    try{
      if(this.#handle.hasPointerCapture?.(state.pointerId)){
        this.#handle.releasePointerCapture?.(state.pointerId)
      }
    }catch{}
  }

  #suppressNextClick(){
    if(this.#destroyed)return false
    this.#clearClickSuppression()
    if(this.#destroyed)return false
    let active=true
    let timer
    const view=this.#document.defaultView??globalThis
    const cleanup=()=>{
      active=false
      if(timer!==undefined)view.clearTimeout?.(timer)
      this.#handle.removeEventListener('click',swallow,true)
      if(this.#clickCleanup===cleanup)this.#clickCleanup=null
    }
    const swallow=event=>{
      if(!active||this.#destroyed)return
      active=false
      event.preventDefault?.()
      event.stopImmediatePropagation?.()
      cleanup()
    }
    try{timer=view.setTimeout?.(()=>cleanup(),0)}
    catch(error){cleanup();throw error}
    // A custom window timer can destroy the owning editor synchronously.
    // No listener may be installed, and no move can be committed afterward.
    if(this.#destroyed||!active){cleanup();return false}
    this.#clickCleanup=cleanup
    try{this.#handle.addEventListener('click',swallow,true)}
    catch(error){cleanup();throw error}
    if(this.#destroyed||!active){cleanup();return false}
    return true
  }

  #clearClickSuppression(){
    const cleanup=this.#clickCleanup
    this.#clickCleanup=null
    cleanup?.()
  }
}
