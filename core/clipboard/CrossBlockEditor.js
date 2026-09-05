import { getTextLength } from '../textOffset.js'
import { EditorEvent } from '../editorEvents.js'

/** @param {import('../types').IBlock} block */
function editableElement(block) {
  const root = block.contentElement
  if (root.matches('[contenteditable="true"]')) return root
  return /** @type {HTMLElement | null} */ (root.querySelector('[contenteditable="true"]'))
}

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

  /** @type {import('../CommandDispatcher').CommandDispatcher} */
  #commands

  /** @type {string} */
  #defaultBlockType

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../types').IBlockManager} blocks
   * @param {import('../types').ISelectionManager} selection
   * @param {import('../types').ICrossBlockSelection} crossBlockSelection
   * @param {import('../types').IEventBus} events
   * @param {string} defaultBlockType
   * @param {import('../CommandDispatcher').CommandDispatcher} commands
   */
  constructor(rootEl, blocks, selection, crossBlockSelection, events, defaultBlockType, commands) {
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#crossBlockSelection = crossBlockSelection
    this.#events = events
    this.#commands = commands
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
   * @param {(...blocks: import('../types').IBlock[]) => void} notifyChanged
   */
  deleteContent(crossRange, notifyChanged) {
    const blocks = this.#blocks

    const firstBlock = blocks.getBlockByChildNode(crossRange.startContainer)
    const lastBlock = blocks.getBlockByChildNode(crossRange.endContainer)
    if (!firstBlock || !lastBlock || firstBlock === lastBlock) return

    const firstIndex = blocks.getBlockIndex(firstBlock.id)
    const lastIndex = blocks.getBlockIndex(lastBlock.id)
    if (firstIndex < 0 || lastIndex <= firstIndex) return

    const rangeStart = { node: crossRange.startContainer, offset: crossRange.startOffset }
    const rangeEnd = { node: crossRange.endContainer, offset: crossRange.endOffset }

    const firstCe = editableElement(firstBlock)
    const lastCe = editableElement(lastBlock)

    // The cross-block algorithm requires two editable endpoints. Validate
    // before opening a history batch so malformed/detached ranges cannot
    // leave UndoManager permanently batching.
    if (!firstCe || !lastCe) return

    return this.#commands.runForBlocks([firstBlock, lastBlock], () => {
      this.#events.emit(EditorEvent.UNDO_BATCH_START)
      try {
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
        for (let index = lastIndex - 1; index > firstIndex; index--) {
          blocks.remove(index)
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
        const caretOffset = getTextLength(firstCe)

        // 4. Merge first + last.
        if (lastCe !== firstCe) {
          // Preserve boundary whitespace exactly. Trimming here joins words
          // when a range ends immediately before a leading space in the tail.
          const remaining = lastCe.innerHTML
          if (remaining) {
            const tpl = document.createElement('template')
            tpl.innerHTML = remaining
            firstCe.append(...tpl.content.childNodes)
          }
          const index = blocks.getBlockIndex(lastBlock.id)
          if (index >= 0) blocks.remove(index)
        }

        blocks.clearSelection()
        this.#crossBlockSelection.deactivate(this.#rootEl)

        if (blocks.getBlockCount() === 0) blocks.insert(this.#defaultBlockType)

        // 5. Restore caret at the merge boundary.
        const focusIdx = blocks.getBlockIndex(firstBlock.id)
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

        // Mark the surviving block dirty and notify while UndoManager is still
        // batching, so the final snapshot observes the DOM mutation.
        notifyChanged(firstBlock)
      } finally {
        this.#events.emit(EditorEvent.UNDO_BATCH_END)
      }
    })
  }
}
