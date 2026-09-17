import { sanitizeSubtree } from './walker.js'
import { toTrustedHtml } from './trustedHtml.js'

/**
 * Parse an HTML string into an inert template using Rector's private Trusted
 * Types policy when enforcement is active, then apply the narrow inline
 * formatting allowlist before anything can leave the template.
 *
 * @param {string} html
 * @param {Document} ownerDocument
 * @returns {HTMLTemplateElement}
 */
function sanitizedTemplate(html, ownerDocument) {
  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(String(html || ''), ownerDocument))
  sanitizeSubtree(template.content)
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
 * Sanitize and replace an element's children through a TrustedHTML sink when
 * Trusted Types are enforced.
 * @param {Element} element
 * @param {string} html
 */
export function setSanitizedHtml(element, html) {
  const ownerDocument = element.ownerDocument ?? globalThis.document
  const safe = sanitizeHtml(html, ownerDocument)
  setTrustedHtml(element, safe)
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
  insertTrustedHtml(element, position, safe)
}
