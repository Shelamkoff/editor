// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { invokeObserver } from '../shared/invokeObserver.js'

const EXECUTE_ORIGINS = new Set(['user', 'native-input', 'plugin', 'external'])

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}

function replayChanges(changes, direction) {
  if (direction === 'forward') return cloneEditorData(changes)
  return [...changes].reverse().map(change => {
    switch (change.kind) {
      case 'block.insert': return { kind:'block.remove', index:change.index, block:cloneEditorData(change.block) }
      case 'block.remove': return { kind:'block.insert', index:change.index, block:cloneEditorData(change.block) }
      case 'block.update': return { kind:'block.update', id:change.id, before:cloneEditorData(change.after), after:cloneEditorData(change.before) }
      case 'block.move': return { kind:'block.move', id:change.id, from:change.to, to:change.from }
      case 'document.replace': return { kind:'document.replace', before:cloneEditorData(change.after), after:cloneEditorData(change.before) }
      default: throw new TypeError(`Unknown document change: ${change?.kind}`)
    }
  })
}

function noopProjector() {
  return {
    prepare() {
      return {
        apply() {},
        recover() {},
        finalize() {},
        discard() {},
      }
    },
  }
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new TypeError('Transaction metadata must be an object')
  }
  // Metadata is caller-owned, potentially accessor-backed input. Observe
  // each supported field once before authoring; neither validation nor
  // history/event assembly may sample a different name or origin later.
  const origin = metadata.origin
  if (!EXECUTE_ORIGINS.has(origin)) {
    throw new TypeError('Transaction origin must be user, native-input, plugin, or external')
  }
  const name = metadata.name
  if (typeof name !== 'string' || !name) {
    throw new TypeError('Transaction name must be a non-empty string')
  }
  const result = {
    origin,
    name,
    coalesce: metadata.coalesce === true,
  }
  const selectionAfter = metadata.selectionAfter
  if (selectionAfter !== undefined) {
    if (typeof selectionAfter !== 'function') throw new TypeError('selectionAfter must resolve a prepared logical bookmark')
    result.selectionAfter = selectionAfter
  }
  const selectionBefore = metadata.selectionBefore
  if (selectionBefore !== undefined) result.selectionBefore = cloneEditorData(selectionBefore)
  const historyGroup = metadata.historyGroup
  if (historyGroup !== undefined) {
    if (typeof historyGroup !== 'string' || !historyGroup) {
      throw new TypeError('historyGroup must be a non-empty string when provided')
    }
    result.historyGroup = historyGroup
  }
  const sourceBlockId = metadata.sourceBlockId
  if (sourceBlockId !== undefined) {
    if (typeof sourceBlockId !== 'string' || !sourceBlockId) {
      throw new TypeError('sourceBlockId must be a non-empty string when provided')
    }
    result.sourceBlockId = sourceBlockId
  }
  const continuation = metadata.continuation
  if (continuation !== undefined) {
    if (!continuation || typeof continuation !== 'object' || Array.isArray(continuation)) {
      throw new TypeError('Async history continuation requires a revision, blockId and fieldKey')
    }
    const baseRevision = continuation.baseRevision
    const blockId = continuation.blockId
    const fieldKey = continuation.fieldKey
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1
      || typeof blockId !== 'string' || !blockId
      || typeof fieldKey !== 'string' || !fieldKey || fieldKey.length > 128) {
      throw new TypeError('Async history continuation requires a revision, blockId and fieldKey')
    }
    result.continuation = { baseRevision, blockId, fieldKey }
  }
  return result
}

export class TransactionEngine {
  #store
  #history
  #projector
  #selection
  #onCommit
  #diagnostics
  #phase = 'idle'
  #health = 'ready'
  #destroyed = false
  /** @type {{ draft: any, context: any, hasFailed: boolean, failed: unknown } | null} */
  #current = null

  constructor(options) {
    if (!options?.store || !options?.history) {
      throw new TypeError('TransactionEngine requires store and history')
    }
    this.#store = options.store
    this.#history = options.history
    this.#projector = options.projector ?? noopProjector()
    this.#selection = options.selection ?? null
    this.#onCommit = typeof options.onCommit === 'function' ? options.onCommit : null
    this.#diagnostics = options.diagnostics ?? null
  }

