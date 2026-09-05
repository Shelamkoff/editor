/** @param {Node} node */
function isAtomic(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && (/** @type {Element} */ (node).tagName === 'BR'
      || /** @type {Element} */ (node).hasAttribute('data-inline-plugin'))
}

/** Walk logical leaves without entering inline widgets.
 * @param {Node} root
 * @returns {Generator<Node>}
 */
function* positionNodes(root) {
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    if (node.nodeType === Node.TEXT_NODE || isAtomic(node)) yield node
    else {
      for (let index = node.childNodes.length - 1; index >= 0; index--) {
        stack.push(node.childNodes[index])
      }
    }
  }
}

/** UTF-16 text units, with one unit per BR or atomic inline widget.
 * @param {Node} root
 * @returns {number}
 */
export function getTextLength(root) {
  let length = 0
  for (const node of positionNodes(root)) length += isAtomic(node) ? 1 : (node.textContent?.length ?? 0)
  return length
}

/**
 * Create a TreeWalker for text transformations, excluding widget labels.
 * Position calculations use logical leaves instead of this text-only view.
 * @param {Node} root
 * @returns {TreeWalker}
 */
export function editableTextWalker(root) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('[data-inline-plugin]')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
}

/** @param {Node} node @returns {Text | null} */
export function firstTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (node)
  return /** @type {Text | null} */ (editableTextWalker(node).nextNode())
}

/** @param {Node} node @returns {Text | null} */
export function lastTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (node)
  const walker = editableTextWalker(node)
  let last = null
  while (walker.nextNode()) last = walker.currentNode
  return /** @type {Text | null} */ (last)
}

/**
 * Convert a native DOM boundary to a logical position. Both sides of a BR or
 * widget have distinct offsets; a widget's label never changes its length.
 * @param {Node} container
 * @param {Node} targetNode
 * @param {number} targetOffset
 * @returns {number}
 */
export function getTextOffset(container, targetNode, targetOffset) {
  if (!container.contains(targetNode)) return getTextLength(container)
  for (let node = targetNode; node && node !== container; node = node.parentNode) {
    if (isAtomic(node)) {
      targetNode = node
      targetOffset = targetOffset > 0 ? 1 : 0
      break
    }
  }
  let offset = 0
  if (targetNode.nodeType === Node.TEXT_NODE || isAtomic(targetNode)) {
    offset = Math.max(0, Math.min(targetOffset, getTextLength(targetNode)))
  } else {
    for (let index = 0; index < Math.min(targetOffset, targetNode.childNodes.length); index++) {
      offset += getTextLength(targetNode.childNodes[index])
    }
  }
  for (let node = targetNode; node && node !== container; node = node.parentNode) {
    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
      offset += getTextLength(sibling)
    }
  }
  return offset
}

/** @param {Node} node @param {number} offset @returns {{ node: Node, offset: number }} */
function boundary(node, offset) {
  if (!isAtomic(node)) return { node, offset }
  const parent = node.parentNode
  if (!parent) return { node, offset: 0 }
  const index = Array.prototype.indexOf.call(parent.childNodes, node)
  return { node: parent, offset: index + (offset > 0 ? 1 : 0) }
}

/**
 * Resolve a logical position without placing a caret inside an atomic node.
 * At text-wrapper boundaries, the bias keeps selection starts/ends on their
 * intended side. Out-of-range positions clamp to the nearest valid boundary.
 * @param {Node} container
 * @param {number} charOffset
 * @param {'start' | 'end'} [bias]
 * @returns {{ node: Node, offset: number }}
 */
export function findNodeAtOffset(container, charOffset, bias = 'start') {
  const nodes = [...positionNodes(container)]
  let remaining = Math.max(0, Math.trunc(charOffset) || 0)
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    const length = isAtomic(node) ? 1 : (node.textContent?.length ?? 0)
    if (remaining < length) return boundary(node, remaining)
    if (remaining === length) {
      if (bias === 'start' && nodes[index + 1]) return boundary(nodes[index + 1], 0)
      return boundary(node, length)
    }
    remaining -= length
  }
  const last = nodes[nodes.length - 1]
  return last ? boundary(last, getTextLength(last)) : { node: container, offset: 0 }
}

/**
 * Restore a selection using the same logical positions as caret/history APIs.
 * @param {HTMLElement} element
 * @param {number} startOffset
 * @param {number} endOffset
 */
export function restoreSelectionByOffsets(element, startOffset, endOffset) {
  const selection = window.getSelection()
  if (!selection) return
  const start = findNodeAtOffset(element, startOffset, 'start')
  const end = findNodeAtOffset(element, endOffset, 'end')
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Find the last occurrence of text within a DOM text node.
 * @param {HTMLElement} element
 * @param {string} search
 * @returns {Range | null}
 */
export function createRangeFromLastTextMatch(element, search) {
  if (!search) return null
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  /** @type {Text | null} */
  let matchNode = null
  let matchOffset = -1
  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode)
    const offset = node.data.lastIndexOf(search)
    if (offset >= 0) { matchNode = node; matchOffset = offset }
  }
  if (!matchNode) return null
  const range = document.createRange()
  range.setStart(matchNode, matchOffset)
  range.setEnd(matchNode, matchNode.length)
  return range
}
