// @ts-check
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { InstanceScope } from './InstanceScope.js'
import { captureInstanceMethod, captureInstanceDestroy } from './instanceMethods.js'
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

function snapshotBlockInstance(source, type, destroySource) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`Block runtime "${type}" returned an invalid instance`)
  }
  const element = source.element
  const read = captureInstanceMethod(source, 'read')
  const update = captureInstanceMethod(source, 'update')
  const editableFields = captureInstanceMethod(source, 'editableFields')
  const setReadOnly = captureInstanceMethod(source, 'setReadOnly')
  const focus = captureInstanceMethod(source, 'focus')
  if (!element || !read || !setReadOnly || !destroySource) {
    throw new TypeError(`Block runtime "${type}" returned an invalid instance`)
  }
  /** @type {import('../plugin-kit/types').BlockInstance} */
  const instance = {
    element,
    read,
    setReadOnly,
    destroy: destroySource,
  }
  if (update) instance.update = update
  if (editableFields) instance.editableFields = editableFields
  if (focus) instance.focus = focus
  return Object.freeze(instance)
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
    const fresh = this.#stageAll(store, { candidate: true, stageInline: true, generation: store.generation })

    try {
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#entries = fresh
      for (const entry of fresh.values()) this.#applyPreparedInline(entry)
      for (const entry of fresh.values()) this.#activateEntry(entry)
      for (const entry of fresh.values()) this.#finalizePreparedInline(entry)
    } catch (error) {
      for (const entry of fresh.values()) this.#recoverPreparedInline(entry)
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
    this.#refreshFields(id, entry, true)
    return [...(entry.instance.editableFields?.() ?? [])]
  }

  resolveInlineWidgetElement(target) {
    return this.#inlineProjection?.resolveWidgetElement(target) ?? null
  }

  resolveEditableTarget(target) {
    let node = target
    while (node && node !== this.#container) {
      const owner = this.#fieldOwners.get(node)
      if (owner) return { ...owner }
      node = node.parentNode
    }
    // Tabs and carousel navigation can replace presentation hosts without a
    // document transaction. Resolve their current registered fields on demand.
    const blockId = this.resolveBlockTarget(target)
    const entry = blockId ? this.#entries.get(blockId) : null
    if (entry) {
      this.#refreshFields(blockId, entry, true)
      node = target
      while (node && node !== entry.element) {
        const owner = this.#fieldOwners.get(node)
        if (owner) return { ...owner }
        node = node.parentNode
      }
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


  prepare({ store, draft, changes, sourceBlockId, generation }) {
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
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation })
          staged.set(id, entry)
          insertions.push({ id, entry, after })
          continue
        }

        if (replaceDocument || before.type !== after.type) {
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation })
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry, beforeRecord: before, afterRecord: after })
          continue
        }

        const dataChanged = !sameJson(before.data, after.data)
        if (dataChanged && typeof current.instance.update !== 'function') {
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation })
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
          this.#applyPreparedInline(item.after)
          item.before.element.replaceWith(item.after.element)
          nextEntries.set(item.id, item.after)
        }

        for (const item of insertions) {
          this.#applyPreparedInline(item.entry)
          nextEntries.set(item.id, item.entry)
        }

        for (const item of removals) {
          item.entry.element.remove()
          nextEntries.delete(item.id)
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
      },

      recover: () => {
        if (recovered) return
        if (!applied) {
          for (const entry of staged.values()) this.#destroyEntry(entry)
          recovered = true
          return
        }

        for (const item of replacements) this.#recoverPreparedInline(item.after)
        for (const item of insertions) this.#recoverPreparedInline(item.entry)

        const damagedIds = new Set(updates.map(item => item.id))
        const restored = new Map()
        try {
          for (const id of damagedIds) {
            const record = store.peek(id)
            if (!record) continue
            restored.set(id, this.#createEntry(record, {
              candidate: false,
              stageInline: true,
              generation: store.generation,
            }))
          }
        } catch (error) {
          for (const entry of restored.values()) this.#destroyEntry(entry)
          throw error
        }

        const nextEntries = new Map(previousEntries)
        for (const [id, entry] of restored) nextEntries.set(id, entry)

        this.#container.replaceChildren(...store.ids().map(id => {
          const entry = nextEntries.get(id)
          if (!entry) throw new Error(`Recovery is missing block entry: ${id}`)
          return entry.element
        }))
        this.#entries = nextEntries

        for (const entry of restored.values()) this.#applyPreparedInline(entry)
        for (const entry of restored.values()) this.#activateEntry(entry)
        for (const entry of restored.values()) this.#finalizePreparedInline(entry)

        const keep = new Set(nextEntries.values())
        const candidates = new Set([
          ...this.#entries.values(),
          ...staged.values(),
          ...previousEntries.values(),
        ])
        for (const entry of candidates) if (!keep.has(entry)) this.#destroyEntry(entry)
        recovered = true
      },

      finalize: () => {
        if (finalized || recovered) return
        if (!applied) throw new Error('Cannot finalize an unapplied block projection')

        for (const item of updates) item.entry.lifetime.candidate = null
        for (const item of replacements) {
          item.after.lifetime.candidate = null
          this.#activateEntry(item.after)
          this.#finalizePreparedInline(item.after)
          this.#destroyEntry(item.before)
        }
        for (const item of insertions) {
          item.entry.lifetime.candidate = null
          this.#activateEntry(item.entry)
          this.#finalizePreparedInline(item.entry)
        }
        for (const item of removals) {
          this.#inlineProjection?.destroyBlock?.(item.id)
          this.#destroyEntry(item.entry)
        }

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
        changed.push(entry)
        entry.instance.setReadOnly(next)
      }
      this.#inlineProjection?.setReadOnly?.(next)
      for (const entry of this.#entries.values()) entry.scope?.setReadOnly?.(next)
      this.#readOnly = next
    } catch (error) {
      let recoveryError = error instanceof ReadOnlyRecoveryError ? error : null
      for (let index = changed.length - 1; index >= 0; index--) {
        try { changed[index].instance.setReadOnly(this.#readOnly) }
        catch (failure) { recoveryError ??= failure }
      }
      if (recoveryError && this.#store) {
        try { this.#restore(this.#store, new Map()) }
        catch (failure) {
          throw new ReadOnlyRecoveryError([error, recoveryError, failure], 'Read-only transition and recovery failed')
        }
      }
      throw error instanceof ReadOnlyRecoveryError ? error.errors[0] : error
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

  #stageAll(source, { candidate = false, stageInline = false, generation = source.generation } = {}) {
    const staged = new Map()
    try {
      for (const id of source.ids()) {
        const record = source.peek(id)
        if (!record) throw new Error(`Canonical block is missing: ${id}`)
        staged.set(id, this.#createEntry(record, { candidate, stageInline, generation }))
      }
      return staged
    } catch (error) {
      for (const entry of staged.values()) this.#destroyEntry(entry)
      throw error
    }
  }

  #createEntry(record, { candidate = false, stageInline = false, generation = this.#store?.generation ?? 0 } = {}) {
    const ownerDocument = this.#container.ownerDocument
    const lifetime = { candidate: candidate ? record : null }
    const scope = new InstanceScope({ staged: true, generation, readOnly: this.#readOnly })

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
        scope: null,
      }
    }

    const definition = this.#registry.getBlockDefinition(record.type)
    const runtime = this.#registry.getBlockRuntime(record.type)
    if (!definition || !runtime) throw new Error(`Missing runtime for block type: ${record.type}`)
    const AbortControllerCtor = ownerDocument.defaultView?.AbortController ?? globalThis.AbortController
    const controller = new AbortControllerCtor()
    let sourceInstance = null
    let destroySource
    let instance = null
    let element = null

    try {
      const readRecord = () => lifetime.candidate ?? this.#store?.peek(record.id) ?? record
      const base = this.#contextFactory(record.id, record.type, controller.signal, readRecord, scope) ?? {}
      const context = Object.freeze({
        ...base,
        ownerDocument: base.ownerDocument ?? ownerDocument,
        signal: base.signal ?? controller.signal,
        isReadOnly: typeof base.isReadOnly === 'function'
          ? base.isReadOnly
          : () => this.#readOnly,
      })
      sourceInstance = runtime.create(record.data, context)
      destroySource = captureInstanceDestroy(sourceInstance)
      instance = snapshotBlockInstance(sourceInstance, record.type, destroySource)
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
        baseContext: context,
        lifetime,
        scope,
      }
      this.#blockOwners.set(element, record.id)
      instance.setReadOnly(this.#readOnly)
      this.#refreshFields(record.id, entry)
      this.#applyTunes(entry, record)
      if (stageInline && this.#inlineProjection) {
        entry.inlinePrepared = this.#inlineProjection.prepareBlock(
          record.id,
          record,
          definition,
          instance.editableFields?.() ?? [],
          context,
          generation,
        )
      }
      return entry
    } catch (error) {
      try { scope.revoke() } catch {}
      try { controller.abort() } catch {}
      try {
        destroySource?.()
      } catch {}
      try { element?.remove?.() } catch {}
      throw error
    }
  }

  #activateEntry(entry) {
    entry?.scope?.activate?.()
  }

  #applyPreparedInline(entry) {
    entry?.inlinePrepared?.apply?.()
  }

  #recoverPreparedInline(entry) {
    if (!entry?.inlinePrepared) return
    try { entry.inlinePrepared.recover() } finally { entry.inlinePrepared = null }
  }

  #finalizePreparedInline(entry) {
    if (!entry?.inlinePrepared) return
    try { entry.inlinePrepared.finalize() } finally { entry.inlinePrepared = null }
  }

  #discardPreparedInline(entry) {
    if (!entry?.inlinePrepared) return
    try { entry.inlinePrepared.discard() } finally { entry.inlinePrepared = null }
  }

  #refreshFields(id, entry, projectPresentation = false) {
    const fields = entry.instance.editableFields?.() ?? []
    const changed = entry.fields && (fields.length !== entry.fields.length
      || fields.some((field, index) => field.key !== entry.fields[index]?.key || field.element !== entry.fields[index]?.element))
    entry.fields = fields
    for (const field of fields) {
      if (!field?.element || typeof field.key !== 'string' || !field.key) continue
      this.#fieldOwners.set(field.element, {
        blockId: id,
        fieldKey: field.key,
        element: field.element,
        mode: field.mode,
      })
    }
    if (projectPresentation && changed && entry.scope?.active && this.#inlineProjection) {
      this.#inlineProjection.reconcileBlock(id, entry.record, entry.definition, fields, entry.baseContext)
    }
  }

  #applyTunes(entry, record) {
    const style = entry.element?.style
    if (!style) return
    const align = record.tunes?.textAlign
    style.textAlign = ['left', 'center', 'right', 'justify'].includes(align) ? align : ''
  }

  #restore(store, extraEntries) {
    const fresh = this.#stageAll(store, { candidate: false, stageInline: true, generation: store.generation })
    const oldEntries = new Set([...this.#entries.values(), ...extraEntries.values()])

    try {
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#entries = fresh
      for (const entry of fresh.values()) this.#applyPreparedInline(entry)
      for (const entry of fresh.values()) this.#activateEntry(entry)
      for (const entry of fresh.values()) this.#finalizePreparedInline(entry)
    } catch (error) {
      for (const entry of fresh.values()) this.#recoverPreparedInline(entry)
      for (const entry of fresh.values()) this.#destroyEntry(entry)
      throw error
    }

    for (const entry of oldEntries) this.#destroyEntry(entry)
  }

  #destroyEntry(entry) {
    if (!entry) return
    try { this.#discardPreparedInline(entry) } catch {}
    try { entry.scope?.revoke?.() } catch {}
    try { entry.controller?.abort() } catch {}
    try { entry.instance?.destroy?.() } catch {}
    try { entry.element?.remove?.() } catch {}
  }
}