  get phase() { return this.#phase }
  get health() { return this.#health }
  get canUndo() { return !this.#destroyed && this.#history.canUndo }
  get canRedo() { return !this.#destroyed && this.#history.canRedo }

  /** End this engine's authority. In-flight committed history is retained,
   * but callbacks queued by a prior Undo/Redo must not restore a dead editor.
   */
  destroy() { this.#destroyed = true }

  /** Narrow read access for preparation outside an execute callback. */
  get currentReadSource() {
    const source=this.#phase==='building'&&this.#current?this.#current.draft:this.#store
    return {ids:()=>source.ids(),peek:id=>source.peek(id)}
  }

  execute(metadataInput, operation) {
    if (typeof operation !== 'function') throw new TypeError('Transaction operation must be a function')
    this.#assertHealthy()

    if (this.#phase === 'building' && this.#current) {
      try {
        const result = synchronousResult(operation(this.#current.context))
        if (this.#current.hasFailed) throw this.#current.failed
        return result
      } catch (error) {
        if (!this.#current.hasFailed) {
          this.#current.failed = error
          this.#current.hasFailed = true
        }
        throw error
      }
    }
    if (this.#phase !== 'idle') throw new Error(`Cannot mutate document during ${this.#phase} phase`)

    // Caller metadata getters are executable code. They must not reenter
    // commands while a prior authority check still sees an idle engine.
    this.#phase = 'preparing-metadata'
    let metadata
    try { metadata = normalizeMetadata(metadataInput) }
    finally { this.#phase = 'idle' }
    this.#assertHealthy()
    return this.#observeCommand(metadata.name, () => this.#executeOuter(metadata, operation))
  }

  #executeOuter(metadata, operation) {
    const selectionBefore = metadata.selectionBefore !== undefined ? metadata.selectionBefore : this.#captureSelection()
    // A selection callback can explicitly destroy the owner even though it
    // cannot reenter a mutation. Never start a new draft after that teardown.
    this.#assertHealthy()
    const draft = this.#store.createDraft()
    const context = this.#createContext(draft)
    const current = { draft, context, hasFailed: false, failed: undefined }

    this.#current = current
    this.#phase = 'building'
    let result
    try {
      result = synchronousResult(operation(context))
      if (current.hasFailed) throw current.failed
      // An operation can synchronously revoke this engine, even without
      // producing document changes. Never prepare a projection or report
      // a successful no-op after the owner has been destroyed.
      this.#assertHealthy()
    } catch (error) {
      this.#current = null
      this.#phase = 'idle'
      throw error
    }
    this.#current = null

    const changes = draft.changes
    if (changes.length === 0) {
      this.#phase = 'idle'
      return result
    }

    const ownedChanges = cloneEditorData(changes)
    const replacesDocument = ownedChanges.some(change => change.kind === 'document.replace')
    const storeCommit = this.#store.prepareCommit(draft, { newGeneration: replacesDocument })
    let prepared = null
    let historyCommit = null

    try {
      this.#phase = 'preparing-projection'
      prepared = this.#prepareProjection({
        store: this.#store,
        draft,
        changes: ownedChanges,
        origin: metadata.origin,
        name: metadata.name,
        sourceBlockId: metadata.sourceBlockId,
        generation: storeCommit.generation,
        revision: storeCommit.revision,
      })
      this.#assertHealthy()

      this.#phase = 'applying-projection'
      prepared.apply()
      this.#assertHealthy()

      const selectionAfter = metadata.selectionAfter
        ? cloneEditorData(metadata.selectionAfter(result) ?? null)
        : this.#captureSelection()
      this.#assertHealthy()
      const record = {
        id: storeCommit.revision,
        origin: metadata.origin,
        name: metadata.name,
        changes: ownedChanges,
        selectionBefore,
        selectionAfter,
      }
      if (metadata.historyGroup !== undefined) record.historyGroup = metadata.historyGroup
      historyCommit = this.#history.prepareRecord(record, {
        coalesce: metadata.coalesce,
        continuation: metadata.continuation,
      })

      const event = this.#event({
        sequence: storeCommit.revision,
        origin: metadata.origin,
        action: 'commit',
        name: metadata.name,
        changes: ownedChanges,
        history: historyCommit.history,
      })

      this.#phase = 'committing'
      storeCommit.commit()
      historyCommit.commit()

      this.#phase = 'finalizing'
      this.#finalize(prepared)

      this.#phase = 'publishing'
      this.#publish(event)
      this.#phase = 'idle'
      return result
    } catch (error) {
      if (this.#phase === 'committing' || this.#phase === 'finalizing' || this.#phase === 'publishing') {
        this.#fail(error)
      }
      this.#rollbackPrepared(prepared, error, 'Projection failed and recovery also failed', selectionBefore)
    }
  }

  undo() { return this.#replay('undo') }
  redo() { return this.#replay('redo') }

  clearHistory() {
    this.#assertHealthy()
    if (this.#phase !== 'idle') throw new Error(`Cannot clear history during ${this.#phase} phase`)
    this.#history.clear()
  }

  #createContext(draft) {
    return Object.freeze({
      ids: () => draft.ids(),
      peek: id => draft.peek(id),
      get: id => draft.get(id),
      list: () => draft.list(),
      insert: (index, block) => draft.insert(index, block),
      update: (id, block) => draft.update(id, block),
      remove: id => draft.remove(id),
      move: (id, to) => draft.move(id, to),
      replace: document => draft.replace(document),
    })
  }

  #replay(action) {
    this.#assertHealthy()
    if (this.#phase !== 'idle') throw new Error(`Cannot ${action} during ${this.#phase} phase`)
    return this.#observeCommand(`history.${action}`, () => this.#replayObserved(action))
  }

  #replayObserved(action) {
    const selectionBeforeReplay = this.#captureSelection()
    this.#assertHealthy()
    const historyCommit = this.#history.prepareReplay(action)
    if (!historyCommit) return false
    const record = historyCommit.record
    const draft = this.#store.createDraft()
    const direction = action === 'undo' ? 'backward' : 'forward'
    draft.applyChanges(record.changes, direction)
    const appliedChanges = replayChanges(record.changes, direction)
    const replacesDocument = appliedChanges.some(change => change.kind === 'document.replace')
    const storeCommit = this.#store.prepareCommit(draft, { newGeneration: replacesDocument })
    let prepared = null

    try {
      this.#phase = 'preparing-projection'
      prepared = this.#prepareProjection({
        store: this.#store,
        draft,
        changes: appliedChanges,
        origin: 'history',
        name: record.name,
        action,
        direction,
        generation: storeCommit.generation,
        revision: storeCommit.revision,
      })
      this.#assertHealthy()

      this.#phase = 'applying-projection'
      prepared.apply()
      this.#assertHealthy()

      const event = this.#event({
        sequence: storeCommit.revision,
        origin: 'history',
        action,
        name: record.name,
        changes: appliedChanges,
        history: historyCommit.history,
      })

      this.#phase = 'committing'
      storeCommit.commit()
      historyCommit.commit()

      const selection = action === 'undo' ? record.selectionBefore : record.selectionAfter
      this.#restoreSelection(selection)
      // Moving the caret or reacting to onCommit may change selection without
      // advancing the document revision. Do not reclaim that newer selection.
      const restoredSelection = this.#selection?.capture ? this.#captureSelection() : null
      const committedGeneration = storeCommit.generation
      const committedRevision = storeCommit.revision
      if (selection) {
        queueMicrotask(() => {
          if (
            this.#destroyed
            || this.#health !== 'ready'
            || this.#phase !== 'idle'
            || this.#store.generation !== committedGeneration
            || this.#store.revision !== committedRevision
            || (this.#selection?.capture
              && JSON.stringify(this.#captureSelection()) !== JSON.stringify(restoredSelection))
          ) return
          this.#restoreSelection(selection)
        })
      }

      this.#phase = 'finalizing'
      this.#finalize(prepared)

      this.#phase = 'publishing'
      this.#publish(event)
      this.#phase = 'idle'
      return true
    } catch (error) {
      if (this.#phase === 'committing' || this.#phase === 'finalizing' || this.#phase === 'publishing') {
        this.#fail(error)
      }
      this.#rollbackPrepared(prepared, error, 'History projection failed and recovery also failed', selectionBeforeReplay)
    }
  }

  #prepareProjection(input) {
    const prepared = this.#projector.prepare(input)
    if (
      !prepared
      || typeof prepared.apply !== 'function'
      || typeof prepared.recover !== 'function'
      || typeof prepared.finalize !== 'function'
      || typeof prepared.discard !== 'function'
    ) {
      try { prepared?.discard?.() } catch {}
      throw new TypeError('Projector prepare() must return apply(), recover(), finalize(), and discard()')
    }
    return prepared
  }

  #rollbackPrepared(prepared, original, message, selectionBefore = null) {
    const failures = [original]
    if (prepared) {
      try { prepared.recover() } catch (error) { failures.push(error) }
      try { prepared.discard() } catch (error) { failures.push(error) }
    }
    if (failures.length > 1) {
      const aggregate = new AggregateError(failures, message)
      this.#fail(aggregate)
    }
    this.#restoreSelection(selectionBefore)
    this.#phase = 'idle'
    throw original
  }

