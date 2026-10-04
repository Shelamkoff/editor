import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'

/** Build the shared v1 media-source presentation on an instance-owned DOM.
 * @param {{ownerDocument:Document,prefix:string,icon:string,uploadText:string,afterText:string,urlPrefix:string,emptyText:string,readOnly:boolean,signal:AbortSignal,onUpload:()=>void,inlineActions:Array<{label:string,onSelect:()=>void}>,actions?:Array<{icon?:string,label:string,onSelect:()=>void}>}} options
 * @returns {HTMLDivElement}
 */
export function createMediaDropzone(options) {
  const { ownerDocument: document, prefix, signal } = options
  const root = document.createElement('div')
  root.className = prefix + '__select'
  if (options.readOnly) { root.textContent = options.emptyText; return root }
  const icon = document.createElement('div')
  icon.className = prefix + '__select-icon'
  setTrustedHtml(icon, options.icon)
  const svg = icon.querySelector('svg')
  if (svg) { svg.style.width = '48px'; svg.style.height = '48px' }
  const text = document.createElement('div')
  text.className = prefix + '__select-text'
  const link = (label, onSelect) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = prefix + '__select-link'
    button.textContent = label
    button.addEventListener('click', onSelect, { signal })
    return button
  }
  text.append(link(options.uploadText, options.onUpload), ' ' + options.afterText)
  for (const action of options.inlineActions) text.append(document.createElement('br'), options.urlPrefix + ' ', link(action.label, action.onSelect))
  root.append(icon, text)
  if (options.actions?.length) {
    const actions = document.createElement('div')
    actions.className = prefix + '__select-actions'
    for (const action of options.actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = prefix + '__select-action'
      if (action.icon) setTrustedHtml(button, action.icon)
      button.append(document.createTextNode(action.label))
      button.addEventListener('click', action.onSelect, { signal })
      actions.append(button)
    }
    root.append(actions)
  }
  return root
}
