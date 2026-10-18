// @ts-check
import { invokeObserver } from '../shared/invokeObserver.js'

export class InteractionState {
  #runtime
  #reconciler
  #currentId = null
  #selected = new Set()
  #onChange
  #onError
  #generation
  #currentClaimVersion = 0

  constructor({ runtime, reconciler, onChange, onError }) {
    if (!runtime?.list) throw new TypeError('InteractionState requires a DocumentRuntime')
    if (!reconciler?.focus) throw new TypeError('InteractionState requires a BlockReconciler')
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#onChange = typeof onChange === 'function' ? onChange : null
    this.#onError = typeof onError === 'function' ? onError : () => {}
    this.reconcile({ notify: false })
  }

  get currentId() {
    return this.#currentId
  }

  get selectedIds() {
    const selected = this.#selected
    return this.#runtime.ids().filter(id => selected.has(id))
  }

  get currentIndex() {
    if (!this.#currentId) return -1
    return this.#runtime.indexOf(this.#currentId)
  }

  setCurrent(id) {
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    if (id === null) {
      this.#currentClaimVersion++
      this.#currentId = null
      this.#notify(previousCurrentId, previousSelectedIds)
      return
    }
    if (!this.#runtime.has(id)) throw new Error(`Unknown block id: ${id}`)
    // Even a claim of the same block represents a newer focus/selection
    // decision. An older focus call must not overwrite it when its plug-in
    // callback returns after a reentrant interaction.
    this.#currentClaimVersion++
    this.#currentId = id
    this.#notify(previousCurrentId, previousSelectedIds)
  }

  setCurrentIndex(index) {
    const id=this.#runtime.idAt(index)
    if (!id) throw new RangeError('Current block index is out of range')
    this.setCurrent(id)
  }

  select(ids) {
    if (!Array.isArray(ids)) throw new TypeError('Selected block ids must be an array')
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    const known = new Set(this.#runtime.ids())
    const next = new Set()
    for (const id of ids) {
      if (typeof id !== 'string' || !known.has(id)) throw new Error(`Unknown block id: ${id}`)
      next.add(id)
    }
    this.#selected = next
    this.#notify(previousCurrentId, previousSelectedIds)
  }

  clearSelection() {
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    this.#selected.clear()
    this.#notify(previousCurrentId, previousSelectedIds)
  }

  focus(id = this.#currentId, target) {
    if (!id || !this.#runtime.has(id)) return false
    const claimVersion = this.#currentClaimVersion
    const generation = this.#runtime.generation
    const modeEpoch = this.#runtime.modeEpoch
    const readOnly = this.#runtime.readOnly
    // The plug-in focus callback may synchronously cause a newer focus,
    // render a replacement occurrence, or revoke the editor entirely.
    if (!this.#reconciler.focus(id, target)) return false
    if (claimVersion !== this.#currentClaimVersion
      || generation !== this.#runtime.generation
      || modeEpoch !== this.#runtime.modeEpoch
      || readOnly !== this.#runtime.readOnly
      || this.#runtime.health === 'destroyed'
      || this.#runtime.health === 'failed'
      || !this.#runtime.has(id)) return false
    this.setCurrent(id)
    return this.#currentId === id
      && modeEpoch === this.#runtime.modeEpoch
      && readOnly === this.#runtime.readOnly
      && generation === this.#runtime.generation
      && this.#runtime.health !== 'destroyed'
      && this.#runtime.health !== 'failed'
  }

  resolveBlockTarget(target) {
    return this.#reconciler.resolveBlockTarget(target)
  }

  reconcile({ notify = true } = {}) {
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    const ids = this.#runtime.ids()
    if (this.#generation !== this.#runtime.generation) this.#selected.clear()
    this.#generation = this.#runtime.generation
    const known = new Set(ids)
    this.#selected = new Set([...this.#selected].filter(id => known.has(id)))
    if (!this.#currentId || !known.has(this.#currentId)) {
      const nextId = ids[0] ?? null
      if (this.#currentId !== nextId) this.#currentClaimVersion++
      this.#currentId = nextId
    }
    if (notify) this.#notify(previousCurrentId, previousSelectedIds)
  }

  #notify(previousCurrentId, previousSelectedIds) {
    if (!this.#onChange) return
    const selectedIds = this.selectedIds
    const currentChanged = previousCurrentId !== this.#currentId
    const selectionChanged = previousSelectedIds.length !== selectedIds.length
      || previousSelectedIds.some((id, index) => id !== selectedIds[index])
    if (!currentChanged && !selectionChanged) return
    invokeObserver(this.#onChange, [Object.freeze({
      currentId: this.#currentId,
      selectedIds: Object.freeze([...selectedIds]),
      previousCurrentId,
      previousSelectedIds: Object.freeze([...previousSelectedIds]),
    })], this.#onError)
  }
}
