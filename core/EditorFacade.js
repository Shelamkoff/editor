import { EditorEvent } from './editorEvents.js'
import { hydrateInlinePlugins } from './hydrateInlinePlugins.js'
import { insertInlinePluginAtCaret } from './inlinePluginInsert.js'

/**
 * @typedef {Object} EditorFacadeDeps
 * @property {import('./types').IBlockManager} blocks Live block collection.
 * @property {import('./types').ISelectionManager} selection Selection service.
 * @property {import('./types').IEventBus} events Internal event bus.
 * @property {string} defaultBlockType Fallback block type for insertions.
 * @property {import('./CommandDispatcher').CommandDispatcher} commands Command boundary.
 * @property {import('./DocumentSchema').DocumentSchema} documentSchema Document validator and migrator.
 * @property {import('./Diagnostics').Diagnostics} diagnostics Diagnostic reporter.
 * @property {import('./DocumentSnapshotStore').DocumentSnapshotStore} snapshots Document snapshot store.
 * @property {import('./PublicEditorApi').EditorBlocksApi} publicBlocks Public block API.
 * @property {import('./PublicEditorApi').EditorEventSubscriptions} publicEvents Public event subscriptions.
 * @property {boolean} readOnly Initial interaction mode.
 * @property {import('./types').IInlinePluginRegistry} [inlinePluginRegistry] Inline plugin registry.
 * @property {import('./types').InlinePluginContext} [inlinePluginCtx] Inline plugin runtime context.
 * @property {import('./types').ICrossBlockSelection} [crossBlockSelection] Cross-block selection service.
 */

export class EditorFacade {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./PublicEditorApi').EditorBlocksApi} */
  #publicBlocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./PublicEditorApi').EditorEventSubscriptions} */
  #publicEvents

  /** @type {import('./DocumentSnapshotStore').DocumentSnapshotStore} */
  #snapshots

  /** @type {import('./DocumentSchema').DocumentSchema} */
  #documentSchema

  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #commands

  /** @type {import('./Diagnostics').Diagnostics} */
  #diagnostics

  /** @type {boolean} */
  #ready = false

  /** Teardown may also run for a facade that never became ready. */
  #destroyed = false

  /** @type {string} */
  #defaultBlockType

  /** @type {Array<{ destroy(): void }>} */
  #destroyables = []

  /** @type {import('./types').IInlinePluginRegistry | null} */
  #inlinePluginRegistry

  /** @type {import('./types').InlinePluginContext | null} */
  #inlinePluginCtx

  /** @type {import('./types').ICrossBlockSelection | null} */
  #crossBlockSelection

  /** @type {import('./UndoManager').UndoManager | null} */
  #history = null

  /** @type {boolean} */
  #readOnly

  /** @type {((readOnly: boolean) => void) | null} */
  #readOnlyTransition = null

  /**
   * @param {HTMLElement} rootEl
   * @param {EditorFacadeDeps} deps
   */
  constructor(rootEl, deps) {
    const {
      blocks,
      selection,
      events,
      defaultBlockType,
      commands,
      documentSchema,
      diagnostics,
      snapshots,
      publicBlocks,
      publicEvents,
      readOnly,
      inlinePluginRegistry,
      inlinePluginCtx,
      crossBlockSelection,
    } = deps
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#events = events
    this.#commands = commands
    this.#documentSchema = documentSchema
    this.#diagnostics = diagnostics
    this.#snapshots = snapshots
    this.#publicBlocks = publicBlocks
    this.#publicEvents = publicEvents
    this.#defaultBlockType = defaultBlockType
    this.#inlinePluginRegistry = inlinePluginRegistry ?? null
    this.#inlinePluginCtx = inlinePluginCtx ?? null
    this.#crossBlockSelection = crossBlockSelection ?? null
    this.#readOnly = readOnly
  }

  /**
   * Register a module for cleanup on destroy.
   * @param {{ destroy(): void }} module
   */
  registerDestroyable(module) {
    this.#destroyables.push(module)
  }

  /** @param {import('./UndoManager').UndoManager} history */
  configureHistory(history) {
    this.#history = history
  }

  /** @param {(readOnly: boolean) => void} transition */
  configureReadOnlyTransition(transition) {
    this.#readOnlyTransition = transition
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
    return this.#publicBlocks
  }

  get events() {
    return this.#publicEvents
  }

  get rootElement() {
    return this.#rootEl
  }

  get readOnly() {
    return this.#readOnly
  }

  get canUndo() {
    return !this.#readOnly && Boolean(this.#history?.canUndo)
  }

  get canRedo() {
    return !this.#readOnly && Boolean(this.#history?.canRedo)
  }

