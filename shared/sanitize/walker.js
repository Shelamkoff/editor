import { ALLOWED_TAGS, ALLOWED_ATTRS } from './allowlist.js'
import { sanitizeUrl } from './sanitizeUrl.js'
import { sanitizeStyle } from './sanitizeStyle.js'
import { namespaceContentClass } from './contentClasses.js'
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

/**
 * Recursively sanitize a DOM subtree in place.
 *
 * - Unknown tags are unwrapped (children preserved).
 * - Disallowed attributes are stripped.
 * - `<a>` href is sanitized and `rel="noopener noreferrer"` is forced.
 * - `<span style>` is filtered through the style allowlist.
 * - Host-owned live inline widgets are serialized to canonical placeholders before
 *   this external HTML sanitizer runs; forged widget marker attributes are ordinary
 *   disallowed attributes here and never decode a widget.
 *
 * @param {Node} node
 */
export function sanitizeSubtree(node) {
  sanitize(node, false)
}

/** Sanitize author nodes for a DOM projection, before widget hydration.
 * @param {Node} node
 */
export function sanitizePresentationSubtree(node) {
  sanitize(node, true)
}

/** @param {Node} node @param {boolean} presentation */
function sanitize(node, presentation) {
  let i = 0

  while (i < node.childNodes.length) {
    const child = /** @type {ChildNode} */ (node.childNodes[i])

    if (child.nodeType === 3) {
      i++
      continue
    }

    if (child.nodeType !== 1) {
      child.remove()
      continue
    }

    let el = /** @type {HTMLElement} */ (child)
    const tag = el.tagName.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep children, remove the tag itself.
      // Don't advance i — the newly-inserted children must be revisited.
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el)
      }
      el.remove()
      continue
    }


    // Strip disallowed attributes
    const allowedAttrs = Object.hasOwn(ALLOWED_ATTRS, tag) ? ALLOWED_ATTRS[tag] : undefined
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      if (!allowedAttrs?.has(attr.name)) {
        el.removeAttribute(attr.name)
      }
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') || ''
      el.setAttribute('href', sanitizeUrl(href))
      el.setAttribute('rel', 'noopener noreferrer')
    }

    if (el.hasAttribute('style')) {
      const safeStyle = sanitizeStyle(el.style)
      if (safeStyle) {
        el.setAttribute('style', safeStyle)
      } else {
        el.removeAttribute('style')
      }
    }

    // The former serialize/reparse sink gave every admitted tag HTML meaning.
    // Preserve that meaning in direct fragments too: an SVG <a>/<mark> moved
    // outside its rejected SVG root otherwise becomes invisible foreign DOM.
    // Copy only attributes already admitted and hardened above, before any
    // replacement can enter an active document.
    if (el.namespaceURI !== undefined && el.namespaceURI !== HTML_NAMESPACE) {
      const replacement = el.ownerDocument.createElementNS(HTML_NAMESPACE, tag)
      for (const attribute of Array.from(el.attributes)) replacement.setAttribute(attribute.name, attribute.value)
      while (el.firstChild) replacement.appendChild(el.firstChild)
      el.replaceWith(replacement)
      el = replacement
    }

    // Unwrap empty `<span>` with no meaningful attributes.
    if (tag === 'span' && !el.getAttribute('style') && !el.getAttribute('class')) {
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el)
      }
      el.remove()
      continue
    }

    if (presentation) namespaceContentClass(el)
    sanitize(el, presentation)
    i++
  }
}
