// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { ProjectionAnimator } from './ProjectionAnimator.js'

function sameJson(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right) } catch { return false }
}

function hasStructuralChange(changes) {
  return changes.some(change => (
    change.kind === 'block.insert'
    || change.kind === 'block.remove'
    || change.kind === 'block.move'
    || change.kind === 'document.replace'
  ))
}

export class BlockReconciler {
  #container
  #registry
  #contextFactory
  #activationResolver
  #entries = new Map()
  #fieldOwners = new WeakMap()
  #blockOwners = new WeakMap()
  #readOnly
  #inlineProjection
  #animator
  #store = null
  #destroyed = false

  constructor({
    container,
    registry,
    contextFactory,
    activationResolver,
    inlineProjection = null,
    readOnly = false,
    animationDurations,
  }) {
    if (!container?.ownerDocument) throw new TypeError('BlockReconciler requires a container')
    if (!registry) throw new TypeError('BlockReconciler requires an ExtensionRegistry')
    if (typeof contextFactory !== 'function') throw new TypeError('BlockReconciler requires contextFactory')
    this.#container = container
    this.#registry = registry
    this.#contextFactory = contextFactory
    this.#activationResolver = typeof activationResolver === 'function'
      ? activationResolver
      : (_id, record) => registry.hasBlock(record.type)
    this.#inlineProjection = inlineProjection
    this.#readOnly = readOnly === true
    this.#animator = new ProjectionAnimator(animationDurations)

  }

  mount(store) {
    this.#assertLive()
    const previousStore = this.#store
    const previousEntries = this.#entries
    this.#store = store
    const fresh = this.#stageAll(store, { candidate: false, hydrateInline: false })

    try {
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#entries = fresh
      for (const entry of fresh.values()) this.#hydrateEntry(entry)
    } catch (error) {
      for (const id of store.ids()) this.#inlineProjection?.destroyBlock?.(id)
      for (const entry of fresh.values()) this.#destroyEntry(entry)
      this.#entries = previousEntries
      this.#store = previousStore
      if (previousStore) {
        this.#container.replaceChildren(...previousStore.ids().map(id => previousEntries.get(id).element))
      } else {
        this.#container.replaceChildren()
      }
      throw error
    }

    for (const entry of previousEntries.values()) this.#destroyEntry(entry)
    this.#animator.enable()
  }

  getElement(id) {
    return this.#entries.get(id)?.element
  }

  get ids() {
    return [...this.#entries.keys()]
  }

  getEditableField(id, fieldKey) {
    return this.getEditableFields(id).find(field => field.key === fieldKey)
  }

  resolveBlockTarget(target) {
    let node = target
    while (node && node !== this.#container) {
      const blockId = this.#blockOwners.get(node)
      if (blockId) return blockId
      node = node.parentNode
    }
    return null
  }

  focus(id, target) {
    const entry = this.#entries.get(id)
    if (!entry || entry.unregistered || typeof entry.instance.focus !== 'function') return false
    entry.instance.focus(target)
    return true
  }

  getEditableFields(id) {
    const entry = this.#entries.get(id)
    if (!entry) return []
    this.#refreshFields(id, entry)
    return [...(entry.instance.editableFields?.() ?? [])]
  }

  resolveEditableTarget(target) {
    let node = target
    while (node && node !== this.#container) {
      const owner = this.#fieldOwners.get(node)
      if (owner) return { ...owner }
      node = node.parentNode
    }
    return null
  }

  readBlock(id) {
    const entry = this.#entries.get(id)
    if (!entry) throw new Error(`Unknown projected block id: ${id}`)
    const data = cloneEditorData(entry.instance.read())
    if (!this.#inlineProjection || entry.unregistered) {
      return { data, inline: entry.record.inline === undefined ? undefined : cloneEditorData(entry.record.inline) }
    }
    return this.#inlineProjection.serializeBlock(
      id,
      entry.record,
      entry.definition,
      entry.instance.editableFields?.() ?? [],
      data,
    )
  }


