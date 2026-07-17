import { sanitizeSubtree } from './walker.js'
import { normalizeTextValue } from '../textFormat.js'

/**
 * Parse an HTML string into a sanitized DocumentFragment.
 * Used by the renderer for document output of inline content.
 *
 * Behaves identically to sanitizeHtml(), but returns a live DocumentFragment
 * instead of a string — avoids an extra serialize/parse round-trip.
 *
 * @param {string} html
 * @returns {DocumentFragment}
 */
export function parseInline(html) {
  const fragment = document.createDocumentFragment()
  const source = normalizeTextValue(html)
  if (!source) return fragment

  const template = document.createElement('template')
  template.innerHTML = source
  sanitizeSubtree(template.content)
  fragment.appendChild(template.content)

  return fragment
}
