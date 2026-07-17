import { BLOCK_CLASS } from '../core/constants.js'
import { CrossBlockSelection } from '../core/CrossBlockSelection.js'
import { closestBlock, el } from '../core/dom.js'
import { createSvgIcon, ICON_BACK } from '../core/icons.js'
import { getTextOffset, editableTextWalker } from '../core/textOffset.js'

/** SVG markup for the standard back-navigation icon used in action panels. */
export { ICON_BACK }

/** SVG markup for the bold formatting control. */
export const ICON_BOLD = createSvgIcon('<path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6z"/><path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7"/>')
/** SVG markup for the italic formatting control. */
export const ICON_ITALIC = createSvgIcon('<path d="M11 5l6 0"/><path d="M7 19l6 0"/><path d="M14 5l-4 14"/>')
/** SVG markup for the link formatting control. */
export const ICON_LINK = createSvgIcon('<path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/>')
/** SVG markup for the inline-code formatting control. */
export const ICON_CODE = createSvgIcon('<path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/>')
/** SVG markup for the text-highlight formatting control. */
export const ICON_HIGHLIGHT = createSvgIcon('<path d="M3 19h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M12.5 5.5l4 4"/><path d="M4.5 13.5l4 4"/><path d="M21 15l-2 2l-4 -4l2 -2z"/>')
/** SVG markup for the strikethrough formatting control. */
export const ICON_STRIKETHROUGH = createSvgIcon('<path d="M5 12l14 0"/><path d="M16 6.5a4 2 0 0 0 -4 -1.5h-1a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5a4 2 0 0 1 -4 -1.5"/>')
/** SVG markup for the left-alignment control. */
export const ICON_ALIGN_LEFT = createSvgIcon('<path d="M4 6l16 0"/><path d="M4 12l10 0"/><path d="M4 18l14 0"/>')
/** SVG markup for the center-alignment control. */
export const ICON_ALIGN_CENTER = createSvgIcon('<path d="M4 6l16 0"/><path d="M7 12l10 0"/><path d="M5 18l14 0"/>')
/** SVG markup for the right-alignment control. */
export const ICON_ALIGN_RIGHT = createSvgIcon('<path d="M4 6l16 0"/><path d="M10 12l10 0"/><path d="M6 18l14 0"/>')
/** SVG markup for the justified-alignment control. */
export const ICON_ALIGN_JUSTIFY = createSvgIcon('<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>')
/** SVG markup for the remove-link control. */
export const ICON_UNLINK = createSvgIcon('<path d="M9 15l3 -3m2 -2l1 -1"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/><path d="M3 3l18 18"/>')
/** SVG markup for confirmation controls. */
export const ICON_CHECK = createSvgIcon('<path d="M5 12l5 5l10 -10"/>')
/** SVG markup for the clear-formatting control. */
export const ICON_CLEAR = createSvgIcon('<path d="M17 15l4 4m0 -4l-4 4"/><path d="M7 6v-1h11v1"/><path d="M7 19l4 0"/><path d="M13 5l-4 14"/>')

/** Inline tag selector for empty-tag cleanup. */
const INLINE_TAGS_SELECTOR = 'b, i, s, em, strong, u, mark, code, span, a, sup, sub'

/**
 * Like `element.closest(selector)`, but stops at the contenteditable boundary.
 * Prevents matching elements outside the editor (e.g. a `<span>` in the page layout).
 * @param {HTMLElement | null} el
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestInEditable(el, selector) {
  while (el) {
    if (el.matches(selector)) return el
    if (el.getAttribute('contenteditable') === 'true') return null
    el = el.parentElement
  }
  return null
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

/**
 * Merge adjacent sibling elements with the same tag name.
 * E.g. `<b>a</b><b>b</b>` → `<b>ab</b>`.
 * Only merges direct siblings; does not recurse into children.
 * @param {Node | null} parent
 * @param {string} tagName — lowercase tag name to merge
 */
function mergeAdjacentTags(parent, tagName) {
  if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return
  const upper = tagName.toUpperCase()
  // Normalize first so empty text nodes between elements are removed
  parent.normalize()
  /** @type {Node | null} */
  let node = parent.firstChild
  while (node) {
    const next = node.nextSibling
    // Only merge if two same-tag elements are truly DOM-adjacent (no text nodes between them)
    if (node.nodeType === Node.ELEMENT_NODE
        && next?.nodeType === Node.ELEMENT_NODE
        && /** @type {Element} */ (node).tagName === upper
        && /** @type {Element} */ (next).tagName === upper
        && haveSameAttributes(
          /** @type {Element} */ (node),
          /** @type {Element} */ (next),
        )) {
      while (next.firstChild) node.appendChild(next.firstChild)
      next.remove()
      // Don't advance — merged node may have a new adjacent sibling
    } else {
      node = next
    }
  }
  parent.normalize()
}

