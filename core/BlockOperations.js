import { EditorEvent } from './editorEvents.js'

/** @typedef {import('./types').IBlockOperations} IBlockOperationsContract */
/** @implements {IBlockOperationsContract} */
export class BlockOperations {
  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {string} */
  #defaultBlockType

  /** @type {import('./types').IEventBus} */
  #events

  /**
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').ISelectionManager} selection
   * @param {string} defaultBlockType
   * @param {import('./types').IEventBus} events
   */
  constructor(blocks, selection, defaultBlockType, events) {
    this.#blocks = blocks
    this.#selection = selection
    this.#defaultBlockType = defaultBlockType
    this.#events = events
  }

  /**
   * Insert a new block, set it as current, place the caret, and focus.
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   * @param {number} [index]
   * @param {'start' | 'end'} [caretPosition='start']
   * @returns {import('./types').IBlock}
   */
  insertAndFocus(type, data, index, caretPosition = 'start') {
    const newBlock = this.#blocks.insert(type, data, index)
    const newIndex = this.#blocks.getBlockIndex(newBlock.id)
    this.#blocks.setCurrentIndex(newIndex)
    this.#selection.setCaretToBlock(newBlock.id, caretPosition)
    newBlock.focus()
    return newBlock
  }

  /**
   * If the current block is empty and of the default type, convert it in place.
   * Otherwise, insert a new block after it. Focuses the result.
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   * @param {'start' | 'end'} [caretPosition='start']
   * @returns {import('./types').IBlock}
   */
  replaceEmptyOrInsert(type, data, caretPosition = 'start') {
    const currentIndex = this.#blocks.getCurrentIndex()
    const currentBlock = this.#blocks.getBlockByIndex(currentIndex)

    if (currentBlock?.isEmpty()
        && currentBlock.type === this.#defaultBlockType
        && currentBlock.type !== type) {
      const converted = this.#blocks.convert(currentIndex, type, data)
      if (converted) {
        this.#blocks.setCurrentIndex(currentIndex)
        this.#selection.setCaretToBlock(converted.id, caretPosition)
        converted.focus()
        return converted
      }
    }

    return this.insertAndFocus(type, data, currentIndex + 1, caretPosition)
  }

  /**
   * Split the current block at the caret position (Enter key).
   * Extracts content after caret into a new block of the same type.
   */
  splitBlock() {
    const blocks = this.#blocks
    const current = blocks.getCurrentBlock()
    if (!current) return

    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      const fragmentHtml = this.#selection.extractFragmentAfterCaret()
      current.markDirty()
      this.#events.emit(EditorEvent.BLOCK_CHANGED, { blockId: current.id })

      const currentIndex = blocks.getCurrentIndex()
      const data = fragmentHtml ? { text: fragmentHtml } : {}
      this.insertAndFocus(this.#defaultBlockType, data, currentIndex + 1)
    } finally {
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
  }

  /**
   * Convert the current empty non-default block to the configured default
   * block and preserve focus. This is the common "exit block" operation used
   * by list-like plugins and by Backspace handling.
   * @returns {boolean} Whether a block was converted.
   */
  exitEmptyBlock() {
    const current = this.#blocks.getCurrentBlock()
    if (!current || !current.isEmpty() || current.type === this.#defaultBlockType) return false

    const index = this.#blocks.getCurrentIndex()
    const converted = this.#blocks.convert(index, this.#defaultBlockType)
    if (!converted) return false

    this.#blocks.setCurrentIndex(index)
    converted.focus()
    this.#selection.setCaretToBlock(converted.id, 'start')
    return true
  }

  /**
   * Merge the current block with the previous one (Backspace at start).
   * If current block is empty — removes it and focuses previous.
   * If both are the same type and support merge — merges content.
   * @returns {boolean} Whether the merge was handled
   */
  mergeWithPrevious() {
    if (!this.#selection.isAtStart()) return false

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    if (currentIndex <= 0) return false

    const current = blocks.getCurrentBlock()
    const prev = blocks.getBlockByIndex(currentIndex - 1)
    if (!current || !prev) return false

    if (current.isEmpty()) {
      blocks.remove(currentIndex)
      blocks.setCurrentIndex(currentIndex - 1)
      this.#selection.setCaretToBlock(prev.id, 'end')
      prev.focus()
      return true
    }

    if (prev.type === current.type && prev.canMerge) {
      this.#events.emit(EditorEvent.UNDO_BATCH_START)
      try {
        const currentData = current.save().data
        const mergeOffset = prev.contentElement.textContent?.length ?? 0
        prev.merge(currentData)
        blocks.remove(currentIndex)
        blocks.setCurrentIndex(currentIndex - 1)
        prev.focus()
        const actualLength = prev.contentElement.textContent?.length ?? 0
        this.#selection.setCaretToOffset(prev.id, Math.min(mergeOffset, actualLength))
      } finally {
        this.#events.emit(EditorEvent.UNDO_BATCH_END)
      }
      return true
    }

    return false
  }

  /**
   * Merge the next block into the current one (Delete at end).
   * If next block is empty - removes it.
   * If both are the same type and support merge - merges content.
   * @returns {boolean} Whether the merge was handled
   */
  mergeWithNext() {
    if (!this.#selection.isAtEnd()) return false

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    const current = blocks.getCurrentBlock()
    const next = blocks.getBlockByIndex(currentIndex + 1)
    if (!current || !next) return false

    if (next.isEmpty()) {
      blocks.remove(currentIndex + 1)
      return true
    }

    if (current.type === next.type && current.canMerge) {
      this.#events.emit(EditorEvent.UNDO_BATCH_START)
      try {
        const nextData = next.save().data
        const mergeOffset = current.contentElement.textContent?.length ?? 0
        current.merge(nextData)
        blocks.remove(currentIndex + 1)
        const actualLength = current.contentElement.textContent?.length ?? 0
        this.#selection.setCaretToOffset(current.id, Math.min(mergeOffset, actualLength))
      } finally {
        this.#events.emit(EditorEvent.UNDO_BATCH_END)
      }
      return true
    }

    return false
  }

  /**
   * Move the caret to the end of the previous block (ArrowUp at start).
   * @returns {boolean} Whether navigation happened
   */
  navigateToPrevious() {
    if (!this.#selection.isAtStart()) return false

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    if (currentIndex <= 0) return false

    const prev = blocks.getBlockByIndex(currentIndex - 1)
    if (!prev) return false

    blocks.setCurrentIndex(currentIndex - 1)
    this.#selection.setCaretToBlock(prev.id, 'end')
    prev.focus()
    return true
  }

  /**
   * Move the caret to the start of the next block (ArrowDown at end).
   * @returns {boolean} Whether navigation happened
   */
  navigateToNext() {
    if (!this.#selection.isAtEnd()) return false

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    const next = blocks.getBlockByIndex(currentIndex + 1)
    if (!next) return false

    blocks.setCurrentIndex(currentIndex + 1)
    this.#selection.setCaretToBlock(next.id, 'start')
    next.focus()
    return true
  }
}
