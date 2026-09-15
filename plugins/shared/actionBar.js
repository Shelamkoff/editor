/**
 * Shared action bar utilities for block plugins (image, gallery, etc.).
 * Eliminates duplicate makeActionBtn/makeSep across plugin view-filled files.
 */

/**
 * Create an action button with click handler and AbortSignal cleanup.
 * @param {string} cssClass — CSS class for the button element
 * @param {string} innerHTML — SVG icon or label HTML
 * @param {() => void} handler — click callback
 * @param {AbortSignal} signal — AbortSignal for automatic listener removal
 * @param {Document} [ownerDocument] Document that owns the target block
 * @returns {HTMLButtonElement}
 */
export function makeActionBtn(cssClass, innerHTML, handler, signal, ownerDocument = globalThis.document) {
  const btn = ownerDocument.createElement('button')
  btn.type = 'button'
  btn.className = cssClass
  btn.innerHTML = innerHTML
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    handler()
  }, { signal })
  return btn
}

/**
 * Create a visual separator element for action bars.
 * @param {string} cssClass — CSS class for the separator element
 * @param {Document} [ownerDocument] Document that owns the target block
 * @returns {HTMLDivElement}
 */
export function makeSep(cssClass, ownerDocument = globalThis.document) {
  const sep = ownerDocument.createElement('div')
  sep.className = cssClass
  return sep
}
