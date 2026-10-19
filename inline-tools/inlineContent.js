/** Inline tag selector for empty-tag cleanup. */
const INLINE_TAGS_SELECTOR = 'b, i, s, em, strong, u, mark, code, span, a, sup, sub'
const ELEMENT_NODE = 1
const DOCUMENT_FRAGMENT_NODE = 11

/** Author-created line breaks and images are content even without text.
 * @param {Node} node
 * @returns {boolean}
 */
export function hasInlineContent(node) {
  return !!node.textContent || (
    (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE)
    && !!/** @type {Element | DocumentFragment} */ (node).querySelector('br, img, [data-inline-plugin]')
  )
}

/**
 * Remove empty inline wrapper tags and normalize text nodes.
 * Called after any DOM mutation that unwraps/removes inline formatting.
 * @param {Node | null} parent
 * @returns {void}
 */
export function removeEmptyInlineTags(parent) {
  if (!parent || parent.nodeType !== ELEMENT_NODE) return
  const empties = /** @type {HTMLElement} */ (parent).querySelectorAll(INLINE_TAGS_SELECTOR)
  for (const el of empties) {
    // Embedded native, locked and inline-widget descendants are independently
    // owned controls, including empty nodes with no visible text. Do not treat
    // their elements as disposable editor formatting wrappers.
    if (el.closest('[data-inline-plugin], [contenteditable="false"], button, input, textarea, select, option, [role="button"]')) continue
    if (!hasInlineContent(el)) el.remove()
  }
  parent.normalize()
}

