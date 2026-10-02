// @ts-check

export class InteractionState {
  #runtime
  #reconciler
  #currentId = null
  #selected = new Set()

  constructor({ runtime, reconciler }) {
    if (!runtime?.list) throw new TypeError('InteractionState requires a DocumentRuntime')
    if (!reconciler?.focus) throw new TypeError('InteractionState requires a BlockReconciler')
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.reconcile()
  }

  get currentId() {
    return this.#currentId
  }

  get selectedIds() {
    const selected = this.#selected
    return this.#runtime.list().map(record => record.id).filter(id => selected.has(id))
  }

  get currentIndex() {
    if (!this.#currentId) return -1
    return this.#runtime.list().findIndex(record => record.id === this.#currentId)
  }

  setCurrent(id) {
    if (id === null) {
      this.#currentId = null
      return
    }
    if (!this.#runtime.get(id)) throw new Error(`Unknown block id: ${id}`)
    this.#currentId = id
  }

  setCurrentIndex(index) {
    const records = this.#runtime.list()
    if (!Number.isInteger(index) || index < 0 || index >= records.length) {
      throw new RangeError('Current block index is out of range')
    }
    this.#currentId = records[index].id
  }

  select(ids) {
    if (!Array.isArray(ids)) throw new TypeError('Selected block ids must be an array')
    const known = new Set(this.#runtime.list().map(record => record.id))
    const next = new Set()
    for (const id of ids) {
      if (typeof id !== 'string' || !known.has(id)) throw new Error(`Unknown block id: ${id}`)
      next.add(id)
    }
    this.#selected = next
  }

  clearSelection() {
    this.#selected.clear()
  }

  focus(id = this.#currentId, target) {
    if (!id) return false
    if (!this.#runtime.get(id)) return false
    this.#currentId = id
    return this.#reconciler.focus(id, target)
  }

  resolveBlockTarget(target) {
    return this.#reconciler.resolveBlockTarget(target)
  }

  reconcile() {
    const ids = this.#runtime.list().map(record => record.id)
    const known = new Set(ids)
    this.#selected = new Set([...this.#selected].filter(id => known.has(id)))
    if (!this.#currentId || !known.has(this.#currentId)) {
      this.#currentId = ids[0] ?? null
    }
  }
}
