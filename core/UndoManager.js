import { EDITOR_VERSION } from './constants.js'
import { EditorEvent } from './editorEvents.js'

/**
 * @typedef {{ data: string, blocksKey: string, blockId?: string, offset?: number }} Snapshot
 */

export class UndoManager {
  /** @type {number} */
  #maxStack

  /** @type {number} */
  #debounceMs

  /** @type {import('./types').IBlockReader} */
  #blocks

  /** @type {() => Promise<import('./types').EditorDocument>} */
  #saveFn

  /** @type {(data: import('./types').EditorDocument, caret?: { blockId: string, offset: number }) => void} */
  #renderFn

  /** @type {() => { blockId: string, offset: number } | null} */
  #getCaretFn

  /** @type {Snapshot[]} */
  #undoStack = []

  /** @type {Snapshot[]} */
  #redoStack = []

  /** @type {ReturnType<typeof setTimeout> | null} */
  #debounceTimer = null

  /** @type {boolean} */
  #destroyed = false

  /** @type {boolean} */
  #snapshotInProgress = false

  /** @type {boolean} */
  #pendingSnapshot = false

  /** @type {boolean} */
  #batching = false

  /** @type {boolean} */
  #restoring = false

  /** @type {() => void} */
  #unsubscribe

  /**
   * @param {import('./types').IBlockReader} blocks
   * @param {import('./types').IEventBus} events
   * @param {() => Promise<import('./types').EditorDocument>} saveFn
   * @param {(data: import('./types').EditorDocument, caret?: { blockId: string, offset: number }) => void} renderFn
   * @param {() => { blockId: string, offset: number } | null} getCaretFn
   * @param {{ maxStack: number, debounceMs: number }} [tuning]
   */
  constructor(blocks, events, saveFn, renderFn, getCaretFn, tuning) {
    this.#blocks = blocks
    this.#saveFn = saveFn
    this.#renderFn = renderFn
    this.#getCaretFn = getCaretFn
    this.#maxStack = tuning?.maxStack ?? 100
    this.#debounceMs = tuning?.debounceMs ?? 300

    // Take initial snapshot synchronously
    this.#takeSnapshotSync()

    // Capture pre-change state before structural operations
    const unsubWillChange = events.on(EditorEvent.WILL_CHANGE, () => {
      if (this.#restoring) return
      this.saveSync()
    })

    // Listen for changes
    const unsubChanged = events.on(EditorEvent.CHANGED, () => {
      if (this.#restoring) return
      this.#debouncedSnapshot()
    })

    // Batch events
    const unsubBatchStart = events.on(EditorEvent.UNDO_BATCH_START, () => { if (!this.#restoring) this.beginBatch() })
    const unsubBatchEnd = events.on(EditorEvent.UNDO_BATCH_END, () => { if (!this.#restoring) this.endBatch() })

    this.#unsubscribe = () => { unsubWillChange(); unsubChanged(); unsubBatchStart(); unsubBatchEnd() }
  }

  get canUndo() {
    return this.#undoStack.length > 1
  }

  get canRedo() {
    return this.#redoStack.length > 0
  }

  /**
   * Save a snapshot immediately.
   */
  save() {
    void this.#takeSnapshot()
  }

  /**
   * Flush any pending debounce and take a synchronous snapshot.
   * Call BEFORE structural operations (insert, remove, move, convert)
   * to ensure the pre-change state is in the undo stack.
   */
  saveSync() {
    if (this.#batching) return
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
    }
    this.#takeSnapshotSync()
  }

  /**
   * Restore the previous state.
   */
  undo() {
    // Flush pending debounced snapshot so the current state is captured before undo
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
      this.#takeSnapshotSync()
    }

    if (!this.canUndo) return

    const current = this.#undoStack.pop()
    if (current) this.#redoStack.push(current)

    const prev = this.#undoStack[this.#undoStack.length - 1]
    if (prev) {
      this.#restore(prev)
    }
  }

  /**
   * Restore the next state.
   */
  redo() {
    // Flush pending debounced snapshot so the current state is captured
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer)
      this.#debounceTimer = null
      this.#takeSnapshotSync()
    }

    if (!this.canRedo) return

    const next = this.#redoStack.pop()
    if (next) {
      this.#undoStack.push(next)
      this.#restore(next)
    }
  }

  /**
   * Begin a batch — all changes until endBatch() are treated as one undo step.
   * Call saveSync() before batch to capture pre-change state.
   */
  beginBatch() {
    if (!this.#batching) {
      this.saveSync()
      this.#batching = true
    }
  }

  /**
   * End the batch and take a snapshot of the final state.
   */
  endBatch() {
    if (this.#batching) {
      this.#batching = false
      this.#takeSnapshotSync()
    }
  }

  /**
   * Clear all history.
   */
  clear() {
    this.#undoStack = []
    this.#redoStack = []
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
    if (this.#batching) return
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
    this.#debounceTimer = setTimeout(() => {
      void this.#takeSnapshot()
      this.#debounceTimer = null
    }, this.#debounceMs)
  }

  /**
   * Deduplicate, serialize, and push a snapshot onto the undo stack.
   * @param {import('./types').EditorDocument} data
   * @returns {boolean} true if pushed, false if deduplicated
   */
  #pushSnapshot(data) {
    const blocksKey = JSON.stringify(data.blocks)

    // Deduplicate: if block content is identical to the last snapshot,
    // update the caret position but don't push a new snapshot.
    const lastSnapshot = this.#undoStack.length ? this.#undoStack[this.#undoStack.length - 1] : null
    if (lastSnapshot?.blocksKey === blocksKey) {
      const caret = this.#getCaretFn()
      if (caret) {
        lastSnapshot.blockId = caret.blockId
        lastSnapshot.offset = caret.offset
      }
      return false
    }

    const caret = this.#getCaretFn()
    const dataStr = `{"time":${data.time},"version":${JSON.stringify(data.version)},"blocks":${blocksKey}}`
    /** @type {Snapshot} */
    const snapshot = { data: dataStr, blocksKey }
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

  /**
   * Synchronous snapshot for initial state.
   */
  #takeSnapshotSync() {
    const blocks = this.#blocks.save()
    this.#pushSnapshot({ time: Date.now(), version: EDITOR_VERSION, blocks })
  }

  async #takeSnapshot() {
    if (this.#snapshotInProgress) {
      this.#pendingSnapshot = true
      return
    }

    this.#snapshotInProgress = true

    try {
      const data = await this.#saveFn()
      if (this.#destroyed) return
      this.#pushSnapshot(data)
    } catch (err) {
      console.warn('[UndoManager] Failed to take snapshot:', err)
    } finally {
      this.#snapshotInProgress = false

      if (this.#pendingSnapshot) {
        this.#pendingSnapshot = false
        void this.#takeSnapshot()
      }
    }
  }

  /**
   * @param {Snapshot} snapshot
   */
  #restore(snapshot) {
    let data
    try {
      data = JSON.parse(snapshot.data)
    } catch (err) {
      console.error('[UndoManager] Failed to parse snapshot:', err)
      return
    }
    const caret = snapshot.blockId != null ? { blockId: snapshot.blockId, offset: snapshot.offset ?? 0 } : undefined
    // Suppress event handlers during render so undo/redo does not create snapshots
    this.#restoring = true
    this.#renderFn(data, caret)
    this.#restoring = false
  }
}
