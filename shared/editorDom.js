/** CSS class applied to canonical block wrapper elements. */
export const BLOCK_CLASS = 'oe-block'

/** CSS selector for canonical block wrapper elements. */
export const BLOCK_SELECTOR = '.oe-block'

/**
 * Create an element with optional class name and attributes in the supplied realm.
 * @param {string} tag
 * @param {string} [className]
 * @param {Record<string, string>} [attrs]
 * @param {Document} [ownerDocument]
 * @returns {HTMLElement}
 */
export function el(tag, className, attrs, ownerDocument = document) {
  const element = ownerDocument.createElement(tag)
  if (className) element.className = className
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)
  }
  return element
}

/**
 * Resolve the canonical block shell owning one DOM node.
 * @param {Node} node
 * @returns {HTMLElement | null}
 */
export function closestBlock(node) {
  const element = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
  return /** @type {HTMLElement | null} */ (element?.closest(BLOCK_SELECTOR) ?? null)
}

/**
 * Position a popup relative to one anchor in the popup's owner document.
 * @param {HTMLElement} popupEl
 * @param {DOMRect} anchorRect
 * @param {DOMRect | null} rootRect
 * @param {{ defaultHeight?: number, gap?: number, buffer?: number, relative?: boolean }} [options]
 */
export function positionPopup(
  popupEl,
  anchorRect,
  rootRect,
  { defaultHeight = 300, gap = 4, buffer = 8, relative = false } = {},
) {
  const height = popupEl.offsetHeight || defaultHeight
  const viewportHeight = popupEl.ownerDocument?.defaultView?.innerHeight ?? Number.POSITIVE_INFINITY
  const spaceBelow = viewportHeight - anchorRect.bottom - buffer
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
