import { sanitizeSubtree, sanitizePresentationSubtree } from './walker.js'
import { toTrustedHtml } from './trustedHtml.js'
import { inheritContentStyleField } from './contentClasses.js'

/**
 * Parse an HTML string into an inert template using Rector's private Trusted
 * Types policy when enforcement is active, then apply the narrow inline
 * formatting allowlist before anything can leave the template.
 *
 * @param {string} html
 * @param {Document} ownerDocument
 * @param {boolean} [presentation]
 * @returns {HTMLTemplateElement}
 */
function sanitizedTemplate(html, ownerDocument, presentation = false) {
  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(String(html || ''), ownerDocument))
  if (presentation) sanitizePresentationSubtree(template.content)
  else sanitizeSubtree(template.content)
  return template
}

/**
 * Sanitize an HTML string and return a safe plain HTML string.
 * Used for persisted block data and public string-oriented integrations.
 *
 * The return type deliberately remains `string` even under Trusted Types;
 * consumers assigning it to an HTML sink should use setSanitizedHtml() rather
 * than weakening their CSP with a default policy.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {string}
 */
export function sanitizeHtml(html, ownerDocument = globalThis.document) {
  if (!html) return ''
  return sanitizedTemplate(html, ownerDocument).innerHTML
}

/**
 * Assign HTML that is already trusted by the application/library owner. This
 * does not sanitize; use only for static Rector markup or trusted extension
 * markup such as plugin icons. User/document HTML belongs in setSanitizedHtml().
 *
 * Real DOM Elements always expose ownerDocument. The no-owner fallback exists
 * only for narrow DOM adapters/test doubles and deliberately avoids borrowing
 * ambient globalThis.document from another realm.
 * @param {Element} element
 * @param {string} html
 */
export function setTrustedHtml(element, html) {
  const value = String(html || '')
  const ownerDocument = element.ownerDocument
  if (!ownerDocument) {
    element.innerHTML = value
    return
  }
  element.innerHTML = /** @type {any} */ (toTrustedHtml(value, ownerDocument))
}

/**
 * Insert HTML that is already trusted by the application/library owner.
 * @param {Element} element
 * @param {'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'} position
 * @param {string} html
 */
export function insertTrustedHtml(element, position, html) {
  const value = String(html || '')
  const ownerDocument = element.ownerDocument
  if (!ownerDocument) {
    element.insertAdjacentHTML(position, value)
    return
  }
  element.insertAdjacentHTML(position, /** @type {any} */ (toTrustedHtml(value, ownerDocument)))
}

/**
 * Sanitize inert nodes and preserve presentation identity when replacing the
 * owned target. A template owns its content fragment rather than DOM children.
 * @param {Element} element
 * @param {string} html
 */
export function setSanitizedHtml(element, html) {
  const ownerDocument = element.ownerDocument ?? globalThis.document
  const target = element.localName === 'template' ? /** @type {HTMLTemplateElement} */ (element).content : element
  target.replaceChildren(sanitizedTemplate(html, ownerDocument, true).content)
  if (target === element) inheritContentStyleField(element)
}

/**
 * Sanitize and insert inline HTML at one adjacent position without exposing a
 * plain string to a Trusted Types protected sink.
 * @param {Element} element
 * @param {'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'} position
 * @param {string} html
 */
export function insertSanitizedHtml(element, position, html) {
  const ownerDocument = element.ownerDocument ?? globalThis.document
  const safe = sanitizeHtml(html, ownerDocument)
  // Preserve insertAdjacentHTML's context and native position errors while
  // keeping the class namespace on the actual inserted nodes.
  const range = ownerDocument.createRange()
  const parent = element.parentNode
  const where = position.toLowerCase()
  const Exception = ownerDocument.defaultView?.DOMException ?? DOMException
  if (where === 'beforebegin' || where === 'afterend') {
    if (!parent || parent.nodeType === 9) throw new Exception('No parent permits adjacent insertion', 'NoModificationAllowedError')
    if (where === 'beforebegin') range.setStartBefore(element)
    else range.setStartAfter(element)
  } else if (where === 'afterbegin') range.setStart(element, 0)
  else if (where === 'beforeend') range.setStart(element, element.childNodes.length)
  else throw new Exception('Invalid adjacent position', 'SyntaxError')
  const fragment = range.createContextualFragment(/** @type {any} */ (toTrustedHtml(safe, ownerDocument)))
  sanitizePresentationSubtree(fragment)
  range.insertNode(fragment)
}
