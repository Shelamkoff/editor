// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

function snapshot(runtime, record, knownStatus = undefined) {
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
    status: knownStatus ?? (runtime.activation(value.id)?.kind === 'active' ? 'active' : 'unregistered'),
  })
}

export class EditorBlocksApi {
  #runtime
  #view
  #selection
  #isDestroyed

  constructor({ runtime, view, selection = null, isDestroyed = () => false }) {
    this.#runtime = runtime
    this.#view = view
    this.#selection = selection
    this.#isDestroyed = isDestroyed
  }

  #assertLive() {
    if (this.#isDestroyed()) throw new Error('Editor is destroyed')
  }

  get count() { this.#assertLive(); return this.#runtime.size }
  get currentId() { this.#assertLive(); return this.#view.currentId }

  get(id) { this.#assertLive(); return snapshot(this.#runtime, this.#runtime.get(id)) }
  at(index) { this.#assertLive(); const id=this.#runtime.idAt(index); return snapshot(this.#runtime, id?this.#runtime.get(id):undefined) }
  list() { this.#assertLive(); return Object.freeze(this.#runtime.list().map(record => snapshot(this.#runtime, record))) }
  indexOf(id) { this.#assertLive(); return this.#runtime.indexOf(id) }
  selectedIds() { this.#assertLive(); return Object.freeze([...this.#view.selectedIds]) }

  setCurrent(id) { this.#assertLive(); this.#runtime.assertControlAuthority(); this.#view.setCurrent(id) }
  select(ids) {
    this.#assertLive()
    this.#runtime.assertControlAuthority()
    // Iterable input is caller-owned code: its iterator/getters may attempt
    // render, read-only changes or even editor destruction. Capture it under
    // the same protected preparation boundary as other public inputs, and
    // do not dispatch a selection from a revoked control owner.
    const selected = this.#runtime.prepareExtensionValue(() => [...ids])
    this.#assertLive()
    this.#runtime.assertControlAuthority()
    if (this.#selection) this.#selection.selectBlocks(selected)
    else this.#view.select(selected)
  }
  clearSelection() {
    this.#assertLive()
    this.#runtime.assertControlAuthority()
    if (this.#selection) this.#selection.clear()
    else this.#view.clearSelection()
  }

  insert(input, index) {
    this.#assertLive()
    this.#runtime.assertCommandAuthority('host')
    const captured = this.#runtime.prepareExtensionValue(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('blocks.insert() requires { type, data?, tunes?, inline? }')
      }
      const type = input.type
      if (typeof type !== 'string') throw new TypeError('blocks.insert() requires { type, data?, tunes?, inline? }')
      const data = input.data
      const tunes = input.tunes
      const inline = input.inline
      return {
        type,
        data: data === undefined ? undefined : cloneEditorData(data),
        tunes: tunes === undefined ? undefined : cloneEditorData(tunes),
        inline: inline === undefined ? undefined : cloneEditorData(inline),
      }
    })
    const id = this.#runtime.insert(captured.type, captured.data, index, {
      tunes: captured.tunes,
      inline: captured.inline,
    }, 'host')
    this.#view.reconcileInteraction()
    if (this.#runtime.has(id)) this.#view.setCurrent(id)
    return id
  }

  update(id, producer) {
    this.#assertLive()
    if (typeof producer !== 'function') throw new TypeError('blocks.update() requires a producer')
    this.#runtime.update(id, current => {
      const currentSnapshot = snapshot(this.#runtime, current, 'active')
      const patch = producer(currentSnapshot)
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('blocks.update() producer must return an object')
      }
      return patch
    }, 'host')
  }

  remove(id) { this.#assertLive(); this.#view.remove(id, 'host') }
  move(id, to) { this.#assertLive(); this.#view.move(id, to, 'host') }
  convert(id, target) {
    this.#assertLive()
    this.#runtime.assertCommandAuthority('host')
    // Conversion target accessors run before entering the canonical draft.
    // Otherwise a type/toolbox getter can reenter host mutations while the
    // transaction is building, or destroy the owner before commit.
    const captured = target && typeof target === 'object'
      ? this.#runtime.prepareExtensionValue(() => ({ ...target }))
      : target
    this.#assertLive()
    this.#runtime.assertCommandAuthority('host')
    return snapshot(this.#runtime, this.#view.convert(id, captured, 'host'), 'active')
  }
  focus(id, target) {
    this.#assertLive()
    this.#runtime.assertControlAuthority()
    // A custom fieldKey/offset getter must not change between plug-in focus
    // and LogicalSelection.setCaret. Snapshot the public option fields inside
    // a protected input-read phase before allowing presentation side effects.
    // Keep optional undefined fields intact; focus targets are not persisted
    // document payloads and need no JSON format conversion.
    const captured = target && typeof target === 'object'
      ? this.#runtime.prepareExtensionValue(() => ({ ...target }))
      : target
    this.#assertLive()
    this.#runtime.assertControlAuthority()
    return this.#view.focus(id, captured)
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
  #isReady
  #isDestroyed

  constructor({ runtime, view, blocks, destroy, setReadOnly, inlineCommands, subscribe, isReady = () => true, isDestroyed = () => false }) {
    this.#runtime = runtime
    this.#view = view
    this.#blocks = blocks
    this.#destroyEditor = destroy
    this.#setReadOnly = setReadOnly
    this.#inlineCommands = inlineCommands
    this.#subscribe = subscribe
    this.#isReady = isReady
    this.#isDestroyed = isDestroyed
  }

  #assertLive() {
    if (this.#isDestroyed()) throw new Error('Editor is destroyed')
  }

  get blocks() { this.#assertLive(); return this.#blocks }
  get isReady() { return !this.#isDestroyed() && this.#isReady() }
  get canUndo() { this.#assertLive(); return this.#runtime.canUndo }
  get canRedo() { this.#assertLive(); return this.#runtime.canRedo }
  get readOnly() { this.#assertLive(); return this.#runtime.readOnly }

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
    this.#runtime.assertControlAuthority()
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

  destroy() {
    if (this.#isDestroyed()) return
    this.#runtime.assertControlAuthority({ allowFailed: true })
    this.#destroyEditor()
  }
}
