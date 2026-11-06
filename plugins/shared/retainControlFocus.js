/** Keep keyboard ownership when a plugin action replaces its focused button.
 * @template T
 * @param {HTMLElement} element Owning plugin wrapper.
 * @param {() => T} operation Synchronous document or view action.
 * @param {{includeFormControls?:boolean}} [options] Opt in when the action replaces a native form control.
 * @returns {T} The action's result.
 */
export function retainControlFocus(element, operation, {includeFormControls=false}={}) {
  const document=element.ownerDocument
  const focused=document.activeElement
  const owned=focused&&element.contains(focused)&&!focused.closest(includeFormControls
    ?'[contenteditable="true"]':'input,textarea,select,[contenteditable="true"]')
  if(!owned)return operation()
  let acquired=false
  const onFocusIn=()=>{acquired=true}
  document.addEventListener('focusin',onFocusIn,{capture:true})
  let result
  try{result=operation()}
  finally{document.removeEventListener('focusin',onFocusIn,{capture:true})}
  const current=document.activeElement
  // Projection can remove or hide the original control without a focusin.
  // Any acquired focus during publication belongs to the newer interaction.
  if(!acquired&&element.isConnected&&(!element.contains(current)||current.closest('[hidden]')))element.focus({preventScroll:true})
  return result
}
