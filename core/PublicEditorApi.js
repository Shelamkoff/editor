import { EditorEvent } from './editorEvents.js'

const PUBLIC_EDITOR_EVENTS = new Set([
  EditorEvent.READY,
  EditorEvent.WILL_CHANGE,
  EditorEvent.CHANGED,
  EditorEvent.DESTROYED,
  EditorEvent.BLOCK_ADDED,
  EditorEvent.BLOCK_REMOVED,
  EditorEvent.BLOCK_MOVED,
  EditorEvent.BLOCK_CONVERTED,
  EditorEvent.BLOCK_CHANGED,
  EditorEvent.BLOCK_FOCUSED,
  EditorEvent.BLOCK_BLURRED,
  EditorEvent.BLOCK_SELECTED,
  EditorEvent.TOOLBAR_OPENED,
  EditorEvent.TOOLBAR_CLOSED,
  EditorEvent.HISTORY_COMMIT,
  EditorEvent.HISTORY_CHANGED,
  EditorEvent.READ_ONLY_CHANGED,
  EditorEvent.PASTE_APPLIED,
  EditorEvent.DRAG_HANDLE_CLICKED,
])


/**
 * Project internal event payloads onto the documented public contract.
 * Internal services may attach coordination data (for example animation
 * promises) that must never become accidental public API.
 * @param {string} event
 * @param {any} data
 */
function publicEventData(event, data) {
  switch (event) {
    case EditorEvent.BLOCK_ADDED:
    case EditorEvent.BLOCK_REMOVED:
      return { blockId: data?.blockId, index: data?.index }
    case EditorEvent.BLOCK_MOVED:
      return {
        blockId: data?.blockId,
        from: data?.from,
        to: Number.isSafeInteger(data?.from) && Number.isSafeInteger(data?.to) && data.from < data.to
          ? data.to - 1
          : data?.to,
      }
    case EditorEvent.BLOCK_CONVERTED:
      return { blockId: data?.blockId, from: data?.from, to: data?.to }
    case EditorEvent.BLOCK_CHANGED:
    case EditorEvent.BLOCK_FOCUSED:
    case EditorEvent.BLOCK_BLURRED:
      return { blockId: data?.blockId }
    case EditorEvent.BLOCK_SELECTED:
      return { blockIds: Array.isArray(data?.blockIds) ? [...data.blockIds] : [] }
    case EditorEvent.TOOLBAR_OPENED:
    case EditorEvent.TOOLBAR_CLOSED:
      return { type: data?.type }
    case EditorEvent.HISTORY_CHANGED:
      return { canUndo: data?.canUndo === true, canRedo: data?.canRedo === true }
    case EditorEvent.READ_ONLY_CHANGED:
      return { readOnly: data?.readOnly === true }
    case EditorEvent.PASTE_APPLIED:
      return {
        ...(typeof data?.startBlockId === 'string' ? { startBlockId: data.startBlockId } : {}),
        ...(typeof data?.endBlockId === 'string' ? { endBlockId: data.endBlockId } : {}),
      }
    default:
      return undefined
  }
}

/**
 * Safe identity view over a live block id. It deliberately omits manager-
 * integrity methods such as destroy(), markDirty(), merge() and
 * replaceContentElement(). Resolving by id makes a retained view follow an
 * atomic conversion, which replaces the internal Block instance while keeping
 * its document identity. Access fails while that id is absent from the live
 * document instead of exposing detached stale DOM.
 */
class PublicBlockView {
  /** @type {string} */ #id
  /** @type {(id: string) => import('./types').IBlock | undefined} */ #resolveBlock
  /** @type {() => void} */ #assertActive
  /** @type {() => void} */ #assertMutable
  /** @type {false | 'removed' | 'destroyed'} */ #retired = false

  /**
   * @param {string} id
   * @param {(id: string) => import('./types').IBlock | undefined} resolveBlock
   * @param {() => void} assertActive
   * @param {() => void} assertMutable
   */
  constructor(id, resolveBlock, assertActive, assertMutable) {
    this.#id = id
    this.#resolveBlock = resolveBlock
    this.#assertActive = assertActive
    this.#assertMutable = assertMutable
  }

