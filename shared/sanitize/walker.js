import { ALLOWED_TAGS, ALLOWED_ATTRS, INLINE_PLUGIN_ATTRS } from './allowlist.js'
import { sanitizeUrl } from './sanitizeUrl.js'
import { sanitizeStyle } from './sanitizeStyle.js'

/**
 * Recursively sanitize a DOM subtree in place.
 *
 * - Unknown tags are unwrapped (children preserved).
 * - Disallowed attributes are stripped.
 * - `<a>` href is sanitized and `rel="noopener noreferrer"` is forced.
 * - `<span style>` is filtered through the style allowlist.
 * - `<span data-inline-plugin>` subtrees keep all their attributes/styles intact
 *   (inline plugins manage their own markup; style/class whitelisting here would
 *   strip legitimate plugin state like color swatches). Their children are still
 *   recursively sanitized so user-authored content inside plugin widgets is safe.
 *
 * @param {Node} node
 */
export function sanitizeSubtree(node) {
  let i = 0

  while (i < node.childNodes.length) {
    const child = /** @type {ChildNode} */ (node.childNodes[i])

    if (child.nodeType === Node.TEXT_NODE) {
      i++
      continue
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove()
      continue
    }

    const el = /** @type {HTMLElement} */ (child)
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

    // Inline plugin span — preserve attributes/styles, recurse into children.
    if (tag === 'span' && el.hasAttribute('data-inline-plugin')) {
      for (const attr of Array.from(el.attributes)) {
        if (!INLINE_PLUGIN_ATTRS.has(attr.name) || attr.name.startsWith('on')) {
          el.removeAttribute(attr.name)
        }
      }
      el.removeAttribute('style')
      el.setAttribute('contenteditable', 'false')
      sanitizeSubtree(el)
      i++
      continue
    }

    // Strip disallowed attributes
    const allowedAttrs = ALLOWED_ATTRS[tag]
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
      const safeStyle = sanitizeStyle(el.getAttribute('style') || '')
      if (safeStyle) {
        el.setAttribute('style', safeStyle)
      } else {
        el.removeAttribute('style')
      }
    }

    // Unwrap empty `<span>` with no meaningful attributes.
    if (tag === 'span' && !el.getAttribute('style') && !el.getAttribute('class')) {
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el)
      }
      el.remove()
      continue
    }

    sanitizeSubtree(el)
    i++
  }
}
