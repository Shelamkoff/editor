import { EditorEvent } from '../editorEvents.js'
import { convertCrossBlockRange, isTextType } from '../crossBlockConvert.js'
import { splitAndConvert, isFullBlockSelected } from '../splitConvert.js'

/**
 * @typedef {Object} BlockActionsDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {import('../types').ISelectionManager} selection
 * @property {import('../BlockOperations').BlockOperations} blockOps
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {import('../types').IEventBus} events
 * @property {import('../CommandDispatcher').CommandDispatcher} commands
 * @property {string} defaultBlockType
 * @property {(current: import('../types').IBlock, index: number) => import('../types').IBlock | undefined} duplicateBlock
 * @property {() => void} onClose       called after each terminal action
 * @property {() => void} onAfterMove   called after move (rebuild + reposition)
 * @property {() => Range | null} getSavedRange
 *   Returns the range that was active when the menu opened — used by `convertTo`
 *   to restore caret before slicing the block.
 */

/**
 * The actual block-mutating operations exposed by the settings menu:
 * move up/down, duplicate, delete, convert to type, plugin-specific
 * settings actions (e.g. heading level change).
 *
 * Each method is "fire-and-forget" — it performs the mutation and (in
 * most cases) closes the menu via `deps.onClose()`. Move operations
 * keep the menu open via `deps.onAfterMove()`.
 */
export class BlockActions {
  /** @type {BlockActionsDeps} */
  #deps

  /** @type {import('../CommandDispatcher').CommandDispatcher} */
  #mutations

  /** @param {BlockActionsDeps} deps */
  constructor(deps) {
    this.#deps = deps
    this.#mutations = deps.commands
  }

  moveUp() {
    const index = this.#deps.blocks.getCurrentIndex()
    if (index <= 0) return
    this.#deps.blocks.move(index, index - 1)
    this.#deps.onAfterMove()
  }

  moveDown() {
    const index = this.#deps.blocks.getCurrentIndex()
    if (index >= this.#deps.blocks.getBlockCount() - 1) return
    this.#deps.blocks.move(index, index + 2)
    this.#deps.onAfterMove()
  }

  duplicate() {
    const blocks = this.#deps.blocks
    const index = blocks.getCurrentIndex()
    const current = blocks.getBlockByIndex(index)
    if (!current) return

    this.#deps.duplicateBlock(current, index)
    this.#deps.onClose()
  }

  delete() {
    this.#deps.events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      const blocks = this.#deps.blocks
      const index = blocks.getCurrentIndex()
      blocks.remove(index)

      if (blocks.getBlockCount() === 0) {
        blocks.insert(this.#deps.defaultBlockType)
      }

      const focusIdx = Math.min(index, blocks.getBlockCount() - 1)
      blocks.setCurrentIndex(focusIdx)
      const block = blocks.getBlockByIndex(focusIdx)
      if (block) {
        block.focus()
        this.#deps.selection.setCaretToBlock(block.id, 'start')
      }
    } finally {
      this.#deps.events.emit(EditorEvent.UNDO_BATCH_END)
    }
    this.#deps.onClose()
  }

  /**
   * Convert the current block (or the cross-block range) to a different type.
   *
   * Three branches:
   *  1. Cross-block range → delegate to `convertCrossBlockRange`.
   *  2. Single block, no selection or full-block selection → swap whole block.
   *  3. Single block, partial selection → `splitAndConvert` (creates two blocks).
   *
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   */
  convertTo(type, data) {
    return this.#mutations.execute({
      name: 'settings.convert',
      markDirty: false,
      apply: () => this.#applyConversion(type, data),
    })
  }

  #applyConversion(type, data) {
    const crossRange = this.#deps.crossBlockSelection.range

    if (crossRange) {
      convertCrossBlockRange(
        {
          blocks: this.#deps.blocks,
          selection: this.#deps.selection,
          plugins: this.#deps.plugins,
          crossBlockSelection: this.#deps.crossBlockSelection,
          events: this.#deps.events,
        },
        crossRange, type, data,
        null,
      )
      this.#deps.onClose()
      return
    }

    // Restore the saved selection so the conversion happens against
    // the user's actual caret/range, not the menu focus.
    const savedRange = this.#deps.getSavedRange()
    if (savedRange) {
      const sel = window.getSelection()
      if (sel) {
        try { sel.removeAllRanges(); sel.addRange(savedRange) } catch { /* detached DOM */ }
      }
    }

    const blocks = this.#deps.blocks
    const index = blocks.getCurrentIndex()
    const current = blocks.getBlockByIndex(index)
    if (!current) { this.#deps.onClose(); return }

    if (type === current.type && !data) { this.#deps.onClose(); return }

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      // No selection — full block convert.
      const converted = blocks.convert(index, type, data)
      if (converted) {
        blocks.setCurrentIndex(index)
        this.#deps.selection.setCaretToBlock(converted.id, 'end')
        converted.focus()
      }
      this.#deps.onClose()
      return
    }

    const range = sel.getRangeAt(0)
    const contentEl = current.contentElement
    const isFullBlock = sel.isCollapsed || isFullBlockSelected(contentEl, range)

    this.#deps.events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      if (isFullBlock) {
        const converted = blocks.convert(index, type, data)
        if (converted) {
          blocks.setCurrentIndex(index)
          this.#deps.selection.setCaretToBlock(converted.id, 'start')
          converted.focus()
        }
      } else {
        splitAndConvert(
          blocks,
          this.#deps.selection,
          index,
          current.type,
          contentEl,
          range,
          type,
          data,
          isTextType(this.#deps.plugins, type),
        )
      }
    } finally {
      this.#deps.events.emit(EditorEvent.UNDO_BATCH_END)
    }
    this.#deps.onClose()
  }

  /**
   * Handle a plugin-specific settings item (e.g. "Heading 2" → changeLevel(2)).
   * Falls back to `onSettingsAction` + `convert` for plugins without an
   * in-place update path.
   *
   * @param {import('../types').IBlock} current
   * @param {import('../types').BlockPlugin} plugin
   * @param {HTMLElement} item
   */
  handleSettingsAction(current, plugin, item) {
    const action = item.dataset.level || item.dataset.action || ''

    // Special case: Heading has changeLevel() for in-place updates.
    if (plugin.changeLevel && action) {
      const level = parseInt(action, 10)
      if (level) {
        this.#mutations.runForBlock(current, () => {
          const newEl = plugin.changeLevel(current.contentElement, level)
          if (newEl !== current.contentElement) {
            current.replaceContentElement(newEl)
          }
        })
        this.#deps.onClose()
        // Restore focus to the (possibly new) content element — closing
        // the settings menu shifts focus away, and changeLevel's internal
        // selection restore runs before the close.
        current.contentElement.focus()
        return
      }
    }

    // Fallback: re-render via convert.
    if (plugin.onSettingsAction) {
      this.#mutations.runForBlock(current, () => {
        const newData = plugin.onSettingsAction(current.contentElement, action)
        if (newData) {
          const index = this.#deps.blocks.getCurrentIndex()
          const converted = this.#deps.blocks.convert(index, current.type, newData)
          if (converted) {
            this.#deps.blocks.setCurrentIndex(index)
            this.#deps.selection.setCaretToBlock(converted.id, 'end')
            converted.focus()
          }
        }
      })
    }
    this.#deps.onClose()
  }
}
