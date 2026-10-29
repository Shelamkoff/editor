import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { removeEmptyInlineTags, normalizeAuthoredText, hasProtectedDomContent } from './inlineContent.js'
export { removeEmptyInlineTags } from './inlineContent.js'
import { closestBlock, el } from '../shared/editorDom.js'
import { isAuthoredEditableText } from '../shared/editableFields.js'
import { createSvgIcon, ICON_BACK } from '../shared/editorIcons.js'
import { getTextOffset, getTextLength, findNodeAtOffset as findLogicalPosition, editableTextWalker } from '../shared/textOffset.js'

const ELEMENT_NODE = 1

/**
 * Bind one tool to its mount-scoped selection authority. A fresh mount gets
 * different bookmark provenance; no raw selection/highlight controller leaks.
 *
 * @returns {{
 *   port: import('./types').InlineSelectionPort,
 *   bind: (port: import('./types').InlineSelectionPort | null) => void,
 * }}
 */
export function createSelectionPortBinding() {
  /** @type {import('./types').InlineSelectionPort | null} */
  let current = null
  return {
    port: {
      get range() { return current?.range ?? null },
      capture(range) { return current?.capture(range) ?? null },
      restore(bookmark, options) { return current?.restore(bookmark, options) === true },
    },
    bind(port) { current = port ?? null },
  }
}

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

/**
 * Like `element.closest(selector)`, but stops at the contenteditable boundary.
 * Prevents matching elements outside the editor (e.g. a `<span>` in the page layout).
 * @param {HTMLElement | null} el
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestInEditable(el, selector) {
  if (el?.closest('[data-inline-plugin]')) return null
  while (el) {
    if (el.matches(selector)) return el
    if (el.getAttribute('contenteditable') === 'true') return null
    el = el.parentElement
  }
  return null
}

/**
 * Merge adjacent sibling elements with the same tag name.
 * E.g. `<b>a</b><b>b</b>` → `<b>ab</b>`.
 * Only merges direct siblings; does not recurse into children.
 * @param {Node | null} parent
 * @param {string} tagName — lowercase tag name to merge
 */
