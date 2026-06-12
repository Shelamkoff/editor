/**
 * Reusable keyboard navigation handler for accessible menus.
 *
 * Handles ArrowDown, ArrowUp, Home, End (focus management with wraparound)
 * and Escape (delegates to onEscape callback).
 *
 * @param {KeyboardEvent} e
 * @param {HTMLElement} menuEl — container to query for menu items
 * @param {{ onEscape: () => void, itemSelector?: string }} options
 * @returns {boolean} true if the event was handled
 */
export function handleMenuKeydown(e, menuEl, { onEscape, itemSelector = '[role="menuitem"]:not([aria-disabled="true"])' }) {
  const items = /** @type {HTMLElement[]} */ (
    [...menuEl.querySelectorAll(itemSelector)]
  )
  if (!items.length && e.key !== 'Escape') return false

  const current = /** @type {HTMLElement} */ (document.activeElement)
  const idx = items.indexOf(current)

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault()
      e.stopPropagation()
      const next = idx < items.length - 1 ? idx + 1 : 0
      items[next]?.focus()
      return true
    }
    case 'ArrowUp': {
      e.preventDefault()
      e.stopPropagation()
      const prev = idx > 0 ? idx - 1 : items.length - 1
      items[prev]?.focus()
      return true
    }
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      onEscape()
      return true
    case 'Home':
      e.preventDefault()
      items[0]?.focus()
      return true
    case 'End':
      e.preventDefault()
      items[items.length - 1]?.focus()
      return true
    default:
      return false
  }
}
