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

    const rect=anchor.getBoundingClientRect()
    const popupHeight=popup.offsetHeight||260
    const viewportHeight=this.#view?.innerHeight??Number.POSITIVE_INFINITY
    popup.style.left=rect.left+'px'
    popup.style.top=(viewportHeight-rect.bottom-8>=popupHeight
      ?rect.bottom+4
      :rect.top-popupHeight-4)+'px'

    this.#popup=popup
    this.#anchor=anchor
    this.#cleanup=cleanup??null

    const MutationObserverCtor=this.#view?.MutationObserver
    if(MutationObserverCtor){
      this.#observer=new MutationObserverCtor(()=>{
        if(this.#anchor&&!this.#root.contains(this.#anchor))this.hidePopup()
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

  #hide(){
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