function mergeAdjacentTags(parent, tagName) {
  if (!parent || parent.nodeType !== ELEMENT_NODE) return
  const element = /** @type {Element} */ (parent)
  // Only an actual editing host owns author formatting. Static editor chrome
  // and controls must not have their wrappers merged by cross-block edits.
  if (element.closest('[data-inline-plugin], button, input, textarea, select, option, [role="button"]')) return
  const host = element.closest('[contenteditable]')
  if (!host || host.getAttribute('contenteditable') !== 'true') return
  const upper = tagName.toUpperCase()
  // Normalize first so empty text nodes between elements are removed
  normalizeAuthoredText(parent)
  /** @type {Node | null} */
  let node = parent.firstChild
  while (node) {
    const next = node.nextSibling
    // Only merge if two same-tag elements are truly DOM-adjacent (no text nodes between them)
    if (node.nodeType === ELEMENT_NODE
        && next?.nodeType === ELEMENT_NODE
        && /** @type {Element} */ (node).tagName === upper
        && /** @type {Element} */ (next).tagName === upper
        && haveSameAttributes(
          /** @type {Element} */ (node),
          /** @type {Element} */ (next),
        )
        && !hasProtectedDomContent(node)
        && !hasProtectedDomContent(next)) {
      while (next.firstChild) node.appendChild(next.firstChild)
      next.remove()
      // Don't advance — merged node may have a new adjacent sibling
    } else {
      node = next
    }
  }
  normalizeAuthoredText(parent)
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

/** Split ordinary wrappers to isolate a selected text leaf without cloning
 * protected descendants, native controls, or inline-widget DOM ownership.
 * @param {Text} text
 * @param {HTMLElement} ancestor
 * @returns {void}
 */
export function isolateAncestor(text, ancestor) {
  /** @type {Node} */
  let part = text
  while (part.parentNode) {
    const parent = /** @type {HTMLElement} */ (part.parentNode)
    const container = parent.parentNode
    if (!container) return
    if (part.previousSibling) {
      const before = parent.cloneNode(false)
      while (parent.firstChild !== part) before.appendChild(parent.firstChild)
      container.insertBefore(before, parent)
    }
    if (part.nextSibling) {
      const after = parent.cloneNode(false)
      while (part.nextSibling) after.appendChild(part.nextSibling)
      container.insertBefore(after, parent.nextSibling)
    }
    if (parent === ancestor) return
    part = parent
  }
}

/**
 * Wrap or unwrap a selection with an inline tag.
 * @param {string} tagName
 * @param {Range} range
 * @param {(element: HTMLElement) => boolean} [matches]
 * @returns {void}
 */
export function toggleTag(tagName, range, matches = () => true) {
  if (!range) return
  const ownerDocument = range.startContainer.ownerDocument
  if (!ownerDocument) return
  // Widget markup belongs to its plugin, not to author text formatting.
  // A range may contain an entire widget but must not edit its internals.
  for (const endpoint of [range.startContainer, range.endContainer]) {
    const element = endpoint.nodeType === ELEMENT_NODE
      ? /** @type {Element} */ (endpoint) : endpoint.parentElement
    if (element?.closest('[data-inline-plugin]')) return
  }
  const canChange = (/** @type {HTMLElement} */ element) => (
    !element.closest('[data-inline-plugin]') && matches(element)
  )

  const parent = range.commonAncestorContainer
  const container = parent.nodeType === ELEMENT_NODE
    ? /** @type {HTMLElement} */ (parent)
    : parent.parentElement

  // Unwrap only the selected authored text. The previous whole-wrapper
  // extraction also removed formatting from locked and native descendants
  // whenever the selection happened to span the entire surrounding tag.
  const selectionRoot = getWalkRoot(range)
  const selectedText = selectionRoot ? collectTextTargets(selectionRoot, range) : []
  const matchingAncestors = (/** @type {Text} */ node) => {
    /** @type {HTMLElement[]} */
    const result = []
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.hasAttribute('contenteditable')) break
      if (parent.matches(tagName) && canChange(parent)) result.push(parent)
    }
    return result
  }
  if (selectedText.some(({ node }) => matchingAncestors(node).length > 0)) {
    // Reverse DOM order prevents earlier endpoints from drifting when text
    // fragments split. Cloned shells retain their non-author children.
    for (const { node, startOffset, endOffset } of selectedText.reverse()) {
      if (endOffset < node.length) node.splitText(endOffset)
      const selected = startOffset > 0 ? node.splitText(startOffset) : node
      const ancestors = matchingAncestors(selected)
      for (const ancestor of ancestors) {
        isolateAncestor(selected, ancestor)
        ancestor.replaceWith(...ancestor.childNodes)
      }
    }
    return
  }

  // Case 3: No existing tag found — wrap selection
  const wrapper = ownerDocument.createElement(tagName)
  const walkRoot = getWalkRoot(range)
  // surroundContents can succeed across a native or contenteditable=false
  // control inside one editing host, wrapping UI text as author formatting.
  // Such selections must use only verified authored text leaves.
  const protectedElements = walkRoot?.querySelectorAll(
    'button, input, textarea, select, option, [contenteditable="false"], [data-inline-plugin], [role="button"]',
  ) ?? []
  const crossesControl = Array.from(protectedElements).some(element => range.intersectsNode(element))
  let surrounded = false
  if (!crossesControl) {
    try {
      range.surroundContents(wrapper)
      surrounded = true
    } catch {
      // Partially selected element boundaries also need the text-only path.
    }
  }
  if (!surrounded) {
    if (walkRoot) {
      const targets = collectTextTargets(walkRoot, range)
      for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i]
        if (!target) continue
        const { node, startOffset, endOffset } = target
        let targetNode = node
        if (endOffset < node.length) node.splitText(endOffset)
        if (startOffset > 0) targetNode = /** @type {Text} */ (node.splitText(startOffset))
        const w = ownerDocument.createElement(tagName)
        targetNode.parentNode?.insertBefore(w, targetNode)
        w.appendChild(targetNode)
      }
      normalizeAuthoredText(walkRoot)
      mergeAdjacentTags(walkRoot, tagName)
    }
    return
  }

  // Merge equivalent neighboring wrappers. The selection owner resolves its
  // private logical bookmark once all DOM transformation stages complete.
  const mergeParent = wrapper.parentNode
  if (mergeParent && wrapper.closest('[contenteditable="true"]')) {
    mergeAdjacentTags(mergeParent, tagName)
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
  const el = node.nodeType === ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement
  return /** @type {HTMLElement | null} */ (el?.closest('.oe-editor'))
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
  return findLogicalPosition(container, charOffset, bias)
}

