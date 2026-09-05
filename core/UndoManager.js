import { EditorEvent } from './editorEvents.js'

/**
 * @typedef {{ time?: number, version: string, blocks: string[], blockId?: string, offset?: number, fieldIndex?: number }} Snapshot
 */

export class UndoManager {
  /** @type {number} */
  #maxStack

  /** @type {number} */
  #debounceMs

  /** @type {import('./types').IBlockReader} */
  #blocks

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {() => import('./types').EditorDocument} */
  #captureFn

  /** @type {(data: import('./types').EditorDocument, caret?: import('./types').CaretPosition) => void} */
  #renderFn

  /** @type {() => import('./types').CaretPosition | null} */
  #getCaretFn

  /** @type {Snapshot[]} */
  #undoStack = []

  /** @type {Snapshot[]} */
  #redoStack = []

  /** @type {WeakMap<object, string>} */
  #serializedBlocks = new WeakMap()

  /** @type {ReturnType<typeof setTimeout> | null} */
  #debounceTimer = null

  /** @type {boolean} */
  #destroyed = false

  /** Nesting depth for compound operations. Only the outer boundary commits. */
  #batchDepth = 0

  /** @type {boolean} */
  #restoring = false

  /** Ignore only our own completed-restoration change, not observer commands. */
  #restoredChange = false

  /** @type {() => boolean} */
  #commandActive = () => false

  /** A live change exists but has not reached its coalesced snapshot yet. */
  #pendingChange = false

  /** @type {boolean | null} */
  #lastCanUndo = null

  /** @type {boolean | null} */
  #lastCanRedo = null

  /** History keeps recording, but commands are unavailable in read-only mode. */
  #commandsEnabled = true

  /** @type {() => void} */
  #unsubscribe