  get #block() {
    if (this.#retired === 'destroyed') throw new Error('Editor instance is destroyed')
    if (this.#retired === 'removed') throw new Error(`Block "${this.#id}" is no longer attached to the editor`)
    this.#assertActive()
    const block = this.#resolveBlock(this.#id)
    if (!block) throw new Error(`Block "${this.#id}" is no longer attached to the editor`)
    return block
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
  focus() { this.#assertMutable(); this.#block.focus() }
  isEmpty() { return this.#block.isEmpty() }

  /** Permanently retire this handle and release editor-owned resolver closures.
   * @param {'removed' | 'destroyed'} [reason]
   */
  retire(reason = 'removed') {
    if (this.#retired) return
    this.#retired = reason
    this.#resolveBlock = () => undefined
    this.#assertActive = () => {}
    this.#assertMutable = () => {
      if (reason === 'destroyed') throw new Error('Editor instance is destroyed')
      throw new Error(`Block "${this.#id}" is no longer attached to the editor`)
    }
  }
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

  /** @type {import('./CommandDispatcher').CommandDispatcher | null} */
  #commands

  /** Stable public handles keyed by document block identity. */
  /** @type {Map<string, PublicBlockView>} */
  #views = new Map()

  /**
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').IEventBus} events
   * @param {import('./CommandDispatcher').CommandDispatcher} [commands]
   */
  constructor(blocks, events, commands) {
    this.#manager = blocks
    this.#events = events
    this.#commands = commands ?? null

    const afterCommit = callback => this.#commands ? this.#commands.afterCommit(callback) : callback()

    events.on(EditorEvent.BLOCK_REMOVED, ({ blockId } = {}) => {
      if (typeof blockId !== 'string') return
      afterCommit(() => this.#retireViewIfMissing(blockId))
    })
    events.on(EditorEvent.DOCUMENT_REPLACED, () => {
      afterCommit(() => this.#retireMissingViews())
    })
    events.on(EditorEvent.DESTROYED, () => {
      for (const view of this.#views.values()) view.retire('destroyed')
      this.#manager = null
      this.#commands = null
      this.#views.clear()
    })
  }

  #assertActive() {
    if (!this.#manager) throw new Error('Editor instance is destroyed')
  }

  #assertMutableState() {
    this.#assertActive()
    if (this.#commands?.inTransaction) {
      throw new Error('Cannot change editor state during an active command transaction')
    }
  }

  #retireViewIfMissing(id) {
    if (!this.#manager || this.#manager.getBlockById(id)) return
    this.#views.get(id)?.retire()
    this.#views.delete(id)
  }

  #retireMissingViews() {
    if (!this.#manager) return
    for (const id of this.#views.keys()) {
      if (this.#manager.getBlockById(id)) continue
      this.#views.get(id)?.retire()
      this.#views.delete(id)
    }
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
    let view = this.#views.get(block.id)
    if (!view) {
      const id = block.id
      view = new PublicBlockView(
        id,
        blockId => this.#manager?.getBlockById(blockId),
        () => this.#assertActive(),
        () => this.#assertMutableState(),
      )
      this.#views.set(id, view)
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
  setCurrentIndex(index) {
    this.#assertMutableState()
    if (!Number.isSafeInteger(index)) throw new RangeError('Block index must be a safe integer')
    const count = this.#blocks.getBlockCount()
    if (index < 0 || index >= count) throw new RangeError('Block index is out of range')
    if (index === this.#blocks.getCurrentIndex()) return
    this.#blocks.setCurrentIndex(index)
  }

  /** @param {string[]} blockIds */
  selectBlocks(blockIds) {
    this.#assertMutableState()
    if (!Array.isArray(blockIds) || blockIds.some(id => typeof id !== 'string')) {
      throw new TypeError('blockIds must be an array of strings')
    }
    const previousBlockIds = this.#selectedBlockIds()
    const selected = new Set(blockIds)
    for (const block of this.#blocks) block.selected = selected.has(block.id)
    this.#emitSelectionChanged(previousBlockIds)
  }

  clearSelection() {
    this.#assertMutableState()
    const previousBlockIds = this.#selectedBlockIds()
    this.#blocks.clearSelection()
    this.#emitSelectionChanged(previousBlockIds)
  }

  insert(type, data, index, id, inline) {
    this.#assertMutableState()
    return this.#view(this.#blocks.insert(type, data, index, id, inline))
  }

  remove(index) {
    this.#assertMutableState()
    const removed = this.#blocks.getBlockByIndex(index)
    const wasCurrent = removed !== undefined && removed === this.#blocks.getCurrentBlock()
    this.#blocks.remove(index)
    if (wasCurrent) {
      removed.focused = false
      const current = this.#blocks.getCurrentBlock()
      if (current) {
        current.focused = true
        this.#events.emit(EditorEvent.BLOCK_FOCUSED, { blockId: current.id })
      }
    }
  }
  move(fromIndex, toIndex) {
    this.#assertMutableState()
    if (!Number.isSafeInteger(fromIndex) || !Number.isSafeInteger(toIndex)) {
      throw new RangeError('Block index must be a safe integer')
    }
    const count = this.#blocks.getBlockCount()
    if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex > count) return
    // `toIndex === count` is retained as a compatibility alias for the old
    // insertion-boundary API's "move to end" form. All in-range values are
    // final block indices.
    const finalIndex = toIndex === count ? count - 1 : toIndex
    if (fromIndex === finalIndex) return
    const insertionIndex = fromIndex < finalIndex ? finalIndex + 1 : finalIndex
    this.#blocks.move(fromIndex, insertionIndex)
  }
  convert(index, type, data) {
    this.#assertMutableState()
    return this.#view(this.#blocks.convert(index, type, data))
  }

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
  /** @type {Map<string, Map<Function, { on?: () => void, once?: () => void }>>} */
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
    if (!PUBLIC_EDITOR_EVENTS.has(event)) {
      throw new TypeError(`Unknown public editor event: ${String(event)}`)
    }
    if (typeof handler !== 'function') throw new TypeError('Handler must be a function')
    let handlers = this.#subscriptions.get(event)
    if (!handlers) this.#subscriptions.set(event, handlers = new Map())
    let registrations = handlers.get(handler)
    if (!registrations) {
      registrations = {}
      handlers.set(handler, registrations)
    }
    const kind = once ? 'once' : 'on'
    const existing = registrations[kind]
    if (existing) return existing
    let listening = true
    const receive = data => {
      const publicData = publicEventData(event, data)
      const deliver = () => {
        if (!listening || (!this.#active && event !== EditorEvent.DESTROYED)) return
        if (once) unsubscribe()
        try {
          const result = handler(publicData)
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(error => console.error(`[EditorEvents] ${event}:`, error))
          }
        } catch (error) { console.error(`[EditorEvents] ${event}:`, error) }
      }
      if (event === EditorEvent.WILL_CHANGE) deliver()
      else if (this.#commands) this.#commands.afterCommit(deliver)
      else deliver()
    }
    const off = this.#events.on(event, receive)
    const unsubscribe = () => {
      listening = false
      off()
      delete registrations[kind]
      if (!registrations.on && !registrations.once) handlers.delete(handler)
      if (handlers.size === 0) this.#subscriptions.delete(event)
    }
    registrations[kind] = unsubscribe
    return unsubscribe
  }

  on(event, handler) { return this.#listen(event, handler, false) }
  off(event, handler) {
    const registrations = this.#subscriptions.get(event)?.get(handler)
    registrations?.on?.()
    registrations?.once?.()
  }
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
  insertInlinePlugin(type, data) {
    this.#assertActive()
    if (typeof type !== 'string') throw new TypeError('Inline plugin type must be a string')
    if (
      data !== undefined
      && (
        data === null
        || typeof data !== 'object'
        || Array.isArray(data)
        || Object.values(data).some(value => typeof value !== 'string')
      )
    ) {
      throw new TypeError('Inline plugin data must be an object of string values')
    }
    return this.#facade.insertInlinePlugin(type, data)
  }
  destroy() { if (this.#facade.isReady) this.#facade.destroy() }
}