/**
 * Compare element attributes without depending on their source order.
 * Wrappers with different classes, data or inline styles must not be merged.
 * @param {Element} left
 * @param {Element} right
 * @returns {boolean}
 */
function haveSameAttributes(left, right) {
  if (left.attributes.length !== right.attributes.length) return false
  for (const attribute of left.attributes) {
    if (right.getAttribute(attribute.name) !== attribute.value) return false
  }
  return true
}

/**
 * Check if content already has a given tag in its wrapper chain.
 * extractContents clones partially-covered inline elements (DOM spec),
 * so we need to detect these to avoid double-wrapping.
 *
 * Handles both single-child chains (`<i><b>text</b></i>`) and
 * multi-child fragments (`<i>a</i><s>b</s>`) — the latter can occur
 * when extractContents splits a parent that had multiple children.
 *
 * @param {Node} content — text node, element, or DocumentFragment
 * @param {string} tag — lowercase tag name to look for
 * @returns {boolean}
 */
function hasWrapperTag(content, tag) {
  let node = content
  // Unwrap single-child DocumentFragments
  while (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.childNodes.length === 1) {
    node = /** @type {Node} */ (node.firstChild)
  }
  // For multi-child fragments: the tag is considered present if the
  // fragment itself IS the unwrapped content (no single wrapper around it).
  // We only need to detect a wrapper that surrounds ALL children.
  // Walk down single-child element chain looking for the tag.
  while (node.nodeType === Node.ELEMENT_NODE) {
    if (/** @type {Element} */ (node).tagName.toLowerCase() === tag) return true
    // Only descend if there's exactly one element child (a wrapper chain)
    const children = /** @type {Element} */ (node).children
    if (children.length !== 1) break
    node = children[0]
  }
  return false
}

/**
 * Wrap content in an inline wrapper tag, but only if the content isn't
 * already wrapped in the same tag (which happens when extractContents
 * clones partially-covered elements per DOM spec).
 *
 * For multi-child fragments (e.g. `<i>a</i><s>b</s>`), wraps each
 * top-level child individually if it lacks the wrapper, avoiding
 * double-wrapping children that already have the tag from extractContents.
 *
 * @param {Node} content — text node, element, or DocumentFragment
 * @param {HTMLElement} wrapperTemplate — cloned empty element to use as wrapper
 * @returns {Node}
 */
function wrapIfNeeded(content, wrapperTemplate) {
  const tag = wrapperTemplate.tagName.toLowerCase()

  // Already has the wrapper (single-child chain) — skip
  if (hasWrapperTag(content, tag)) return content

  // Multi-child fragment: extractContents already cloned partially-covered
  // wrappers for each child individually (DOM spec). Adding another wrapper
  // around the whole fragment would double-wrap children that don't need it.
  // Leave multi-child fragments as-is — the per-child clones are correct.
  if (content.nodeType === Node.DOCUMENT_FRAGMENT_NODE && content.childNodes.length > 1) {
    return content
  }

  const w = /** @type {HTMLElement} */ (wrapperTemplate.cloneNode(false))
  w.appendChild(content)
  return w
}

/**
 * Wrap or unwrap a selection with an inline tag.
 * @param {string} tagName
 * @param {Range} range
 * @param {(element: HTMLElement) => boolean} [matches]
 * @returns {void}
 */
