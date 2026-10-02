// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

function ownBlock(input) {
  const block = cloneEditorData(input)
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError('Block record must be a JSON object')
  }
  if (typeof block.id !== 'string' || block.id.length === 0) {
    throw new TypeError('Block id must be a non-empty string')
  }
  if (typeof block.type !== 'string' || block.type.length === 0) {
    throw new TypeError('Block type must be a non-empty string')
  }
  if (!Object.hasOwn(block, 'data')) {
    throw new TypeError(`Block "${block.id}" must contain data`)
  }
  return block
}

function ownDocument(input) {
  const document = cloneEditorData(input)
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('Document must be a JSON object')
  }
  if (typeof document.version !== 'string' || document.version.length === 0) {
    throw new TypeError('Document version must be a non-empty string')
  }
  if (!Array.isArray(document.blocks)) {
    throw new TypeError('Document blocks must be an array')
  }

  const ids = new Set()
  const blocks = []
  for (let index = 0; index < document.blocks.length; index++) {
    if (!Object.hasOwn(document.blocks, index)) {
      throw new TypeError('Document blocks must be a dense array')
    }
    const block = ownBlock(document.blocks[index])
    if (ids.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`)
    ids.add(block.id)
    blocks.push(block)
  }
  return { version: document.version, blocks }
}

function stateFromDocument(document) {
  const owned = ownDocument(document)
  return {
    version: owned.version,
    order: owned.blocks.map(block => block.id),
    blocks: new Map(owned.blocks.map(block => [block.id, block])),
  }
}

function exportState(state) {
  return {
    version: state.version,
    blocks: state.order.map(id => cloneEditorData(state.blocks.get(id))),
  }
}

function assertIndex(index, min, max, label) {
  if (!Number.isInteger(index) || index < min || index > max) {
    throw new RangeError(label)
  }
}

export class DocumentDraft {
  #owner
  #version
  #order
  #blocks
  #changes = []

  constructor(owner, document) {
    this.#owner = owner
    const state = stateFromDocument(document)
    this.#version = state.version
    this.#order = state.order
    this.#blocks = state.blocks
  }

  isOwnedBy(owner) {
    return this.#owner === owner
  }

  get version() {
    return this.#version
  }

  get changes() {
    return this.#changes.map(change => cloneEditorData(change))
  }

  get(id) {
    const block = this.#blocks.get(id)
    return block ? cloneEditorData(block) : undefined
  }

  list() {
    return this.#order.map(id => cloneEditorData(this.#blocks.get(id)))
  }

  export() {
    return exportState({
      version: this.#version,
      order: this.#order,
      blocks: this.#blocks,
    })
  }

  insert(index, input) {
    assertIndex(index, 0, this.#order.length, 'Insert index is out of range')
    const block = ownBlock(input)
    if (this.#blocks.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`)
    this.#order.splice(index, 0, block.id)
    this.#blocks.set(block.id, block)
    this.#changes.push({ kind: 'block.insert', index, block: cloneEditorData(block) })
    return block.id
  }

  update(id, input) {
    const current = this.#blocks.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    const next = ownBlock(input)
    if (next.id !== id) throw new Error('Block update cannot change block id')
    const before = cloneEditorData(current)
    this.#blocks.set(id, next)
    this.#changes.push({
      kind: 'block.update',
      id,
      before,
      after: cloneEditorData(next),
    })
  }

  remove(id) {
    const block = this.#blocks.get(id)
    if (!block) throw new Error(`Unknown block id: ${id}`)
    const index = this.#order.indexOf(id)
    this.#order.splice(index, 1)
    this.#blocks.delete(id)
    this.#changes.push({
      kind: 'block.remove',
      index,
      block: cloneEditorData(block),
    })
  }

  move(id, to) {
    const from = this.#order.indexOf(id)
    if (from < 0) throw new Error(`Unknown block id: ${id}`)
    assertIndex(to, 0, this.#order.length - 1, 'Final block index is out of range')
    if (from === to) return
    this.#order.splice(from, 1)
    this.#order.splice(to, 0, id)
    this.#changes.push({ kind: 'block.move', id, from, to })
  }

  replace(document) {
    const before = this.export()
    const next = stateFromDocument(document)
    this.#version = next.version
    this.#order = next.order
    this.#blocks = next.blocks
    this.#changes.push({
      kind: 'document.replace',
      before,
      after: this.export(),
    })
  }

  applyChanges(changes, direction) {
    if (direction !== 'forward' && direction !== 'backward') {
      throw new TypeError('Change direction must be forward or backward')
    }
    const sequence = direction === 'forward' ? changes : [...changes].reverse()
    for (const change of sequence) this.#applyChange(change, direction)
  }

  #applyChange(change, direction) {
    switch (change.kind) {
      case 'block.insert':
        if (direction === 'forward') {
          this.#insertReplay(change.index, change.block)
        } else {
          this.#removeReplay(change.block.id, change.index)
        }
        return
      case 'block.remove':
        if (direction === 'forward') {
          this.#removeReplay(change.block.id, change.index)
        } else {
          this.#insertReplay(change.index, change.block)
        }
        return
      case 'block.update':
        this.#updateReplay(change.id, direction === 'forward' ? change.after : change.before)
        return
      case 'block.move':
        this.#moveReplay(change.id, direction === 'forward' ? change.to : change.from)
        return
      case 'document.replace': {
        const next = stateFromDocument(direction === 'forward' ? change.after : change.before)
        this.#version = next.version
        this.#order = next.order
        this.#blocks = next.blocks
        return
      }
      default:
        throw new TypeError(`Unknown document change: ${change?.kind}`)
    }
  }

  #insertReplay(index, input) {
    const block = ownBlock(input)
    if (this.#blocks.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`)
    assertIndex(index, 0, this.#order.length, 'Replay insert index is out of range')
    this.#order.splice(index, 0, block.id)
    this.#blocks.set(block.id, block)
  }

  #removeReplay(id, expectedIndex) {
    const index = this.#order.indexOf(id)
    if (index < 0) throw new Error(`Unknown block id during replay: ${id}`)
    if (index !== expectedIndex) {
      throw new Error(`Replay block index mismatch for ${id}: expected ${expectedIndex}, got ${index}`)
    }
    this.#order.splice(index, 1)
    this.#blocks.delete(id)
  }

  #updateReplay(id, input) {
    if (!this.#blocks.has(id)) throw new Error(`Unknown block id during replay: ${id}`)
    const block = ownBlock(input)
    if (block.id !== id) throw new Error('Replay update cannot change block id')
    this.#blocks.set(id, block)
  }

  #moveReplay(id, to) {
    const from = this.#order.indexOf(id)
    if (from < 0) throw new Error(`Unknown block id during replay: ${id}`)
    assertIndex(to, 0, this.#order.length - 1, 'Replay move index is out of range')
    this.#order.splice(from, 1)
    this.#order.splice(to, 0, id)
  }
}

export class DocumentStore {
  #version
  #order
  #blocks

  constructor(document) {
    const state = stateFromDocument(document)
    this.#version = state.version
    this.#order = state.order
    this.#blocks = state.blocks
  }

  get version() {
    return this.#version
  }

  get(id) {
    const block = this.#blocks.get(id)
    return block ? cloneEditorData(block) : undefined
  }

  list() {
    return this.#order.map(id => cloneEditorData(this.#blocks.get(id)))
  }

  export() {
    return exportState({
      version: this.#version,
      order: this.#order,
      blocks: this.#blocks,
    })
  }

  createDraft() {
    return new DocumentDraft(this, this.export())
  }

  createDraftFrom(document) {
    return new DocumentDraft(this, document)
  }

  commit(draft) {
    if (!(draft instanceof DocumentDraft) || !draft.isOwnedBy(this)) {
      throw new TypeError('Cannot commit a draft owned by another DocumentStore')
    }
    const state = stateFromDocument(draft.export())
    this.#version = state.version
    this.#order = state.order
    this.#blocks = state.blocks
  }
}
