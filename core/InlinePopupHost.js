// @ts-check
import { invokeObserver } from '../shared/invokeObserver.js'

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

  constructor({root,isReadOnly=()=>false}){
    if(!root?.ownerDocument)throw new TypeError('InlinePopupHost requires an editor root')
    this.#root=root
    this.#document=root.ownerDocument
    this.#view=this.#document.defaultView
    this.#isReadOnly=isReadOnly
  }

  showPopup(anchor,content,cleanup){
    if(this.#destroyed||this.#isReadOnly()||!this.#root.contains(anchor)){
      this.#runCleanup(cleanup)
      return
    }
    const generation=++this.#generation
    this.#hide()
    if(generation!==this.#generation||this.#destroyed||this.#isReadOnly()||!this.#root.contains(anchor)){
      this.#runCleanup(cleanup)
      return
    }

    const popup=this.#document.createElement('div')
    popup.className='oe-ip-popup'
    popup.appendChild(content)
    this.#root.appendChild(popup)

    this.#popup=popup
    this.#anchor=anchor
    this.#cleanup=cleanup??null
    this.#position()

    const Ctor=this.#view?.AbortController??AbortController
    this.#positionController=new Ctor()
    const positionSignal=this.#positionController.signal
    this.#view?.addEventListener('resize',()=>this.#position(),{signal:positionSignal})
    this.#view?.addEventListener('scroll',()=>this.#position(false),{capture:true,passive:true,signal:positionSignal})

    const MutationObserverCtor=this.#view?.MutationObserver
    if(MutationObserverCtor){
      this.#observer=new MutationObserverCtor(()=>{
        if(this.#anchor&&!this.#root.contains(this.#anchor))this.hidePopup()
        else this.#position()
      })
      this.#observer.observe(this.#root,{childList:true,subtree:true})
    }

    queueMicrotask(()=>{
      if(this.#popup!==popup)return
      this.#outside=event=>{
        const target=event.target
        if(!(target instanceof (this.#view?.Node??Node)))return
        if(popup.contains(target)||anchor.contains(target))return
        this.hidePopup()
      }
      this.#document.addEventListener('mousedown',this.#outside,true)
    })
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
    this.#positionController?.abort()
    this.#positionController=null
    this.#naturalHeight=0
    this.#observer?.disconnect()
    this.#observer=null
    if(this.#outside){
      this.#document.removeEventListener('mousedown',this.#outside,true)
      this.#outside=null
    }
    this.#popup?.remove()
    this.#popup=null
    this.#anchor=null
    const cleanup=this.#cleanup
    this.#cleanup=null
    this.#runCleanup(cleanup)
  }

  #runCleanup(cleanup){
    invokeObserver(cleanup,[],error=>console.error('Inline popup cleanup failed',error))
  }
}