export function toggleTag(tagName, range, matches = () => true) {
  const sel = window.getSelection()
  if (!sel || !range) return

  const parent = range.commonAncestorContainer
  const container = parent.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (parent)
    : parent.parentElement

  // Case 1: Selection is entirely INSIDE an existing tag — unwrap
  let ancestor = closestInEditable(container, tagName)
  while (ancestor && !matches(ancestor)) {
    ancestor = closestInEditable(ancestor.parentElement, tagName)
  }
  if (ancestor) {
    // Check if selection covers the full ancestor content via character offsets
    // (compareBoundaryPoints is unreliable for mixed text/element boundaries)
    const startOff = getTextOffset(ancestor, range.startContainer, range.startOffset)
    const endOff = getTextOffset(ancestor, range.endContainer, range.endOffset)
    const totalLen = ancestor.textContent?.length ?? 0
    const coversStart = startOff === 0
    const coversEnd = endOff >= totalLen

    if (coversStart && coversEnd) {
      // Full unwrap — selection covers entire ancestor
      const parentNode = ancestor.parentNode
      const firstChild = ancestor.firstChild
      const lastChild = ancestor.lastChild
      while (ancestor.firstChild) {
        parentNode?.insertBefore(ancestor.firstChild, ancestor)
      }
      ancestor.remove()
      if (firstChild && lastChild) {
        try {
          sel.removeAllRanges()
          const newRange = document.createRange()
          newRange.setStartBefore(firstChild)
          newRange.setEndAfter(lastChild)
          sel.addRange(newRange)
        } catch { /* detached */ }
      }
      removeEmptyInlineTags(parentNode)
    } else {
      // Partial unwrap — only remove tag from selected portion
      // Preserves inner inline wrappers (e.g. removing <b> keeps <i>)
      // Result: <b><i>before</i></b><i>selected</i><b><i>after</i></b>
      const parentNode = ancestor.parentNode
      const ref = ancestor.nextSibling

      // Save selection offsets relative to CE for restoration after DOM mutations
      const ce = ancestor.closest('[contenteditable="true"]') || parentNode
      const savedSelStart = ce ? getTextOffset(ce, range.startContainer, range.startOffset) : -1
      const savedSelEnd = ce ? getTextOffset(ce, range.endContainer, range.endOffset) : -1

      // Save inner inline wrapper chain (between text node and ancestor, exclusive)
      const innerWrappers = []
      /** @type {Node | null} */
      let n = range.startContainer
      if (n.nodeType === Node.TEXT_NODE) n = n.parentElement
      while (n && n !== ancestor) {
        innerWrappers.push(/** @type {HTMLElement} */ (n).cloneNode(false))
        n = /** @type {HTMLElement} */ (n).parentElement
      }

      // 1. Extract content AFTER selection
      const afterRange = document.createRange()
      afterRange.setStart(range.endContainer, range.endOffset)
      afterRange.setEndAfter(ancestor.lastChild || ancestor)
      const afterFrag = afterRange.extractContents()

      // 2. Extract selected content and re-wrap with inner wrappers (preserving other formatting)
      //    wrapIfNeeded skips if extractContents already cloned the wrapper (partial coverage).
      /** @type {Node} */
      let wrappedSelected = range.extractContents()
      for (let i = 0; i < innerWrappers.length; i++) {
        const iw = innerWrappers[i]
        if (!iw) continue
        wrappedSelected = wrapIfNeeded(wrappedSelected, /** @type {HTMLElement} */ (iw))
      }
      parentNode?.insertBefore(wrappedSelected, ref)

      // 4. Re-wrap after content with inner wrappers + ancestor tag
      //    extractContents already clones partially-covered inner wrappers,
      //    so wrapIfNeeded prevents duplication.
      if (afterFrag.textContent) {
        /** @type {Node} */
        let wrappedAfter = afterFrag
        for (let i = 0; i < innerWrappers.length; i++) {
          const iw = innerWrappers[i]
          if (!iw) continue
          wrappedAfter = wrapIfNeeded(wrappedAfter, /** @type {HTMLElement} */ (iw))
        }
        const afterTag = /** @type {HTMLElement} */ (ancestor.cloneNode(false))
        afterTag.appendChild(wrappedAfter)
        parentNode?.insertBefore(afterTag, ref)
      }

      // 5. Remove ancestor if empty
      if (!ancestor.textContent) ancestor.remove()

      // 6. Clean up empty inline tags left by extraction
      removeEmptyInlineTags(parentNode)
      mergeAdjacentTags(parentNode, tagName)

      // 7. Restore selection from saved offsets
      if (ce && savedSelStart >= 0) {
        const s = findNodeAtOffset(ce, savedSelStart)
        const e = findNodeAtOffset(ce, savedSelEnd, 'end')
        if (s && e) {
          try {
            sel.removeAllRanges()
            const nr = document.createRange()
            nr.setStart(s.node, s.offset)
            nr.setEnd(e.node, e.offset)
            sel.addRange(nr)
          } catch { /* detached */ }
        }
      }
    }
    return
  }

  // Case 2: Selection CONTAINS descendant tags — unwrap (full or partial)
  if (container) {
    const descendants = container.querySelectorAll(tagName)
    const toUnwrap = []
    for (const el of descendants) {
      if (range.intersectsNode(el) && matches(/** @type {HTMLElement} */ (el))) {
        toUnwrap.push(el)
      }
    }
    if (toUnwrap.length) {
      // Save selection offsets relative to the CE so we can restore after DOM mutations
      const ce = container.closest('[contenteditable="true"]') || container
      const savedStart = getTextOffset(ce, range.startContainer, range.startOffset)
      const savedEnd = getTextOffset(ce, range.endContainer, range.endOffset)

      // Process in reverse DOM order so extractContents/insertBefore
      // mutations don't invalidate range references for earlier elements.
      for (let ti = toUnwrap.length - 1; ti >= 0; ti--) {
        const el = /** @type {HTMLElement} */ (toUnwrap[ti])
        // Create a clipped range: intersection of selection with this element
        const clipped = document.createRange()
        if (el.contains(range.startContainer)) {
          clipped.setStart(range.startContainer, range.startOffset)
        } else {
          clipped.setStart(el, 0)
        }
        if (el.contains(range.endContainer)) {
          clipped.setEnd(range.endContainer, range.endOffset)
        } else {
          clipped.setEnd(el, el.childNodes.length)
        }

        const clippedLen = clipped.toString().length
        const fullLen = el.textContent?.length ?? 0

        if (clippedLen >= fullLen) {
          // Full unwrap
          const p = el.parentNode
          while (el.firstChild) p?.insertBefore(el.firstChild, el)
          el.remove()
        } else {
          // Partial unwrap — split element, preserve inner wrappers
          const parentNode = el.parentNode
          const ref = el.nextSibling

          // Save inner wrapper chain
          const innerWrappers = []
          /** @type {Node | null} */
          let nn = clipped.startContainer
          if (nn.nodeType === Node.TEXT_NODE) nn = nn.parentElement
          while (nn && nn !== el) {
            innerWrappers.push(/** @type {HTMLElement} */ (nn).cloneNode(false))
            nn = /** @type {HTMLElement} */ (nn).parentElement
          }

          const afterRange = document.createRange()
          afterRange.setStart(clipped.endContainer, clipped.endOffset)
          afterRange.setEndAfter(el.lastChild || el)
          const afterFrag = afterRange.extractContents()

          // Re-wrap selected with inner wrappers (skip if extractContents already cloned them)
          /** @type {Node} */
          let wrappedSel = clipped.extractContents()
          for (let i = 0; i < innerWrappers.length; i++) {
            const iw = innerWrappers[i]
            if (!iw) continue
            wrappedSel = wrapIfNeeded(wrappedSel, /** @type {HTMLElement} */ (iw))
          }
          parentNode?.insertBefore(wrappedSel, ref)

          if (afterFrag.textContent) {
            /** @type {Node} */
            let wrappedAfter = afterFrag
            for (let i = 0; i < innerWrappers.length; i++) {
              const iw = innerWrappers[i]
              if (!iw) continue
              wrappedAfter = wrapIfNeeded(wrappedAfter, /** @type {HTMLElement} */ (iw))
            }
            const afterTag = /** @type {HTMLElement} */ (el.cloneNode(false))
            afterTag.appendChild(wrappedAfter)
            parentNode?.insertBefore(afterTag, ref)
          }

          if (!el.textContent) el.remove()
        }
      }

      // Clean up empty inline tags, merge adjacent, and normalize
      removeEmptyInlineTags(container)
      mergeAdjacentTags(container, tagName)

      // Restore selection from saved offsets
      const s = findNodeAtOffset(ce, savedStart)
      const e = findNodeAtOffset(ce, savedEnd, 'end')
      if (s && e) {
        try {
          sel.removeAllRanges()
          const nr = document.createRange()
          nr.setStart(s.node, s.offset)
          nr.setEnd(e.node, e.offset)
          sel.addRange(nr)
        } catch { /* detached */ }
      }

      return
    }
  }

  // Case 3: No existing tag found — wrap selection
  const wrapper = document.createElement(tagName)
  try {
    range.surroundContents(wrapper)
  } catch {
    // surroundContents fails when range crosses element boundaries.
    // Per-text-node wrapping as safe fallback.
    // Use contenteditable for single-block, commonAncestorContainer for cross-block.
    const singleCe = container?.closest('[contenteditable="true"]')
    const walkRoot = singleCe || (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement)
    if (walkRoot) {
      const walker = editableTextWalker(walkRoot)
      /** @type {{ node: Text, startOffset: number, endOffset: number }[]} */
      const targets = []
      while (walker.nextNode()) {
        const textNode = /** @type {Text} */ (walker.currentNode)
        if (!range.intersectsNode(textNode)) continue
        let so = 0, eo = textNode.length
        if (textNode === range.startContainer) so = range.startOffset
        if (textNode === range.endContainer) eo = range.endOffset
        if (so >= eo) continue
        targets.push({ node: textNode, startOffset: so, endOffset: eo })
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i]
        if (!target) continue
        const { node, startOffset, endOffset } = target
        let targetNode = node
        if (endOffset < node.length) node.splitText(endOffset)
        if (startOffset > 0) targetNode = /** @type {Text} */ (node.splitText(startOffset))
        const w = document.createElement(tagName)
        targetNode.parentNode?.insertBefore(w, targetNode)
        w.appendChild(targetNode)
      }
      walkRoot.normalize()
      mergeAdjacentTags(walkRoot, tagName)
    }
    return
  }

  // Merge with adjacent same-tag siblings before restoring selection.
  // mergeAdjacentTags may absorb `wrapper` into a preceding sibling,
  // so we save the CE-relative offsets and restore from them.
  const mergeParent = wrapper.parentNode
  if (mergeParent) {
    const ce = wrapper.closest('[contenteditable="true"]')
    if (ce) {
      const wrapStart = getTextOffset(ce, wrapper.firstChild || wrapper, 0)
      const wrapEnd = wrapStart + (wrapper.textContent?.length ?? 0)
      mergeAdjacentTags(mergeParent, tagName)
      // Restore selection from saved offsets
      const s = findNodeAtOffset(ce, wrapStart)
      const e = findNodeAtOffset(ce, wrapEnd, 'end')
      if (s && e) {
        try {
          sel.removeAllRanges()
          const nr = document.createRange()
          nr.setStart(s.node, s.offset)
          nr.setEnd(e.node, e.offset)
          sel.addRange(nr)
        } catch { /* detached */ }
      }
    } else {
      // No CE — fallback: select wrapper contents (no merge)
      try {
        sel.removeAllRanges()
        const nr = document.createRange()
        nr.selectNodeContents(wrapper)
        sel.addRange(nr)
      } catch { /* detached */ }
    }
  }
}

