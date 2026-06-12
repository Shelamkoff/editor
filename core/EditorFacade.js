import { DEFAULT_BLOCK_TYPE, EDITOR_VERSION } from './constants.js'
import { EditorEvent } from './editorEvents.js'
import { hydrateInlinePlugins } from './hydrateInlinePlugins.js'
import { insertInlinePluginAtCaret } from './inlinePluginInsert.js'
import { populateBlocks } from './populateBlocks.js'
import { serializeInlineHtml } from '../shared/inlineMarshal.js'

export class EditorFacade {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {boolean} */
  #ready = false

  /** @type {string} */
  #defaultBlockType

  /** @type {Array<{ destroy(): void }>} */
  #destroyables = []

  /** @type {import('./InlinePluginRegistry').InlinePluginRegistry | null} */
  #inlinePluginRegistry

  /** @type {import('./types').InlinePluginContext | null} */
  #inlinePluginCtx

  /** @type {import('./types').ICrossBlockSelection | null} */
  #crossBlockSelection

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').ISelectionManager} selection
   * @param {import('./types').IEventBus} events
   * @param {import('./types').EditorConfig} config
   * @param {import('./InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
   * @param {import('./types').InlinePluginContext} [inlinePluginCtx]
   * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
   */
  constructor(rootEl, blocks, selection, events, config, inlinePluginRegistry, inlinePluginCtx, crossBlockSelection) {
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#events = events
    this.#defaultBlockType = config.defaultBlock || DEFAULT_BLOCK_TYPE
    this.#inlinePluginRegistry = inlinePluginRegistry ?? null
    this.#inlinePluginCtx = inlinePluginCtx ?? null
    this.#crossBlockSelection = crossBlockSelection ?? null
  }

  /**
   * Register a module for cleanup on destroy.
   * @param {{ destroy(): void }} module
   */
  registerDestroyable(module) {
    this.#destroyables.push(module)
  }

  /**
   * Mark the editor as ready.
   */
  markReady() {
    this.#ready = true
  }

  get isReady() {
    return this.#ready
  }

  get blocks() {
    return /** @type {import('./types').IBlockReader} */ (this.#blocks)
  }

  get events() {
    return this.#events
  }

  get rootElement() {
    return this.#rootEl
  }

  /**
   * Save editor content.
   *
   * Each block's raw `data` is post-processed through the plugin's
   * `mapTextFields` hook to tokenize any committed inline-widget spans
   * (e.g. mentions). Widget data is lifted into the block-level `inline`
   * map keyed by each widget's stable instance id — `data` ends up
   * carrying only `{{<id>}}` text placeholders, polymorphically
   * reconstructible on load.
   *
   * @returns {Promise<import('./types').EditorDocument>}
   */
  async save() {
    const registry = this.#inlinePluginRegistry
    const snapshots = []

    for (const block of this.#blocks) {
      /** @type {import('./types').BlockData} */
      let snap
      try {
        snap = block.save()
      } catch (err) {
        console.error(`[EditorFacade] Failed to save block ${block.id} (${block.type}):`, err)
        snap = { id: block.id, type: block.type, data: {} }
      }

      // Inline-widget marshalling — only for text blocks that opted in.
      if (registry && typeof block.plugin.mapTextFields === 'function') {
        /** @type {Record<string, import('../renderer/types').InlineWidget>} */
        const inline = {}
        block.plugin.mapTextFields(
          /** @type {Record<string, unknown>} */ (snap.data),
          (html) => {
            const res = serializeInlineHtml(html, registry)
            Object.assign(inline, res.inline)
            return res.html
          },
        )
        if (Object.keys(inline).length > 0) snap.inline = inline
      }

      snapshots.push(snap)
    }

    return {
      time: Date.now(),
      version: EDITOR_VERSION,
      blocks: snapshots,
    }
  }

  /**
   * Render data into the editor, replacing existing content.
   * @param {import('./types').EditorDocument} data
   * @param {{ blockId: string, offset: number }} [caret] - optional caret position to restore
   */
  render(data, caret) {
    // Clear transient selection state before replacing content.
    // Without this, InlineToolbar refuses to hide (checks crossBlockSelection.range)
    // and CSS highlights remain painted on detached DOM nodes.
    if (this.#crossBlockSelection) this.#crossBlockSelection.deactivate(this.#rootEl)
    this.#blocks.clearSelection()

    this.#blocks.clear()
    populateBlocks(this.#blocks, data.blocks, this.#defaultBlockType, 'EditorFacade')

    // Hydrate inline plugins in re-rendered blocks
    if (this.#inlinePluginRegistry && this.#inlinePluginCtx && this.#inlinePluginRegistry.size > 0) {
      for (const block of this.#blocks) {
        hydrateInlinePlugins(block.contentElement, this.#inlinePluginRegistry, this.#inlinePluginCtx)
      }
    }

    // Restore caret position
    if (caret) {
      const targetBlock = this.#blocks.getBlockById(caret.blockId)
      if (targetBlock) {
        const idx = this.#blocks.getBlockIndex(caret.blockId)
        if (idx >= 0) this.#blocks.setCurrentIndex(idx)
        targetBlock.focus()
        this.#selection.setCaretToOffset(caret.blockId, caret.offset)
        return
      }
    }

    // Fallback: focus first block
    this.#blocks.setCurrentIndex(0)
    const first = this.#blocks.getBlockByIndex(0)
    if (first) {
      first.focus()
      this.#selection.setCaretToBlock(first.id, 'end')
    }
  }

  /**
   * Clear all blocks and insert an empty default block.
   */
  clear() {
    this.#blocks.clear()
    this.#blocks.insert(this.#defaultBlockType)
    this.#blocks.setCurrentIndex(0)
  }

  /**
   * Focus the editor (first block or current block).
   */
  focus() {
    const block = this.#blocks.getCurrentBlock() || this.#blocks.getBlockByIndex(0)
    if (block) {
      block.focus()
    }
  }

  /**
   * Insert an inline plugin widget at the current caret position.
   * @param {string} type
   * @param {Record<string, string>} [data]
   */
  insertInlinePlugin(type, data = {}) {
    if (!this.#inlinePluginRegistry || !this.#inlinePluginCtx) return
    insertInlinePluginAtCaret(this.#inlinePluginRegistry, this.#inlinePluginCtx, this.#events, type, data)
  }

  /**
   * Destroy the editor and clean up all modules.
   */
  destroy() {
    for (let i = this.#destroyables.length - 1; i >= 0; i--) {
      try {
        this.#destroyables[i]?.destroy()
      } catch (err) {
        console.warn('[EditorFacade] Error destroying module:', err)
      }
    }
    this.#destroyables = []

    this.#blocks.clear()
    this.#events.emit(EditorEvent.DESTROYED)
    this.#events.clear()

    this.#rootEl.remove()
    this.#ready = false
  }
}
