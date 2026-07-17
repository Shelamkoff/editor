import { CSS } from './css.js'

/**
 * Apply per-block style overrides from `state.data.styles` onto the live
 * `<img>` and its container. Skips width-related styles when the block is
 * in expanded mode (full-width takes precedence over user width).
 *
 * @param {import('./state.js').ImageState} state
 * @param {HTMLImageElement} img
 * @param {HTMLElement} container
 * @returns {void}
 */
export function applyInlineStyles(state, img, container) {
  const styles = state.data.styles
  if (!styles) return

  if (styles.objectFit) img.style.objectFit = styles.objectFit
  if (styles.objectPosition) img.style.objectPosition = styles.objectPosition
  if (styles.height) img.style.height = styles.height
  if (styles.maxHeight) img.style.maxHeight = styles.maxHeight
  if (styles.minHeight) img.style.minHeight = styles.minHeight

  if (!state.data.expanded) {
    if (styles.width) img.style.width = styles.width
    if (styles.maxWidth) img.style.maxWidth = styles.maxWidth
    if (styles.minWidth) img.style.minWidth = styles.minWidth
  }

  if (styles.borderStyle && styles.borderStyle !== 'none') {
    img.style.borderStyle = styles.borderStyle
    img.style.borderWidth = styles.borderWidth || '1px'
    img.style.borderColor = styles.borderColor || '#2e2e35'
  }
  if (styles.borderRadius) img.style.borderRadius = styles.borderRadius

  if (styles.backgroundColor && state.data.withBackground) {
    container.style.backgroundColor = styles.backgroundColor
  }
}

/**
 * Re-apply inline styles to an already-mounted image. Used when the
 * settings form mutates `state.data.styles` and needs the live preview
 * to reflect the change.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @returns {void}
 */
export function refreshInlineStyles(wrapper, state) {
  const img = /** @type {HTMLImageElement | null} */ (wrapper.querySelector(`.${CSS.image}`))
  const container = /** @type {HTMLElement | null} */ (wrapper.querySelector(`.${CSS.imageContainer}`))
  if (!img || !container) return

  img.style.cssText = ''
  container.style.cssText = ''
  applyInlineStyles(state, img, container)
}
