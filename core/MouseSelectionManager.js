/**
 * Handles mouse-driven selection across blocks:
 * - Cross-block text selection via mouse drag
 * - Click-area handling (clicking below all blocks)
 * - CSS Highlight API for cross-contenteditable selection
 */
import { BLOCK_SELECTOR } from './constants.js'
import { EditorEvent } from './editorEvents.js'

export class MouseSelectionManager {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {HTMLElement} */
  #blocksEl

  /** @type {HTMLElement} */
  #clickArea

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {string} */
  #defaultBlockType

  /** @type {import('./types').IBlock | null} */
  #mouseStartBlock = null

  /** @type {Node | null} exact DOM node of mousedown caret */
  #mouseStartNode = null

  /** @type {number} offset within mouseStartNode */
  #mouseStartOffset = 0

  /** @type {boolean} */
  #isBlockSelecting = false

  /**
   * @typedef {Object} MouseSelectionConfig
   * @property {HTMLElement} blocksEl
   * @property {HTMLElement} clickArea
   * @property {import('./types').IBlockManager} blocks
   * @property {import('./types').ISelectionManager} selection
   * @property {import('./types').IEventBus} events
   * @property {import('./types').ICrossBlockSelection} crossBlockSelection
   * @property {string} defaultBlockType
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {MouseSelectionConfig} config
   */
  constructor(rootEl, config) {
    const { blocksEl, clickArea, blocks, selection, events, crossBlockSelection, defaultBlockType } = config
    this.#rootEl = rootEl
    this.#blocksEl = blocksEl
    this.#clickArea = clickArea
    this.#blocks = blocks
    this.#selection = selection
    this.#events = events
    this.#crossBlockSelection = crossBlockSelection
    this.#defaultBlockType = defaultBlockType

    rootEl.addEventListener('mousedown', this.#onMouseDown)
    rootEl.addEventListener('click', this.#onClickArea)
    document.addEventListener('mousemove', this.#onMouseMove)
    document.addEventListener('mouseup', this.#onMouseUp)
    // Outside-click handler: clears cross-block selection + native text
    // selection when the user clicks anywhere outside the editor, mirroring
    // how plain text fields lose selection on outside focus.
    document.addEventListener('mousedown', this.#onDocumentMouseDown, true)
  }

  /**
   * Clean up all event listeners.
   */
  destroy() {
    this.#rootEl.removeEventListener('mousedown', this.#onMouseDown)
    this.#rootEl.removeEventListener('click', this.#onClickArea)
    document.removeEventListener('mousemove', this.#onMouseMove)
    document.removeEventListener('mouseup', this.#onMouseUp)
    document.removeEventListener('mousedown', this.#onDocumentMouseDown, true)
  }

  /**
   * Clear any active block selection state.
   */
  #clearBlockSelection() {
    this.#blocks.clearSelection()
    this.#isBlockSelecting = false
    this.#crossBlockSelection.deactivate(this.#rootEl)
  }

  /**
   * Document-level mousedown. Clears block/cross-block selection and any
   * native text selection that lives inside the editor when the user
   * clicks ANYWHERE outside the editor root — matching the standard
   * text-field UX where clicking elsewhere drops the selection.
   *
   * Events originating INSIDE the editor are left alone: the `rootEl`
   * mousedown listener (`#onMouseDown`) already handles them.
   *
   * @param {MouseEvent} e
   */
  #onDocumentMouseDown = (e) => {
    const target = /** @type {Node | null} */ (e.target)
    if (!target || this.#rootEl.contains(target)) return

    // Drop block + cross-block selection.
    this.#clearBlockSelection()

    // If the native text selection is still anchored inside the editor,
    // collapse it so the user sees the selection disappear visually.
    const nativeSel = window.getSelection()
    if (nativeSel && nativeSel.rangeCount > 0) {
      const anchor = nativeSel.anchorNode
      if (anchor && this.#rootEl.contains(anchor)) {
        nativeSel.removeAllRanges()
      }
    }
  }

  /**
   * Get caret position under a point.
   * @param {number} x
   * @param {number} y
   * @returns {{ node: Node, offset: number } | null}
   */
  #caretFromPoint(x, y) {
    if (typeof document.caretPositionFromPoint === 'function') {
      const p = document.caretPositionFromPoint(x, y)
      return p ? { node: p.offsetNode, offset: p.offset } : null
    }
    // Fallback for browsers without caretPositionFromPoint
    const doc = /** @type {Document & { caretRangeFromPoint?(x: number, y: number): Range | null }} */ (document)
    if (typeof doc.caretRangeFromPoint === 'function') {
      const r = doc.caretRangeFromPoint(x, y)
      return r ? { node: r.startContainer, offset: r.startOffset } : null
    }
    return null
  }

  /** Check if target is the click area below all blocks */
  #isClickAreaTarget(/** @type {HTMLElement} */ target) {
    return target === this.#clickArea
  }

  /** Check if target is any empty space (gaps, root, blocks container, click area) */
  #isEmptySpace(/** @type {HTMLElement} */ target) {
    return target === this.#rootEl || target === this.#blocksEl || target === this.#clickArea
  }

  #onMouseDown = (/** @type {MouseEvent} */ e) => {
    const target = /** @type {HTMLElement} */ (e.target)

    // Only clear cross-block selection when clicking inside content area,
    // not on toolbar buttons or other UI elements
    if (target.closest(BLOCK_SELECTOR) || target.closest('.oe-blocks') || this.#isClickAreaTarget(target)) {
      this.#clearBlockSelection()
    }

    this.#mouseStartNode = null
    this.#mouseStartOffset = 0

    if (this.#isEmptySpace(target)) {
      if (this.#isClickAreaTarget(target)) {
        const lastBlock = this.#blocks.getBlockByIndex(this.#blocks.getBlockCount() - 1)
        this.#mouseStartBlock = lastBlock || null
      } else {
        this.#mouseStartBlock = null
      }
      return
    }

    this.#mouseStartBlock = this.#blocks.getBlockByChildNode(/** @type {Node} */ (e.target)) ?? null

    const caret = this.#caretFromPoint(e.clientX, e.clientY)
    if (caret) {
      this.#mouseStartNode = caret.node
      this.#mouseStartOffset = caret.offset
    }
  }

  #onClickArea = (/** @type {MouseEvent} */ e) => {
    if (this.#isBlockSelecting) return

    const target = /** @type {HTMLElement} */ (e.target)
    if (!this.#isClickAreaTarget(target)) return

    const blocks = this.#blocks
    const lastBlock = blocks.getBlockByIndex(blocks.getBlockCount() - 1)

    if (lastBlock && lastBlock.isEmpty() && lastBlock.type === this.#defaultBlockType) {
      const idx = blocks.getBlockIndex(lastBlock.id)
      blocks.setCurrentIndex(idx)
      lastBlock.focus()
      this.#selection.setCaretToBlock(lastBlock.id, 'start')
      return
    }

    const focusBlock = blocks.insert(this.#defaultBlockType, undefined, blocks.getBlockCount())
    const idx = blocks.getBlockIndex(focusBlock.id)
    blocks.setCurrentIndex(idx)
    focusBlock.focus()
    this.#selection.setCaretToBlock(focusBlock.id, 'start')
  }

  #onMouseMove = (/** @type {MouseEvent} */ e) => {
    if (!this.#mouseStartBlock || (e.buttons & 1) === 0) return

    const blocks = this.#blocks
    const currentBlock = blocks.getBlockByY(e.clientY)
    if (!currentBlock) return

    if (currentBlock.id === this.#mouseStartBlock.id) {
      if (this.#isBlockSelecting) {
        const rect = this.#mouseStartBlock.element.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          this.#clearBlockSelection()
        }
      }
      return
    }

    e.preventDefault()
    if (!this.#mouseStartNode) return

    this.#isBlockSelecting = true

    const endContent = currentBlock.contentElement
    const contentRect = endContent.getBoundingClientRect()
    const clampedY = Math.max(contentRect.top + 1, Math.min(contentRect.bottom - 1, e.clientY))
    let endCaret = this.#caretFromPoint(e.clientX, clampedY)
    if (!endCaret) return

    const range = document.createRange()
    const startIdx = blocks.getBlockIndex(this.#mouseStartBlock.id)
    const endIdx = blocks.getBlockIndex(currentBlock.id)

    try {
      if (startIdx <= endIdx) {
        range.setStart(this.#mouseStartNode, this.#mouseStartOffset)
        range.setEnd(endCaret.node, endCaret.offset)
      } else {
        range.setStart(endCaret.node, endCaret.offset)
        range.setEnd(this.#mouseStartNode, this.#mouseStartOffset)
      }
    } catch {
      return
    }

    this.#crossBlockSelection.activate(range, this.#rootEl)

    const sel = window.getSelection()
    if (sel) {
      try {
        sel.removeAllRanges()
        sel.setBaseAndExtent(
          this.#mouseStartNode, this.#mouseStartOffset,
          endCaret.node, endCaret.offset,
        )
      } catch {
        // Native selection across editing hosts not supported
      }
    }

    const from = Math.min(startIdx, endIdx)
    let to = Math.max(startIdx, endIdx)

    const lastBlockIdx = blocks.getBlockCount() - 1
    if (to === lastBlockIdx) {
      const lb = blocks.getBlockByIndex(lastBlockIdx)
      if (lb?.isEmpty()) to = Math.max(from, to - 1)
    }

    const ids = []
    blocks.clearSelection()
    for (let i = from; i <= to; i++) {
      const b = blocks.getBlockByIndex(i)
      if (b) {
        b.selected = true
        ids.push(b.id)
      }
    }
    this.#events.emit(EditorEvent.BLOCK_SELECTED, { blockIds: ids })
  }

  #onMouseUp = () => {
    this.#mouseStartBlock = null
    this.#mouseStartNode = null
    this.#mouseStartOffset = 0
  }
}
