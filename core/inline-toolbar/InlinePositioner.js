/**
 * Position the inline toolbar relative to the current native selection.
 *
 * Tries to render above the selection; flips below when there's not enough
 * space at the top of the viewport. Horizontally centered on the selection
 * but clamped to stay within the editor's bounds.
 */
export class InlinePositioner {
  /** @type {HTMLElement} */
  #toolbarEl

  /** @type {HTMLElement} */
  #rootEl

  /**
   * @param {HTMLElement} toolbarEl
   * @param {HTMLElement} rootEl
   */
  constructor(toolbarEl, rootEl) {
    this.#toolbarEl = toolbarEl
    this.#rootEl = rootEl
  }

  /**
   * Reposition the toolbar based on the current native selection.
   * No-op if there's no live selection.
   */
  position() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const rangeRect = range.getBoundingClientRect()
    const editorRect = this.#rootEl.getBoundingClientRect()
    const toolbarHeight = this.#toolbarEl.offsetHeight || 40
    const toolbarWidth = this.#toolbarEl.offsetWidth || 200

    // Center on selection, then clamp so toolbar stays within editor bounds.
    const halfToolbar = toolbarWidth / 2
    const centerLeft = rangeRect.left + rangeRect.width / 2 - editorRect.left
    const minLeft = halfToolbar + 4
    const maxLeft = editorRect.width - halfToolbar - 4
    const left = Math.max(minLeft, Math.min(centerLeft, maxLeft))

    // Flip below the selection if there isn't enough room above.
    const spaceAbove = rangeRect.top
    const needsFlip = spaceAbove < toolbarHeight + 16

    if (needsFlip) {
      const top = rangeRect.bottom - editorRect.top
      this.#toolbarEl.style.left = `${left}px`
      this.#toolbarEl.style.top = `${top}px`
      this.#toolbarEl.style.transform = 'translateX(-50%)'
      this.#toolbarEl.style.marginTop = '8px'
    } else {
      const top = rangeRect.top - editorRect.top
      this.#toolbarEl.style.left = `${left}px`
      this.#toolbarEl.style.top = `${top}px`
      this.#toolbarEl.style.transform = 'translateX(-50%) translateY(-100%)'
      this.#toolbarEl.style.marginTop = '-8px'
    }
  }
}
