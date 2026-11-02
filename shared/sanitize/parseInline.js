import { sanitizePresentationSubtree } from './walker.js'
import { toTrustedHtml } from './trustedHtml.js'
import { normalizeTextValue } from '../textFormat.js'

/**
 * Parse an HTML string into a sanitized DocumentFragment.
 * Used by the renderer for document output of inline content.
 *
 * Retains sanitizeHtml()'s canonical HTML meaning, with presentation-only class
 * identity on live nodes. Returns a DocumentFragment without serialize/reparse.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {DocumentFragment}
 */
export function parseInline(html, ownerDocument = globalThis.document) {
  const fragment = ownerDocument.createDocumentFragment()
  const source = normalizeTextValue(html)
  if (!source) return fragment

  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(source, ownerDocument))
  sanitizePresentationSubtree(template.content)
  fragment.appendChild(template.content)

  return fragment
}
