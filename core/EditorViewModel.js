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
    const id = this.#runtime.insert(type, data, index, {}, authority)
    this.#interaction.reconcile()
    if (this.#runtime.has(id)) this.#interaction.setCurrent(id)
    return id
  }

  update(id, producer, authority = 'interaction') { this.#runtime.update(id, producer, authority) }

  remove(id, authority = 'interaction') {
    const index = this.indexOf(id)
    this.#runtime.remove(id, authority)
    this.#interaction.reconcile()
    if (this.#interaction.currentId === id) {
      const nextId=this.#runtime.idAt(Math.min(Math.max(index,0),this.#runtime.size-1))
      if(nextId)this.#interaction.setCurrent(nextId)
    }
  }

  move(id, to, authority = 'interaction') {
    this.#runtime.move(id, to, authority)
    this.#interaction.reconcile()
  }

  convert(id, target, authority = 'interaction') {
    this.#runtime.convert(id, target, authority)
    this.#interaction.reconcile()
    return this.get(id)
  }

  focus(id = this.#interaction.currentId, target) {
    if (!id) return false
    this.#interaction.setCurrent(id)
    const focused = this.#interaction.focus(id, target)
    if (target) this.#selection.setCaret(id, target)
    return focused
  }

  setCaret(id, target) {
    this.#interaction.setCurrent(id)
    return this.#selection.setCaret(id, target)
  }

  reconcileInteraction() { this.#interaction.reconcile() }
}
