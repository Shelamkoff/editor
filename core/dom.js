import { BLOCK_SELECTOR } from './constants.js'

/**
 * Create an element with optional class name and attributes.
 * @param {string} tag
 * @param {string} [className]
 * @param {Record<string, string>} [attrs]
 * @returns {HTMLElement}
 */
export function el(tag, className, attrs) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, value)
    }
  }
  return element
}

/**
 * Find the closest `.oe-block` ancestor of a DOM node.
 * Consolidates the repeated `node.closest('.oe-block')` pattern.
 * @param {import('./types').DOMNode} node
 * @returns {HTMLElement | null}
 */
export function closestBlock(node) {
  const el = node.nodeType === Node.ELEMENT_NODE
    ? /** @type {Element} */ (node)
    : node.parentElement
  return /** @type {HTMLElement | null} */ (el?.closest(BLOCK_SELECTOR) ?? null)
}

/**
 * Position a popup element below (or above if no space) an anchor rect.
 *
 * Two modes:
 *  - `relative: false` (default) — sets absolute pixel values computed
 *    against `rootRect` (the editor root's bounding rect).
 *  - `relative: true` — sets CSS `calc(100% + …)` values, useful when
 *    the popup is a direct child of its anchor.
 *
 * @param {HTMLElement} popupEl
 * @param {DOMRect} anchorRect
 * @param {DOMRect | null} rootRect  — required when `relative` is false
 * @param {{ defaultHeight?: number, gap?: number, buffer?: number, relative?: boolean }} [options]
 */
export function positionPopup(popupEl, anchorRect, rootRect, { defaultHeight = 300, gap = 4, buffer = 8, relative = false } = {}) {
  const height = popupEl.offsetHeight || defaultHeight
  const spaceBelow = window.innerHeight - anchorRect.bottom - buffer
  const spaceAbove = anchorRect.top - buffer

  if (spaceBelow >= height || spaceBelow >= spaceAbove) {
    popupEl.style.bottom = 'auto'
    popupEl.style.top = relative
      ? `calc(100% + ${gap}px)`
      : `${anchorRect.bottom - /** @type {DOMRect} */ (rootRect).top + gap}px`
  } else {
    popupEl.style.top = 'auto'
    popupEl.style.bottom = relative
      ? `calc(100% + ${gap}px)`
      : `${/** @type {DOMRect} */ (rootRect).bottom - anchorRect.top + gap}px`
  }
}

