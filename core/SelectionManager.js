import { getTextOffset, firstTextNode, lastTextNode, editableTextWalker } from './textOffset.js'

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

    return {
      blockId: block.id,
      offset: getTextOffset(block.contentElement, range.startContainer, range.startOffset),
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

    const element = block.contentElement
    const sel = window.getSelection()
    if (!sel) return

    if (!element.hasChildNodes()) {
      element.focus()
      return
    }

    const range = document.createRange()

    if (position === 'start') {
      const node = firstTextNode(element) || element
      range.setStart(node, 0)
      range.collapse(true)
    } else {
      const node = lastTextNode(element) || element
      const offset = node.nodeType === Node.TEXT_NODE
        ? (node.textContent?.length ?? 0)
        : node.childNodes.length
      range.setStart(node, offset)
      range.collapse(true)
    }

    sel.removeAllRanges()
    sel.addRange(range)
  }

  /**
   * Set the caret to a specific text offset within a block's content.
   * Walks text nodes to find the correct position.
   * @param {string} blockId
   * @param {number} textOffset — character offset from start of block text
   */
  setCaretToOffset(blockId, textOffset) {
    const block = this.#blocks.getBlockById(blockId)
    if (!block) return

    const element = block.contentElement
    const sel = window.getSelection()
    if (!sel) return

    if (!element.hasChildNodes()) {
      element.focus()
      return
    }

    const walker = editableTextWalker(element)
    let remaining = textOffset

    while (walker.nextNode()) {
      const node = walker.currentNode
      const len = node.textContent?.length ?? 0

      if (remaining <= len) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      remaining -= len
    }

    // Offset exceeds total text — clamp to end (can happen after merge/undo)
    this.setCaretToBlock(blockId, 'end')
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

    const totalLength = block.contentElement.textContent?.length ?? 0
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

    const endRange = document.createRange()
    endRange.selectNodeContents(block.contentElement)
    endRange.setStart(range.startContainer, range.startOffset)

    const fragment = endRange.extractContents()
    const temp = document.createElement('div')
    temp.appendChild(fragment)

    return temp.innerHTML
  }
}
