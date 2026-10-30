// @ts-check
import { sanitizeHtml } from './sanitize/sanitizeHtml.js'
import { toTrustedHtml } from './sanitize/trustedHtml.js'

const CANONICAL_TAGS = new Map([
  ['strong', 'b'],
  ['em', 'i'],
  ['strike', 's'],
])

const MERGEABLE_TAGS = new Set(['b', 'i', 's'])

/**
 * @param {Document | undefined} ownerDocument
 * @returns {Document}
 */
function requireDocument(ownerDocument) {
  const document = ownerDocument ?? globalThis.document
  if (!document?.createElement) {
    throw new TypeError('Rich-text normalization requires an ownerDocument')
  }
  return document
}

/**
 * @param {Element} element
 * @returns {void}
 */
function canonicalizeStyle(element) {
  if (!element.hasAttribute('style')) return
  const style = /** @type {HTMLElement} */ (element).style
  const declarations = []
  // Native CSS parsing retains comment/string boundaries, escapes, duplicate
  // precedence and priorities. Canonicalization only orders parsed properties.
  for (let index = 0; index < style.length; index++) {
    const property = style.item(index)
    const value = style.getPropertyValue(property)
    if (!value) continue
    const priority = style.getPropertyPriority(property)
    declarations.push([property, `${value}${priority ? ` !${priority}` : ''}`])
  }
  declarations.sort((left, right) => left[0].localeCompare(right[0]))

  if (declarations.length === 0) {
    element.removeAttribute('style')
    return
  }

  element.setAttribute(
    'style',
    declarations.map(([property, value]) => `${property}: ${value};`).join(' '),
  )
}

/**
 * Reinsert attributes in lexical order so serialization does not depend on
 * source order. Inline widget markup is sanitized before this function runs;
 * attribute sorting changes only serialization, not behavior.
 *
 * @param {Element} element
 * @returns {void}
 */
function canonicalizeAttributes(element) {
  const attributes = Array.from(element.attributes)
    .map(attribute => [attribute.name, attribute.value])
    .sort((left, right) => left[0].localeCompare(right[0]))

  for (const attribute of Array.from(element.attributes)) {
    element.removeAttribute(attribute.name)
  }
  for (const [name, value] of attributes) {
    element.setAttribute(name, value)
  }
}

/**
 * @param {Element} element
 * @param {string} tagName
 * @param {Document} ownerDocument
 * @returns {Element}
 */
function replaceTag(element, tagName, ownerDocument) {
  const replacement = ownerDocument.createElement(tagName)
  for (const attribute of Array.from(element.attributes)) {
    replacement.setAttribute(attribute.name, attribute.value)
  }
  while (element.firstChild) replacement.appendChild(element.firstChild)
  element.replaceWith(replacement)
  return replacement
}

/**
 * @param {Element} left
 * @param {Element} right
 * @returns {boolean}
 */
function sameAttributes(left, right) {
  if (left.attributes.length !== right.attributes.length) return false
  for (const attribute of Array.from(left.attributes)) {
    if (right.getAttribute(attribute.name) !== attribute.value) return false
  }
  return true
}

/**
 * @param {ParentNode} parent
 * @returns {void}
 */
function mergeAdjacentCanonicalTags(parent) {
  let node = parent.firstChild
  while (node) {
    const next = node.nextSibling

    if (
      node.nodeType === 1
      && next?.nodeType === 1
      && MERGEABLE_TAGS.has(/** @type {Element} */ (node).tagName.toLowerCase())
      && /** @type {Element} */ (node).tagName === /** @type {Element} */ (next).tagName
      && sameAttributes(/** @type {Element} */ (node), /** @type {Element} */ (next))
    ) {
      while (next.firstChild) node.appendChild(next.firstChild)
      next.remove()
      continue
    }

    if (node.nodeType === 1) {
      mergeAdjacentCanonicalTags(/** @type {Element} */ (node))
    }
    node = next
  }
}

/**
 * Canonicalize a detached, already-sanitized rich-text DOM subtree.
 * Shared with the editor serializer so literal inline tokens are protected
 * only after any tag replacements and adjacent-mark merges that could join
 * otherwise separate authored Text leaves.
 *
 * @param {ParentNode} root
 * @param {Document} ownerDocument
 */
export function canonicalizeRichTextSubtree(root, ownerDocument) {
  const elements = Array.from(root.querySelectorAll('*'))
  for (const original of elements) {
    const canonicalTag = CANONICAL_TAGS.get(original.tagName.toLowerCase())
    const element = canonicalTag
      ? replaceTag(original, canonicalTag, ownerDocument)
      : original

    canonicalizeStyle(element)
    canonicalizeAttributes(element)
  }

  mergeAdjacentCanonicalTags(root)
}

/**
 * Canonicalize already-sanitized Rector rich text.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {string}
 */
export function canonicalizeRichText(html, ownerDocument) {
  const document = requireDocument(ownerDocument)
  const template = document.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(String(html || ''), document))

  canonicalizeRichTextSubtree(template.content, document)
  return template.innerHTML
}

/**
 * Sanitize and canonicalize Rector rich text into a stable persisted string.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {string}
 */
export function normalizeRichText(html, ownerDocument) {
  const document = requireDocument(ownerDocument)
  return canonicalizeRichText(sanitizeHtml(html, document), document)
}
