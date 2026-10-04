/** Keep keyboard ownership when a plugin action replaces its focused button.
 * @template T
 * @param {HTMLElement} element Owning plugin wrapper.
 * @param {() => T} operation Synchronous document or view action.
 * @returns {T} The action's result.
 */
export function retainControlFocus(element, operation) {
  const document=element.ownerDocument
  const focused=document.activeElement
  const owned=focused&&element.contains(focused)&&!focused.closest('input,textarea,select,[contenteditable="true"]')
  const result=operation()
  const current=document.activeElement
  if(owned&&element.isConnected&&(!element.contains(current)||current.closest('[hidden]')))element.focus({preventScroll:true})
  return result
}
