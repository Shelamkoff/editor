import { isRichTextCaretPadding } from './richTextCaretPadding.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const SHOW_TEXT = 4
const FILTER_ACCEPT = 1
const FILTER_REJECT = 2

/** @param {Node} node */
function isAtomic(node) {
  return node.nodeType === ELEMENT_NODE
    && (/** @type {Element} */ (node).tagName === 'BR'
      || /** @type {Element} */ (node).hasAttribute('data-inline-plugin'))
}

/** @param {Element} element */
function isNativeControl(element) {
  return ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(element.tagName)
    || element.getAttribute?.('role') === 'button'
}

/** Controls within an authored field do not own authored text offsets.
 * Nested editing hosts have their own offset namespace. This guard is also
 * used when resolving native endpoints in a locked control.
 * @param {Node} node
 * @param {Node} root
 */
function isOutsideLogicalText(node, root) {
  if (node.nodeType !== ELEMENT_NODE || isAtomic(node)) return false
  const element = /** @type {Element} */ (node)
  if (isNativeControl(element)) return true
  const editable = element.getAttribute?.('contenteditable')
  return editable === 'false'
    || (node !== root && (editable === 'true' || element.hasAttribute?.('contenteditable')))
}

/** Walk logical leaves without entering inline widgets or nested editors.
 * @param {Node} root
 * @param {Node} [ownerRoot] Editing host that owns these offsets.
 * @returns {Generator<Node>}
 */
function* positionNodes(root, ownerRoot = root) {
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    if (isRichTextCaretPadding(node)) continue
    if (isAtomic(node)) {
      yield node
      continue
    }
    if (isOutsideLogicalText(node, ownerRoot)) continue
    if (node.nodeType === TEXT_NODE) yield node
    else {
      for (let index = node.childNodes.length - 1; index >= 0; index--) {
        stack.push(node.childNodes[index])
      }
    }
  }
}

/** @param {Node} root @param {Node} ownerRoot */
function textLengthWithin(root, ownerRoot) {
  let length = 0
  for (const node of positionNodes(root, ownerRoot)) length += isAtomic(node) ? 1 : (node.textContent?.length ?? 0)
  return length
}

/** UTF-16 authored text units, with one unit per BR or atomic inline widget.
 * @param {Node} root
 * @returns {number}
 */
export function getTextLength(root) {
  return textLengthWithin(root, root)
}

/** Determine whether a logical UTF-16 offset divides a surrogate pair.
 * Adjacent authored Text leaves share one logical string even when formatting
 * wrappers split their DOM representation. BRs and inline widgets are atomic
 * separators, not character halves.
 * @param {Node} root
 * @param {number} offset
 * @returns {boolean}
 */
export function splitsSurrogateAtOffset(root, offset) {
  if (!Number.isSafeInteger(offset) || offset <= 0) return false
  let consumed = 0
  let previous = -1
  for (const node of positionNodes(root)) {
    if (isAtomic(node)) {
      if (offset <= consumed + 1) return false
      consumed++
      previous = -1
      continue
    }
    const value = node.textContent ?? ''
    const index = offset - consumed
    if (index >= 0 && index < value.length) {
      const before = index > 0 ? value.charCodeAt(index - 1) : previous
      const after = value.charCodeAt(index)
      return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
    }
    consumed += value.length
    if (value.length) previous = value.charCodeAt(value.length - 1)
  }
  return false
}

/** Native labels, inline widgets and non-author editing hosts do not
 * participate in text transformations. A cross-block walker may begin outside
 * any host, so its true editable islands stay visible even through a false
 * plugin shell. Within one true field, nested fields have separate ownership.
 * @param {Node} node
 * @param {Node} root
 */
function isOutsideEditableWalker(node, root) {
  const rootIsHost = root.nodeType === ELEMENT_NODE
    && /** @type {Element} */ (root).getAttribute?.('contenteditable') === 'true'
  let foundEditable = false
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (isAtomic(ancestor)) return true
    if (isNativeControl(ancestor)) return true
    const editable = ancestor.getAttribute?.('contenteditable')
    if (editable === 'true') {
      if (rootIsHost && ancestor !== root) return true
      foundEditable = true
    } else if (editable === 'false' && !foundEditable) {
      return true
    }
    if (ancestor === root) break
  }
  if (foundEditable) return false
  // When root is a formatting wrapper beneath an authoring host, its Text
  // leaves still belong to that host. A root outside every editing host may
  // also contain static toolbar/section labels; those are never authored text.
  const element = root.nodeType === ELEMENT_NODE
    ? /** @type {Element} */ (root) : root.parentElement
  return element?.closest?.('[contenteditable]')?.getAttribute('contenteditable') !== 'true'
}

/**
 * Create a TreeWalker for text transformations, excluding widget labels.
 * Position calculations use logical leaves instead of this text-only view.
 * @param {Node} root
 * @returns {TreeWalker}
 */
export function editableTextWalker(root) {
  const ownerDocument = root.nodeType === 9
    ? /** @type {Document} */ (root)
    : root.ownerDocument
  if (!ownerDocument) throw new Error('DOM node must belong to a document')
  const viewFilter = ownerDocument.defaultView?.NodeFilter
  return ownerDocument.createTreeWalker(root, viewFilter?.SHOW_TEXT ?? SHOW_TEXT, {
    acceptNode(node) {
      if (isOutsideEditableWalker(node, root)) return viewFilter?.FILTER_REJECT ?? FILTER_REJECT
      return viewFilter?.FILTER_ACCEPT ?? FILTER_ACCEPT
    },
  })
}

/** @param {Node} node @returns {Text | null} */
export function firstTextNode(node) {
  if (node.nodeType === TEXT_NODE) return /** @type {Text} */ (node)
  return /** @type {Text | null} */ (editableTextWalker(node).nextNode())
}

/** @param {Node} node @returns {Text | null} */
export function lastTextNode(node) {
  if (node.nodeType === TEXT_NODE) return /** @type {Text} */ (node)
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
    if (isOutsideLogicalText(node, container)) {
      // The control's label is not author text. A selection inside it cannot
      // supply an authored offset; project the endpoint to its outer edge.
      targetNode = node
      targetOffset = 0
      break
    }
  }
  let offset = 0
  if (targetNode.nodeType === TEXT_NODE || isAtomic(targetNode)) {
    offset = Math.max(0, Math.min(targetOffset, textLengthWithin(targetNode, container)))
  } else {
    for (let index = 0; index < Math.min(targetOffset, targetNode.childNodes.length); index++) {
      offset += textLengthWithin(targetNode.childNodes[index], container)
    }
  }
  for (let node = targetNode; node && node !== container; node = node.parentNode) {
    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
      offset += textLengthWithin(sibling, container)
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
  const ownerDocument = element.ownerDocument
  const selection = ownerDocument.defaultView?.getSelection() ?? null
  if (!selection) return
  const start = findNodeAtOffset(element, startOffset, 'start')
  const end = findNodeAtOffset(element, endOffset, 'end')
  const range = ownerDocument.createRange()
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
  const ownerDocument = element.ownerDocument
  const showText = ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? SHOW_TEXT
  const walker = ownerDocument.createTreeWalker(element, showText)
  /** @type {Text | null} */
  let matchNode = null
  let matchOffset = -1
  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode)
    const offset = node.data.lastIndexOf(search)
    if (offset >= 0) { matchNode = node; matchOffset = offset }
  }
  if (!matchNode) return null
  const range = ownerDocument.createRange()
  range.setStart(matchNode, matchOffset)
  range.setEnd(matchNode, matchNode.length)
  return range
}
