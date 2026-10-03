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

  get canUndo() { return this.#undo.length > 0 }
  get canRedo() { return this.#redo.length > 0 }
  get undoDepth() { return this.#undo.length }
  get redoDepth() { return this.#redo.length }

  /**
   * Validate and prepare the next history state without mutating the cursor.
   * commit() only swaps already-prepared arrays and cannot invoke user/schema code.
   */
  prepareRecord(record, { coalesce = false } = {}) {
    const next = ownRecord(record)
    let undo = [...this.#undo]
    const redo = []
    let coalesced = false

    const previous = undo[undo.length - 1]
    if (coalesce && previous && compatibleUpdate(previous, next)) {
      const previousChange = previous.changes[0]
      const nextChange = next.changes[0]
      const merged = ownRecord({
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
      })
      undo[undo.length - 1] = merged
      coalesced = true
    } else {
      undo.push(next)
      if (undo.length > this.#maxStack) undo = undo.slice(undo.length - this.#maxStack)
    }

    let committed = false
    return Object.freeze({
      coalesced,
      history: Object.freeze({ canUndo: undo.length > 0, canRedo: false }),
      commit: () => {
        if (committed) return
        this.#undo = undo
        this.#redo = redo
        committed = true
      },
    })
  }

  /**
   * Prepare an undo/redo cursor move and return the detached record to replay.
   * No cursor mutation occurs before commit().
   */
  prepareReplay(action) {
    if (action !== 'undo' && action !== 'redo') {
      throw new TypeError('History replay action must be undo or redo')
    }
    const source = action === 'undo' ? this.#undo : this.#redo
    const current = source[source.length - 1]
    if (!current) return null

    const record = cloneEditorData(current)
    const undo = [...this.#undo]
    const redo = [...this.#redo]
    if (action === 'undo') {
      redo.push(undo.pop())
    } else {
      undo.push(redo.pop())
      if (undo.length > this.#maxStack) undo.shift()
    }

    let committed = false
    return Object.freeze({
      record,
      history: Object.freeze({ canUndo: undo.length > 0, canRedo: redo.length > 0 }),
      commit: () => {
        if (committed) return
        this.#undo = undo
        this.#redo = redo
        committed = true
      },
    })
  }

  push(record) {
    this.prepareRecord(record).commit()
  }

  coalesce(record) {
    const prepared = this.prepareRecord(record, { coalesce: true })
    if (!prepared.coalesced) return false
    prepared.commit()
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
    const prepared = this.prepareReplay('undo')
    if (!prepared) return false
    prepared.commit()
    return true
  }

  commitRedo() {
    const prepared = this.prepareReplay('redo')
    if (!prepared) return false
    prepared.commit()
    return true
  }

  clear() {
    this.#undo = []
    this.#redo = []
  }
}
