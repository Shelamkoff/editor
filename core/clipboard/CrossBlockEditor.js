import { getTextLength } from '../textOffset.js'
import { EditorEvent } from '../editorEvents.js'

import { editableFields, editableAtBoundary } from '../editableFields.js'

/** Delete a selection spanning editable fields without discarding unselected
 * fields or plugin-owned wrappers. All mutations share one command boundary.
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

    const firstField = editableAtBoundary(firstBlock.contentElement, rangeStart.node, rangeStart.offset)
    const lastField = editableAtBoundary(lastBlock.contentElement, rangeEnd.node, rangeEnd.offset)
    const firstCe = firstField?.element
    const lastCe = lastField?.element
    if (!firstCe || !lastCe || !firstCe.contains(rangeStart.node) || !lastCe.contains(rangeEnd.node)) return false
    const firstFields = editableFields(firstBlock.contentElement).filter(field => field.contentEditable === 'true')
    const lastFields = editableFields(lastBlock.contentElement).filter(field => field.contentEditable === 'true')
    const firstPosition = firstFields.indexOf(firstCe)
    const lastPosition = lastFields.indexOf(lastCe)
    if (firstPosition < 0 || lastPosition < 0) return false
    // Nested editing hosts need a plugin-owned structural split. Refuse them
    // before mutation rather than detach an endpoint through its ancestor.
    if (firstFields.some(field => field !== firstCe && field.contains(firstCe))
        || lastFields.some(field => field !== lastCe && field.contains(lastCe))) return false

    return this.#commands.runForBlocks([firstBlock, lastBlock], () => {
      const source = lastBlock.save()
      const suffixRange = document.createRange()
      suffixRange.selectNodeContents(lastCe)
      suffixRange.setStart(rangeEnd.node, rangeEnd.offset)
      const suffix = document.createElement('template')
      suffix.content.appendChild(suffixRange.cloneContents())
      const transferred = firstBlock.importInlineContent(suffix.innerHTML, source.inline)

      // Only the first field's suffix and subsequent fields are selected.
      const headRange = document.createRange()
      headRange.selectNodeContents(firstCe)
      headRange.setStart(rangeStart.node, rangeStart.offset)
      headRange.deleteContents()
      for (const field of firstFields.slice(firstPosition + 1)) field.replaceChildren()
      const caretOffset = getTextLength(firstCe)

      // Move the last field's suffix; later fields stay in their original block.
      for (const field of lastFields.slice(0, lastPosition + 1)) field.replaceChildren()
      suffix.innerHTML = transferred
      firstCe.append(...suffix.content.childNodes)
      for (let index = lastIndex - 1; index > firstIndex; index--) blocks.remove(index)
      if (lastPosition === lastFields.length - 1) blocks.remove(blocks.getBlockIndex(lastBlock.id))

      blocks.clearSelection()
      this.#crossBlockSelection.deactivate(this.#rootEl)
      blocks.setCurrentIndex(blocks.getBlockIndex(firstBlock.id))
      this.#selection.setCaretToOffset(firstBlock.id, caretOffset, firstField.index)
      notifyChanged(firstBlock, lastBlock)
      return true
    })
  }
}
