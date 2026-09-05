import { Block } from './Block.js'
import { BlockAnimator } from './BlockAnimator.js'
import { closestBlock } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { deserializeInlineHtml } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { uid } from './uid.js'
import { createPreservedBlockPlugin } from './PreservedBlockPlugin.js'

/** @typedef {import('./types').IBlockManager} IBlockManagerContract */
/** @implements {IBlockManagerContract} */
export class BlockManager {
  /** @type {Block[]} */
  #blocks = []

  /** @type {Map<string, Block>} */
  #blockMap = new Map()

  /** @type {Map<string, number>} block ID → array index for O(1) lookup */
  #indexMap = new Map()

  /** @type {Map<string, import('./types').BlockPlugin>} */
  #plugins

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {HTMLElement} */
  #container

  /** @type {number} current focused block index, -1 if none */
  #currentIndex = -1

  /** @type {BlockAnimator} */
  #animator

  /** @type {import('./InlinePluginRegistry').InlinePluginRegistry | null} */
  #inlinePluginRegistry = null
  /** @type {boolean} */
  #readOnly

  /** @type {import('./CommandDispatcher').CommandDispatcher | null} */
  #commands = null

  /** @type {{ splitBlock: (() => void) | null, exitEmptyBlock: (() => boolean) | null }} */
  #structuralCommands = { splitBlock: null, exitEmptyBlock: null }

  /** @type {Map<string, import('./types').BlockPlugin>} */
  #preservedPlugins = new Map()

  /** @type {(type: string) => string} */
  #unknownBlockLabel


  /**
   * @param {HTMLElement} container - .oe-blocks element
   * @param {Map<string, import('./types').BlockPlugin>} plugins
   * @param {import('./types').IEventBus} events
   * @param {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} [animations]
   * @param {boolean} [readOnly]
   * @param {(type: string) => string} [unknownBlockLabel]
   */
  constructor(container, plugins, events, animations, readOnly = false, unknownBlockLabel = type => `Unsupported block type: ${type}`) {
    this.#container = container
    this.#plugins = plugins
    this.#events = events
    this.#animator = new BlockAnimator(animations ?? { blockInsertMs: 350, blockMoveMs: 200, blockRemoveMs: 350 })
    this.#readOnly = readOnly
    this.#unknownBlockLabel = unknownBlockLabel
  }

  /**
   * Wire in the inline plugin registry. Called once by `createEditor` after
   * the registry is built. BlockManager uses it to rehydrate inline widget
   * placeholder tokens (`{{<id>}}`) into live widget DOM when blocks are
   * created from saved data.
   *
   * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
   */
  setInlinePluginRegistry(registry) {
    this.#inlinePluginRegistry = registry
  }

  /** @param {import('./CommandDispatcher').CommandDispatcher} commands */
  setCommandDispatcher(commands) {
    this.#commands = commands
  }

  /**
   * Wire structural commands into existing and subsequently created blocks.
   * @param {{ splitBlock: (() => void) | null, exitEmptyBlock: (() => boolean) | null }} commands
   * @returns {void}
   */
  setPluginStructuralCommands(commands) {
    this.#structuralCommands = commands
    for (const block of this.#blocks) block.setStructuralCommands(commands)
  }

  /** Select the render context used for subsequently created blocks. */
  setReadOnly(readOnly) {
    this.#readOnly = readOnly
  }

  /** Build a block without mutating the live manager. */
  #createBlock(type, data, id, inline, metadata = {}, preserveUnknown = false) {
    if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')
    let plugin = this.#plugins.get(type)
    if (!plugin && preserveUnknown) {
      plugin = this.#preservedPlugins.get(type)
      if (!plugin) {
        plugin = createPreservedBlockPlugin(type, this.#unknownBlockLabel)
        this.#preservedPlugins.set(type, plugin)
      }
    }
    if (!plugin) throw new Error(`[BlockManager] Unknown block type: "${type}"`)

    const blockData = data === undefined ? undefined : cloneEditorData(data)
    if (inline && typeof plugin.mapTextFields === 'function' && this.#inlinePluginRegistry && blockData) {
      const registry = this.#inlinePluginRegistry
      plugin.mapTextFields(blockData, (html) => deserializeInlineHtml(html, inline, registry))
    }
    const block = new Block(plugin, this.#commands, blockData, id, this.#readOnly, {
      ...metadata,
      inline,
      preserveInline: preserveUnknown,
    })
    block.setStructuralCommands(this.#structuralCommands)
    return block
  }

  /** Resolve a collision-safe block id. */
  #uniqueId(requested, occupied) {
    let id = requested || uid()
    if (occupied.has(id) && requested) {
      console.warn(`[BlockManager] Duplicate block id "${requested}" was remapped`)
    }
    while (occupied.has(id)) id = uid()
    return id
  }

