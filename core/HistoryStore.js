// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { equalJsonValue } from '../shared/jsonData.js'

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
    // Consecutive authoring edits must join at the exact canonical state.
    // Identical origins/names alone do not make a disconnected transition
    // one undo gesture; otherwise history silently skips an intervening edit.
    && equalJsonValue(previous.after, next.before)
}

/**
 * A one-shot async completion may amend the immediately preceding authoring
 * action only when that action changed the named field of the same block.
 * This is narrower than ordinary typing coalescence: only native or plugin-
 * authored URL edits can be continued. A host's external URL update must remain
 * a separate action, even if the user later submits that same URL for metadata.
 */
function compatibleContinuation(previous, next, token) {
  if (!previous || !token || previous.id !== token.baseRevision
    || previous.changes.length !== 1 || next.changes.length !== 1
    || !['native-input', 'plugin'].includes(previous.origin)
    || !['native-input', 'block.update'].includes(previous.name)
    || next.name !== 'block.update') return false

  const prior = previous.changes[0]
  const update = next.changes[0]
  if (prior.kind !== 'block.update' || update.kind !== 'block.update'
    || prior.id !== token.blockId || update.id !== token.blockId) return false
  const field = token.fieldKey
  const before = prior.before?.data
  const after = prior.after?.data
  const metadataBefore = update.before?.data
  const metadataAfter = update.after?.data
  if (!before || !after || !metadataBefore || !metadataAfter
    || !Object.hasOwn(before, field) || !Object.hasOwn(after, field)
    || !Object.hasOwn(metadataBefore, field) || !Object.hasOwn(metadataAfter, field)
    || before[field] === after[field] || after[field] !== metadataBefore[field]
    || metadataBefore[field] !== metadataAfter[field]) return false

  // Do not merge a stale result into a record whose canonical after snapshot
  // differs from the before snapshot of this metadata transaction.
  return equalJsonValue(prior.after, update.before)
}

/** @typedef {{ record: ReturnType<typeof ownRecord>, bytes: number }} HistoryEntry */

export class HistoryStore {
  /** @type {HistoryEntry[]} */
  #undo = []
  /** @type {HistoryEntry[]} */
  #redo = []
  #undoBytes = 0
  #maxStack
  #maxBytes
  #coalesceAllowed = false
  // Prepared record/replay cursors are snapshots, not perpetual write leases.
  // Clearing history or committing another plan revokes all earlier plans.
  #epoch = 0

  /** @param {{ maxStack?: number, maxBytes?: number }} [options] */
  constructor(options = {}) {
    const maxStack = options.maxStack ?? 100
    if (!Number.isSafeInteger(maxStack) || maxStack < 1) {
      throw new RangeError('History maxStack must be a positive safe integer')
    }
    const maxBytes = options.maxBytes
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
      throw new RangeError('History maxBytes must be a positive safe integer')
    }
    this.#maxStack = maxStack
    this.#maxBytes = maxBytes
  }

  get canUndo() { return this.#undo.length > 0 }
  get canRedo() { return this.#redo.length > 0 }
  get undoDepth() { return this.#undo.length }
  get redoDepth() { return this.#redo.length }

  /**
   * Validate and prepare the next history state without mutating the cursor.
   * commit() only swaps prepared state and cannot invoke user/schema code.
   */
  prepareRecord(record, { coalesce = false, continuation = null } = {}) {
    const next = ownRecord(record)
    let undo = [...this.#undo]
    const redo = []
    let coalesced = false
    let candidate = next

    const previousEntry = undo[undo.length - 1]
    const previous = previousEntry?.record
    const continued = this.#coalesceAllowed && this.#redo.length === 0
      && compatibleContinuation(previous, next, continuation)
    if (continued) {
      const prior = previous.changes[0]
      const fresh = next.changes[0]
      const merged = ownRecord({
        ...previous,
        id: next.id,
        changes: [{
          kind: 'block.update',
          id: prior.id,
          before: cloneEditorData(prior.before),
          after: cloneEditorData(fresh.after),
        }],
        selectionAfter: Object.hasOwn(next, 'selectionAfter')
          ? cloneEditorData(next.selectionAfter)
          : null,
      })
      candidate = merged
      coalesced = true
    } else if (coalesce && this.#coalesceAllowed && previous && compatibleUpdate(previous, next)) {
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
      candidate = merged
      coalesced = true
    }

    // Only an owned record is serialized, never the caller's accessors/toJSON.
    // Cache its complete cost after coalescence, outside the commit phase.
    // The disabled path retains count-only behavior without byte traversals.
    const entry = {
      record: candidate,
      bytes: this.#maxBytes === undefined
        ? 0
        : new TextEncoder().encode(JSON.stringify(candidate)).byteLength,
    }
    let undoBytes = this.#undoBytes + entry.bytes
    if (coalesced) {
      undo[undo.length - 1] = entry
      undoBytes -= previousEntry.bytes
    } else {
      undo.push(entry)
    }

    let first = 0
    while (undo.length - first > this.#maxStack) {
      undoBytes -= undo[first++].bytes
    }
    // Keep the newest whole action even when it exceeds the configured budget.
    // Redo is cleared by this authoring action; its costs need not be retained.
    while (this.#maxBytes !== undefined && undoBytes > this.#maxBytes && undo.length - first > 1) {
      undoBytes -= undo[first++].bytes
    }
    if (first > 0) undo = undo.slice(first)

    const expectedEpoch = this.#epoch
    let committed = false
    return Object.freeze({
      coalesced,
      history: Object.freeze({ canUndo: undo.length > 0, canRedo: false }),
      commit: () => {
        if (committed) return
        if (this.#epoch !== expectedEpoch) {
          throw new Error('Prepared history plan is stale')
        }
        this.#undo = undo
        this.#redo = redo
        this.#undoBytes = undoBytes
        // Async completion seals this authoring action: further typing must
        // not accidentally merge into the previously captured native group.
        this.#coalesceAllowed = !continued
        this.#epoch++
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

    const record = cloneEditorData(current.record)
    const undo = [...this.#undo]
    const redo = [...this.#redo]
    let undoBytes = this.#undoBytes
    // Replay transfers the same entry and cached cost between stacks. The
    // combined retained history is unchanged: never serialize or evict here.
    if (action === 'undo') {
      undo.pop()
      redo.push(current)
      undoBytes -= current.bytes
    } else {
      redo.pop()
      undo.push(current)
      undoBytes += current.bytes
    }

    const expectedEpoch = this.#epoch
    let committed = false
    return Object.freeze({
      record,
      history: Object.freeze({ canUndo: undo.length > 0, canRedo: redo.length > 0 }),
      commit: () => {
        if (committed) return
        if (this.#epoch !== expectedEpoch) {
          throw new Error('Prepared history plan is stale')
        }
        this.#undo = undo
        this.#redo = redo
        this.#undoBytes = undoBytes
        // A successful replay ends the previous typing gesture, including
        // programmatic/keyboard replay that bypasses native beforeinput.
        this.#coalesceAllowed = false
        this.#epoch++
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
    const record = this.#undo[this.#undo.length - 1]?.record
    return record ? cloneEditorData(record) : undefined
  }

  peekRedo() {
    const record = this.#redo[this.#redo.length - 1]?.record
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
    this.#undoBytes = 0
    this.#coalesceAllowed = false
    this.#epoch++
  }
}
