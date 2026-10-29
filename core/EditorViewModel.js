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

  insert(type, data, index, authority = 'interaction', options = {}) {
    const decision = this.#interaction.explicitCurrentVersion
    const id = this.#runtime.insert(type, data, index, options, authority)
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
    return this.#interaction.focus(id, target, { selection: this.#selection })
  }

  setCaret(id, target) {
    return this.#interaction.focus(id, target, { selection: this.#selection, caretOnly: true })
  }

  /** History may reveal one recorded field before the normal logical restore.
   * Ordinary selection continuations never acquire this presentation right.
   * @param {any} bookmark
   * @returns {boolean}
   */
  restoreHistorySelection(bookmark) {
    const anchor = bookmark?.anchor, focus = bookmark?.focus
    if (!anchor || !focus) return false
    if (!anchor.fieldKey || anchor.blockId !== focus.blockId || anchor.fieldKey !== focus.fieldKey) {
      return this.#selection.restore(bookmark)
    }
    const id = anchor.blockId
    const mounted = this.#reconciler.getElement(id)
    if (!mounted) return false
    const document = mounted.ownerDocument
    const active = document.activeElement
    const decision = this.#interaction.explicitCurrentVersion
    const generation = this.#runtime.generation, revision = this.#runtime.revision, modeEpoch = this.#runtime.modeEpoch
    const owns = () => this.#runtime.health === 'ready'
      && generation === this.#runtime.generation && revision === this.#runtime.revision
      && modeEpoch === this.#runtime.modeEpoch && this.#reconciler.getElement(id) === mounted
    const existing = this.#reconciler.getEditableFields(id).find(field => field.key === anchor.fieldKey)
    if (!owns() || document.activeElement !== active || this.#interaction.explicitCurrentVersion !== decision) return false
    // A known mounted field keeps the existing strict restoration path. Only
    // a missing recorded field may ask its plugin to reveal that exact key.
    if (existing) return this.#selection.restore(bookmark)
    if (!this.focus(id, { fieldKey: anchor.fieldKey, offset: anchor.offset })
      || !owns() || this.#interaction.explicitCurrentVersion !== decision + 1) return false
    const field = this.#reconciler.getEditableFields(id).find(field => field.key === anchor.fieldKey)
    const selected = this.#selection.capture()
    const matches = point => point?.blockId === id && point.fieldKey === anchor.fieldKey && point.offset === anchor.offset
    if (!owns() || this.#interaction.explicitCurrentVersion !== decision + 1
      || !field || document.activeElement !== field.element
      || !matches(selected?.anchor) || !matches(selected?.focus)) return false
    return this.#selection.restore(bookmark)
  }

  reconcileInteraction() { this.#interaction.reconcile() }
}
