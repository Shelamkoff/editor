// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

export class EditorViewModel {
  #runtime
  #reconciler
  #interaction
  #selection

  constructor({ runtime, reconciler, interaction, selection }) {
    if (!runtime?.list) throw new TypeError('EditorViewModel requires a DocumentRuntime')
    if (!reconciler?.getElement) throw new TypeError('EditorViewModel requires a BlockReconciler')
    if (!interaction) throw new TypeError('EditorViewModel requires InteractionState')
    if (!selection) throw new TypeError('EditorViewModel requires LogicalSelection')
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#interaction = interaction
    this.#selection = selection
  }

  get count() { return this.#runtime.size }
  get currentId() { return this.#interaction.currentId }
  get currentIndex() { return this.#interaction.currentIndex }
  get selectedIds() { return this.#interaction.selectedIds }

  records() { return this.#runtime.list().map(record => cloneEditorData(record)) }
  get(id) {
    const record = this.#runtime.get(id)
    return record ? cloneEditorData(record) : undefined
  }
  at(index) {
    const id=this.#runtime.idAt(index)
    const record=id?this.#runtime.get(id):undefined
    return record ? cloneEditorData(record) : undefined
  }
  indexOf(id) { return this.#runtime.indexOf(id) }

  element(id) { return this.#reconciler.getElement(id) }
  fields(id) { return this.#reconciler.getEditableFields(id) }
  resolveBlockTarget(target) { return this.#reconciler.resolveBlockTarget(target) }

  setCurrent(id) { this.#interaction.setCurrent(id) }
  setCurrentIndex(index) { this.#interaction.setCurrentIndex(index) }
  select(ids) { this.#interaction.select(ids) }
  clearSelection() { this.#interaction.clearSelection() }

  insert(type, data, index, authority = 'interaction') {
    const decision = this.#interaction.explicitCurrentVersion
    const id = this.#runtime.insert(type, data, index, {}, authority)
    this.#interaction.reconcile()
    // A commit observer may have accepted a newer author current-block
    // decision while the model inserted the block. Preserve it instead of
    // reclaiming focus for the old insertion continuation.
    if (this.#interaction.explicitCurrentVersion === decision
      && this.#runtime.has(id)) this.#interaction.setCurrent(id)
    return id
  }

  update(id, producer, authority = 'interaction') { this.#runtime.update(id, producer, authority) }

  remove(id, authority = 'interaction') {
    const wasCurrent = this.#interaction.currentId === id
    const decision = this.#interaction.explicitCurrentVersion
    const nextId = this.#runtime.remove(id, authority)
    this.#interaction.reconcile()
    // Reconciliation may automatically choose the first surviving block;
    // that fallback is not a newer user decision. An explicit focus during
    // the commit is, and must win over this removed-block continuation.
    if (wasCurrent && nextId && this.#interaction.explicitCurrentVersion === decision
      && this.#runtime.has(nextId)) this.#interaction.setCurrent(nextId)
  }

  move(id, to, authority = 'interaction') {
    this.#runtime.move(id, to, authority)
    this.#interaction.reconcile()
  }

  convert(id, target, authority = 'interaction') {
    const record=this.#runtime.convert(id, target, authority)
    this.#interaction.reconcile()
    return record?cloneEditorData(record):undefined
  }

  focus(id = this.#interaction.currentId, target) {
    if (!id) return false
    if (!target) return this.#interaction.focus(id)
    // Keyed focus is a two-part author gesture: mounted plugin focus and
    // logical caret ownership. Do not publish currentId until both accept.
    // A missing field must not emit a false current-block change.
    const decision = this.#interaction.explicitCurrentVersion
    const generation = this.#runtime.generation
    const modeEpoch = this.#runtime.modeEpoch
    const readOnly = this.#runtime.readOnly
    if (!this.#interaction.focus(id, target, { deferCurrent: true })) return false
    if (decision !== this.#interaction.explicitCurrentVersion
      || generation !== this.#runtime.generation
      || modeEpoch !== this.#runtime.modeEpoch
      || readOnly !== this.#runtime.readOnly
      || this.#runtime.health !== 'ready'
      || !this.#runtime.has(id)) return false
    if (this.#selection.setCaret(id, target) !== true) return false
    // Native caret focus may synchronously hand ownership to a newer block,
    // generation or control mode. The older request never reclaims it.
    if (decision !== this.#interaction.explicitCurrentVersion
      || generation !== this.#runtime.generation
      || modeEpoch !== this.#runtime.modeEpoch
      || readOnly !== this.#runtime.readOnly
      || this.#runtime.health !== 'ready'
      || !this.#runtime.has(id)) return false
    this.#interaction.setCurrent(id)
    return this.#interaction.currentId === id
      && generation === this.#runtime.generation
      && modeEpoch === this.#runtime.modeEpoch
      && readOnly === this.#runtime.readOnly
      && this.#runtime.health === 'ready'
  }

  setCaret(id, target) {
    // Deferred caret work may run after failed recovery or editor teardown.
    // Reject it before asking the logical selection to touch detached DOM.
    if (this.#runtime.health !== 'ready' || !this.#runtime.has(id)) return false
    const decision = this.#interaction.explicitCurrentVersion
    const generation = this.#runtime.generation
    const modeEpoch = this.#runtime.modeEpoch
    // The native/logical caret must accept the target before claiming the
    // corresponding current block. A missing keyed field returns false
    // without altering author focus or publishing current-block events.
    if (this.#selection.setCaret(id, target) !== true) return false
    if (this.#runtime.health === 'destroyed' || this.#runtime.health === 'failed'
      || generation !== this.#runtime.generation
      || modeEpoch !== this.#runtime.modeEpoch
      || !this.#runtime.has(id)) return false
    // Native focus itself may dispatch a newer current-block decision.
    if (this.#interaction.explicitCurrentVersion !== decision) {
      return this.#interaction.currentId === id
    }
    this.#interaction.setCurrent(id)
    return this.#interaction.currentId === id
  }

  reconcileInteraction() { this.#interaction.reconcile() }
}
