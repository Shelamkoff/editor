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

    // A composite block's edge is an actual field, including an empty one.
    // setCaretToOffset focuses that host before restoring the logical point.
    const fields = editableFields(block.contentElement)
      .map((element, index) => ({ element, index }))
      .filter(field => field.element.contentEditable === 'true')
    const edge = position === 'start' ? fields[0] : fields.at(-1)
    this.setCaretToOffset(
      blockId,
      position === 'start' ? 0 : getTextLength(edge?.element ?? block.contentElement),
      edge?.index,
    )
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
  isAtStart() { return this.#isAtBlockEdge(false) }

  /** Check the last editable field, not a wrapper-wide character offset. */
  isAtEnd() { return this.#isAtBlockEdge(true) }

  /** Empty fields still own distinct positions. A zero-length sibling must
   * not turn an internal field boundary into the start/end of the whole block.
   * @param {boolean} atEnd
   */
  #isAtBlockEdge(atEnd) {
    const range = this.#getRange()
    if (!range || !range.collapsed) return false
    const block = this.#blocks.getBlockByChildNode(range.startContainer)
    if (!block) return false
    const fields = editableFields(block.contentElement).filter(field => field.contentEditable === 'true')
    const edge = atEnd ? fields.at(-1) : fields[0]
    const field = editableAtBoundary(block.contentElement, range.startContainer, range.startOffset)?.element
    if (!edge || field !== edge || !edge.contains(range.startContainer)) return false
    const offset = getTextOffset(edge, range.startContainer, range.startOffset)
    return atEnd ? offset >= getTextLength(edge) : offset === 0
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

    // Split only the field containing the caret, not a plugin's entire
    // wrapper (for example the quote text plus its unselected caption).
    const field = editableAtBoundary(block.contentElement, range.startContainer, range.startOffset)?.element
    if (!field || field.contentEditable !== 'true'
        || !field.contains(range.startContainer) || !field.contains(range.endContainer)) return null

    // Cross-block selections must first be replaced by the range editor.
    if (!range.collapsed) {
      range.deleteContents()
      range.collapse(true)
    }

    const endRange = document.createRange()
    endRange.selectNodeContents(field)
    endRange.setStart(range.startContainer, range.startOffset)

    const fragment = endRange.extractContents()
    const temp = document.createElement('div')
    temp.appendChild(fragment)

    return temp.innerHTML
  }
}
