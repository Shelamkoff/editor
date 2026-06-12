/**
 * Create a TreeWalker that skips text nodes inside inline plugin widgets.
 * @param {Node} root
 * @returns {TreeWalker}
 */
export function editableTextWalker(root) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('[data-inline-plugin]')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
}

/**
 * Get the first text node inside a node.
 * @param {Node} node
 * @returns {Text | null}
 */
export function firstTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (node)
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  return /** @type {Text | null} */ (w.nextNode())
}

/**
 * Get the last text node inside a node.
 * @param {Node} node
 * @returns {Text | null}
 */
export function lastTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (node)
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let last = null
  while (w.nextNode()) last = w.currentNode
  return /** @type {Text | null} */ (last)
}

/**
 * Calculate character offset from the start of a container element.
 * Uses TreeWalker over text nodes — consistent with findNodeAtOffset().
 * Handles both text-node and element-node target positions.
 * @param {Node} container
 * @param {Node} targetNode
 * @param {number} targetOffset
 * @returns {number}
 */
export function getTextOffset(container, targetNode, targetOffset) {
  // Normalize element-node positions to text-node positions.
  // When targetNode is an element, targetOffset is a child-node index.
  if (targetNode.nodeType === Node.ELEMENT_NODE) {
    if (targetOffset < targetNode.childNodes.length) {
      // "Before child[targetOffset]" → resolve to (firstTextNodeInChild, 0)
      const child = /** @type {Node} */ (targetNode.childNodes[targetOffset])
      const first = firstTextNode(child)
      if (first) {
        targetNode = first
        targetOffset = 0
      } else {
        return countTextBefore(container, child)
      }
    } else {
      // "After last child" → resolve to (lastTextNode, endOfText)
      const last = lastTextNode(targetNode)
      if (last) {
        targetNode = last
        targetOffset = last.textContent?.length ?? 0
      } else {
        // No text nodes at all — return total text length up to this point
        return container.textContent?.length ?? 0
      }
    }
  }

  // targetNode is now a text node — walk until we find it
  // Use editableTextWalker to skip inline plugin widget text (consistent with setCaretToOffset)
  const walker = editableTextWalker(container)
  let offset = 0

  while (walker.nextNode()) {
    if (walker.currentNode === targetNode) {
      return offset + targetOffset
    }
    offset += walker.currentNode.textContent?.length ?? 0
  }

  // targetNode not found — return total offset (defensive)
  return offset
}

/**
 * Restore a text selection by character offsets within an element.
 * Walks text nodes to find the correct start/end positions.
 * @param {HTMLElement} element
 * @param {number} startOffset — character offset from start
 * @param {number} endOffset — character offset for end
 */
export function restoreSelectionByOffsets(element, startOffset, endOffset) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const walker = editableTextWalker(element)
  let pos = 0
  let startSet = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent?.length ?? 0
    if (!startSet && pos + len >= startOffset) {
      range.setStart(node, startOffset - pos)
      startSet = true
    }
    if (startSet && pos + len >= endOffset) {
      range.setEnd(node, endOffset - pos)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    pos += len
  }
  // Fallback: select all content
  range.selectNodeContents(element)
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Count total text content before a node in document order.
 * @param {Node} container
 * @param {Node} refNode
 * @returns {number}
 */
function countTextBefore(container, refNode) {
  const walker = editableTextWalker(container)
  let offset = 0
  while (walker.nextNode()) {
    const textNode = walker.currentNode
    // Stop when we reach or pass the reference node
    if (textNode === refNode) break
    if (refNode.nodeType === Node.ELEMENT_NODE && refNode.contains(textNode)) break
    // Check document order: stop if textNode comes after refNode
    const pos = textNode.compareDocumentPosition(refNode)
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) break
    offset += textNode.textContent?.length ?? 0
  }
  return offset
}
