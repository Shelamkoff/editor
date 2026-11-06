/** Keep keyboard ownership when a plugin action replaces its focused button.
 * @template T
 * @param {HTMLElement} element Owning plugin wrapper.
 * @param {() => T} operation Synchronous document or view action.
 * @param {{includeFormControls?:boolean,sourceControl?:HTMLElement}} [options] Opt in when the action replaces a native form control; its current change source can retain ownership across blur.
 * @returns {T} The action's result.
 */
export function retainControlFocus(element, operation, {includeFormControls=false,sourceControl}={}) {
  const document=element.ownerDocument
  const focused=document.activeElement
  const owned=focused&&element.contains(focused)&&!focused.closest(includeFormControls
    ?'[contenteditable="true"]':'input,textarea,select,[contenteditable="true"]')
  const blurredSource=includeFormControls&&focused===document.body&&sourceControl?.isConnected
    &&sourceControl.ownerDocument===document&&element.contains(sourceControl)
    &&sourceControl.closest('input,textarea,select')===sourceControl
    &&!sourceControl.closest('[contenteditable="true"]')
  if(!owned&&!blurredSource)return operation()
  let acquired=false
  let pending=false
  const onFocusIn=()=>{acquired=true}
  const release=()=>document.removeEventListener('focusin',onFocusIn,{capture:true})
  document.addEventListener('focusin',onFocusIn,{capture:true})
  try{
    const result=operation()
    if(blurredSource){
      // Native change can run with BODY active before focus navigation ends.
      // A task (not a microtask) lets its intended target acquire ownership.
      if(!acquired&&element.isConnected&&document.activeElement===document.body){
        const schedule=document.defaultView?.setTimeout?.bind(document.defaultView)??setTimeout
        schedule(()=>{
          try{
            if(!acquired&&element.isConnected&&document.activeElement===document.body)element.focus({preventScroll:true})
          }finally{release()}
        },0)
        pending=true
      }
    }else{
      const current=document.activeElement
      // Projection can remove or hide the original control without a focusin.
      // Any acquired focus belongs to the newer interaction.
      if(!acquired&&element.isConnected&&(!element.contains(current)||current.closest('[hidden]')))element.focus({preventScroll:true})
    }
    return result
  }finally{
    if(!pending)release()
  }
}