/**
 * Find the closest .oe-editor root from a DOM node.
 * Avoids global querySelector — works with multiple editor instances.
 * @param {Node | null | undefined} [node]
 * @returns {HTMLElement | null}
 */
export function getEditorRoot(node) {
  if (!node) return null
  const el = node.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement
  return /** @type {HTMLElement | null} */ (el?.closest('.oe-editor'))
}

/**
 * Clear the stored cross-block range (call after DOM mutations that
 * invalidate the range's node references).
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @param {Node} [contextNode] - any node inside the editor for scoping
 * @returns {void}
 */
export function clearCrossBlockRange(cbs, contextNode) {
  if (cbs) {
    const editor = getEditorRoot(contextNode ?? cbs.range?.startContainer)
    cbs.deactivate(editor ?? undefined)
  } else {
    const editor = getEditorRoot(contextNode)
    if (editor) editor.classList.remove('oe-editor--cross-selecting')
    CrossBlockSelection.hideHighlight()
  }
}

export { getTextOffset }

/**
 * Find the text node and offset at a given character position.
 * @param {Node} container
 * @param {number} charOffset
 * @param {'start' | 'end'} [bias='start'] - when the offset lands exactly at a
 *   node boundary, 'start' prefers the beginning of the next node (for range
 *   start points), 'end' prefers the end of the current node (for range end
 *   points). This avoids creating ranges that inadvertently cross into adjacent
 *   inline wrappers.
 * @returns {{ node: Node, offset: number } | null}
 */
