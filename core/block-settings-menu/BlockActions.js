import { resolveBlockRange } from '../selectionRange.js'
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
 * @property {() => void} onClose
 * @property {() => void} onAfterMove
 * @property {() => Range | null} getSavedRange
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
    return this.#mutations.execute({
      name: 'settings.delete',
      markDirty: false,
      apply: () => this.#deleteAndReplace(),
    })
  }

  #deleteAndReplace() {
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

  /** @param {string} type @param {Record<string, unknown>} [data] */
  convertTo(type, data) {
    return this.#mutations.execute({
      name: 'settings.convert',
      markDirty: false,
      apply: () => this.#applyConversion(type, data),
    })
  }

  #applyConversion(type, data) {
    const candidate = this.#deps.crossBlockSelection.range ?? this.#deps.getSavedRange()
    const endpoints = candidate ? resolveBlockRange(this.#deps.blocks, candidate) : null
    if (candidate && !endpoints) { this.#deps.onClose(); return }

    if (endpoints && endpoints.first !== endpoints.last) {
      convertCrossBlockRange(
        {
          blocks: this.#deps.blocks,
          selection: this.#deps.selection,
          plugins: this.#deps.plugins,
          crossBlockSelection: this.#deps.crossBlockSelection,
          events: this.#deps.events,
        },
        candidate, type, data,
        null,
      )
      this.#deps.onClose()
      return
    }

    const blocks = this.#deps.blocks
    const index = blocks.getCurrentIndex()
    const current = blocks.getBlockByIndex(index)
    if (!current) { this.#deps.onClose(); return }

    if (type === current.type && !data) { this.#deps.onClose(); return }

    const savedRange = this.#deps.getSavedRange()
    const ownerDocument = savedRange?.startContainer.ownerDocument ?? current.contentElement.ownerDocument
    const sel = ownerDocument?.defaultView?.getSelection?.() ?? null

    // Restore the saved selection in the same browsing context that owns the
    // range. Menu focus can live in an iframe where the ambient page selection
    // is unrelated to the editor.
    if (savedRange && sel) {
      try { sel.removeAllRanges(); sel.addRange(savedRange) } catch { /* detached DOM */ }
    }

    if (!sel || sel.rangeCount === 0) {
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
   * @param {import('../types').IBlock} current
   * @param {import('../types').BlockPlugin} plugin
   * @param {HTMLElement} item
   */
  handleSettingsAction(current, plugin, item) {
    const action = item.dataset.level || item.dataset.action || ''

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
        current.contentElement.focus()
        return
      }
    }

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
