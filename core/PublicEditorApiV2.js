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

export class EditorBlocksApiV2 {
  #runtime
  #view

  constructor({ runtime, view }) {
    this.#runtime = runtime
    this.#view = view
  }

  get count() { return this.#runtime.list().length }
  get currentId() { return this.#view.currentId }

  get(id) { return snapshot(this.#runtime, this.#runtime.get(id)) }
  at(index) { return snapshot(this.#runtime, this.#runtime.list()[index]) }
  list() { return Object.freeze(this.#runtime.list().map(record => snapshot(this.#runtime, record))) }
  indexOf(id) { return this.#runtime.list().findIndex(record => record.id === id) }
  selectedIds() { return Object.freeze([...this.#view.selectedIds]) }

  setCurrent(id) { this.#view.setCurrent(id) }
  select(ids) { this.#view.select([...ids]) }
  clearSelection() { this.#view.clearSelection() }

  insert(input, index) {
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

  remove(id) { this.#view.remove(id) }
  move(id, to) { this.#view.move(id, to) }
  convert(id, target) { return this.#view.convert(id, target) }
  focus(id, target) { return this.#view.focus(id, target) }

  *[Symbol.iterator]() {
    for (const record of this.#runtime.list()) yield snapshot(this.#runtime, record)
  }
}

export class EditorHandleV2 {
  #runtime
  #view
  #blocks
  #destroyEditor
  #setReadOnly
  #inlineCommands
  #subscribe

  constructor({ runtime, view, blocks, destroy, setReadOnly, inlineCommands, subscribe }) {
    this.#runtime = runtime
    this.#view = view
    this.#blocks = blocks
    this.#destroyEditor = destroy
    this.#setReadOnly = setReadOnly
    this.#inlineCommands = inlineCommands
    this.#subscribe = subscribe
  }

  get blocks() { return this.#blocks }
  get canUndo() { return this.#runtime.canUndo }
  get canRedo() { return this.#runtime.canRedo }
  get readOnly() { return this.#runtime.readOnly }
  get documentMode() { return this.#runtime.documentMode }

  save() { return cloneEditorData(this.#runtime.save()) }
  render(document) {
    this.#runtime.render(document)
    this.#view.reconcileInteraction()
  }
  clear() {
    this.#runtime.clear()
    this.#view.reconcileInteraction()
  }
  undo() {
    const changed = this.#runtime.undo()
    if (changed) this.#view.reconcileInteraction()
    return changed
  }
  redo() {
    const changed = this.#runtime.redo()
    if (changed) this.#view.reconcileInteraction()
    return changed
  }
  focus() { return this.#view.focus() }
  setReadOnly(value) { return this.#setReadOnly(value) }

  insertInlinePlugin(type, data) {
    return this.#inlineCommands?.insert?.(type, data) ?? false
  }

  on(type, listener) {
    if (!this.#subscribe) throw new Error('Editor event subscription is unavailable')
    return this.#subscribe(type, listener)
  }

  destroy() { this.#destroyEditor() }
}