  #finalize(prepared) {
    try {
      prepared.finalize()
    } catch (error) {
      this.#diagnostic(error, 'transaction.finalize')
    }
  }

  #fail(error) {
    this.#health = 'failed'
    this.#phase = 'failed'
    this.#current = null
    throw error
  }

  #assertHealthy() {
    if (this.#destroyed) throw new Error('TransactionEngine is destroyed')
    if (this.#health !== 'ready') throw new Error('TransactionEngine is failed')
  }

  #captureSelection() {
    if (!this.#selection?.capture) return null
    // Before execute/Undo/Redo has acquired a draft or replay plan, the
    // engine is still idle. Selection is an external callback and must not
    // reenter model/history commands while that preflight snapshot is read.
    // Preserve the existing projection/commit phase for later captures.
    const preflight = this.#phase === 'idle'
    if (preflight) this.#phase = 'capturing-selection'
    try {
      return cloneEditorData(this.#selection.capture() ?? null)
    } catch (error) {
      this.#diagnostic(error)
      return null
    } finally {
      if (preflight) this.#phase = 'idle'
    }
  }

  #restoreSelection(bookmark) {
    if (!bookmark || !this.#selection?.restore) return
    try {
      this.#selection.restore(cloneEditorData(bookmark))
    } catch (error) {
      this.#diagnostic(error)
    }
  }

  #event(input) {
    return deepFreeze(cloneEditorData({
      sequence: input.sequence,
      origin: input.origin,
      action: input.action,
      name: input.name,
      changes: input.changes,
      history: input.history,
    }))
  }

  #publish(event) {
    // Publishing happens after the canonical commit point. An observer may
    // return a Promise/thenable even though the transaction is synchronous;
    // contain late rejection without changing committed state or history.
    invokeObserver(this.#onCommit, [event], error => this.#diagnostic(error))
  }

  #observeDiagnostics(operation) {
    if (!this.#diagnostics) return undefined
    // Telemetry is an observer, never a source of new authoring authority.
    // The clock, threshold and error sink can all be user-provided callbacks.
    const previousPhase = this.#phase
    this.#phase = 'diagnostic-observation'
    try { return operation(this.#diagnostics) }
    catch { return undefined }
    finally { this.#phase = previousPhase }
  }

  #observeCommand(operation, run) {
    const startedAt = this.#observeDiagnostics(sink => sink.now()) ?? 0
    this.#assertHealthy()
    try {
      return run()
    } catch (error) {
      this.#observeDiagnostics(sink => sink.emit('command.failed', {
        operation,
        errorName: sink.errorName(error),
      }))
      throw error
    } finally {
      if (startedAt) {
        this.#observeDiagnostics(sink => {
          const durationMs = sink.now() - startedAt
          if (durationMs >= sink.threshold('commandMs')) {
            sink.emit('command.slow', { operation, durationMs })
          }
        })
      }
    }
  }

  #diagnostic(error, operation = 'transaction.observer') {
    this.#observeDiagnostics(sink => sink.emit('command.failed', {
      operation,
      errorName: sink.errorName(error),
    }))
  }
}
