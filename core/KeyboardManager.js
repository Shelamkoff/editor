import { CompositionGuard } from './CompositionGuard.js'
import { BLOCK_SELECTOR } from './constants.js'
import { EditorEvent } from './editorEvents.js'

export class KeyboardManager {
  /** @type {CompositionGuard} */
  #composition
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IBlockOperations} */
  #blockOps

  /** @type {import('./ShortcutRegistry').ShortcutRegistry} */
  #shortcuts

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {string} */
  #defaultBlockType

  /**
   * Predicate that returns true when an interactive UI overlay is open
   * (dropdown, actions panel, etc.). While true, KeyboardManager yields
   * control — keys go to the overlay, not to block editing.
   * @type {(() => boolean) | null}
   */
  #isUIActive = null

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./types').IBlockOperations} blockOps
   * @param {import('./ShortcutRegistry').ShortcutRegistry} shortcuts
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').IEventBus} events
   * @param {string} defaultBlockType
   * @param {(() => boolean)} [uiActivePredicate]
   */
  constructor(rootEl, blockOps, shortcuts, blocks, events, defaultBlockType, uiActivePredicate) {
    this.#rootEl = rootEl
    this.#blockOps = blockOps
    this.#shortcuts = shortcuts
    this.#blocks = blocks
    this.#events = events
    this.#defaultBlockType = defaultBlockType
    this.#isUIActive = uiActivePredicate ?? null

    this.#composition = new CompositionGuard(rootEl)
    rootEl.addEventListener('keydown', this.#onKeyDown)
  }

  /**
   * Clean up.
   */
  destroy() {
    this.#composition.destroy()
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown)
  }

  /**
   * @param {KeyboardEvent} e
   */
  #onKeyDown = (e) => {
    const target = /** @type {HTMLElement} */ (e.target)
    const isBlockTarget = target === this.#rootEl || !!target.closest?.(BLOCK_SELECTOR)

    // Editor-scoped history must run before overlay routing. Otherwise an open
    // actions panel/dropdown lets the browser execute its own contenteditable
    // DOM history, whose order is unrelated to the editor's block history.
    if (isBlockTarget && this.#shortcuts.handle(e, 'editor')) return

    // Document-level shortcuts (currently undo/redo) remain available while a
    // non-text editor control owns focus. Native history in inputs, textareas,
    // selects, and auxiliary contenteditables must never be intercepted.
    if (!isBlockTarget) {
      const isEditorControl = this.#rootEl.contains(target)
      const ownsNativeHistory = !!target.closest?.('input, textarea, select, [contenteditable="true"]')
      if (isEditorControl && !ownsNativeHistory) this.#shortcuts.handle(e, 'editor')
      return
    }

    // Skip block commands when interactive UI overlay is active. The overlay
    // handles its own keyboard events.
    if (this.#isUIActive?.()) return

    // 0. If blocks are selected, handle delete/backspace to remove them
    if (this.#blocks.hasSelectedBlocks()) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        this.#deleteSelectedBlocks()
        return
      }
      // Any other non-modifier key clears selection
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        this.#blocks.clearSelection()
      }
    }

    // 1. Try content-scoped shortcuts (Mod+B, plugin shortcuts...). Editor-
    // scoped history was already offered above and will not match again here
    // because a handled event returned immediately.
    if (this.#shortcuts.handle(e)) return

    // 2. Structural keys
    switch (e.key) {
      case 'Enter':
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          this.#blockOps.splitBlock()
        }
        return

      case 'Backspace':
        if (!e.metaKey && !e.ctrlKey) {
          if (this.#blockOps.mergeWithPrevious()) {
            e.preventDefault()
          } else {
            // Convert empty non-default block to default type (e.g. empty list → paragraph)
            if (this.#blockOps.exitEmptyBlock()) e.preventDefault()
          }
        }
        return

      case 'Delete':
        if (!e.metaKey && !e.ctrlKey) {
          if (this.#blockOps.mergeWithNext()) {
            e.preventDefault()
          }
        }
        return

      case 'ArrowUp':
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
          if (this.#blockOps.navigateToPrevious()) {
            e.preventDefault()
          }
        }
        return

      case 'ArrowDown':
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
          if (this.#blockOps.navigateToNext()) {
            e.preventDefault()
          }
        }
        return

    }

    // 3. Cmd+A — select all in block, then all blocks
    // Use e.code for layout independence (e.key is 'ф' on Russian layout)
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyA') {
      this.#handleSelectAll(e)
    }
  }

  /**
   * Ctrl+A logic based on selection state (no timer):
   * - If blocks are already selected → clear selection, let browser select text
   * - If no text is selected (collapsed caret) → let browser select all in current block
   * - If text is already selected (second press) → select all blocks
   * @param {KeyboardEvent} e
   */
  #handleSelectAll(e) {
    // If blocks are already in selected state, clear and let browser re-select text
    if (this.#blocks.hasSelectedBlocks()) {
      this.#blocks.clearSelection()
      // Don't preventDefault — browser's native Ctrl+A will select text in the
      // focused contenteditable (user-select:none is removed synchronously above)
      return
    }

    const sel = window.getSelection()
    const current = this.#blocks.getCurrentBlock()

    // If current block is empty (collapsed caret, nothing to select),
    // skip browser's native selectAll and go directly to block selection
    const isEmptyBlock = current && current.isEmpty()

    if ((sel && !sel.isCollapsed) || isEmptyBlock) {
      // Text is already selected (second Ctrl+A) or block is empty → select all blocks
      e.preventDefault()

      const ids = []
      let firstBlock = null
      let lastBlock = null
      const lastIdx = this.#blocks.getBlockCount() - 1

      for (let i = 0; i <= lastIdx; i++) {
        const block = this.#blocks.getBlockByIndex(i)
        if (!block) continue
        // Skip the last block if it's empty
        if (i === lastIdx && block.isEmpty()) continue
        block.selected = true
        ids.push(block.id)
        if (!firstBlock) firstBlock = block
        lastBlock = block
      }

      // Create native selection spanning all selected blocks
      if (firstBlock && lastBlock && sel) {
        const firstCe = firstBlock.contentElement
        const lastCe = lastBlock.contentElement
        const range = document.createRange()
        range.setStart(firstCe, 0)
        range.setEnd(lastCe, lastCe.childNodes.length)
        sel.removeAllRanges()
        sel.addRange(range)
      }

      this.#events.emit(EditorEvent.BLOCK_SELECTED, { blockIds: ids })
    }
    // else: collapsed caret in non-empty block → let browser handle (selects text)
  }

  /**
   * Delete all selected blocks, leave one empty block.
   */
  #deleteSelectedBlocks() {
    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      const result = this.#blocks.removeSelected(this.#defaultBlockType)
      if (result) {
        this.#blocks.setCurrentIndex(result.focusIndex)
        const focusBlock = this.#blocks.getBlockByIndex(result.focusIndex)
        if (focusBlock) focusBlock.focus()
      }
    } finally {
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
  }
}
