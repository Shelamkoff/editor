/**
 * Safe view over an internal Block. It deliberately omits manager-integrity
 * methods such as destroy(), markDirty(), merge() and replaceContentElement().
 */
class PublicBlockView {
  /** @type {import('./types').IBlock} */
  #block

  /** @param {import('./types').IBlock} block */
  constructor(block) {
    this.#block = block
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
  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {WeakMap<import('./types').IBlock, PublicBlockView>} */
  #views = new WeakMap()

  /** @param {import('./types').IBlockManager} blocks */
  constructor(blocks) {
    this.#blocks = blocks
  }

  /** @param {import('./types').IBlock | undefined} block */
  #view(block) {
    if (!block) return undefined
    let view = this.#views.get(block)
    if (!view) {
      view = new PublicBlockView(block)
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
    const selected = new Set(blockIds)
    for (const block of this.#blocks) block.selected = selected.has(block.id)
  }

  clearSelection() { this.#blocks.clearSelection() }

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
  /** @type {import('./types').IEventBus} */
  #events

  /** @param {import('./types').IEventBus} events */
  constructor(events) {
    this.#events = events
  }

  on(event, handler) { return this.#events.on(event, handler) }
  off(event, handler) { this.#events.off(event, handler) }
  once(event, handler) { return this.#events.once(event, handler) }
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
  save() { this.#assertActive(); return this.#facade.save() }
  render(data) { this.#assertActive(); this.#facade.render(data) }
  clear() { this.#assertActive(); this.#facade.clear() }
  focus() { this.#assertActive(); this.#facade.focus() }
  insertInlinePlugin(type, data) { this.#assertActive(); return this.#facade.insertInlinePlugin(type, data) }
  destroy() { if (this.#facade.isReady) this.#facade.destroy() }
}
