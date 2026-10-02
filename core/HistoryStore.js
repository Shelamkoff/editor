// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

function ownRecord(record) {
  const owned = cloneEditorData(record)
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) {
    throw new TypeError('History record must be a JSON object')
  }
  if (!Number.isSafeInteger(owned.id) || owned.id < 1) {
    throw new TypeError('History record id must be a positive safe integer')
  }
  if (typeof owned.name !== 'string' || !owned.name) {
    throw new TypeError('History record name must be a non-empty string')
  }
  if (!Array.isArray(owned.changes) || owned.changes.length === 0) {
    throw new TypeError('History record must contain at least one document change')
  }
  return owned
}

function compatibleUpdate(left, right) {
  if (
    left.origin !== right.origin
    || left.name !== right.name
    || (left.historyGroup ?? null) !== (right.historyGroup ?? null)
    || left.changes.length !== 1
    || right.changes.length !== 1
  ) return false

  const previous = left.changes[0]
  const next = right.changes[0]
  return previous.kind === 'block.update'
    && next.kind === 'block.update'
    && previous.id === next.id
}

export class HistoryStore {
  #undo = []
  #redo = []
  #maxStack

  constructor(options = {}) {
    const maxStack = options.maxStack ?? 100
    if (!Number.isSafeInteger(maxStack) || maxStack < 1) {
      throw new RangeError('History maxStack must be a positive safe integer')
    }
    this.#maxStack = maxStack
  }

  get canUndo() {
    return this.#undo.length > 0
  }

  get canRedo() {
    return this.#redo.length > 0
  }

  get undoDepth() {
    return this.#undo.length
  }

  get redoDepth() {
    return this.#redo.length
  }

  push(record) {
    const owned = ownRecord(record)
    this.#undo.push(owned)
    if (this.#undo.length > this.#maxStack) this.#undo.shift()
    this.#redo = []
  }

  /**
   * Merge a compatible update record into the current undo head.
   * Returns false when the records cannot be safely coalesced.
   */
  coalesce(record) {
    const next = ownRecord(record)
    const previous = this.#undo[this.#undo.length - 1]
    if (!previous || !compatibleUpdate(previous, next)) return false

    const previousChange = previous.changes[0]
    const nextChange = next.changes[0]
    const merged = {
      ...next,
      changes: [{
        kind: 'block.update',
        id: previousChange.id,
        before: cloneEditorData(previousChange.before),
        after: cloneEditorData(nextChange.after),
      }],
      selectionBefore: Object.hasOwn(previous, 'selectionBefore')
        ? cloneEditorData(previous.selectionBefore)
        : null,
      selectionAfter: Object.hasOwn(next, 'selectionAfter')
        ? cloneEditorData(next.selectionAfter)
        : null,
    }
    this.#undo[this.#undo.length - 1] = ownRecord(merged)
    this.#redo = []
    return true
  }

  peekUndo() {
    const record = this.#undo[this.#undo.length - 1]
    return record ? cloneEditorData(record) : undefined
  }

  peekRedo() {
    const record = this.#redo[this.#redo.length - 1]
    return record ? cloneEditorData(record) : undefined
  }

  commitUndo() {
    if (!this.#undo.length) return false
    const record = this.#undo.pop()
    this.#redo.push(record)
    return true
  }

  commitRedo() {
    if (!this.#redo.length) return false
    const record = this.#redo.pop()
    this.#undo.push(record)
    if (this.#undo.length > this.#maxStack) this.#undo.shift()
    return true
  }

  clear() {
    this.#undo = []
    this.#redo = []
  }
}
