// @ts-check
import { invokeObserver } from '../shared/invokeObserver.js'

export class InteractionState {
  #runtime
  #reconciler
  #currentId = null
  #selected = new Set()
  #onChange
  #onError
  #onFocus
  #generation
  #currentClaimVersion = 0
  #explicitCurrentVersion = 0
  #pendingFocus = null

  constructor({ runtime, reconciler, onChange, onError, onFocus }) {
    if (!runtime?.list) throw new TypeError('InteractionState requires a DocumentRuntime')
    if (!reconciler?.focus) throw new TypeError('InteractionState requires a BlockReconciler')
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#onChange = typeof onChange === 'function' ? onChange : null
    this.#onFocus = typeof onFocus === 'function' ? onFocus : null
    this.#onError = typeof onError === 'function' ? onError : () => {}
    this.reconcile({ notify: false })
  }

  get currentId() {
    return this.#currentId
  }

  // Auto-reconcile can pick a fallback after block deletion. Only an explicit
  // current-block decision supersedes an outer insert/remove continuation.
  get explicitCurrentVersion() { return this.#explicitCurrentVersion }

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
      this.#explicitCurrentVersion++
      this.#currentClaimVersion++
      this.#currentId = null
      this.#notify(previousCurrentId, previousSelectedIds)
      return
    }
    if (!this.#runtime.has(id)) throw new Error(`Unknown block id: ${id}`)
    this.#explicitCurrentVersion++
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
    this.#currentClaimVersion++
    this.#explicitCurrentVersion++
    this.#selected = next
    this.#notify(previousCurrentId, previousSelectedIds)
  }

  clearSelection() {
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    this.#currentClaimVersion++
    this.#explicitCurrentVersion++
    this.#selected.clear()
    this.#notify(previousCurrentId, previousSelectedIds)
  }

  /** Coordinate plugin disclosure, logical caret and current-block publication.
   * The selection port remains owned by LogicalSelection; this is one
   * synchronous intent, not an additional stored selection or public lease.
   */
  focus(id = this.#currentId, target, { selection = null, caretOnly = false } = {}) {
    if (!id || this.#runtime.health !== 'ready' || !this.#runtime.has(id)) return false
    const offset = target?.offset
    if (offset !== undefined && offset !== 'start' && offset !== 'end'
      && (typeof offset !== 'number' || !Number.isFinite(offset))) return false
    const element = this.#reconciler.getElement(id)
    if (!element) return false
    const previousCurrentId = this.#currentId
    const previousSelectedIds = this.selectedIds
    const intent = {
      id,
      element,
      acknowledgment: null,
      claim: ++this.#currentClaimVersion,
      generation: this.#runtime.generation,
      revision: this.#runtime.revision,
      modeEpoch: this.#runtime.modeEpoch,
      readOnly: this.#runtime.readOnly,
    }
    this.#explicitCurrentVersion++
    this.#pendingFocus = intent
    let previousBookmark = null
    try {
      try { previousBookmark = selection?.capture?.() ?? null } catch {}
      if (!this.#ownsFocus(intent)) return false
      const previousOwners = previousBookmark ? [previousBookmark.anchor, previousBookmark.focus].map(point => ({
        point,
        block: this.#reconciler.getElement(point.blockId),
        field: this.#reconciler.getEditableFields(point.blockId).find(field => field.key === point.fieldKey),
      })) : []
      if (!this.#ownsFocus(intent)) return false
      const rejected = () => {
        if (!this.#ownsFocus(intent)) return false
        // A superseded request has no right to restore its previous selection.
        const retained = previousOwners.length === 2 && previousOwners.every(({ point, block, field }) => {
          if (!block || this.#reconciler.getElement(point.blockId) !== block) return false
          const fields = this.#reconciler.getEditableFields(point.blockId)
          if (point.fieldKey === '') return fields.length === 0
          return !!field && fields.some(current => current.key === field.key
            && current.mode === field.mode && current.element === field.element)
        })
        if (retained && this.#ownsFocus(intent) && this.#currentId === previousCurrentId) {
          intent.acknowledgment = previousOwners[0].block
          try { selection.restore(previousBookmark) } catch {}
        }
        return false
      }
      intent.acknowledgment = element
      if (!caretOnly && !this.#reconciler.focus(id, target)) return rejected()
      if (!this.#ownsFocus(intent)) return false
      const hasCaret = caretOnly || target?.fieldKey !== undefined || target?.offset !== undefined
      if (selection && hasCaret && selection.setCaret(id, target) !== true) return rejected()
      if (!this.#ownsFocus(intent)) return false
      if (!element.contains(element.ownerDocument.activeElement)) return rejected()
      this.#currentId = id
      this.#pendingFocus = null
      this.#notify(previousCurrentId, previousSelectedIds)
      // Acceptance precedes observers. A listener can now make a newer
      // navigation decision, without retroactively rejecting this one.
      if (intent.claim === this.#currentClaimVersion && this.#currentId === id
        && this.#runtime.health === 'ready') {
        invokeObserver(this.#onFocus, [id], this.#onError)
      }
      return true
    } finally {
      if (this.#pendingFocus === intent) this.#pendingFocus = null
    }
  }

  #ownsFocus(intent) {
    return this.#pendingFocus === intent
      && intent.claim === this.#currentClaimVersion
      && intent.generation === this.#runtime.generation
      && intent.revision === this.#runtime.revision
      && intent.modeEpoch === this.#runtime.modeEpoch
      && intent.readOnly === this.#runtime.readOnly
      && this.#runtime.health === 'ready'
      && this.#runtime.has(intent.id)
      && this.#reconciler.getElement(intent.id) === intent.element
  }

  observeNativeFocus(target) {
    const id = this.#reconciler.resolveBlockTarget(target)
    const element = id ? this.#reconciler.getElement(id) : null
    // A focus handler can focus another owner before this event reaches the
    // document. Do not let the older bubbling notification steal it back.
    if (element && !element.contains(element.ownerDocument.activeElement)) return null
    const intent = this.#pendingFocus
    // The exact currently mounted destination can acknowledge plugin focus,
    // including an intermediate field while a keyed target is disclosed.
    if (id && intent && this.#ownsFocus(intent)
      && this.#reconciler.getElement(id) === intent.acknowledgment) return null
    if (id) {
      this.setCurrent(id)
      if (this.#currentId === id) invokeObserver(this.#onFocus, [id], this.#onError)
    } else if (intent) {
      // Native focus outside this editor supersedes its pending request too.
      this.#currentClaimVersion++
      this.#explicitCurrentVersion++
    }
    return id
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
