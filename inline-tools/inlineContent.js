/** Inline tag selector for empty-tag cleanup. */
const INLINE_TAGS_SELECTOR = 'b, i, s, em, strong, u, mark, code, span, a, sup, sub'

/** Author-created line breaks and images are content even without text.
 * @param {Node} node
 * @returns {boolean}
 */
export function hasInlineContent(node) {
  return !!node.textContent || (
    (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
    && !!/** @type {Element | DocumentFragment} */ (node).querySelector('br, img')
  )
}

/**
 * Remove empty inline wrapper tags and normalize text nodes.
 * Called after any DOM mutation that unwraps/removes inline formatting.
 * @param {Node | null} parent
 * @returns {void}
 */
export function removeEmptyInlineTags(parent) {
  if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return
  const empties = /** @type {HTMLElement} */ (parent).querySelectorAll(INLINE_TAGS_SELECTOR)
  for (const el of empties) {
    if (!el.textContent && !el.querySelector('img, br')) el.remove()
  }
  parent.normalize()
}

