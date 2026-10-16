// @ts-check
import { toTrustedHtml } from './sanitize/trustedHtml.js'

/** Use the owning browser's HTML parser to distinguish empty rich-text marks
 * from authored characters. Canonical widget placeholders remain real content.
 *
 * @param {string} html Canonical rich text from a versioned block schema.
 * @param {{ownerDocument?: Document}} [context] Optional owning DOM realm.
 * @returns {boolean}
 */
export function isRichTextEmpty(html, context = {}) {
  if (typeof html !== 'string') throw new TypeError('Rich text must be a string')
  if (!html.trim()) return true
  // Most keystrokes remain plain text; avoid a DOM parse on this hot path.
  if (!/[<&]/.test(html)) return false
  const ownerDocument = context.ownerDocument ?? globalThis.document
  if (!ownerDocument?.createElement) {
    throw new TypeError('Rich-text emptiness requires the owning document for HTML')
  }
  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(html, ownerDocument))
  if (!template.content) throw new TypeError('Rich-text emptiness requires a template parser')
  return !(template.content.textContent ?? '').trim()
}
