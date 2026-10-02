// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

const EXECUTE_ORIGINS = new Set(['user', 'native-input', 'plugin', 'external'])

function noopProjector() {
  return {
    prepare() {
      return {
        apply() {},
        recover() {},
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
  return result
}

export class TransactionEngine {
  #store
  #history
  #projector
  #selection
  #onCommit
  #onDiagnostic
  #phase = 'idle'
  /** @type {{ draft: any, context: any, failed: unknown } | null} */
  #current = null
  #sequence = 0

  constructor(options) {
    if (!options?.store || !options?.history) {
      throw new TypeError('TransactionEngine requires store and history')
    }
    this.#store = options.store
    this.#history = options.history
    this.#projector = options.projector ?? noopProjector()
    this.#selection = options.selection ?? null
    this.#onCommit = typeof options.onCommit === 'function' ? options.onCommit : null
    this.#onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : null
  }

  get phase() {
    return this.#phase
  }

  get canUndo() {
    return this.#history.canUndo
  }

  get canRedo() {
    return this.#history.canRedo
  }

  execute(metadataInput, operation) {
    if (typeof operation !== 'function') throw new TypeError('Transaction operation must be a function')

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

    if (this.#phase !== 'idle') {
      throw new Error(`Cannot mutate document during ${this.#phase} phase`)
    }

    const metadata = normalizeMetadata(metadataInput)
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

    const changes = draft.changes
    if (changes.length === 0) {
      this.#current = null
      this.#phase = 'idle'
      return result
    }

    let prepared
    try {
      this.#phase = 'preparing-projection'
      prepared = this.#projector.prepare({
        store: this.#store,
        draft,
        changes: cloneEditorData(changes),
        origin: metadata.origin,
        name: metadata.name,
      })
      if (!prepared || typeof prepared.apply !== 'function' || typeof prepared.recover !== 'function') {
        throw new TypeError('Projector prepare() must return apply() and recover()')
      }

      this.#phase = 'applying-projection'
      prepared.apply()
    } catch (error) {
      if (prepared && typeof prepared.recover === 'function') {
        try {
          prepared.recover()
        } catch (recoveryError) {
          this.#current = null
          this.#phase = 'idle'
          throw new AggregateError([error, recoveryError], 'Projection failed and recovery also failed')
        }
      }
      this.#current = null
      this.#phase = 'idle'
      throw error
    }

    this.#phase = 'committing'
    this.#store.commit(draft)
    const selectionAfter = this.#captureSelection()

    const record = {
      id: ++this.#sequence,
      origin: metadata.origin,
      name: metadata.name,
      changes: cloneEditorData(changes),
      selectionBefore,
      selectionAfter,
    }
    if (metadata.historyGroup !== undefined) record.historyGroup = metadata.historyGroup

    if (!(metadata.coalesce && this.#history.coalesce(record))) {
      this.#history.push(record)
    }

    this.#current = null
    this.#phase = 'publishing'
    this.#publish({
      origin: metadata.origin,
      action: 'commit',
      record: cloneEditorData(record),
    })
    this.#phase = 'idle'
    return result
  }

  undo() {
    return this.#replay('undo')
  }

  redo() {
    return this.#replay('redo')
  }

  clearHistory() {
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
    if (this.#phase !== 'idle') {
      throw new Error(`Cannot ${action} during ${this.#phase} phase`)
    }

    const record = action === 'undo'
      ? this.#history.peekUndo()
      : this.#history.peekRedo()
    if (!record) return false

    const draft = this.#store.createDraft()
    const direction = action === 'undo' ? 'backward' : 'forward'
    draft.applyChanges(record.changes, direction)

    let prepared
    try {
      this.#phase = 'preparing-projection'
      prepared = this.#projector.prepare({
        store: this.#store,
        draft,
        changes: cloneEditorData(record.changes),
        origin: 'history',
        name: record.name,
        action,
        direction,
      })
      if (!prepared || typeof prepared.apply !== 'function' || typeof prepared.recover !== 'function') {
        throw new TypeError('Projector prepare() must return apply() and recover()')
      }

      this.#phase = 'applying-projection'
      prepared.apply()
    } catch (error) {
      if (prepared && typeof prepared.recover === 'function') {
        try {
          prepared.recover()
        } catch (recoveryError) {
          this.#phase = 'idle'
          throw new AggregateError([error, recoveryError], 'History projection failed and recovery also failed')
        }
      }
      this.#phase = 'idle'
      throw error
    }

    this.#phase = 'committing'
    this.#store.commit(draft)
    if (action === 'undo') this.#history.commitUndo()
    else this.#history.commitRedo()

    const selection = action === 'undo' ? record.selectionBefore : record.selectionAfter
    this.#restoreSelection(selection)

    this.#phase = 'publishing'
    this.#publish({
      origin: 'history',
      action,
      record: cloneEditorData(record),
    })
    this.#phase = 'idle'
    return true
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

  #publish(event) {
    if (!this.#onCommit) return
    try {
      this.#onCommit(Object.freeze(event))
    } catch (error) {
      this.#diagnostic(error)
    }
  }

  #diagnostic(error) {
    if (!this.#onDiagnostic) return
    try { this.#onDiagnostic(error) } catch {}
  }
}
