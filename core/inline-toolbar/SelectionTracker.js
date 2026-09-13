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
 */
export class SelectionTracker {
  /** @type {SelectionTrackerDeps} */
  #deps

  /** @type {HTMLElement} */
  #toolbarEl

  /** @type {Document} */
  #document

  /** @type {Window | null} */
  #view

  /** @type {boolean} */
  #isMouseDown = false

  /** @type {boolean} */
  #suppressSelectionChange = false

  /** @type {boolean} */
  #destroyed = false

  /**
   * @param {HTMLElement} toolbarEl
   * @param {SelectionTrackerDeps} deps
   */
  constructor(toolbarEl, deps) {
    this.#toolbarEl = toolbarEl
    this.#deps = deps
    this.#document = deps.rootEl.ownerDocument
    this.#view = this.#document.defaultView

    this.#document.addEventListener('selectionchange', this.#onSelectionChange)
    deps.rootEl.addEventListener('mousedown', this.#onEditorMouseDown)
    this.#document.addEventListener('mouseup', this.#onDocumentMouseUp)
    this.#document.addEventListener('mousedown', this.#onDocumentMouseDown, true)
  }

  destroy() {
    this.#destroyed = true
    this.#document.removeEventListener('selectionchange', this.#onSelectionChange)
    this.#deps.rootEl.removeEventListener('mousedown', this.#onEditorMouseDown)
    this.#document.removeEventListener('mouseup', this.#onDocumentMouseUp)
    this.#document.removeEventListener('mousedown', this.#onDocumentMouseDown, true)
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

    const schedule = this.#view?.requestAnimationFrame?.bind(this.#view)
    if (!schedule) return
    schedule(() => {
      if (this.#destroyed) return
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
    if (!target || typeof target !== 'object' || !('nodeType' in target)) return
    if (this.#toolbarEl.contains(/** @type {Node} */ (target))) return
    this.#deps.hide()
  }

  #checkSelection() {
    const sel = this.#view?.getSelection()
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
    if (!startBlock || !endBlock) {
      this.#deps.hide()
      return
    }

    if (startBlock.id === endBlock.id) {
      if (startBlock.hasInlineTools) this.#deps.show()
      else this.#deps.hide()
      return
    }

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
