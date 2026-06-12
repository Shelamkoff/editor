import { positionPopup } from '../dom.js'

/**
 * Positioning logic for the floating block toolbar.
 *
 * Two positioning modes:
 *  - Desktop: absolute, anchored to the current block's top inside the
 *    editor root.
 *  - Mobile: appended *into* the block element so it sits in normal flow
 *    below content.
 *
 * Plus a FLIP-style animator for `block:moved`: snapshot old top, set new
 * top via `offsetTop` walk, animate the delta. The walk is needed because
 * the live `getBoundingClientRect()` is unreliable mid-animation (the
 * block we're tracking may itself be in a CSS transform).
 */
export class ToolbarPositioner {
  /** @type {HTMLElement} */
  #toolbarEl

  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('../types').IBlockReader} */
  #blocks

  /** @type {number} */
  #mobileBreakpoint

  /** @type {number} */
  #moveAnimationMs

  /** @type {boolean} */
  moveAnimating = false

  /**
   * @param {HTMLElement} toolbarEl
   * @param {HTMLElement} rootEl
   * @param {import('../types').IBlockReader} blocks
   * @param {{ mobileBreakpoint: number, moveAnimationMs: number }} options
   */
  constructor(toolbarEl, rootEl, blocks, options) {
    this.#toolbarEl = toolbarEl
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#mobileBreakpoint = options.mobileBreakpoint
    this.#moveAnimationMs = options.moveAnimationMs
  }

  /**
   * Move the toolbar to the current block. Called on focus/insert/remove.
   * Returns false if there is no current block (caller should hide).
   *
   * @returns {boolean}
   */
  updatePosition() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return false

    this.#toolbarEl.style.display = ''

    if (this.isMobile()) {
      // Mobile: live in the block's flow, below content.
      if (this.#toolbarEl.parentElement !== block.element) {
        block.element.appendChild(this.#toolbarEl)
      }
      this.#toolbarEl.style.top = ''
    } else {
      // Desktop: absolute inside editor root.
      if (this.#toolbarEl.parentElement !== this.#rootEl) {
        this.#rootEl.appendChild(this.#toolbarEl)
      }
      const editorRect = this.#rootEl.getBoundingClientRect()
      const blockRect = block.element.getBoundingClientRect()
      this.#toolbarEl.style.top = `${blockRect.top - editorRect.top}px`
    }

    return true
  }

  /**
   * FLIP-animate the toolbar to the new block position (called on `block:moved`).
   * Optionally also animates the settings menu element if it's open.
   *
   * @param {HTMLElement | null} settingsMenuEl
   */
  animatePosition(settingsMenuEl) {
    if (this.isMobile()) {
      this.updatePosition()
      return
    }

    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    // FIRST: save current toolbar position.
    const oldTop = parseFloat(this.#toolbarEl.style.top) || 0

    // LAST: compute layout position via offsetTop walk
    // (immune to in-flight FLIP transforms on the block element).
    let newTop = 0
    /** @type {HTMLElement | null} */
    let offsetEl = block.element
    while (offsetEl && offsetEl !== this.#rootEl) {
      newTop += offsetEl.offsetTop
      offsetEl = /** @type {HTMLElement | null} */ (offsetEl.offsetParent)
    }

    this.moveAnimating = true
    this.#toolbarEl.style.top = `${newTop}px`

    if (this.#toolbarEl.parentElement !== this.#rootEl) {
      this.#rootEl.appendChild(this.#toolbarEl)
    }

    // INVERT + PLAY
    const dy = oldTop - newTop
    if (Math.abs(dy) < 1) {
      this.moveAnimating = false
      return
    }

    const opts = { duration: this.#moveAnimationMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }

    this.#toolbarEl.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      opts,
    ).onfinish = () => { this.moveAnimating = false }

    if (settingsMenuEl) {
      settingsMenuEl.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        opts,
      )
    }
  }

  /**
   * After a block-removed animation completes, FLIP the toolbar to its
   * new spot. Returns the dy offset for callers that want to animate
   * additional siblings (or zero if no animation is needed).
   *
   * @returns {number}
   */
  animateAfterRemoval() {
    const oldTop = parseFloat(this.#toolbarEl.style.top) || 0
    this.updatePosition()
    const newTop = parseFloat(this.#toolbarEl.style.top) || 0
    const dy = oldTop - newTop
    if (Math.abs(dy) > 1) {
      this.#toolbarEl.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: this.#moveAnimationMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
    return dy
  }

  /**
   * Position the toolbox popup relative to the toolbar (desktop only —
   * mobile uses CSS bottom-sheet positioning).
   *
   * @param {HTMLElement} toolboxEl
   */
  positionToolbox(toolboxEl) {
    if (this.isMobile()) {
      toolboxEl.style.top = ''
      toolboxEl.style.bottom = ''
      toolboxEl.style.left = ''
      toolboxEl.style.right = ''
      return
    }

    const toolbarRect = this.#toolbarEl.getBoundingClientRect()
    const editorRect = this.#rootEl.getBoundingClientRect()

    const rightOffset = editorRect.right - toolbarRect.right
    toolboxEl.style.right = `${rightOffset}px`
    toolboxEl.style.left = 'auto'

    positionPopup(toolboxEl, toolbarRect, editorRect)
  }

  /** @returns {boolean} */
  isMobile() {
    return window.innerWidth < this.#mobileBreakpoint
  }
}
