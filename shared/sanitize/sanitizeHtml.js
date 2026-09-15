import { sanitizeSubtree } from './walker.js'

/**
 * Sanitize an HTML string and return a safe HTML string.
 * Used by block plugins when rendering stored content into contenteditable DOM.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {string}
 */
export function sanitizeHtml(html, ownerDocument = globalThis.document) {
  if (!html) return ''

  // Template contents are inert: parsing untrusted markup cannot execute a
  // script or start media loading before the allowlist walker runs.
  const template = ownerDocument.createElement('template')
  template.innerHTML = html
  sanitizeSubtree(template.content)
  return template.innerHTML
}