export function findNodeAtOffset(container, charOffset, bias = 'start') {
  const walker = editableTextWalker(container)
  let remaining = charOffset
  /** @type {Text | null} */
  let lastNode = null
  while (walker.nextNode()) {
    lastNode = /** @type {Text} */ (walker.currentNode)
    const len = lastNode.textContent?.length ?? 0
    // Use < for intermediate nodes, <= only for the last node
    if (remaining < len) return { node: lastNode, offset: remaining }
    if (remaining === len) {
      const saved = /** @type {Text} */ (walker.currentNode)
      if (walker.nextNode()) {
        const next = /** @type {Text} */ (walker.currentNode)
        // 'end' bias: stay in current node to avoid crossing into the next wrapper
        if (bias === 'end' && saved.parentElement !== next.parentElement) {
          return { node: saved, offset: remaining }
        }
        // 'start' bias (default): prefer start of next node for clean range boundaries
        return { node: next, offset: 0 }
      }
      // Last node — return end position
      return { node: saved, offset: remaining }
    }
    remaining -= len
  }
  // Clamp to end of last text node
  if (lastNode) return { node: lastNode, offset: lastNode.textContent?.length ?? 0 }
  return null
}

/**
 * Return every editable field owned by one block in DOM order.
 * @param {HTMLElement} block
 * @returns {HTMLElement[]}
 */
