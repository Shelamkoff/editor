// @ts-check
import { invokeObserver } from '../shared/invokeObserver.js'
import { synchronousResult } from '../shared/synchronousResult.js'

export class InlinePopupHost {
  #root
  #document
  #view
  #isReadOnly
  #popup=null
  #anchor=null
  #cleanup=null
  #outside=null
  #observer=null
  #positionController=null
  #naturalHeight=0
  #generation=0
  #destroyed=false
  #observe
  #presentation=null

  constructor({root,isReadOnly=()=>false,observe=operation=>operation()}){
    if(!root?.ownerDocument)throw new TypeError('InlinePopupHost requires an editor root')
    this.#root=root
    this.#document=root.ownerDocument
    this.#view=this.#document.defaultView
    this.#isReadOnly=isReadOnly
    this.#observe=observe
  }

  showPopup(owner,anchor,content,cleanup){
    const ElementCtor=this.#view?.HTMLElement
    if(!ElementCtor||!(anchor instanceof ElementCtor)||!(content instanceof ElementCtor)
      ||anchor.ownerDocument!==this.#document||content.ownerDocument!==this.#document
      ||content===this.#root||content.contains(this.#root)
      // Popup contents must be detached from editor UI. Moving an owned
      // editable anchor/control into a transient popup destroys it on close.
      ||this.#root.contains(content)
      // Do not steal either connected controls or nodes already owned by
      // another detached application/popup subtree.
      ||content.isConnected||content.parentNode
      ||(cleanup!==undefined&&typeof cleanup!=='function')){
      throw new TypeError('Popup requires owning-document HTML elements and optional cleanup function')
    }
    const presentation={owner}
    const handle=Object.freeze({close:()=>{
      if(this.#presentation===presentation)this.hidePopup()
    }})
    if(this.#destroyed||this.#isReadOnly()||!this.#root.isConnected||!this.#root.contains(anchor)){
      this.#runCleanup(cleanup)
      return handle
    }
    const generation=++this.#generation
    this.#hide()
    if(generation!==this.#generation||this.#destroyed||this.#isReadOnly()||!this.#root.isConnected||!this.#root.contains(anchor)){
      this.#runCleanup(cleanup)
      return handle
    }

    const popup=this.#document.createElement('div')
    let claimed=false
    try {
      popup.className='oe-ip-popup'
      popup.appendChild(content)
      this.#root.appendChild(popup)
      // A custom-element callback can synchronously open a successor during
      // insertion. An older presentation must never reclaim its ownership.
      if(generation!==this.#generation||this.#destroyed||this.#isReadOnly()
        ||!this.#root.isConnected||!this.#root.contains(anchor)){
        popup.remove()
        this.#runCleanup(cleanup)
        return handle
      }

      this.#popup=popup
      this.#anchor=anchor
      this.#cleanup=cleanup??null
      this.#presentation=presentation
      claimed=true
      this.#position()
      if(this.#presentation!==presentation)return handle

      const Ctor=this.#view?.AbortController??AbortController
      this.#positionController=new Ctor()
      const positionSignal=this.#positionController.signal
      /** @param {boolean} remeasure */
      const reposition=remeasure=>{
        if(this.#presentation!==presentation)return
        try{this.#position(remeasure)}
        catch(error){
          if(this.#presentation===presentation)this.hidePopup()
          console.warn('[InlinePopupHost] Failed to position popup:',error)
        }
      }
      this.#view?.addEventListener('resize',()=>reposition(true),{signal:positionSignal})
      this.#view?.addEventListener('scroll',()=>reposition(false),{capture:true,passive:true,signal:positionSignal})

      const MutationObserverCtor=this.#view?.MutationObserver
      if(MutationObserverCtor){
        this.#observer=new MutationObserverCtor(()=>{
          if(this.#presentation!==presentation)return
          if(this.#anchor&&!this.#root.contains(this.#anchor))this.hidePopup()
          else reposition(true)
        })
        this.#observer.observe(this.#root,{childList:true,subtree:true})
      }

      queueMicrotask(()=>{
        if(this.#popup!==popup||this.#presentation!==presentation)return
        const outside=event=>{
          // A previously captured event may dispatch a listener even after
          // removal. This callback belongs only to the originating popup.
          if(this.#presentation!==presentation)return
          const target=event.target
          if(!(target instanceof (this.#view?.Node??Node)))return
          if(popup.contains(target)||anchor.contains(target))return
          this.hidePopup()
        }
        this.#outside=outside
        try{
          this.#document.addEventListener('mousedown',outside,true)
          // Handle an unusual synchronous reentry during listener registration.
          if(this.#presentation!==presentation)this.#document.removeEventListener('mousedown',outside,true)
        }catch(error){
          // Listener registration runs in a microtask outside showPopup's
          // synchronous rollback boundary. Retire this exact presentation.
          if(this.#presentation===presentation)this.hidePopup()
          console.warn('[InlinePopupHost] Failed to install outside handler:',error)
        }
      })
      return handle
    }catch(error){
      if(this.#presentation===presentation)this.hidePopup()
      else if(!claimed){
        try{popup.remove()}catch{}
        this.#runCleanup(cleanup)
      }
      throw error
    }
  }

  hidePopup(){
    this.#generation++
    this.#hide()
  }

  setReadOnly(value){
    if(value)this.hidePopup()
  }

  destroy(){
    if(this.#destroyed)return
    this.#destroyed=true
    this.hidePopup()
  }

  #position(remeasure=true){
    const popup=this.#popup,anchor=this.#anchor
    if(!popup||!anchor)return
    const margin=8,gap=4
    const rect=anchor.getBoundingClientRect()
    const viewportWidth=Math.min(this.#view?.innerWidth??Infinity,this.#document.documentElement.clientWidth||Infinity)
    const viewportHeight=this.#view?.innerHeight??Infinity
    if(remeasure)popup.style.removeProperty('--oe-inline-popup-max-height')
    const maxWidth=Math.max(0,viewportWidth-margin*2)
    popup.style.maxWidth=maxWidth+'px'
    popup.style.left=margin+'px'
    if(remeasure)this.#naturalHeight=Math.max(popup.getBoundingClientRect().height,popup.scrollHeight)
    const naturalHeight=this.#naturalHeight
    const below=Math.max(0,viewportHeight-rect.bottom-gap-margin)
    const above=Math.max(0,rect.top-gap-margin)
    const down=below>=naturalHeight||below>=above
    const viewportSpace=Math.max(0,viewportHeight-margin*2)
    const available=Math.min(viewportSpace,(down?below:above)||viewportSpace)
    popup.style.maxHeight=available+'px'
    popup.style.setProperty('--oe-inline-popup-max-height',available+'px')
    popup.style.overflow=naturalHeight>available||popup.scrollWidth>maxWidth?'auto':''
    const bounds=popup.getBoundingClientRect()
    popup.style.left=Math.max(margin,Math.min(rect.left,viewportWidth-bounds.width-margin))+'px'
    const top=down?rect.bottom+gap:rect.top-bounds.height-gap
    popup.style.top=Math.max(margin,Math.min(top,viewportHeight-bounds.height-margin))+'px'
  }

  #hide(){
    // Retire this presentation before any teardown that can invoke
    // author-defined code (abort listeners, custom-element disconnect hooks,
    // or popup cleanup). A successor must keep its newly acquired ownership.
    const controller=this.#positionController
    const observer=this.#observer
    const outside=this.#outside
    const popup=this.#popup
    const cleanup=this.#cleanup
    this.#presentation=null
    this.#positionController=null
    this.#observer=null
    this.#outside=null
    this.#popup=null
    this.#anchor=null
    this.#cleanup=null
    this.#naturalHeight=0
    // Teardown steps are independent. A failing DOM observer or listener
    // removal must not strand the owned surface or skip plugin cleanup.
    const release=operation=>{
      try{operation()}
      catch(error){
        try{console.warn('[InlinePopupHost] Popup teardown failed:',error)}catch{}
      }
    }
    release(()=>controller?.abort())
    release(()=>observer?.disconnect())
    if(outside)release(()=>this.#document.removeEventListener('mousedown',outside,true))
    // DOM nodes are not permanently owned by their creator. If application
    // code reparented this transient surface, do not delete its new owner's DOM.
    if(popup?.parentNode===this.#root)release(()=>popup.remove())
    release(()=>this.#runCleanup(cleanup))
  }

  #runCleanup(cleanup){
    if(typeof cleanup!=='function')return
    this.#observe(()=>invokeObserver(()=>synchronousResult(cleanup()),[],error=>console.error('Inline popup cleanup failed',error)))
  }
}
