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

      this.#cancelSession()
      const AbortControllerCtor=this.#document.defaultView?.AbortController??AbortController
      const controller=new AbortControllerCtor()
      const pointerId=Number.isInteger(event.pointerId)?event.pointerId:0
      const state={
        pointerId,
        sourceId,
        element,
        generation:this.#runtime.generation,
        revision:this.#runtime.revision,
        startX:event.clientX,
        startY:event.clientY,
        active:false,
        gap:Math.max(0,this.#runtime.indexOf(sourceId)),
        beforeId:null,
        afterId:null,
        spacer:null,
        controller,
      }
      this.#session=state

      try{this.#handle.setPointerCapture?.(pointerId)}catch{}

      this.#document.addEventListener('pointermove',moveEvent=>this.#move(state,moveEvent),{
        capture:true,
        signal:controller.signal,
      })
      this.#document.addEventListener('pointerup',upEvent=>this.#finish(state,upEvent),{
        capture:true,
        signal:controller.signal,
      })
      this.#document.addEventListener('pointercancel',cancelEvent=>{
        if(this.#matchesPointer(state,cancelEvent))this.#cancelSession(state)
      },{
        capture:true,
        signal:controller.signal,
      })
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
      &&this.#runtime.has(state.sourceId)
      &&this.#view.element(state.sourceId)===state.element
    )
  }

  #activate(state){
    if(state.active)return
    state.active=true
    state.element.classList?.add('oe-block--dragging')
    this.#document.body?.classList?.add('oe-editor-dragging')
    const spacer=this.#document.createElement?.('div')??null
    if(spacer){
      spacer.className='oe-block-drop-gap'
      spacer.setAttribute?.('aria-hidden','true')
      state.spacer=spacer
    }
    const order=this.#runtime.ids()
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
    this.#activate(state)
    event.preventDefault?.()

    const order=this.#runtime.ids()
    const without=order.filter(id=>id!==state.sourceId)
    const gap=dragGapAtY(without,id=>this.#view.element(id),event.clientY)
    this.#setGap(state,gap,without)
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
    if(before&&before.parentNode===parent)parent.insertBefore(spacer,before)
    else parent.appendChild(spacer)
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
    this.#suppressNextClick()

    if(currentIndex<0||targetIndex===currentIndex)return
    this.#runtime.move(state.sourceId,targetIndex)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(state.sourceId)
    queueMicrotask(()=>this.#view.focus(state.sourceId))
  }

  #cancelSession(expected=null){
    const state=this.#session
    if(!state||(expected&&state!==expected))return
    this.#session=null
    state.controller.abort()
    state.element.classList?.remove('oe-block--dragging')
    state.spacer?.remove?.()
    this.#document.body?.classList?.remove('oe-editor-dragging')
    try{
      if(this.#handle.hasPointerCapture?.(state.pointerId)){
        this.#handle.releasePointerCapture?.(state.pointerId)
      }
    }catch{}
  }

  #suppressNextClick(){
    this.#clearClickSuppression()
    let active=true
    const swallow=event=>{
      if(!active)return
      active=false
      event.preventDefault?.()
      event.stopImmediatePropagation?.()
      cleanup()
    }
    const view=this.#document.defaultView??globalThis
    const timer=view.setTimeout?.(()=>cleanup(),0)
    const cleanup=()=>{
      if(!active&&this.#clickCleanup===null)return
      active=false
      if(timer!==undefined)view.clearTimeout?.(timer)
      this.#handle.removeEventListener('click',swallow,true)
      if(this.#clickCleanup===cleanup)this.#clickCleanup=null
    }
    this.#clickCleanup=cleanup
    this.#handle.addEventListener('click',swallow,true)
  }

  #clearClickSuppression(){
    const cleanup=this.#clickCleanup
    this.#clickCleanup=null
    cleanup?.()
  }
}