  /** Rebuild the reverse index map after any structural change. */
  #rebuildIndexMap() {
    this.#indexMap.clear()
    for (let i = 0; i < this.#blocks.length; i++) {
      this.#indexMap.set(this.#blocks[i].id, i)
    }
  }

  /**
   * Place an active block element according to the model order.
   *
   * Removed blocks may remain in the container while their exit animation is
   * running, so `container.children[index]` is not a valid model index. Use
   * neighboring live Block instances as anchors instead.
   * @param {HTMLElement} element
   * @param {number} index
   */
  #placeElementAtIndex(element, index) {
    const next = /** @type {HTMLElement | undefined} */ (this.#blocks[index + 1]?.element)
    if (next?.parentNode === this.#container) {
      this.#container.insertBefore(element, next)
      return
    }

    const previous = /** @type {HTMLElement | undefined} */ (this.#blocks[index - 1]?.element)
    if (previous?.parentNode === this.#container) {
      previous.after(element)
      return
    }

    this.#container.prepend(element)
  }

  /** Enable insert/remove animations (call after initial load). */
  enableAnimations() {
    this.#animator.enable()
  }

  /**
   * Insert a new block.
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   * @param {number} [index] - insert position, defaults to after current or end
   * @param {string} [id] - optional block ID (for restoring saved data)
   * @param {Record<string, import('../renderer/types').InlineWidget>} [inline]
   * @returns {Block}
   */
  insert(type, data, index, id, inline) {
    if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')
    const blockId = this.#uniqueId(id, this.#blockMap)

    if (index === undefined || index < 0 || index > this.#blocks.length) {
      index = this.#currentIndex >= 0 ? this.#currentIndex + 1 : this.#blocks.length
    }
    const insertIndex = index

    return this.#commands.execute({
      name: 'block.insert',
      markDirty: false,
      apply: () => {
        const block = this.#createBlock(type, data, blockId, inline)
        this.#blocks.splice(insertIndex, 0, block)
        this.#blockMap.set(block.id, block)
        this.#rebuildIndexMap()

        // Adjust currentIndex if inserting before or at the current block.
        if (this.#currentIndex >= 0 && insertIndex <= this.#currentIndex) {
          this.#currentIndex++
        }

        this.#placeElementAtIndex(block.element, insertIndex)
        this.#animator.animateInsert(block.element)
        this.#events.emit(EditorEvent.BLOCK_ADDED, { blockId: block.id, index: insertIndex })
        return block
      },
    })
  }

  /**
   * Build a complete replacement document off-DOM. The returned transaction
   * owns the staged blocks until commit() or dispose() is called.
   * @param {import('./types').BlockData[] | undefined} blockList
   * @param {string} defaultBlockType
   * @param {string} [logPrefix]
   */
  prepareReplacement(blockList, defaultBlockType, logPrefix = 'Editor') {
    /** @type {Block[]} */
    const staged = []
    /** @type {Map<string, Block>} */
    const stagedMap = new Map()
    let settled = false

    const disposeStaged = () => {
      for (const block of staged) block.destroy()
    }

    const add = (type, data, requestedId, inline, tunes, revision, preserveUnknown) => {
      const id = this.#uniqueId(requestedId, stagedMap)
      const block = this.#createBlock(type, data, id, inline, { tunes, revision }, preserveUnknown)
      staged.push(block)
      stagedMap.set(id, block)
    }

    try {
      if (Array.isArray(blockList) && blockList.length > 0) {
        for (const candidate of blockList) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            console.warn(`[${logPrefix}] Skipping malformed block entry`)
            continue
          }

          const blockData = /** @type {import('./types').BlockData} */ (candidate)
          const type = typeof blockData.type === 'string' ? blockData.type : ''
          const data = blockData.data && typeof blockData.data === 'object' && !Array.isArray(blockData.data)
            ? blockData.data
            : undefined
          const id = typeof blockData.id === 'string' && blockData.id ? blockData.id : undefined
          const inline = blockData.inline && typeof blockData.inline === 'object' && !Array.isArray(blockData.inline)
            ? blockData.inline
            : undefined
          const tunes = blockData.tunes && typeof blockData.tunes === 'object' && !Array.isArray(blockData.tunes)
            ? blockData.tunes
            : undefined
          const revision = typeof blockData.revision === 'string' || typeof blockData.revision === 'number'
            ? blockData.revision
            : undefined
          if (!type) {
            console.warn(`[${logPrefix}] Skipping block without a type`)
            continue
          }
          const preserveUnknown = !this.#plugins.has(type)
          if (preserveUnknown) {
            console.warn(`[${logPrefix}] Preserving unregistered block type "${type}" as read-only`)
          }
          add(type, data, id, inline, tunes, revision, preserveUnknown)
        }
      }

      if (staged.length === 0) add(defaultBlockType, undefined, undefined, undefined, undefined, undefined, false)
    } catch (error) {
      disposeStaged()
      settled = true
      throw error
    }

    return {
      blocks: /** @type {readonly Block[]} */ (staged),
      commit: (options = {}) => {
        if (settled) throw new Error('[BlockManager] Replacement transaction is already settled')
        if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')
        this.#commands.execute({
          name: 'document.replace',
          markDirty: false,
          notifyChange: options.notifyChange,
          apply: () => {
            settled = true
            for (const block of this.#blocks) block.destroy()

            this.#blocks = staged
            this.#blockMap = stagedMap
            this.#rebuildIndexMap()
            this.#currentIndex = -1
            this.#container.replaceChildren(...staged.map(block => block.element))
            this.#events.emit(EditorEvent.DOCUMENT_REPLACED)
          },
        })
      },
      dispose: () => {
        if (settled) return
        settled = true
        disposeStaged()
      },
    }
  }

  /**
   * Remove a block by index.
   * @param {number} index
   */
  remove(index) {
    const block = this.#blocks[index]
    if (!block) return
    if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')

    this.#commands.execute({
      name: 'block.remove',
      markDirty: false,
      apply: () => {
        this.#blocks.splice(index, 1)
        this.#blockMap.delete(block.id)
        this.#rebuildIndexMap()
        block.destroy()
        const animDone = this.#animator.animateRemove(block.element)

        // Adjust current index to keep tracking the same block.
        if (index < this.#currentIndex) {
          this.#currentIndex--
        } else if (index === this.#currentIndex || this.#currentIndex >= this.#blocks.length) {
          this.#currentIndex = Math.min(this.#currentIndex, this.#blocks.length - 1)
        }

        this.#events.emit(EditorEvent.BLOCK_REMOVED, { blockId: block.id, index, animDone })
      },
    })
  }

  /**
   * Move a block from one position to another.
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  move(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    const block = this.#blocks[fromIndex]
    if (!block) return
    if (fromIndex < 0 || toIndex < 0 || toIndex > this.#blocks.length) return

    if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')

    this.#commands.execute({
      name: 'block.move',
      markDirty: false,
      apply: () => {
        // FLIP animation: snapshot positions before move.
        const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex
        const lo = Math.min(fromIndex, adjustedTo)
        const hi = Math.max(fromIndex, adjustedTo)

        /** @type {Map<string, DOMRect>} */
        const firstRects = new Map()
        for (let i = lo; i <= hi; i++) {
          const candidate = this.#blocks[i]
          if (candidate) firstRects.set(candidate.id, candidate.element.getBoundingClientRect())
        }

        block.element.remove()
        this.#blocks.splice(fromIndex, 1)
        this.#blocks.splice(adjustedTo, 0, block)
        this.#rebuildIndexMap()
        this.#placeElementAtIndex(block.element, adjustedTo)

        // Recalculate currentIndex to track the same block after move.
        if (this.#currentIndex === fromIndex) {
          this.#currentIndex = adjustedTo
        } else if (fromIndex < this.#currentIndex && adjustedTo >= this.#currentIndex) {
          this.#currentIndex--
        } else if (fromIndex > this.#currentIndex && adjustedTo <= this.#currentIndex) {
          this.#currentIndex++
        }

        this.#animator.animateMove(this.#blocks, lo, hi, firstRects)
        this.#events.emit(EditorEvent.BLOCK_MOVED, { blockId: block.id, from: fromIndex, to: toIndex })
        this.#events.emit(EditorEvent.BLOCK_FOCUSED, { blockId: block.id })
      },
    })
  }

  /**
   * Convert a block to a different type, preserving transferable data.
   * @param {number} index
   * @param {string} newType
   * @param {Record<string, unknown>} [extraData] - e.g. { level: 2 } from toolbox entry
   * @returns {Block | undefined}
   */
  convert(index, newType, extraData) {
    const block = this.#blocks[index]
    if (!block) return undefined

    const plugin = this.#plugins.get(newType)
    if (!plugin) {
      throw new Error(`[BlockManager] Unknown block type: "${newType}"`)
    }

    // Extract transferable data from old block
    let oldData
    try {
      oldData = block.plugin.exportData
        ? block.plugin.exportData(block.contentElement)
        : block.save().data
    } catch (err) {
      console.warn(`[BlockManager] Failed to export data from ${block.type}:`, err)
      oldData = {}
    }

    const newData = { ...oldData, ...extraData }
    const oldType = block.type
    const blockId = block.id

    // Build the replacement before touching the live model. A plugin render
    // failure must leave the original block fully usable and attached.
    if (!this.#commands) throw new Error('[BlockManager] CommandDispatcher is not configured')
    return this.#commands.execute({
      name: 'block.convert',
      markDirty: false,
      apply: () => {
        const newBlock = new Block(plugin, this.#commands, newData, blockId, this.#readOnly)
        newBlock.setStructuralCommands(this.#structuralCommands)
        block.disposePlugin()
        block.element.remove()
        this.#blocks.splice(index, 1, newBlock)
        this.#blockMap.set(blockId, newBlock)
        this.#indexMap.set(blockId, index)
        this.#placeElementAtIndex(newBlock.element, index)

        // Preserve focused state.
        if (this.#currentIndex === index) newBlock.focused = true

        this.#events.emit(EditorEvent.BLOCK_CONVERTED, { blockId, from: oldType, to: newType })
        return newBlock
      },
    })
  }

  /**
   * Set focus to a block by index.
   * @param {number} index
   */
  setCurrentIndex(index) {
    if (this.#currentIndex >= 0 && this.#currentIndex < this.#blocks.length) {
      const prev = this.#blocks[this.#currentIndex]
      if (prev) {
        prev.focused = false
        this.#events.emit(EditorEvent.BLOCK_BLURRED, { blockId: prev.id })
      }
    }

    this.#currentIndex = index

    if (index >= 0 && index < this.#blocks.length) {
      const block = this.#blocks[index]
      if (block) {
        block.focused = true
        this.#events.emit(EditorEvent.BLOCK_FOCUSED, { blockId: block.id })
      }
    }
  }

  /**
   * @param {number} index
   * @returns {Block | undefined}
   */
  getBlockByIndex(index) {
    return this.#blocks[index]
  }

  /**
   * @param {string} id
   * @returns {Block | undefined}
   */
  getBlockById(id) {
    return this.#blockMap.get(id)
  }

  /**
   * @returns {Block | undefined}
   */
  getCurrentBlock() {
    return this.#blocks[this.#currentIndex]
  }

  /**
   * @returns {number}
   */
  getCurrentIndex() {
    return this.#currentIndex
  }

  /**
   * @returns {number}
   */
  getBlockCount() {
    return this.#blocks.length
  }

  /**
   * Get the index of a block by its ID. O(1) via reverse index map.
   * @param {string} id
   * @returns {number}
   */
  getBlockIndex(id) {
    return this.#indexMap.get(id) ?? -1
  }

  /**
   * Find the block that contains a given DOM node.
   * @param {import('./types').DOMNode} node
   * @returns {Block | undefined}
   */
  getBlockByChildNode(node) {
    const blockEl = closestBlock(node)
    if (!blockEl) return undefined
    const id = blockEl.dataset.blockId
    return id ? this.getBlockById(id) : undefined
  }

  /**
   * Find the closest block by Y coordinate.
   * Used for cross-block mouse selection when the cursor may be
   * in gaps between blocks or outside block elements.
   * @param {number} y - clientY from mouse event
   * @returns {Block | undefined}
   */
  getBlockByY(y) {
    let closest = undefined
    let minDist = Infinity

    for (const block of this.#blocks) {
      const rect = block.element.getBoundingClientRect()
      // If Y is inside the block rect, return immediately
      if (y >= rect.top && y <= rect.bottom) {
        return block
      }
      // Otherwise find the nearest block
      const dist = y < rect.top ? rect.top - y : y - rect.bottom
      if (dist < minDist) {
        minDist = dist
        closest = block
      }
    }

    return closest
  }

  /**
   * Get all blocks in selected state.
   * @returns {Block[]}
   */
  getSelectedBlocks() {
    /** @type {Block[]} */
    const result = []
    for (const block of this.#blocks) {
      if (block.selected) result.push(block)
    }
    return result
  }

  /**
   * Check if any blocks are in selected state.
   * @returns {boolean}
   */
  hasSelectedBlocks() {
    for (const block of this.#blocks) {
      if (block.selected) return true
    }
    return false
  }

  /**
   * Clear selection state from all blocks.
   */
  clearSelection() {
    for (const block of this.#blocks) {
      block.selected = false
    }
  }

  /**
   * Remove all selected blocks and ensure at least one block remains.
   * @param {string} defaultBlockType — block type to insert if all blocks are removed
   * @returns {{ focusIndex: number } | null} — index to focus after removal, or null if nothing was selected
   */
  removeSelected(defaultBlockType) {
    const selected = this.getSelectedBlocks()
    if (selected.length === 0) return null

    const firstIdx = this.getBlockIndex(selected[0].id)

    for (let i = selected.length - 1; i >= 0; i--) {
      const idx = this.getBlockIndex(selected[i].id)
      if (idx >= 0) this.remove(idx)
    }

    if (this.#blocks.length === 0) {
      this.insert(defaultBlockType)
    }

    return { focusIndex: Math.min(firstIdx, this.#blocks.length - 1) }
  }

  /**
   * Remove all blocks.
   */
  clear() {
    for (const block of this.#blocks) {
      block.destroy()
    }
    this.#blocks = []
    this.#blockMap.clear()
    this.#indexMap.clear()
    this.#currentIndex = -1
    this.#container.innerHTML = ''
  }

  /**
   * Iterator support.
   * @returns {IterableIterator<Block>}
   */
  [Symbol.iterator]() {
    return this.#blocks.values()
  }
}
