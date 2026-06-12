import { Block } from './Block.js'
import { BlockAnimator } from './BlockAnimator.js'
import { closestBlock } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { deserializeInlineHtml } from '../shared/inlineMarshal.js'

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

  /**
   * @param {HTMLElement} container - .oe-blocks element
   * @param {Map<string, import('./types').BlockPlugin>} plugins
   * @param {import('./types').IEventBus} events
   * @param {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} [animations]
   */
  constructor(container, plugins, events, animations) {
    this.#container = container
    this.#plugins = plugins
    this.#events = events
    this.#animator = new BlockAnimator(animations ?? { blockInsertMs: 350, blockMoveMs: 200, blockRemoveMs: 350 })
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

  /** Rebuild the reverse index map after any structural change. */
  #rebuildIndexMap() {
    this.#indexMap.clear()
    for (let i = 0; i < this.#blocks.length; i++) {
      this.#indexMap.set(this.#blocks[i].id, i)
    }
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
   * @returns {Block}
   */
  insert(type, data, index, id, inline) {
    const plugin = this.#plugins.get(type)
    if (!plugin) {
      throw new Error(`[BlockManager] Unknown block type: "${type}"`)
    }

    // Rehydrate inline widget placeholders before the plugin renders.
    // Only text blocks that opted in via `mapTextFields` participate — the
    // plugin decides where its HTML fields live and applies `transform` to
    // each, receiving fully-substituted widget DOM as input to `render()`.
    if (inline && typeof plugin.mapTextFields === 'function' && this.#inlinePluginRegistry && data) {
      const registry = this.#inlinePluginRegistry
      plugin.mapTextFields(
        /** @type {Record<string, unknown>} */ (data),
        (html) => deserializeInlineHtml(html, inline, registry),
      )
    }

    const block = new Block(plugin, data, id)

    if (index === undefined || index < 0 || index > this.#blocks.length) {
      index = this.#currentIndex >= 0 ? this.#currentIndex + 1 : this.#blocks.length
    }

    this.#events.emit(EditorEvent.WILL_CHANGE)

    this.#blocks.splice(index, 0, block)
    this.#blockMap.set(block.id, block)
    this.#rebuildIndexMap()

    // Adjust currentIndex if inserting before or at the current block
    if (this.#currentIndex >= 0 && index <= this.#currentIndex) {
      this.#currentIndex++
    }

    const refNode = this.#container.children[index]
    if (refNode) {
      this.#container.insertBefore(block.element, refNode)
    } else {
      this.#container.appendChild(block.element)
    }

    this.#animator.animateInsert(block.element)

    this.#events.emit(EditorEvent.BLOCK_ADDED, { blockId: block.id, index })
    this.#events.emit(EditorEvent.CHANGED)

    return block
  }

  /**
   * Remove a block by index.
   * @param {number} index
   */
  remove(index) {
    const block = this.#blocks[index]
    if (!block) return

    this.#events.emit(EditorEvent.WILL_CHANGE)

    this.#blocks.splice(index, 1)
    this.#blockMap.delete(block.id)
    this.#rebuildIndexMap()
    block.destroy()
    const animDone = this.#animator.animateRemove(block.element)

    // Adjust current index to keep tracking the same block
    if (index < this.#currentIndex) {
      this.#currentIndex--
    } else if (index === this.#currentIndex || this.#currentIndex >= this.#blocks.length) {
      this.#currentIndex = Math.min(this.#currentIndex, this.#blocks.length - 1)
    }

    this.#events.emit(EditorEvent.BLOCK_REMOVED, { blockId: block.id, index, animDone })
    this.#events.emit(EditorEvent.CHANGED)
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

    this.#events.emit(EditorEvent.WILL_CHANGE)

    // FLIP animation: snapshot positions before move
    const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex
    const lo = Math.min(fromIndex, adjustedTo)
    const hi = Math.max(fromIndex, adjustedTo)

    /** @type {Map<string, DOMRect>} */
    const firstRects = new Map()
    for (let i = lo; i <= hi; i++) {
      const b = this.#blocks[i]
      if (b) firstRects.set(b.id, b.element.getBoundingClientRect())
    }

    block.element.remove()
    this.#blocks.splice(fromIndex, 1)
    this.#blocks.splice(adjustedTo, 0, block)
    this.#rebuildIndexMap()

    const refNode = this.#container.children[adjustedTo]
    if (refNode) {
      this.#container.insertBefore(block.element, refNode)
    } else {
      this.#container.appendChild(block.element)
    }

    // Recalculate currentIndex to track the same block after move
    if (this.#currentIndex === fromIndex) {
      this.#currentIndex = adjustedTo
    } else if (fromIndex < this.#currentIndex && adjustedTo >= this.#currentIndex) {
      this.#currentIndex--
    } else if (fromIndex > this.#currentIndex && adjustedTo <= this.#currentIndex) {
      this.#currentIndex++
    }

    // FLIP animation: invert + play
    this.#animator.animateMove(this.#blocks, lo, hi, firstRects)

    this.#events.emit(EditorEvent.BLOCK_MOVED, { blockId: block.id, from: fromIndex, to: toIndex })
    this.#events.emit(EditorEvent.CHANGED)

    // Re-emit block:focused so Toolbar repositions to the moved block
    this.#events.emit(EditorEvent.BLOCK_FOCUSED, { blockId: block.id })
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

    this.#events.emit(EditorEvent.WILL_CHANGE)

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

    block.disposePlugin()
    block.element.remove()

    const newBlock = new Block(plugin, newData, blockId)
    this.#blocks.splice(index, 1, newBlock)
    this.#blockMap.set(blockId, newBlock)
    this.#indexMap.set(blockId, index)

    const refNode = this.#container.children[index]
    if (refNode) {
      this.#container.insertBefore(newBlock.element, refNode)
    } else {
      this.#container.appendChild(newBlock.element)
    }

    // Preserve focused state
    if (this.#currentIndex === index) {
      newBlock.focused = true
    }

    this.#events.emit(EditorEvent.BLOCK_CONVERTED, { blockId, from: oldType, to: newType })
    this.#events.emit(EditorEvent.CHANGED)

    return newBlock
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
   * @param {Node} node
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
   * Save all blocks.
   * @returns {import('./types').BlockData[]}
   */
  save() {
    return this.#blocks.map(b => {
      try {
        return b.save()
      } catch (err) {
        console.error(`[BlockManager] Failed to save block ${b.id} (${b.type}):`, err)
        return { id: b.id, type: b.type, data: {} }
      }
    })
  }

  /**
   * Iterator support.
   * @returns {Iterator<Block>}
   */
  [Symbol.iterator]() {
    return this.#blocks[Symbol.iterator]()
  }
}