function editableFields(block) {
  const descendants = Array.from(
    block.querySelectorAll('[contenteditable]'),
    element => /** @type {HTMLElement} */ (element),
  )
  return block.matches('[contenteditable]') ? [block, ...descendants] : descendants
}

/**
 * Resolve the editable field that owns a range boundary. A boundary may be an
 * element node positioned between children, so inspect that child before
 * falling back to the first field for legacy or synthetic ranges.
 * @param {HTMLElement} block
 * @param {Node} container
 * @param {number} offset
 * @returns {{ element: HTMLElement, index: number } | null}
 */
function editableAtBoundary(block, container, offset) {
  const fields = editableFields(block)
  if (!fields.length) return null

  const containerElement = container.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (container)
    : container.parentElement
  let candidate = containerElement?.closest('[contenteditable]') ?? null

  if (!candidate && container.nodeType === Node.ELEMENT_NODE) {
    const children = container.childNodes
    const child = children[Math.min(offset, children.length - 1)] ?? null
    const childElement = child?.nodeType === Node.ELEMENT_NODE
      ? /** @type {HTMLElement} */ (child)
      : child?.parentElement
    candidate = childElement?.closest('[contenteditable]')
      ?? childElement?.querySelector?.('[contenteditable]')
      ?? null
  }

  const editable = candidate instanceof HTMLElement ? candidate : null
  const index = editable && block.contains(editable) ? fields.indexOf(editable) : -1
  return index >= 0 ? { element: fields[index], index } : { element: fields[0], index: 0 }
}

/**
 * Save cross-block range as block IDs + character offsets (survives DOM mutations).
 * @param {Range} range
 * @returns {{ editorRoot: HTMLElement, startBlockId: string, endBlockId: string, startFieldIndex: number, endFieldIndex: number, startOffset: number, endOffset: number } | null}
 */
export function saveCrossBlockOffsets(range) {
  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)
  if (!startBlock || !endBlock || startBlock === endBlock) return null

  const editorRoot = getEditorRoot(startBlock)
  if (!editorRoot || getEditorRoot(endBlock) !== editorRoot) return null

  const startField = editableAtBoundary(startBlock, range.startContainer, range.startOffset)
  const endField = editableAtBoundary(endBlock, range.endContainer, range.endOffset)
  if (!startField || !endField) return null

  return {
    editorRoot,
    startBlockId: startBlock.dataset.blockId ?? '',
    endBlockId: endBlock.dataset.blockId ?? '',
    startFieldIndex: startField.index,
    endFieldIndex: endField.index,
    startOffset: getTextOffset(startField.element, range.startContainer, range.startOffset),
    endOffset: getTextOffset(endField.element, range.endContainer, range.endOffset),
  }
}

/**
 * Restore cross-block range from saved offsets. Updates CrossBlockSelection and CSS Highlight.
 * @param {import('../types').ICrossBlockSelection | null} cbs
 * @param {{ editorRoot: HTMLElement, startBlockId: string, endBlockId: string, startFieldIndex?: number, endFieldIndex?: number, startOffset: number, endOffset: number }} offsets
 * @returns {Range | null}
 */
export function restoreCrossBlockRange(cbs, offsets) {
  const { editorRoot } = offsets
  if (!editorRoot.isConnected) return null

  // Block IDs are unique only within one editor document. Comparing dataset
  // values also avoids interpolating document-owned IDs into a CSS selector.
  const blocks = editorRoot.querySelectorAll('[data-block-id]')
  const startBlock = Array.from(blocks).find(block => (
    /** @type {HTMLElement} */ (block).dataset.blockId === offsets.startBlockId
  ))
  const endBlock = Array.from(blocks).find(block => (
    /** @type {HTMLElement} */ (block).dataset.blockId === offsets.endBlockId
  ))
  if (!startBlock || !endBlock) return null

  const startCe = editableFields(/** @type {HTMLElement} */ (startBlock))[offsets.startFieldIndex ?? 0]
  const endCe = editableFields(/** @type {HTMLElement} */ (endBlock))[offsets.endFieldIndex ?? 0]
  if (!startCe || !endCe) return null

  const start = findNodeAtOffset(startCe, offsets.startOffset)
  const end = findNodeAtOffset(endCe, offsets.endOffset, 'end')
  if (!start || !end) return null

  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
  } catch { return null }

  // Update stored range and visual highlight
  if (cbs) {
    cbs.activate(range, editorRoot)
  } else {
    editorRoot.classList.add('oe-editor--cross-selecting')
    CrossBlockSelection.showHighlight(range)
  }

  // Place native caret at end of cross-block range
  try {
    const sel = window.getSelection()
    const caret = document.createRange()
    caret.setStart(range.endContainer, range.endOffset)
    caret.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(caret)
  } catch { /* detached */ }

  return range
}

