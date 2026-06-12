/**
 * Positioning logic for the block-settings menu.
 *
 * Desktop: anchored under (or above, on overflow) the floating toolbar,
 * right-aligned with the toolbar's right edge. Reads `toolbar.offsetTop`
 * walk instead of `getBoundingClientRect()` to avoid sampling FLIP-animated
 * transforms — the visual position lags one frame behind layout during
 * block-move animations.
 *
 * Mobile: bottom-sheet positioning is handled by CSS (position: fixed +
 * `oe-settings-menu--open` class), so we just clear inline coordinates.
 */
export class MenuPositioner {
  /** @type {HTMLElement} */
  #menuEl

  /** @type {HTMLElement} */
  #rootEl

  /** @type {number} */
  #mobileBreakpoint

  /**
   * @param {HTMLElement} menuEl
   * @param {HTMLElement} rootEl
   * @param {number} mobileBreakpoint
   */
  constructor(menuEl, rootEl, mobileBreakpoint = 768) {
    this.#menuEl = menuEl
    this.#rootEl = rootEl
    this.#mobileBreakpoint = mobileBreakpoint
  }

  position() {
    if (window.innerWidth < this.#mobileBreakpoint) {
      // Mobile: CSS handles bottom-sheet positioning.
      this.#menuEl.style.top = ''
      this.#menuEl.style.bottom = ''
      this.#menuEl.style.left = ''
      this.#menuEl.style.right = ''
      return
    }

    const toolbar = /** @type {HTMLElement | null} */ (this.#rootEl.querySelector('.oe-toolbar'))
    if (!toolbar) return

    const editorRect = this.#rootEl.getBoundingClientRect()

    // Toolbar layout top relative to editor root, via offsetTop walk
    // (immune to in-flight FLIP transforms).
    let toolbarLayoutTop = 0
    /** @type {HTMLElement | null} */
    let offsetEl = toolbar
    while (offsetEl && offsetEl !== this.#rootEl) {
      toolbarLayoutTop += offsetEl.offsetTop
      offsetEl = /** @type {HTMLElement | null} */ (offsetEl.offsetParent)
    }
    const toolbarHeight = toolbar.offsetHeight

    // Right offset from toolbar's right edge.
    const toolbarRect = toolbar.getBoundingClientRect()
    const rightOffset = editorRect.right - toolbarRect.right
    this.#menuEl.style.right = `${rightOffset}px`
    this.#menuEl.style.left = 'auto'

    // Prefer below; flip above if not enough space.
    const toolbarBottomAbs = editorRect.top + toolbarLayoutTop + toolbarHeight
    const spaceBelow = window.innerHeight - toolbarBottomAbs - 8
    const menuHeight = this.#menuEl.offsetHeight || 320

    if (spaceBelow >= menuHeight) {
      this.#menuEl.style.top = `${toolbarLayoutTop + toolbarHeight + 4}px`
      this.#menuEl.style.bottom = 'auto'
    } else {
      this.#menuEl.style.top = 'auto'
      this.#menuEl.style.bottom = `${editorRect.bottom - (editorRect.top + toolbarLayoutTop) + 4}px`
    }
  }
}
