// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

function snapshot(runtime, record) {
  if (!record) return undefined
  const value = cloneEditorData(record)
  return Object.freeze({
    id: value.id,
    type: value.type,
    dataVersion: value.dataVersion,
    data: value.data,
    tunes: value.tunes,
    inline: value.inline,
    revision: value.revision,
    status: runtime.activation(value.id)?.kind === 'active' ? 'active' : 'preserved',
  })
}

export class EditorBlocksApi {
  #runtime
  #view
  #isDestroyed

  constructor({ runtime, view, isDestroyed = () => false }) {
    this.#runtime = runtime
    this.#view = view
    this.#isDestroyed = isDestroyed
  }

  #assertLive() {
    if (this.#isDestroyed()) throw new Error('Editor is destroyed')
  }

  get count() { this.#assertLive(); return this.#runtime.list().length }
  get currentId() { this.#assertLive(); return this.#view.currentId }

  get(id) { this.#assertLive(); return snapshot(this.#runtime, this.#runtime.get(id)) }
  at(index) { this.#assertLive(); return snapshot(this.#runtime, this.#runtime.list()[index]) }
  list() { this.#assertLive(); return Object.freeze(this.#runtime.list().map(record => snapshot(this.#runtime, record))) }
  indexOf(id) { this.#assertLive(); return this.#runtime.list().findIndex(record => record.id === id) }
  selectedIds() { this.#assertLive(); return Object.freeze([...this.#view.selectedIds]) }

  setCurrent(id) { this.#assertLive(); this.#view.setCurrent(id) }
  select(ids) { this.#assertLive(); this.#view.select([...ids]) }
  clearSelection() { this.#assertLive(); this.#view.clearSelection() }

  insert(input, index) {
    this.#assertLive()
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.type !== 'string') {
      throw new TypeError('blocks.insert() requires { type, data?, tunes?, inline? }')
    }
    const id = this.#runtime.insert(input.type, input.data, index, {
      tunes: input.tunes,
      inline: input.inline,
    })
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    return id
  }

  update(id, producer) {
    this.#assertLive()
    if (typeof producer !== 'function') throw new TypeError('blocks.update() requires a producer')
    this.#runtime.update(id, current => {
      const currentSnapshot = snapshot(this.#runtime, current)
      const patch = producer(currentSnapshot)
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('blocks.update() producer must return an object')
      }
      return patch
    })
  }

  remove(id) { this.#assertLive(); this.#view.remove(id) }
  move(id, to) { this.#assertLive(); this.#view.move(id, to) }
  convert(id, target) { this.#assertLive(); return this.#view.convert(id, target) }
  focus(id, target) {
    this.#assertLive()
    return this.#view.focus(id, target)
  }

  *[Symbol.iterator]() {
    this.#assertLive()
    for (const record of this.#runtime.list()) yield snapshot(this.#runtime, record)
  }
}

export class EditorHandle {
  #runtime
  #view
  #blocks
  #destroyEditor
  #setReadOnly
  #inlineCommands
  #subscribe
  #isDestroyed

  constructor({ runtime, view, blocks, destroy, setReadOnly, inlineCommands, subscribe, isDestroyed = () => false }) {
    this.#runtime = runtime
    this.#view = view
    this.#blocks = blocks
    this.#destroyEditor = destroy
    this.#setReadOnly = setReadOnly
    this.#inlineCommands = inlineCommands
    this.#subscribe = subscribe
    this.#isDestroyed = isDestroyed
  }

  #assertLive() {
    if (this.#isDestroyed()) throw new Error('Editor is destroyed')
  }

  get blocks() { this.#assertLive(); return this.#blocks }
  get canUndo() { this.#assertLive(); return this.#runtime.canUndo }
  get canRedo() { this.#assertLive(); return this.#runtime.canRedo }
  get readOnly() { this.#assertLive(); return this.#runtime.readOnly }
  get documentMode() { this.#assertLive(); return this.#runtime.documentMode }

  save() {
    this.#assertLive()
    return cloneEditorData(this.#runtime.save())
  }
  render(document) {
    this.#assertLive()
    this.#runtime.render(document)
    this.#view.reconcileInteraction()
  }
  clear() {
    this.#assertLive()
    this.#runtime.clear()
    this.#view.reconcileInteraction()
  }
  undo() {
    this.#assertLive()
    const changed = this.#runtime.undo()
    if (changed) this.#view.reconcileInteraction()
    return changed
  }
  redo() {
    this.#assertLive()
    const changed = this.#runtime.redo()
    if (changed) this.#view.reconcileInteraction()
    return changed
  }
  focus() {
    this.#assertLive()
    return this.#view.focus()
  }
  setReadOnly(value) {
    this.#assertLive()
    return this.#setReadOnly(value)
  }

  insertInlinePlugin(type, data) {
    this.#assertLive()
    return this.#inlineCommands?.insert?.(type, data) ?? false
  }

  on(type, listener) {
    this.#assertLive()
    if (!this.#subscribe) throw new Error('Editor event subscription is unavailable')
    return this.#subscribe(type, listener)
  }

  destroy() { this.#destroyEditor() }
}
