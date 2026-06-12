import { CSS } from './css.js'

/**
 * Apply gallery-level inline styles (gap, height, slot border-radius)
 * to the live grid + slot DOM. Idempotent — safe to call after every
 * style edit in the settings form.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 */
export function applyGalleryStyles(wrapper, state) {
  const grid = /** @type {HTMLElement | null} */ (wrapper.querySelector(`.${CSS.grid}`))
  if (!grid) return
  const styles = state.data.styles

  grid.style.gap = styles?.gap || ''
  grid.style.height = styles?.height || ''

  const slots = grid.querySelectorAll(`.${CSS.slot}`)
  slots.forEach((slotEl) => {
    /** @type {HTMLElement} */ (slotEl).style.borderRadius = styles?.borderRadius || ''
  })
}