/**
 * Check if a selection spans multiple .oe-block elements.
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {HTMLElement[] | null} Array of plugin-owned block roots, or null if single-block
 */
export function getSelectedBlockElements(cbs) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  // Native selection clips to focused contenteditable.
  // Use the cross-block range if available.
  const nativeRange = sel.getRangeAt(0)
  const range = cbs?.range || nativeRange
  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)

  if (!startBlock || !endBlock || startBlock === endBlock) return null

  // Collect all plugin-owned block roots between start and end.
  const blocks = []
  const container = startBlock.parentElement
  if (!container) return null

  let inside = false
  for (const child of container.children) {
    if (child === startBlock) inside = true
    if (inside && child.classList.contains(BLOCK_CLASS)) {
      const content = child.firstElementChild
      if (content instanceof HTMLElement) blocks.push(content)
    }
    if (child === endBlock) break
  }

  return blocks.length > 1 ? blocks : null
}

/**
 * Dispatch a synthetic input event on the nearest contenteditable to trigger
 * undo/redo snapshot via EditorFacade.onInput → editor:changed.
 * @param {Node} [contextNode] - any node inside the editor for scoping
 * @returns {void}
 */
export function notifyEditorChanged(contextNode) {
  const element = contextNode?.nodeType === Node.ELEMENT_NODE
    ? /** @type {Element} */ (contextNode)
    : contextNode?.parentElement
  const ce = element?.closest('[contenteditable="true"]')
  if (ce) ce.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

/**
 * Create a simple tag-based inline tool.
 * @param {string} type
 * @param {string} title
 * @param {string} icon
 * @param {string} tag
 * @param {string} [shortcut]
 * @param {import('../types').ICrossBlockSelection} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createSimpleInlineTool(type, title, icon, tag, shortcut, cbs) {
  return {
    type,
    title,
    icon,
    tag,
    shortcut,

    isActive(selection) {
      const range = selection?.range
      if (!range) return false

      const ancestor = range.commonAncestorContainer
      const container = ancestor.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (ancestor)
        : ancestor.parentElement

      // Entire selection is inside the tag
      if (closestInEditable(container, tag)) return true

      // For collapsed caret — closest check above is sufficient
      if (range.collapsed) return false

      // For non-collapsed: check if ANY text node in range is inside the tag
      if (container) {
        const walker = editableTextWalker(container)
        while (walker.nextNode()) {
          const textNode = walker.currentNode
          if (!range.intersectsNode(textNode)) continue
          // Calculate actual selected length within this text node
          let start = 0
          let end = textNode.textContent?.length ?? 0
          if (textNode === range.startContainer) start = range.startOffset
          if (textNode === range.endContainer) end = range.endOffset
          if (start >= end) continue // zero-length intersection (boundary node)
          const selectedText = (textNode.textContent || '').slice(start, end)
          if (!selectedText.trim()) continue
          if (closestInEditable(textNode.parentElement, tag)) return true
        }
      }
      return false
    },

    toggle(selection) {
      const range = selection.range
      if (!range) return
      const saved = saveSelectionOffsets(range)

      toggleTag(tag, range)

      restoreSelectionOffsets(cbs ?? null, saved)
    },
  }
}

/**
 * Find the contentEditable block element from the current selection.
 * @returns {HTMLElement | null}
 */
export function getBlockElement() {
  const sel = window.getSelection()
  if (!sel || !sel.anchorNode) return null
  let node = sel.anchorNode.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (sel.anchorNode)
    : sel.anchorNode.parentElement
  while (node) {
    if (node.getAttribute && node.getAttribute('contenteditable') === 'true') return node
    node = node.parentElement
  }
  return null
}

/**
 * Find the plugin-owned root of the block containing the current selection.
 * Unlike {@link getBlockElement}, this returns the block content root rather
 * than one nested editable field, so block-level settings survive plugins
 * with several text fields.
 * @returns {HTMLElement | null}
 */
export function getBlockContentElement() {
  const selection = window.getSelection()
  const block = closestBlock(selection?.anchorNode)
  return block?.firstElementChild instanceof HTMLElement ? block.firstElementChild : null
}

/**
 * Find the contentEditable ancestor of a range's start.
 * Returns null for cross-block ranges (start and end in different contenteditables).
 * @param {Range} range
 * @returns {HTMLElement | null}
 */
export function getContentEditable(range) {
  const startNode = range.startContainer
  const startEl = startNode.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (startNode)
    : startNode.parentElement
  const startCe = startEl?.closest('[contenteditable="true"]') ?? null

  const endNode = range.endContainer
  const endEl = endNode.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (endNode)
    : endNode.parentElement
  const endCe = endEl?.closest('[contenteditable="true"]') ?? null

  if (startCe !== endCe) return null

  return /** @type {HTMLElement | null} */ (startCe)
}

/**
 * Resolve the DOM root to walk for range operations.
 * Uses contenteditable for single-block ranges, commonAncestorContainer for cross-block.
 * @param {Range} range
 * @returns {HTMLElement | null}
 */
export function getWalkRoot(range) {
  return getContentEditable(range)
    || (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? /** @type {HTMLElement} */ (range.commonAncestorContainer)
      : range.commonAncestorContainer.parentElement)
}

/**
 * Collect text nodes within a range, clipped to range boundaries.
 * @param {HTMLElement} walkRoot
 * @param {Range} range
 * @returns {{ node: Text, startOffset: number, endOffset: number }[]}
 */
export function collectTextTargets(walkRoot, range) {
  const walker = editableTextWalker(walkRoot)
  /** @type {{ node: Text, startOffset: number, endOffset: number }[]} */
  const targets = []
  while (walker.nextNode()) {
    const textNode = /** @type {Text} */ (walker.currentNode)
    if (!range.intersectsNode(textNode)) continue
    let startOffset = 0
    let endOffset = textNode.length
    if (textNode === range.startContainer) startOffset = range.startOffset
    if (textNode === range.endContainer) endOffset = range.endOffset
    if (startOffset >= endOffset) continue
    targets.push({ node: textNode, startOffset, endOffset })
  }
  return targets
}

/**
 * Normalize contenteditables after DOM manipulation.
 * @param {HTMLElement | null} singleCe - single contenteditable (null for cross-block)
 * @param {HTMLElement} walkRoot
 * @returns {void}
 */
export function normalizeAfterEdit(singleCe, walkRoot) {
  if (singleCe) {
    singleCe.normalize()
  } else {
    const blocks = walkRoot.querySelectorAll('[contenteditable]')
    for (const b of blocks) b.normalize()
  }
}

/**
 * @typedef {Object} SavedOffsets
 * @property {{ editorRoot: HTMLElement, startBlockId: string, endBlockId: string, startFieldIndex: number, endFieldIndex: number, startOffset: number, endOffset: number } | null} crossOffsets - Serialized selection spanning multiple editable block fields.
 * @property {{ ce: Node, start: number, end: number } | null} singleOffsets - Text offsets and owning editable node for a selection contained in one field.
 */

/**
 * Save selection offsets (cross-block or single-block) before DOM mutation.
 * @param {Range} range
 * @returns {SavedOffsets}
 */
export function saveSelectionOffsets(range) {
  const crossOffsets = saveCrossBlockOffsets(range)
  /** @type {{ ce: Node, start: number, end: number } | null} */
  let singleOffsets = null
  if (!crossOffsets) {
    const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? /** @type {HTMLElement} */ (range.startContainer)
      : range.startContainer.parentElement
    const ce = startEl?.closest('[contenteditable="true"]')
    if (ce) {
      singleOffsets = {
        ce,
        start: getTextOffset(ce, range.startContainer, range.startOffset),
        end: getTextOffset(ce, range.endContainer, range.endOffset),
      }
    }
  }
  return { crossOffsets, singleOffsets }
}

/**
 * Restore selection from saved offsets after DOM mutation.
 * @param {import('../types').ICrossBlockSelection | null} cbs
 * @param {SavedOffsets} saved
 * @returns {void}
 */
export function restoreSelectionOffsets(cbs, saved) {
  if (saved.crossOffsets) {
    restoreCrossBlockRange(cbs, saved.crossOffsets)
  } else if (saved.singleOffsets) {
    const { ce, start, end } = saved.singleOffsets
    const s = findNodeAtOffset(ce, start)
    const e = findNodeAtOffset(ce, end, 'end')
    if (s && e) {
      try {
        const sel = window.getSelection()
        const r = document.createRange()
        r.setStart(s.node, s.offset)
        r.setEnd(e.node, e.offset)
        sel?.removeAllRanges()
        sel?.addRange(r)
      } catch { /* detached */ }
    }
  }
}

/**
 * Create a standard back button for inline toolbar drill-down panels.
 * @param {{ close(): void }} ctx
 * @returns {HTMLElement}
 */
export function createBackButton(ctx) {
  const backBtn = el('button', 'oe-inline-tool oe-inline-tool--back', { type: 'button' })
  backBtn.innerHTML = ICON_BACK
  backBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
  backBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ctx.close() })
  return backBtn
}
