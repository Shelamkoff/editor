// @ts-check

const paddingNodes = new WeakSet()

/** @param {Node} node */
export function isRichTextCaretPadding(node) {
  return paddingNodes.has(node)
}

/** Give a terminal authored line break a visible empty line for native input.
 * The extra BR belongs only to the projection, not document text or offsets.
 * @param {HTMLElement} field
 */
export function projectRichTextCaretPadding(field) {
  for (const node of field.querySelectorAll('[data-oe-caret-padding]')) {
    if (paddingNodes.has(node)) node.remove()
  }
  /** @type {Node | null} */
  let last = null
  const visit = node => {
    if (node.nodeType === 3) {
      if (node.textContent?.length) last = node
      return
    }
    if (node.nodeType === 1 && (node.tagName === 'BR' || node.hasAttribute('data-inline-plugin'))) {
      last = node
      return
    }
    for (const child of node.childNodes) visit(child)
  }
  visit(field)
  if (!last || /** @type {Element} */ (last).tagName !== 'BR') return
  const padding = field.ownerDocument.createElement('br')
  padding.setAttribute('data-oe-caret-padding', '')
  paddingNodes.add(padding)
  last.parentNode.insertBefore(padding, last.nextSibling)
}
