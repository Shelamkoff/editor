import {
  ICON_CLEAR,
  saveCrossBlockOffsets,
  notifyEditorChanged,
} from './utils.js'

/**
 * Resolve an element-node range boundary to a text-node boundary.
 * Element nodes may be removed during unwrap, but text nodes survive.
 * @param {Node} node
 * @param {number} offset
 * @param {'start' | 'end'} side
 * @returns {{ node: Node, offset: number }}
 */
function resolveToTextBoundary(node, offset, side) {
  if (node.nodeType === Node.TEXT_NODE) return { node, offset }

  /**
   * Find the first text node in or under a given node.
   * TreeWalker skips the root itself, so check directly first.
   * @param {Node} n
   * @returns {Text | null}
   */
  const firstText = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (n)
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT)
    return /** @type {Text | null} */ (w.nextNode())
  }

  /**
   * Find the last text node in or under a given node.
   * @param {Node} n
   * @returns {Text | null}
   */
  const lastText = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return /** @type {Text} */ (n)
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT)
    let last = null
    while (w.nextNode()) last = w.currentNode
    return /** @type {Text | null} */ (last)
  }

  const children = node.childNodes
  if (side === 'start') {
    for (let i = offset; i < children.length; i++) {
      const child = children[i]
      if (!child) continue
      const t = firstText(child)
      if (t) return { node: t, offset: 0 }
    }
    for (let i = offset - 1; i >= 0; i--) {
      const child = children[i]
      if (!child) continue
      const t = lastText(child)
      if (t) return { node: t, offset: t.textContent?.length ?? 0 }
    }
  } else {
    for (let i = offset - 1; i >= 0; i--) {
      const child = children[i]
      if (!child) continue
      const t = lastText(child)
      if (t) return { node: t, offset: t.textContent?.length ?? 0 }
    }
    for (let i = offset; i < children.length; i++) {
      const child = children[i]
      if (!child) continue
      const t = firstText(child)
      if (t) return { node: t, offset: 0 }
    }
  }
  return { node, offset }
}

/**
 * Create inline tool that removes all inline formatting from the selection.
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createClearFormattingTool(label, cbs = null) {
  return {
    type: 'clearFormatting',
    title: label,
    icon: ICON_CLEAR,
    isActive: () => false,
    toggle(selection) {
      const actualRange = cbs?.range || selection?.range
      if (!actualRange) return
      const crossOffsets = saveCrossBlockOffsets(actualRange)

      // Resolve range boundaries to text nodes BEFORE unwrap.
      // Text nodes survive unwrap (only wrappers removed).
      const savedStart = resolveToTextBoundary(
        actualRange.startContainer, actualRange.startOffset, 'start')
      const savedEnd = resolveToTextBoundary(
        actualRange.endContainer, actualRange.endOffset, 'end')

      // Walk all inline elements within the range and unwrap them
      const ancestor = actualRange.commonAncestorContainer
      const walkRoot = ancestor.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (ancestor)
        : ancestor.parentElement
      const walkParent = walkRoot?.closest('[contenteditable="true"]') || walkRoot
      if (walkParent) {
        const inlineTags = /** @type {NodeListOf<HTMLElement>} */ (
          walkParent.querySelectorAll('b, i, s, code, mark, span, em, strong, u, sup, sub')
        )
        const toUnwrap = Array.from(inlineTags)
          .filter(el => {
            if (!actualRange.intersectsNode(el)) return false
            if (el.dataset?.inlinePlugin || el.closest('[data-inline-plugin]')) return false
            return true
          })
          .sort((a, b) => {
            if (a.contains(b)) return 1
            if (b.contains(a)) return -1
            return 0
          })
        for (const el of toUnwrap) {
          if (!el.parentNode) continue
          const parent = el.parentNode
          while (el.firstChild) parent?.insertBefore(el.firstChild, el)
          el.remove()
        }
      }

      // Restore selection using direct DOM node references
      try {
        const r = document.createRange()
        r.setStart(savedStart.node, savedStart.offset)
        r.setEnd(savedEnd.node, savedEnd.offset)

        if (crossOffsets) {
          // Cross-block: update stored range and visual highlight
          const editor = /** @type {HTMLElement | null} */ (savedStart.node.parentElement?.closest('.oe-editor'))
          if (cbs && editor) {
            cbs.activate(r, editor)
          }
        } else {
          // Single-block: native selection
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(r)
        }
      } catch { /* detached nodes */ }

      notifyEditorChanged(actualRange.startContainer)
    },
  }
}
