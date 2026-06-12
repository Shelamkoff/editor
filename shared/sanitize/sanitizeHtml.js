import { sanitizeSubtree } from './walker.js'

/**
 * Sanitize an HTML string and return a safe HTML string.
 * Used by block plugins when rendering stored content into contenteditable DOM.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (!html) return ''

  const temp = document.createElement('div')
  temp.innerHTML = html
  sanitizeSubtree(temp)
  return temp.innerHTML
}