/**
 * Create a simple tag-based inline tool.
 * @param {string} type
 * @param {string} title
 * @param {string} icon
 * @param {string} tag
 * @param {string} [shortcut]
 * @returns {import('./types').InlineTool}
 */
export function createSimpleInlineTool(type, title, icon, tag, shortcut) {
  const selection = createSelectionPortBinding()
  const cbs = selection.port
  return {
    type,
    title,
    icon,
    tag,
    shortcut,
    bindSelectionPort: selection.bind,

    isActive(selection) {
      const range = selection?.range
      if (!range) return false

      const ancestor = range.commonAncestorContainer
      const container = ancestor.nodeType === ELEMENT_NODE
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
      const bookmark = cbs.capture(range)
      if (!bookmark) return

      toggleTag(tag, range)

      if (!cbs.restore(bookmark)) {
        throw new Error('Formatting selection became unavailable during tag toggle')
      }
    },
  }
}

/**
 * Find the contentEditable block element from the current selection.
 * @param {Document} [ownerDocument]
 * @returns {HTMLElement | null}
 */
export function getBlockElement(ownerDocument = globalThis.document) {
  const sel = ownerDocument?.defaultView?.getSelection?.() ?? null
  if (!sel || !sel.anchorNode) return null
  let node = sel.anchorNode.nodeType === ELEMENT_NODE
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
 * @param {Document} [ownerDocument]
 * @returns {HTMLElement | null}
 */
export function getBlockContentElement(ownerDocument = globalThis.document) {
  const selection = ownerDocument?.defaultView?.getSelection?.() ?? null
  const block = closestBlock(selection?.anchorNode)
  const element = block?.firstElementChild ?? null
  const HTMLElementCtor = element?.ownerDocument?.defaultView?.HTMLElement
  return HTMLElementCtor && element instanceof HTMLElementCtor ? element : null
}

/**
 * Find the contentEditable ancestor of a range's start.
 * Returns null for cross-block ranges (start and end in different contenteditables).
 * @param {Range} range
 * @returns {HTMLElement | null}
 */
export function getContentEditable(range) {
  const startNode = range.startContainer
  const startEl = startNode.nodeType === ELEMENT_NODE
    ? /** @type {HTMLElement} */ (startNode)
    : startNode.parentElement
  const startCe = startEl?.closest('[contenteditable="true"]') ?? null

  const endNode = range.endContainer
  const endEl = endNode.nodeType === ELEMENT_NODE
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
    || (range.commonAncestorContainer.nodeType === ELEMENT_NODE
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
    if (!range.intersectsNode(textNode) || !isAuthoredEditableText(textNode)) continue
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
  // The shared host traversal selects top-level authoring fields once.
  // querySelectorAll('[contenteditable=true]') independently normalized nested
  // editable islands, even when their owner was the outer field's plugin.
  normalizeAuthoredText(singleCe ?? walkRoot)
}

/**
 * Create a standard back button for inline toolbar drill-down panels.
 * @param {Pick<import('./types').InlineToolActionContext, 'close' | 'range' | 'backLabel'> & Partial<Pick<import('./types').InlineToolActionContext, 'showTooltip' | 'hideTooltip'>>} ctx
 * @returns {HTMLElement}
 */
export function createBackButton(ctx) {
  const range = ctx.range
  if (!range) throw new Error('Cannot create a panel Back control without a current selection')
  const ownerDocument = range.startContainer.ownerDocument
  const backBtn = el('button', 'oe-inline-tool oe-inline-tool--back', { type: 'button' }, ownerDocument)
  setTrustedHtml(backBtn, ICON_BACK)
  const label = ctx.backLabel ?? 'Back'
  backBtn.setAttribute('aria-label', label)
  backBtn.addEventListener('mouseenter', () => ctx.showTooltip?.(backBtn, label))
  backBtn.addEventListener('mouseleave', () => ctx.hideTooltip?.())
  backBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
  backBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ctx.close() })
  return backBtn
}
