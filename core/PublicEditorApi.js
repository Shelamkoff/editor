import { EditorEvent } from './editorEvents.js'

/**
 * Safe view over an internal Block. It deliberately omits manager-integrity
 * methods such as destroy(), markDirty(), merge() and replaceContentElement().
 */
class PublicBlockView {
  /** @type {import('./types').IBlock} */
  #internalBlock
  /** @type {() => void} */
  #assertActive

  /** @param {import('./types').IBlock} block @param {() => void} assertActive */
  constructor(block, assertActive) {
    this.#internalBlock = block
    this.#assertActive = assertActive
  }

  get #block() {
    this.#assertActive()
    return this.#internalBlock
  }

  get id() { return this.#block.id }
  get type() { return this.#block.type }
  get element() { return this.#block.element }
  get contentElement() { return this.#block.contentElement }
  get focused() { return this.#block.focused }
  get selected() { return this.#block.selected }
  get hasInlineTools() { return this.#block.hasInlineTools }
  get canMerge() { return this.#block.canMerge }
  get version() { return this.#block.version }
  focus() { this.#block.focus() }
  isEmpty() { return this.#block.isEmpty() }
}

/**
 * Intentional public block surface. Structural commands delegate to the
 * manager, while returned objects never expose manager-invariant mutators.
 */
export class EditorBlocksApi {
  /** @type {import('./types').IBlockManager | null} */
  #manager

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {WeakMap<import('./types').IBlock, PublicBlockView>} */
  #views = new WeakMap()

  /**
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').IEventBus} events
   */
  constructor(blocks, events) {
    this.#manager = blocks
    this.#events = events
    events.on(EditorEvent.DESTROYED, () => {
      this.#manager = null
      this.#views = new WeakMap()
    })
  }

  #assertActive() {
    if (!this.#manager) throw new Error('Editor instance is destroyed')
  }

  get #blocks() {
    this.#assertActive()
    return this.#manager
  }

  /** @returns {string[]} */
  #selectedBlockIds() {
    return this.#blocks.getSelectedBlocks().map(block => block.id)
  }

  /** @param {string[]} previousBlockIds */
  #emitSelectionChanged(previousBlockIds) {
    const blockIds = this.#selectedBlockIds()
    const unchanged = blockIds.length === previousBlockIds.length
      && blockIds.every((id, index) => id === previousBlockIds[index])
    if (!unchanged) this.#events.emit(EditorEvent.BLOCK_SELECTED, { blockIds })
  }

  /** @param {import('./types').IBlock | undefined} block */
  #view(block) {
    this.#assertActive()
    if (!block) return undefined
    let view = this.#views.get(block)
    if (!view) {
      view = new PublicBlockView(block, () => this.#assertActive())
      this.#views.set(block, view)
    }
    return view
  }

  getBlockByIndex(index) { return this.#view(this.#blocks.getBlockByIndex(index)) }
  getBlockById(id) { return this.#view(this.#blocks.getBlockById(id)) }
  getCurrentBlock() { return this.#view(this.#blocks.getCurrentBlock()) }
  getCurrentIndex() { return this.#blocks.getCurrentIndex() }
  getBlockCount() { return this.#blocks.getBlockCount() }
  getBlockIndex(id) { return this.#blocks.getBlockIndex(id) }
  getSelectedBlocks() { return this.#blocks.getSelectedBlocks().map(block => this.#view(block)) }
  hasSelectedBlocks() { return this.#blocks.hasSelectedBlocks() }

  /** Focus/navigation state is safe to expose as an explicit command. */
  setCurrentIndex(index) { this.#blocks.setCurrentIndex(index) }

  /** @param {string[]} blockIds */
  selectBlocks(blockIds) {
    const previousBlockIds = this.#selectedBlockIds()
    const selected = new Set(blockIds)
    for (const block of this.#blocks) block.selected = selected.has(block.id)
    this.#emitSelectionChanged(previousBlockIds)
  }

  clearSelection() {
    const previousBlockIds = this.#selectedBlockIds()
    this.#blocks.clearSelection()
    this.#emitSelectionChanged(previousBlockIds)
  }

  insert(type, data, index, id, inline) {
    return this.#view(this.#blocks.insert(type, data, index, id, inline))
  }

  remove(index) { this.#blocks.remove(index) }
  move(fromIndex, toIndex) { this.#blocks.move(fromIndex, toIndex) }
  convert(index, type, data) { return this.#view(this.#blocks.convert(index, type, data)) }

  *[Symbol.iterator]() {
    for (const block of this.#blocks) yield this.#view(block)
  }
}

/** Public subscription-only facade over the internal mutable event bus. */
export class EditorEventSubscriptions {
  #active = true
  /** @type {import('./types').IEventBus} */
  #events
  /** @type {import('./CommandDispatcher').CommandDispatcher | null} */
  #commands
  /** @type {Map<string, Map<Function, () => void>>} */
  #subscriptions = new Map()

  /** @param {import('./types').IEventBus} events
   * @param {import('./CommandDispatcher').CommandDispatcher} [commands]
   */
  constructor(events, commands) {
    this.#events = events
    this.#commands = commands ?? null
    events.on(EditorEvent.DESTROYED, () => {
      this.#active = false
      this.#subscriptions.clear()
    })
  }

  #assertActive() {
    if (!this.#active) throw new Error('Editor instance is destroyed')
  }

  #listen(event, handler, once) {
    this.#assertActive()
    if (typeof handler !== 'function') throw new TypeError('Handler must be a function')
    let handlers = this.#subscriptions.get(event)
    if (!handlers) this.#subscriptions.set(event, handlers = new Map())
    const existing = handlers.get(handler)
    if (existing) return existing
    let listening = true
    const receive = data => {
      const deliver = () => {
        if (!listening || (!this.#active && event !== EditorEvent.DESTROYED)) return
        if (once) unsubscribe()
        try {
          const result = handler(data)
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(error => console.error(`[EditorEvents] ${event}:`, error))
          }
        } catch (error) { console.error(`[EditorEvents] ${event}:`, error) }
      }
      if (this.#commands) this.#commands.afterCommit(deliver)
      else deliver()
    }
    const off = this.#events.on(event, receive)
    const unsubscribe = () => {
      listening = false
      off()
      handlers.delete(handler)
      if (handlers.size === 0) this.#subscriptions.delete(event)
    }
    handlers.set(handler, unsubscribe)
    return unsubscribe
  }

  on(event, handler) { return this.#listen(event, handler, false) }
  off(event, handler) { this.#subscriptions.get(event)?.get(handler)?.() }
  once(event, handler) { return this.#listen(event, handler, true) }
}

/** Minimal consumer handle; the composition facade remains core-internal. */
export class EditorHandle {
  /** @type {import('./EditorFacade').EditorFacade} */
  #facade

  /** @param {import('./EditorFacade').EditorFacade} facade */
  constructor(facade) { this.#facade = facade }

  #assertActive() {
    if (!this.#facade.isReady) throw new Error('Editor instance is destroyed')
  }

  get isReady() { return this.#facade.isReady }
  get blocks() { this.#assertActive(); return this.#facade.blocks }
  get events() { this.#assertActive(); return this.#facade.events }
  get rootElement() { this.#assertActive(); return this.#facade.rootElement }
  get readOnly() { this.#assertActive(); return this.#facade.readOnly }
  get canUndo() { this.#assertActive(); return this.#facade.canUndo }
  get canRedo() { this.#assertActive(); return this.#facade.canRedo }
  save() { this.#assertActive(); return this.#facade.save() }
  render(data) { this.#assertActive(); this.#facade.render(data) }
  clear() { this.#assertActive(); this.#facade.clear() }
  focus() { this.#assertActive(); this.#facade.focus() }
  undo() { this.#assertActive(); return this.#facade.undo() }
  redo() { this.#assertActive(); return this.#facade.redo() }
  setReadOnly(readOnly) { this.#assertActive(); this.#facade.setReadOnly(readOnly) }
  insertInlinePlugin(type, data) { this.#assertActive(); return this.#facade.insertInlinePlugin(type, data) }
  destroy() { if (this.#facade.isReady) this.#facade.destroy() }
}
