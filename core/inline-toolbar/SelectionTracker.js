/**
 * @typedef {Object} SelectionTrackerDeps
 * @property {HTMLElement} rootEl
 * @property {import('../types').IBlockReader} blocks
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => void} updateActiveStates
 * @property {() => boolean} isInActionsView
 *   Returns true while the actions panel is open — selectionchange should be ignored.
 * @property {() => boolean} isTypeSelectorOpen
 * @property {() => boolean} hasOpenToolDropdown
 */

/**
 * Tracks the user's selection and decides when the inline toolbar should
 * appear or disappear.
 *
 * Listens to:
 *  - `selectionchange` on document — fires when the caret moves or text
 *    is selected. Filtered through several "is something else interactive"
 *    checks (actions panel, type selector, tool dropdown, mouse-down).
 *  - `mousedown`/`mouseup` on document — defers checks until the user
 *    finishes their drag-select. Without this we'd flicker the toolbar
 *    while the selection is still growing.
 *  - `mousedown` on document (capture) — closes the toolbar when the
 *    user clicks outside it.
 *
 * Decision logic in `checkSelection`:
 *  - empty/no selection → hide (unless cross-block selection is active)
 *  - single text block with `hasInlineTools` → show
 *  - cross-block range covering only text-blocks → show
 *  - any non-text block in the range → hide
 */
export class SelectionTracker {
  /** @type {SelectionTrackerDeps} */
  #deps

  /** @type {HTMLElement} */
  #toolbarEl

  /** @type {boolean} */
  #isMouseDown = false

  /** @type {boolean} */
  #suppressSelectionChange = false

  /**
   * @param {HTMLElement} toolbarEl
   * @param {SelectionTrackerDeps} deps
   */
  constructor(toolbarEl, deps) {
    this.#toolbarEl = toolbarEl
    this.#deps = deps

    document.addEventListener('selectionchange', this.#onSelectionChange)
    deps.rootEl.addEventListener('mousedown', this.#onEditorMouseDown)
    document.addEventListener('mouseup', this.#onDocumentMouseUp)
    document.addEventListener('mousedown', this.#onDocumentMouseDown, true)
  }

  destroy() {
    document.removeEventListener('selectionchange', this.#onSelectionChange)
    this.#deps.rootEl.removeEventListener('mousedown', this.#onEditorMouseDown)
    document.removeEventListener('mouseup', this.#onDocumentMouseUp)
    document.removeEventListener('mousedown', this.#onDocumentMouseDown, true)
  }

  /**
   * Suppress the next round of selectionchange events. Used by plugin
   * controls during DOM swaps that would otherwise trigger a hide.
   *
   * @param {boolean} value
   */
  setSuppressSelectionChange(value) {
    this.#suppressSelectionChange = value
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  #onSelectionChange = () => {
    if (this.#deps.isInActionsView()) return
    if (this.#suppressSelectionChange) return
    if (this.#isMouseDown) return
    if (this.#deps.isTypeSelectorOpen()) return
    if (this.#deps.hasOpenToolDropdown()) return

    this.#checkSelection()
  }

  #onEditorMouseDown = () => {
    this.#isMouseDown = true
  }

  #onDocumentMouseUp = () => {
    if (!this.#isMouseDown) return
    this.#isMouseDown = false

    requestAnimationFrame(() => {
      if (this.#suppressSelectionChange) return
      if (this.#deps.isInActionsView()) return
      if (this.#deps.isTypeSelectorOpen()) return
      if (this.#deps.hasOpenToolDropdown()) return
      this.#checkSelection()
    })
  }

  #onDocumentMouseDown = (/** @type {MouseEvent} */ e) => {
    if (this.#toolbarEl.style.display === 'none') return
    const target = e.target
    if (!(target instanceof Node)) return
    if (this.#toolbarEl.contains(target)) return
    this.#deps.hide()
  }

  // ── Decision ────────────────────────────────────────────────────────────────

  #checkSelection() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      // Cross-block selection is held in our custom store; native selection
      // gets clipped at editing-host boundaries, so an empty native selection
      // doesn't necessarily mean we should hide.
      if (this.#deps.crossBlockSelection.range) {
        if (this.#toolbarEl.style.display === 'none') this.#deps.show()
        else this.#deps.updateActiveStates()
        return
      }
      this.#deps.hide()
      return
    }

    const range = sel.getRangeAt(0)
    const text = sel.toString()
    if (!text.length) {
      this.#deps.hide()
      return
    }

    const startBlock = this.#deps.blocks.getBlockByChildNode(range.startContainer)
    const endBlock = this.#deps.blocks.getBlockByChildNode(range.endContainer)
    if (!startBlock) {
      this.#deps.hide()
      return
    }

    // Single block selection.
    if (!endBlock || startBlock.id === endBlock.id) {
      if (startBlock.hasInlineTools) {
        this.#deps.show()
      } else {
        this.#deps.hide()
      }
      return
    }

    // Cross-block native selection — only show if every spanned block has inline tools.
    const startIdx = this.#deps.blocks.getBlockIndex(startBlock.id)
    const endIdx = this.#deps.blocks.getBlockIndex(endBlock.id)
    const from = Math.min(startIdx, endIdx)
    const to = Math.max(startIdx, endIdx)

    for (let i = from; i <= to; i++) {
      const b = this.#deps.blocks.getBlockByIndex(i)
      if (!b || !b.hasInlineTools) {
        this.#deps.hide()
        return
      }
    }

    this.#deps.show()
  }
}
