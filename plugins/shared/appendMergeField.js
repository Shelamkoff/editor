import { sanitizeHtml } from '../../core/sanitize.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

/** Append one authored field without recreating existing interactive DOM.
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {unknown} value
 * @param {string} [separator]
 * @returns {boolean} Whether nonempty content was appended.
 */
export function appendMergeField(root, selector, value, separator = '<br>') {
  const field = root.querySelector(selector)
  const html = sanitizeHtml(normalizeTextValue(value))
  if (!field || !html) return false
  field.insertAdjacentHTML('beforeend', (field.innerHTML ? separator : '') + html)
  return true
}