  prepare({ store, draft, changes, sourceBlockId }) {
    this.#assertLive()
    this.#store = store
    const structuralChange = hasStructuralChange(changes)
    const firstRects = structuralChange ? this.#animator.capture(this.#entries) : new Map()
    const currentOrder = structuralChange ? store.ids() : []
    const currentIndexes = new Map(currentOrder.map((id, index) => [id, index]))
    const changedIds = new Set()
    for (const change of changes) {
      if (change.kind === 'document.replace') {
        for (const id of store.ids()) changedIds.add(id)
        for (const id of draft.ids()) changedIds.add(id)
      } else if (change.id) {
        changedIds.add(change.id)
      } else if (change.block?.id) {
        changedIds.add(change.block.id)
      }
    }

    const previousEntries = new Map(this.#entries)
    const replaceDocument = changes.some(change => change.kind === 'document.replace')
    const staged = new Map()
    const updates = []
    const removals = []
    const replacements = []
    const insertions = []

    try {
      for (const id of changedIds) {
        const before = store.peek(id)
        const after = draft.peek(id)
        const current = this.#entries.get(id)

        if (!after) {
          if (before && current) removals.push({ id, entry: current, before })
          continue
        }

        if (!before || !current) {
          const entry = this.#createEntry(after, { candidate: true, hydrateInline: false })
          staged.set(id, entry)
          insertions.push({ id, entry, after })
          continue
        }

        if (replaceDocument || before.type !== after.type) {
          const entry = this.#createEntry(after, { candidate: true, hydrateInline: false })
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry, beforeRecord: before, afterRecord: after })
          continue
        }

        const dataChanged = !sameJson(before.data, after.data)
        if (dataChanged && typeof current.instance.update !== 'function') {
          const entry = this.#createEntry(after, { candidate: true, hydrateInline: false })
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry, beforeRecord: before, afterRecord: after })
          continue
        }

