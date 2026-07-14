import { EditorEvent } from './editorEvents.js'

/**
 * @typedef {{ time?: number, version: string, blocks: string[], blockId?: string, offset?: number }} Snapshot
 */

export class UndoManager {
  /** @type {number} */
  #maxStack

  /** @type {number} */
  #debounceMs

  /** @type {import('./types').IBlockReader} */
  #blocks

  /** @type {() => import('./types').EditorDocument} */
  #captureFn

  /** @type {(data: import('./types').EditorDocument, caret?: { blockId: string, offset: number }) => void} */
  #renderFn

  /** @type {() => { blockId: string, offset: number } | null} */
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

  /** @type {() => void} */
  #unsubscribe

  /**
   * @param {import('./types').IBlockReader} blocks
   * @param {import('./types').IEventBus} events
   * @param {() => import('./types').EditorDocument} captureFn
   * @param {(data: import('./types').EditorDocument, caret?: { blockId: string, offset: number }) => void} renderFn
   * @param {() => { blockId: string, offset: number } | null} getCaretFn
   * @param {{ maxStack: number, debounceMs: number }} [tuning]
   */
  constructor(blocks, events, captureFn, renderFn, getCaretFn, tuning) {
    this.#blocks = blocks
    this.#captureFn = captureFn
    this.#renderFn = renderFn
    this.#getCaretFn = getCaretFn
    this.#maxStack = tuning?.maxStack ?? 100
    this.#debounceMs = tuning?.debounceMs ?? 300

    // Take initial snapshot synchronously
    this.#takeSnapshot()

    // Capture pre-change state before structural operations
    const unsubWillChange = events.on(EditorEvent.WILL_CHANGE, () => {
      if (this.#restoring) return
      this.commit()
    })

    // Listen for changes
    const unsubChanged = events.on(EditorEvent.CHANGED, () => {
      if (this.#restoring) return
      this.#debouncedSnapshot()
    })

    // Batch events
    const unsubBatchStart = events.on(EditorEvent.UNDO_BATCH_START, () => { if (!this.#restoring) this.beginBatch() })
    const unsubBatchEnd = events.on(EditorEvent.UNDO_BATCH_END, () => { if (!this.#restoring) this.endBatch() })
    const unsubCommit = events.on(EditorEvent.HISTORY_COMMIT, () => {
      if (!this.#restoring) this.commit()
    })

    this.#unsubscribe = () => { unsubWillChange(); unsubChanged(); unsubBatchStart(); unsubBatchEnd(); unsubCommit() }
  }

  get canUndo() {
    return this.#undoStack.length > 1
  }

  get canRedo() {
    return this.#redoStack.length > 0
  }

  /**
   * Flush any pending debounce and commit the current document snapshot.
   * Call BEFORE structural operations (insert, remove, move, convert)
   * to ensure the pre-change state is in the undo stack.
   */
  commit() {
    if (this.#destroyed) return
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
    if (this.#destroyed) return
    this.#reconcileCurrentState()

    if (!this.canUndo) return

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
    }
  }

  /**
   * Restore the next state.
   */
  redo() {
    if (this.#destroyed) return
    this.#reconcileCurrentState()

    if (!this.canRedo) return

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
    }
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

  /**
   * Clear all history.
   */
  clear() {
    this.#undoStack = []
    this.#redoStack = []
    this.#serializedBlocks = new WeakMap()
    this.#batchDepth = 0
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    }
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
    const unchanged = lastSnapshot?.blocks.length === blocks.length
      && blocks.every((block, index) => block === lastSnapshot.blocks[index])

    if (unchanged && lastSnapshot) {
      const caret = this.#getCaretFn()
      if (caret) {
        lastSnapshot.blockId = caret.blockId
        lastSnapshot.offset = caret.offset
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
    }

    this.#undoStack.push(snapshot)
    if (this.#undoStack.length > this.#maxStack) {
      this.#undoStack.shift()
    }
    this.#redoStack = []
    return true
  }

  #takeSnapshot() {
    if (this.#destroyed) return
    this.#pushSnapshot(this.#captureFn())
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
      ? { blockId: snapshot.blockId, offset: snapshot.offset ?? 0 }
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
