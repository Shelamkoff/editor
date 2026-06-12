/**
 * Handles all block-level animations: insert (scale+fade in),
 * move (FLIP), and remove (collapse+fade out).
 *
 * Extracted from BlockManager to separate animation concern from
 * block state management (SRP).
 */
export class BlockAnimator {
  /** @type {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} */
  #durations

  /** @type {boolean} */
  #enabled = false

  /**
   * @param {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} durations
   */
  constructor(durations) {
    this.#durations = durations
  }

  /** Enable animations (call after initial load so initial blocks don't animate). */
  enable() {
    this.#enabled = true
  }

  /**
   * Animate a newly inserted block element.
   * @param {HTMLElement} element
   */
  animateInsert(element) {
    if (!this.#enabled) return
    element.animate([
      { opacity: 0, transform: 'scale(0.95) translateY(-6px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ], {
      duration: this.#durations.blockInsertMs,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    })
  }

  /**
   * FLIP-animate blocks that shifted after a move operation.
   * @param {import('./types').IBlock[]} blocks — ordered block array
   * @param {number} lo — first affected index
   * @param {number} hi — last affected index
   * @param {Map<string, DOMRect>} firstRects — pre-move bounding rects keyed by block ID
   */
  animateMove(blocks, lo, hi, firstRects) {
    for (let i = lo; i <= hi; i++) {
      const b = blocks[i]
      if (!b) continue
      const first = firstRects.get(b.id)
      if (!first) continue
      const last = b.element.getBoundingClientRect()
      const dy = first.top - last.top
      if (Math.abs(dy) < 1) continue

      b.element.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: this.#durations.blockMoveMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
  }

  /**
   * Animate a block element's removal (collapse + fade out), then remove from DOM.
   * @param {HTMLElement} element
   * @returns {Promise<void>} resolves when the element is removed from DOM
   */
  animateRemove(element) {
    // Skip animation if element is not in DOM or not visible
    if (!element.parentNode || !element.offsetHeight) {
      element.remove()
      return Promise.resolve()
    }

    const height = element.offsetHeight
    const margin = parseFloat(getComputedStyle(element).marginBottom) || 0
    element.style.overflow = 'hidden'
    element.style.pointerEvents = 'none'
    element.style.transformOrigin = 'top center'

    const anim = element.animate([
      { opacity: 1, transform: 'scale(1) translateY(0)', maxHeight: `${height}px`, marginBottom: `${margin}px` },
      { opacity: 0, transform: 'scale(0.96) translateY(-4px)', maxHeight: `${height}px`, marginBottom: `${margin}px`, offset: 0.4 },
      { opacity: 0, transform: 'scale(0.96) translateY(-4px)', maxHeight: '0px', marginBottom: '0px' },
    ], {
      duration: this.#durations.blockRemoveMs,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    })

    return anim.finished.then(() => element.remove())
  }
}
