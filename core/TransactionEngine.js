// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

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
  if (!EXECUTE_ORIGINS.has(metadata.origin)) {
    throw new TypeError('Transaction origin must be user, native-input, plugin, or external')
  }
  if (typeof metadata.name !== 'string' || !metadata.name) {
    throw new TypeError('Transaction name must be a non-empty string')
  }
  const result = {
    origin: metadata.origin,
    name: metadata.name,
    coalesce: metadata.coalesce === true,
  }
  if (metadata.historyGroup !== undefined) {
    if (typeof metadata.historyGroup !== 'string' || !metadata.historyGroup) {
      throw new TypeError('historyGroup must be a non-empty string when provided')
    }
    result.historyGroup = metadata.historyGroup
  }
  if (metadata.sourceBlockId !== undefined) {
    if (typeof metadata.sourceBlockId !== 'string' || !metadata.sourceBlockId) {
      throw new TypeError('sourceBlockId must be a non-empty string when provided')
    }
    result.sourceBlockId = metadata.sourceBlockId
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
  /** @type {{ draft: any, context: any, failed: unknown } | null} */
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
  get canUndo() { return this.#history.canUndo }
  get canRedo() { return this.#history.canRedo }

  execute(metadataInput, operation) {
    if (typeof operation !== 'function') throw new TypeError('Transaction operation must be a function')
    this.#assertHealthy()

    if (this.#phase === 'building' && this.#current) {
      try {
        const result = operation(this.#current.context)
        if (this.#current.failed) throw this.#current.failed
        return result
      } catch (error) {
        this.#current.failed = error
        throw error
      }
    }
    if (this.#phase !== 'idle') throw new Error(`Cannot mutate document during ${this.#phase} phase`)

    const metadata = normalizeMetadata(metadataInput)
    return this.#observeCommand(metadata.name, () => this.#executeOuter(metadata, operation))
  }

  #executeOuter(metadata, operation) {
    const selectionBefore = this.#captureSelection()
    const draft = this.#store.createDraft()
    const context = this.#createContext(draft)
    const current = { draft, context, failed: null }

    this.#current = current
    this.#phase = 'building'
    let result
    try {
      result = operation(context)
      if (current.failed) throw current.failed
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

      this.#phase = 'applying-projection'
      prepared.apply()

      const selectionAfter = this.#captureSelection()
      const record = {
        id: storeCommit.revision,
        origin: metadata.origin,
        name: metadata.name,
        changes: ownedChanges,
        selectionBefore,
        selectionAfter,
      }
      if (metadata.historyGroup !== undefined) record.historyGroup = metadata.historyGroup
      historyCommit = this.#history.prepareRecord(record, { coalesce: metadata.coalesce })

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
      this.#rollbackPrepared(prepared, error, 'Projection failed and recovery also failed')
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

      this.#phase = 'applying-projection'
      prepared.apply()

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
      const committedRevision = storeCommit.revision
      if (selection) {
        queueMicrotask(() => {
          if (
            this.#health !== 'ready'
            || this.#phase !== 'idle'
            || this.#store.revision !== committedRevision
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
      this.#rollbackPrepared(prepared, error, 'History projection failed and recovery also failed')
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

  #rollbackPrepared(prepared, original, message) {
    const failures = [original]
    if (prepared) {
      try { prepared.recover() } catch (error) { failures.push(error) }
      try { prepared.discard() } catch (error) { failures.push(error) }
    }
    if (failures.length > 1) {
      const aggregate = new AggregateError(failures, message)
      this.#fail(aggregate)
    }
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
    if (this.#health !== 'ready') throw new Error('TransactionEngine is failed')
  }

  #captureSelection() {
    if (!this.#selection?.capture) return null
    try {
      return cloneEditorData(this.#selection.capture() ?? null)
    } catch (error) {
      this.#diagnostic(error)
      return null
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
    if (!this.#onCommit) return
    try {
      this.#onCommit(event)
    } catch (error) {
      this.#diagnostic(error)
    }
  }

  #observeCommand(operation, run) {
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      return run()
    } catch (error) {
      this.#diagnostics?.emit('command.failed', {
        operation,
        errorName: this.#diagnostics.errorName(error),
      })
      throw error
    } finally {
      if (startedAt && this.#diagnostics) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('commandMs')) {
          this.#diagnostics.emit('command.slow', { operation, durationMs })
        }
      }
    }
  }

  #diagnostic(error, operation = 'transaction.observer') {
    this.#diagnostics?.emit('command.failed', {
      operation,
      errorName: this.#diagnostics.errorName(error),
    })
  }
}