  /**
   * @param {import('./types').IBlockReader} blocks
   * @param {import('./types').IEventBus} events
   * @param {() => import('./types').EditorDocument} captureFn
   * @param {(data: import('./types').EditorDocument, caret?: import('./types').CaretPosition) => void} renderFn
   * @param {() => import('./types').CaretPosition | null} getCaretFn
   * @param {{ maxStack: number, debounceMs: number }} [tuning]
   */
  constructor(blocks, events, captureFn, renderFn, getCaretFn, tuning) {
    this.#blocks = blocks
    this.#events = events
    this.#captureFn = captureFn
    this.#renderFn = renderFn
    this.#getCaretFn = getCaretFn
    this.#maxStack = tuning?.maxStack ?? 100
    this.#debounceMs = tuning?.debounceMs ?? 300

    // Take initial snapshot synchronously
    this.#takeSnapshot()

    // Capture pre-change state before structural operations
    const unsubWillChange = events.on(EditorEvent.WILL_CHANGE, () => {
      if (this.#restoring || this.#commandActive()) return
      this.commit()
    })

    // Listen for changes
    const unsubChanged = events.on(EditorEvent.CHANGED, () => {
      if (this.#restoredChange) { this.#restoredChange = false; return }
      if (this.#restoring || this.#commandActive()) return
      this.#pendingChange = true
      this.#emitState()
      this.#debouncedSnapshot()
    })

    // Batch events
    const unsubBatchStart = events.on(EditorEvent.UNDO_BATCH_START, () => { if (!this.#restoring && !this.#commandActive()) this.beginBatch() })
    const unsubBatchEnd = events.on(EditorEvent.UNDO_BATCH_END, () => { if (!this.#restoring && !this.#commandActive()) this.endBatch() })
    const unsubCommit = events.on(EditorEvent.HISTORY_COMMIT, () => {
      if (!this.#restoring && !this.#commandActive()) this.commit()
    })

    this.#unsubscribe = () => { unsubWillChange(); unsubChanged(); unsubBatchStart(); unsubBatchEnd(); unsubCommit() }
  }

  /** @param {() => boolean} active */
  configureCommandActivity(active) { this.#commandActive = active }

  get canUndo() {
    return this.#commandsEnabled && (this.#pendingChange || this.#undoStack.length > 1)
  }

  get canRedo() {
    return this.#commandsEnabled && !this.#pendingChange && this.#redoStack.length > 0
  }

  /**
   * Mask public command availability without pausing history recording.
   * @param {boolean} enabled
   * @param {{ notify?: boolean }} [options]
   */
  setCommandsEnabled(enabled, options = {}) {
    if (this.#destroyed || enabled === this.#commandsEnabled) return
    this.#commandsEnabled = enabled
    if (options.notify === false) {
      this.#lastCanUndo = this.canUndo
      this.#lastCanRedo = this.canRedo
      return
    }
    this.#emitState()
  }

  /**
   * Flush any pending debounce and commit the current document snapshot.
   * Call BEFORE structural operations (insert, remove, move, convert)
   * to ensure the pre-change state is in the undo stack.
   */
  commit() {
    if (this.#destroyed || this.#restoring) return
    if (this.#batchDepth > 0) return
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    }
    this.#takeSnapshot()
  }

  /**
   * Restore the previous state.
   */
  undo() {
    if (this.#destroyed || !this.#commandsEnabled) return false
    try {
      this.#reconcileCurrentState()
    } catch (captureError) {
      // An invalid, unsaved live edit must not prevent recovery. It has no
      // serializable redo state: restore the latest checkpoint without popping
      // it, and keep any previously valid redo branch intact.
      const checkpoint = this.#undoStack[this.#undoStack.length - 1]
      if (!checkpoint) throw captureError
      this.#restore(checkpoint)
      this.#pendingChange = false
      this.#emitState()
      this.#notifyRestored()
      return true
    }

    if (!this.canUndo) return false

    const current = this.#undoStack.pop()
    if (current) this.#redoStack.push(current)

    const prev = this.#undoStack[this.#undoStack.length - 1]
    if (prev) {
      try {
        this.#restore(prev)
      } catch (error) {
        if (current) {
          this.#redoStack.pop()
          this.#undoStack.push(current)
        }
        throw error
      }
      this.#emitState()
      this.#notifyRestored()
      return true
    }
    return false
  }

  /**
   * Restore the next state.
   */
  redo() {
    if (this.#destroyed || !this.#commandsEnabled) return false
    this.#reconcileCurrentState()

    if (!this.canRedo) return false

    const next = this.#redoStack.pop()
    if (next) {
      this.#undoStack.push(next)
      try {
        this.#restore(next)
      } catch (error) {
        this.#undoStack.pop()
        this.#redoStack.push(next)
        throw error
      }
      this.#emitState()
      this.#notifyRestored()
      return true
    }
    return false
  }

  /** Publish a successful user history action after restoration has completed.
   * The history listener is registered before consumer subscriptions. It consumes
   * the one-shot guard before consumers can start a new, normally recorded command.
   */
  #notifyRestored() {
    this.#restoredChange = true
    try { this.#events.emit(EditorEvent.CHANGED) }
    finally { this.#restoredChange = false }
  }

  /**
   * Begin a batch — all changes until endBatch() are treated as one undo step.
   * Captures the pre-change state when the outer batch begins.
   */
  beginBatch() {
    if (this.#batchDepth === 0) {
      this.commit()
    }
    this.#batchDepth++
  }

  /**
   * End the batch and take a snapshot of the final state.
   */
  endBatch() {
    if (this.#batchDepth === 0) return
    this.#batchDepth--
    if (this.#batchDepth === 0) {
      this.#takeSnapshot()
    }
  }

  /** Apply a checkpoint without recording the transient state being replaced.
   * @param {() => void} restore
   */
  withoutRecording(restore) {
    const previous = this.#restoring
    this.#restoring = true
    try {
      restore()
      this.#pendingChange = false
      if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    } finally {
      this.#restoring = previous
      if (!previous) this.#emitState()
    }
  }

  /**
   * Clear all history.
   */
  clear() {
    this.#undoStack = []
    this.#redoStack = []
    this.#serializedBlocks = new WeakMap()
    this.#batchDepth = 0
    this.#pendingChange = false
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    }
    if (!this.#destroyed) this.#emitState()
  }

  /**
   * Clean up.
   */
  destroy() {
    this.#destroyed = true
    this.clear()
    this.#unsubscribe()
  }

  #debouncedSnapshot() {
    if (this.#batchDepth > 0) return
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null
      try {
        this.#takeSnapshot()
      } catch (error) {
        console.warn('[UndoManager] Failed to take debounced snapshot:', error)
      }
    }, this.#debounceMs)
  }

  /**
   * Reconcile the live editor state at the history command boundary.
   *
   * History correctness must not depend on a debounce timer still being
   * active. A synchronous/custom command may have changed the canonical
   * document even when its final change notification was missed. Pushing is
   * content-deduplicated, so the normal committed path remains a no-op here;
   * an uncommitted current state becomes the newest entry and can be undone
   * without accidentally reverting the preceding structural command.
   */
  #reconcileCurrentState() {
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    }
    this.#takeSnapshot()
  }

  /**
   * Deduplicate, serialize, and push a snapshot onto the undo stack.
   * @param {import('./types').EditorDocument} data
   * @returns {boolean} true if pushed, false if deduplicated
   */
  #pushSnapshot(data) {
    const blocks = data.blocks.map(block => {
      const cached = this.#serializedBlocks.get(block)
      if (cached !== undefined) return cached

      const serialized = JSON.stringify(block)
      if (serialized === undefined) {
        throw new TypeError('Editor block is not JSON serializable')
      }
      this.#serializedBlocks.set(block, serialized)
      return serialized
    })

    // Arrays are new per entry, while strings for unchanged canonical
    // blocks are shared between snapshots.
    const lastSnapshot = this.#undoStack.length
      ? this.#undoStack[this.#undoStack.length - 1]
      : null
    const unchanged = lastSnapshot?.version === data.version
      && lastSnapshot.blocks.length === blocks.length
      && blocks.every((block, index) => block === lastSnapshot.blocks[index])

    if (unchanged && lastSnapshot) {
      const caret = this.#getCaretFn()
      if (caret) {
        lastSnapshot.blockId = caret.blockId
        lastSnapshot.offset = caret.offset
        lastSnapshot.fieldIndex = caret.fieldIndex
      }
      return false
    }

    const caret = this.#getCaretFn()
    /** @type {Snapshot} */
    const snapshot = {
      time: data.time,
      version: data.version,
      blocks,
    }
    if (caret) {
      snapshot.blockId = caret.blockId
      snapshot.offset = caret.offset
      snapshot.fieldIndex = caret.fieldIndex
    }

    this.#undoStack.push(snapshot)
    // Keep the current state plus the configured number of undoable states.
    if (this.#undoStack.length > this.#maxStack + 1) {
      this.#undoStack.shift()
    }
    this.#redoStack = []
    return true
  }

  #emitState() {
    const canUndo = this.canUndo
    const canRedo = this.canRedo
    if (canUndo === this.#lastCanUndo && canRedo === this.#lastCanRedo) return
    this.#lastCanUndo = canUndo
    this.#lastCanRedo = canRedo
    this.#events.emit(EditorEvent.HISTORY_CHANGED, {
      canUndo,
      canRedo,
    })
  }

  #takeSnapshot() {
    if (this.#destroyed) return
    // Capture and serialize first. A plugin save failure must not consume the
    // pending change or publish history state that never committed.
    const snapshot = this.#captureFn()
    this.#pushSnapshot(snapshot)
    this.#pendingChange = false
    this.#emitState()
  }

  /**
   * @param {Snapshot} snapshot
   */
  #restore(snapshot) {
    let data
    try {
      data = {
        time: snapshot.time,
        version: snapshot.version,
        blocks: snapshot.blocks.map(block => JSON.parse(block)),
      }
    } catch (err) {
      throw new Error('[UndoManager] Failed to parse snapshot', { cause: err })
    }
    const caret = snapshot.blockId != null
      ? { blockId: snapshot.blockId, offset: snapshot.offset ?? 0, fieldIndex: snapshot.fieldIndex }
      : undefined
    // Suppress event handlers during render so undo/redo does not create snapshots.
    this.#restoring = true
    try {
      this.#renderFn(data, caret)
    } finally {
      this.#restoring = false
    }
  }
}