  undo() {
    if (this.#readOnly) return false
    return this.#history?.undo() ?? false
  }

  redo() {
    if (this.#readOnly) return false
    return this.#history?.redo() ?? false
  }

  /** @param {boolean} readOnly */
  setReadOnly(readOnly) {
    if (typeof readOnly !== 'boolean') throw new TypeError('setReadOnly() requires a boolean')
    if (readOnly === this.#readOnly) return
    if (!this.#readOnlyTransition) throw new Error('Editor read-only transition is not configured')
    this.#readOnlyTransition(readOnly)
    this.#readOnly = readOnly
    this.#events.emit(EditorEvent.READ_ONLY_CHANGED, { readOnly })
    this.#events.emit(EditorEvent.HISTORY_CHANGED, {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    })
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
   * @returns {import('./types').EditorDocument}
   */
  save() {
    return this.#snapshots.save()
  }

  /**
   * Render data into the editor, replacing existing content.
   * @param {import('./types').EditorDocument} data
   * @param {{ blockId: string, offset: number }} [caret] - optional caret position to restore
   * @param {{ focus?: boolean, notifyChange?: boolean }} [options]
   */
  render(data, caret, options = {}) {
    const startedAt = this.#diagnostics.enabled ? this.#diagnostics.now() : 0
    const normalized = this.#documentSchema.normalize(data)
    const replacement = this.#blocks.prepareReplacement(
      normalized.blocks,
      this.#defaultBlockType,
      'EditorFacade',
    )

    try {
      if (this.#inlinePluginRegistry && this.#inlinePluginCtx && this.#inlinePluginRegistry.size > 0) {
        for (const block of replacement.blocks) {
          hydrateInlinePlugins(block.contentElement, this.#inlinePluginRegistry, this.#inlinePluginCtx)
        }
      }
    } catch (error) {
      replacement.dispose()
      throw error
    }

    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      // Clear transient selection state before replacing content.
      // Without this, InlineToolbar refuses to hide (checks crossBlockSelection.range)
      // and CSS highlights remain painted on detached DOM nodes.
      if (this.#crossBlockSelection) this.#crossBlockSelection.deactivate(this.#rootEl)
      this.#blocks.clearSelection()

      replacement.commit({ notifyChange: options.notifyChange })
      this.#snapshots.setDocumentVersion(normalized.version)

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

      // Mode transitions rebuild plugin DOM without stealing browser focus.
      this.#blocks.setCurrentIndex(0)
      if (options.focus === false) return

      // Fallback: focus first block
      const first = this.#blocks.getBlockByIndex(0)
      if (first) {
        first.focus()
        this.#selection.setCaretToBlock(first.id, 'end')
      }
    } finally {
      // No-op after commit; otherwise release the staged document on any failure.
      replacement.dispose()
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
      if (startedAt) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('renderMs')) {
          this.#diagnostics.emit('render.slow', { durationMs })
        }
      }
    }
  }

  /** Restore a trusted internal checkpoint; never capture the damaged DOM.
   * @param {import('./types').EditorDocument} document
   * @param {{ blockId: string, offset: number }} [caret]
   */
  restoreCheckpoint(document, caret) {
    const restore = () => this.#commands.restore(() => this.render(document, caret, { notifyChange: false }))
    if (this.#history) this.#history.withoutRecording(restore)
    else restore()
  }

  /**
   * Clear all blocks and insert an empty default block.
   */
  clear() {
    const replacement = this.#blocks.prepareReplacement(undefined, this.#defaultBlockType, 'EditorFacade.clear')
    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      replacement.commit()
      this.#blocks.setCurrentIndex(0)
    } finally {
      // No-op after commit; otherwise release the staged document on any failure.
      replacement.dispose()
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
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
   * @returns {boolean} whether editor DOM was changed
   */
  insertInlinePlugin(type, data = {}) {
    if (this.#readOnly || !this.#inlinePluginRegistry || !this.#inlinePluginCtx) return false

    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!range || !this.#rootEl.contains(range.commonAncestorContainer)) return false
    const block = this.#blocks.getBlockByChildNode(range.commonAncestorContainer)
    if (
      !block
      || typeof block.plugin.mapTextFields !== 'function'
      || !this.#inlinePluginRegistry.get(type)
    ) return false

    return this.#commands.runForBlock(block, () => insertInlinePluginAtCaret(
      this.#inlinePluginRegistry,
      this.#inlinePluginCtx,
      type,
      data,
      this.#rootEl,
    ))
  }

  /**
   * Destroy the editor and clean up all modules.
   */
  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#ready = false
    // Blocks own plugin-created DOM, listeners and external instances. Release
    // them while plugin registries, shared styles and editor services are still
    // alive; shared ownership is released by the destroyables below.
    this.#blocks.clear()

    for (let i = this.#destroyables.length - 1; i >= 0; i--) {
      try {
        this.#destroyables[i]?.destroy()
      } catch (err) {
        this.#diagnostics.emit('cleanup.failed', {
          operation: this.#destroyables[i]?.constructor?.name || 'destroyable',
          errorName: this.#diagnostics.errorName(err),
        })
        console.warn('[EditorFacade] Error destroying module:', err)
      }
    }
    this.#destroyables = []
    this.#events.emit(EditorEvent.DESTROYED)
    this.#events.clear()

    this.#rootEl.remove()
    this.#ready = false
  }
}
