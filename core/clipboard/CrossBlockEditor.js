import { BLOCK_CLASS } from '../constants.js'
import { closestBlock } from '../dom.js'
import { EditorEvent } from '../editorEvents.js'

/**
 * Operations on cross-block selections (text spanning multiple blocks).
 *
 * Cross-block selection is held in `ICrossBlockSelection` (a custom range
 * since the native browser API can't span editing hosts). This class
 * encapsulates the multi-step delete sequence:
 *
 *  1. Delete tail of last block (from rangeEnd → end of CE).
 *  2. Remove all middle blocks.
 *  3. Delete head of first block (from start of CE → rangeStart).
 *  4. Merge first + last (first block keeps the merged content).
 *  5. Restore caret at the merge boundary.
 *
 * Wrapped in an UNDO_BATCH so the whole operation is one undo step.
 */
export class CrossBlockEditor {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('../types').IBlockManager} */
  #blocks

  /** @type {import('../types').ISelectionManager} */
  #selection

  /** @type {import('../types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {import('../types').IEventBus} */
  #events

  /** @type {string} */
  #defaultBlockType

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../types').IBlockManager} blocks
   * @param {import('../types').ISelectionManager} selection
   * @param {import('../types').ICrossBlockSelection} crossBlockSelection
   * @param {import('../types').IEventBus} events
   * @param {string} defaultBlockType
   */
  constructor(rootEl, blocks, selection, crossBlockSelection, events, defaultBlockType) {
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#crossBlockSelection = crossBlockSelection
    this.#events = events
    this.#defaultBlockType = defaultBlockType
  }

  /**
   * Place the native caret at the end of a cross-block range.
   * Required so UndoManager captures the correct caret position when
   * the next snapshot is taken.
   *
   * @param {Range} range
   */
  setCaretToRangeEnd(range) {
    const endNode = range.endContainer
    const endOffset = range.endOffset

    const endBlock = this.#blocks.getBlockByChildNode(endNode)
    if (!endBlock) return

    const idx = this.#blocks.getBlockIndex(endBlock.id)
    if (idx >= 0) this.#blocks.setCurrentIndex(idx)

    endBlock.focus()

    try {
      const sel = window.getSelection()
      const r = document.createRange()
      r.setStart(endNode, endOffset)
      r.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(r)
    } catch {
      // Range may be detached after a focus shift; ignore.
    }
  }

  /**
   * Delete the content covered by a cross-block range and merge the
   * surviving head + tail into the first block.
   *
   * @param {Range} crossRange
   * @param {() => void} notifyChanged
   */
  deleteContent(crossRange, notifyChanged) {
    this.#events.emit(EditorEvent.UNDO_BATCH_START)

    const blocks = this.#blocks

    const startBlockEl = closestBlock(crossRange.startContainer)
    const endBlockEl = closestBlock(crossRange.endContainer)
    if (!startBlockEl || !endBlockEl) return

    const rangeStart = { node: crossRange.startContainer, offset: crossRange.startOffset }
    const rangeEnd = { node: crossRange.endContainer, offset: crossRange.endOffset }

    const container = startBlockEl.parentElement
    if (!container) return

    /** @type {HTMLElement[]} */
    const blockEls = []
    let inside = false
    for (const child of container.children) {
      if (child === startBlockEl) inside = true
      if (inside && child.classList.contains(BLOCK_CLASS)) {
        blockEls.push(/** @type {HTMLElement} */ (child))
      }
      if (child === endBlockEl) break
    }

    const firstCe = startBlockEl.querySelector('[contenteditable="true"]')
    const lastEl = blockEls.length > 1 ? blockEls[blockEls.length - 1] : null
    const lastCe = lastEl?.querySelector('[contenteditable="true"]')

    // 1. Delete tail of last block.
    if (lastCe) {
      try {
        const delRange = document.createRange()
        delRange.selectNodeContents(lastCe)
        delRange.setEnd(rangeEnd.node, rangeEnd.offset)
        delRange.deleteContents()
        lastCe.normalize()
      } catch {
        // Range may have been invalidated mid-operation; ignore.
      }
    }

    // 2. Remove middle blocks (skip first and last).
    for (let i = blockEls.length - 2; i >= 1; i--) {
      const blockId = blockEls[i]?.dataset.blockId
      if (blockId) {
        const idx = blocks.getBlockIndex(blockId)
        if (idx >= 0) blocks.remove(idx)
      }
    }

    // 3. Delete head of first block.
    if (firstCe) {
      try {
        const delRange = document.createRange()
        delRange.selectNodeContents(firstCe)
        delRange.setStart(rangeStart.node, rangeStart.offset)
        delRange.deleteContents()
        firstCe.normalize()
      } catch {
        // ignore
      }
    }

    // Caret target = end of remaining text in firstCe (the merge boundary).
    const caretOffset = (firstCe?.textContent || '').length

    // 4. Merge first + last.
    if (lastCe && firstCe && lastCe !== firstCe) {
      const remaining = lastCe.innerHTML.trim()
      if (remaining) {
        const tpl = document.createElement('template')
        tpl.innerHTML = remaining
        firstCe.append(...tpl.content.childNodes)
      }
      const lastBlockId = lastEl?.dataset.blockId
      if (lastBlockId) {
        const idx = blocks.getBlockIndex(lastBlockId)
        if (idx >= 0) blocks.remove(idx)
      }
    }

    this.#crossBlockSelection.deactivate(this.#rootEl)

    if (blocks.getBlockCount() === 0) blocks.insert(this.#defaultBlockType)

    // 5. Restore caret at the merge boundary.
    const focusId = startBlockEl.dataset.blockId
    if (focusId) {
      const focusIdx = blocks.getBlockIndex(focusId)
      if (focusIdx >= 0) {
        blocks.setCurrentIndex(focusIdx)
        const block = blocks.getBlockByIndex(focusIdx)
        if (block) {
          block.focus()
          if (caretOffset > 0) {
            this.#selection.setCaretToOffset(block.id, caretOffset)
          } else {
            this.#selection.setCaretToBlock(block.id, 'start')
          }
        }
      }
    }

    this.#events.emit(EditorEvent.UNDO_BATCH_END)
    notifyChanged()
  }
}