        if (
          dataChanged
          || !sameJson(before.tunes, after.tunes)
          || !sameJson(before.inline, after.inline)
          || before.dataVersion !== after.dataVersion
        ) {
          updates.push({ id, entry: current, before, after, dataChanged })
        }
      }
    } catch (error) {
      for (const entry of staged.values()) this.#destroyEntry(entry)
      throw error
    }

    const finalOrder = structuralChange ? draft.ids() : null
    const removalSnapshots = removals.flatMap(item => {
      const snapshot = this.#animator.captureRemoval(
        item.entry.element,
        currentIndexes.get(item.id) ?? currentOrder.length,
      )
      return snapshot ? [snapshot] : []
    })

    let applied = false
    let recovered = false
    let finalized = false
    let discarded = false

    return {
      apply: () => {
        if (applied || recovered || finalized) throw new Error('Prepared block projection cannot be applied twice')
        applied = true
        const nextEntries = new Map(previousEntries)

        for (const item of updates) {
          item.entry.lifetime.candidate = item.after
          if (item.dataChanged && item.id !== sourceBlockId) {
            item.entry.instance.update(item.after.data, item.before.data)
          }
          item.entry.record = item.after
          this.#refreshFields(item.id, item.entry)
          if (this.#inlineProjection && !item.entry.unregistered) {
            this.#inlineProjection.reconcileBlock(
              item.id,
              item.after,
              item.entry.definition,
              item.entry.instance.editableFields?.() ?? [],
              item.entry.baseContext,
              { preserveSourceProjection: item.id === sourceBlockId },
            )
          }
          this.#applyTunes(item.entry, item.after)
        }

        for (const item of replacements) {
          this.#inlineProjection?.destroyBlock?.(item.id)
          item.before.element.replaceWith(item.after.element)
          nextEntries.set(item.id, item.after)
        }

        for (const item of insertions) nextEntries.set(item.id, item.entry)

        for (const item of removals) {
          item.entry.element.remove()
          nextEntries.delete(item.id)
          this.#inlineProjection?.destroyBlock?.(item.id)
        }

        if (finalOrder) {
          let cursor = this.#container.firstChild
          for (const id of finalOrder) {
            const entry = nextEntries.get(id)
            if (!entry) throw new Error(`Projection is missing block entry: ${id}`)
            if (entry.element === cursor) cursor = cursor.nextSibling
            else this.#container.insertBefore(entry.element, cursor)
          }
        }

        this.#entries = nextEntries
        for (const item of replacements) this.#hydrateEntry(item.after)
        for (const item of insertions) this.#hydrateEntry(item.entry)
      },

      recover: () => {
        if (recovered) return
        if (!applied) {
          for (const entry of staged.values()) this.#destroyEntry(entry)
          recovered = true
          return
        }

        const candidates = new Set([
          ...previousEntries.values(),
          ...this.#entries.values(),
          ...staged.values(),
        ])
        const restored = new Map()
        try {
          for (const id of changedIds) {
            const record = store.peek(id)
            if (!record) continue
            restored.set(id, this.#createEntry(record, { candidate: false, hydrateInline: false }))
          }
        } catch (error) {
          for (const entry of restored.values()) this.#destroyEntry(entry)
          throw error
        }

        for (const id of changedIds) this.#inlineProjection?.destroyBlock?.(id)

        const nextEntries = new Map(previousEntries)
        for (const id of changedIds) {
          const entry = restored.get(id)
          if (entry) nextEntries.set(id, entry)
          else nextEntries.delete(id)
        }

        this.#container.replaceChildren(...store.ids().map(id => {
          const entry = nextEntries.get(id)
          if (!entry) throw new Error(`Recovery is missing block entry: ${id}`)
          return entry.element
        }))
        this.#entries = nextEntries
        for (const entry of restored.values()) this.#hydrateEntry(entry)

        const keep = new Set(nextEntries.values())
        for (const entry of candidates) if (!keep.has(entry)) this.#destroyEntry(entry)
        recovered = true
      },

      finalize: () => {
        if (finalized || recovered) return
        if (!applied) throw new Error('Cannot finalize an unapplied block projection')

        for (const item of updates) item.entry.lifetime.candidate = null
        for (const item of replacements) item.after.lifetime.candidate = null
        for (const item of insertions) item.entry.lifetime.candidate = null

        for (const item of replacements) this.#destroyEntry(item.before)
        for (const item of removals) this.#destroyEntry(item.entry)

        this.#animator.animateRemovals(this.#container, removalSnapshots)
        this.#animator.animateMoves(this.#entries, firstRects)
        for (const item of insertions) this.#animator.animateInsert(item.entry.element)
        finalized = true
      },

      discard: () => {
        if (discarded || finalized || recovered) return
        discarded = true
        if (applied) return
        for (const entry of staged.values()) this.#destroyEntry(entry)
      },
    }
  }

  restore(store) {
    this.#assertLive()
    this.#store = store
    this.#restore(store, new Map())
  }

  setReadOnly(value) {
    this.#assertLive()
    const next = value === true
    if (next === this.#readOnly) return

    const changed = []
    try {
      for (const entry of this.#entries.values()) {
        entry.instance.setReadOnly(next)
        changed.push(entry)
      }
      this.#inlineProjection?.setReadOnly?.(next)
      this.#readOnly = next
    } catch (error) {
      let recoveryError = null
      for (let index = changed.length - 1; index >= 0; index--) {
        try { changed[index].instance.setReadOnly(this.#readOnly) }
        catch (failure) { recoveryError ??= failure }
      }
      if (recoveryError && this.#store) {
        try { this.#restore(this.#store, new Map()) }
        catch (failure) {
          throw new AggregateError([error, recoveryError, failure], 'Read-only transition and recovery failed')
        }
      }
      throw error
    }
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    for (const entry of this.#entries.values()) this.#destroyEntry(entry)
    this.#entries.clear()
    this.#inlineProjection?.destroy?.()
    this.#animator.destroy()
    this.#container.replaceChildren()
  }

  #assertLive() {
    if (this.#destroyed) throw new Error('BlockReconciler is destroyed')
  }

  #stageAll(source, { candidate = false, hydrateInline = false } = {}) {
    const staged = new Map()
    try {
      for (const id of source.ids()) {
        const record = source.peek(id)
        if (!record) throw new Error(`Canonical block is missing: ${id}`)
        staged.set(id, this.#createEntry(record, { candidate, hydrateInline }))
      }
      return staged
    } catch (error) {
      for (const entry of staged.values()) this.#destroyEntry(entry)
      throw error
    }
  }

  #createEntry(record, { candidate = false, hydrateInline = false } = {}) {
    const ownerDocument = this.#container.ownerDocument
    const lifetime = { candidate: candidate ? record : null }

    if (!this.#registry.hasBlock(record.type) || !this.#activationResolver(record.id, record)) {
      const element = ownerDocument.createElement('div')
      element.className = 'oe-block oe-unregistered-block'
      element.contentEditable = 'false'
      element.dataset.oeUnregisteredBlock = record.type
      element.dataset.blockId = record.id
      element.dataset.blockType = record.type
      this.#blockOwners.set(element, record.id)
      element.textContent = `Unregistered block: ${record.type}`
      const instance = {
        element,
        read: () => cloneEditorData(record.data),
        setReadOnly() {},
        destroy() {},
      }
      return {
        type: record.type,
        record,
        element,
        instance,
        controller: null,
        unregistered: true,
        definition: null,
        baseContext: null,
        lifetime,
      }
    }

    const definition = this.#registry.getBlockDefinition(record.type)
    const runtime = this.#registry.getBlockRuntime(record.type)
    if (!definition || !runtime) throw new Error(`Missing runtime for block type: ${record.type}`)
    const AbortControllerCtor = ownerDocument.defaultView?.AbortController ?? globalThis.AbortController
    const controller = new AbortControllerCtor()
    let instance = null
    let element = null

    try {
      const readRecord = () => lifetime.candidate ?? this.#store?.peek(record.id) ?? record
      const base = this.#contextFactory(record.id, record.type, controller.signal, readRecord) ?? {}
      const context = Object.freeze({
        ...base,
        ownerDocument,
        signal: controller.signal,
        isReadOnly: () => this.#readOnly,
      })
      instance = runtime.create(record.data, context)
      if (!instance?.element || typeof instance.read !== 'function' || typeof instance.setReadOnly !== 'function' || typeof instance.destroy !== 'function') {
        throw new TypeError(`Block runtime "${record.type}" returned an invalid instance`)
      }
      element = ownerDocument.createElement('div')
      element.className = 'oe-block'
      element.dataset.blockId = record.id
      element.dataset.blockType = record.type
      element.appendChild(instance.element)

      const entry = {
        type: record.type,
        record,
        element,
        instance,
        controller,
        unregistered: false,
        definition,
        baseContext: base,
        lifetime,
      }
      this.#blockOwners.set(element, record.id)
      instance.setReadOnly(this.#readOnly)
      this.#refreshFields(record.id, entry)
      this.#applyTunes(entry, record)
      if (hydrateInline) this.#hydrateEntry(entry)
      return entry
    } catch (error) {
      try { this.#inlineProjection?.destroyBlock?.(record.id) } catch {}
      try { controller.abort() } catch {}
      try { instance?.destroy?.() } catch {}
      try { element?.remove?.() } catch {}
      throw error
    }
  }

  #hydrateEntry(entry) {
    if (!this.#inlineProjection || entry.unregistered) return
    this.#inlineProjection.reconcileBlock(
      entry.record.id,
      entry.record,
      entry.definition,
      entry.instance.editableFields?.() ?? [],
      entry.baseContext,
    )
  }

  #refreshFields(id, entry) {
    const fields = entry.instance.editableFields?.() ?? []
    for (const field of fields) {
      if (!field?.element || typeof field.key !== 'string' || !field.key) continue
      this.#fieldOwners.set(field.element, {
        blockId: id,
        fieldKey: field.key,
        element: field.element,
        mode: field.mode,
      })
    }
  }

  #applyTunes(entry, record) {
    const style = entry.element?.style
    if (!style) return
    const align = record.tunes?.textAlign
    style.textAlign = ['left', 'center', 'right', 'justify'].includes(align) ? align : ''
  }

  #restore(store, extraEntries) {
    const fresh = this.#stageAll(store, { candidate: false, hydrateInline: false })
    const oldEntries = new Set([...this.#entries.values(), ...extraEntries.values()])
    for (const id of this.#entries.keys()) this.#inlineProjection?.destroyBlock?.(id)

    try {
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#entries = fresh
      for (const entry of fresh.values()) this.#hydrateEntry(entry)
    } catch (error) {
      for (const entry of fresh.values()) this.#destroyEntry(entry)
      throw error
    }

    for (const entry of oldEntries) this.#destroyEntry(entry)
  }

  #destroyEntry(entry) {
    if (!entry) return
    try { entry.controller?.abort() } catch {}
    try { entry.instance?.destroy?.() } catch {}
    try { entry.element?.remove?.() } catch {}
  }
}
