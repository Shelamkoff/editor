import { editableFields, editableAtBoundary } from './editableFields.js'
import { getTextOffset, getTextLength, findNodeAtOffset } from './textOffset.js'

/** @typedef {import('./types').ISelectionManager} ISelectionManagerContract */
/** @implements {ISelectionManagerContract} */
export class SelectionManager {
  /** @type {import('./types').IBlockReader} */
  #blocks

  /** @type {HTMLElement} */
  #editorEl

  /**
   * @param {HTMLElement} editorEl
   * @param {import('./types').IBlockReader} blocks
   */
  constructor(editorEl, blocks) {
    this.#editorEl = editorEl
    this.#blocks = blocks
  }

  /**
   * Get the current native range if it's inside the editor.
   * @returns {Range | null}
   */
  #getRange() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!this.#editorEl.contains(range.startContainer)) return null
    return range
  }

  /**
   * Get the current caret position info.
   * @returns {import('./types').CaretPosition | null}
   */
  getCaret() {
    const range = this.#getRange()
    if (!range) return null

    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return null

    const field = editableAtBoundary(block.contentElement, range.startContainer, range.startOffset)
    return {
      blockId: block.id,
      offset: getTextOffset(field?.element ?? block.contentElement, range.startContainer, range.startOffset),
      ...(field ? { fieldIndex: field.index } : {}),
    }
  }

  /**
   * Set the caret to the start or end of a block's content.
   * @param {string} blockId
   * @param {'start' | 'end'} position
   */
  setCaretToBlock(blockId, position) {
    const block = this.#blocks.getBlockById(blockId)
    if (!block) return

    this.setCaretToOffset(blockId, position === 'start' ? 0 : getTextLength(block.contentElement))
  }

  /**
   * Restore a logical position, counting BR and inline widgets as one unit.
   * @param {string} blockId
   * @param {number} textOffset
   * @param {number} [fieldIndex] Editable field identity for history/bookmarks.
   */
  setCaretToOffset(blockId, textOffset, fieldIndex) {
    const block = this.#blocks.getBlockById(blockId)
    const selection = window.getSelection()
    if (!block || !selection) return
    const root = fieldIndex === undefined ? block.contentElement : editableFields(block.contentElement)[fieldIndex]
    if (!root) return
    if (fieldIndex !== undefined) root.focus()
    const point = findNodeAtOffset(root, textOffset)
    const range = document.createRange()
    range.setStart(point.node, point.offset)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /**
   * Get the current text selection info (if any text is selected).
   * @returns {import('./types').InlineSelection | null}
   */
  getSelection() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null

    const range = sel.getRangeAt(0)
    if (!this.#editorEl.contains(range.startContainer)) return null

    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return null

    return {
      blockId: block.id,
      range: range.cloneRange(),
      text: sel.toString(),
    }
  }

  /**
   * Check if the caret is at the very start of the current block's content.
   * @returns {boolean}
   */
  isAtStart() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false

    const range = sel.getRangeAt(0)
    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return false

    return getTextOffset(block.contentElement, range.startContainer, range.startOffset) === 0
  }

  /**
   * Check if the caret is at the very end of the current block's content.
   * @returns {boolean}
   */
  isAtEnd() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false

    const range = sel.getRangeAt(0)
    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return false

    const totalLength = getTextLength(block.contentElement)
    const currentOffset = getTextOffset(block.contentElement, range.startContainer, range.startOffset)

    return currentOffset >= totalLength
  }

  /**
   * Extract the HTML content after the caret in the current block.
   * Used for splitting blocks (Enter key) — intentionally mutates DOM.
   * @returns {string | null}
   */
  extractFragmentAfterCaret() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return null

    // Enter replaces the current text selection before splitting its tail.
    // Cross-block selections are handled by the clipboard range editor.
    if (!range.collapsed) {
      if (!block.contentElement.contains(range.endContainer)) return null
      range.deleteContents()
      range.collapse(true)
    }

    const endRange = document.createRange()
    endRange.selectNodeContents(block.contentElement)
    endRange.setStart(range.startContainer, range.startOffset)

    const fragment = endRange.extractContents()
    const temp = document.createElement('div')
    temp.appendChild(fragment)

    return temp.innerHTML
  }
}
