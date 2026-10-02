// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

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
  #readOnly
  #store = null
  #destroyed = false

  constructor({ container, registry, contextFactory, activationResolver, readOnly = false }) {
    if (!container?.ownerDocument) throw new TypeError('BlockReconciler requires a container')
    if (!registry) throw new TypeError('BlockReconciler requires an ExtensionRegistry')
    if (typeof contextFactory !== 'function') throw new TypeError('BlockReconciler requires contextFactory')
    this.#container = container
    this.#registry = registry
    this.#contextFactory = contextFactory
    this.#activationResolver = typeof activationResolver === 'function'
      ? activationResolver
      : (_id, record) => registry.hasBlock(record.type)
    this.#readOnly = readOnly === true
  }

  mount(store) {
    this.#assertLive()
    const fresh = this.#stageAll(store)
    const previous = this.#entries
    this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
    this.#entries = fresh
    this.#store = store
    for (const entry of previous.values()) this.#destroyEntry(entry)
  }

  getElement(id) {
    return this.#entries.get(id)?.element
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
    return cloneEditorData(entry.instance.read())
  }


  prepare({ store, draft, changes, sourceBlockId }) {
    this.#assertLive()
    this.#store = store
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
          if (before && current) removals.push({ id, entry: current })
          continue
        }

        if (!before || !current) {
          const entry = this.#createEntry(after)
          staged.set(id, entry)
          insertions.push({ id, entry })
          continue
        }

        if (before.type !== after.type) {
          const entry = this.#createEntry(after)
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry })
          continue
        }

        const dataChanged = !sameJson(before.data, after.data)
        if (dataChanged && typeof current.instance.update !== 'function') {
          const entry = this.#createEntry(after)
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry })
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

    const finalOrder = hasStructuralChange(changes) ? draft.ids() : null
    let applied = false

    return {
      apply: () => {
        if (applied) throw new Error('Prepared block projection was already applied')
        const nextEntries = new Map(this.#entries)

        for (const item of updates) {
          if (item.dataChanged && item.id !== sourceBlockId) {
            item.entry.instance.update(item.after.data, item.before.data)
          }
          item.entry.record = item.after
          this.#refreshFields(item.id, item.entry)
          this.#applyTunes(item.entry, item.after)
        }

        for (const item of replacements) {
          item.before.element.replaceWith(item.after.element)
          nextEntries.set(item.id, item.after)
        }

        for (const item of insertions) {
          nextEntries.set(item.id, item.entry)
        }

        for (const item of removals) {
          item.entry.element.remove()
          nextEntries.delete(item.id)
        }

        if (finalOrder) {
          for (const id of finalOrder) {
            const entry = nextEntries.get(id)
            if (!entry) throw new Error(`Projection is missing block entry: ${id}`)
            this.#container.appendChild(entry.element)
          }
        }

        this.#entries = nextEntries
        applied = true

        for (const item of replacements) this.#destroyEntry(item.before)
        for (const item of removals) this.#destroyEntry(item.entry)
      },
      recover: () => {
        this.#restore(store, staged)
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
    this.#container.replaceChildren()
  }

  #assertLive() {
    if (this.#destroyed) throw new Error('BlockReconciler is destroyed')
  }

  #stageAll(source) {
    const staged = new Map()
    try {
      for (const id of source.ids()) {
        const record = source.peek(id)
        if (!record) throw new Error(`Canonical block is missing: ${id}`)
        staged.set(id, this.#createEntry(record))
      }
      return staged
    } catch (error) {
      for (const entry of staged.values()) this.#destroyEntry(entry)
      throw error
    }
  }

  #createEntry(record) {
    const ownerDocument = this.#container.ownerDocument
    const AbortControllerCtor = ownerDocument.defaultView?.AbortController ?? globalThis.AbortController

    if (!this.#registry.hasBlock(record.type) || !this.#activationResolver(record.id, record)) {
      const element = ownerDocument.createElement('div')
      element.className = 'oe-preserved-block'
      element.contentEditable = 'false'
      element.dataset.oePreservedBlock = record.type
      element.textContent = `Unsupported block: ${record.type}`
      const instance = {
        element,
        read: () => cloneEditorData(record.data),
        setReadOnly() {},
        destroy() {},
      }
      return { type: record.type, record, element, instance, controller: null, preserved: true }
    }

    const runtime = this.#registry.getBlockRuntime(record.type)
    if (!runtime) throw new Error(`Missing runtime for block type: ${record.type}`)
    const controller = new AbortControllerCtor()
    const base = this.#contextFactory(record.id, record.type, controller.signal) ?? {}
    const context = Object.freeze({
      ...base,
      ownerDocument,
      signal: controller.signal,
      isReadOnly: () => this.#readOnly,
    })
    const instance = runtime.create(record.data, context)
    if (!instance?.element || typeof instance.read !== 'function' || typeof instance.setReadOnly !== 'function' || typeof instance.destroy !== 'function') {
      controller.abort()
      try { instance?.destroy?.() } catch {}
      throw new TypeError(`Block runtime "${record.type}" returned an invalid instance`)
    }
    const entry = {
      type: record.type,
      record,
      element: instance.element,
      instance,
      controller,
      preserved: false,
    }
    instance.setReadOnly(this.#readOnly)
    this.#refreshFields(record.id, entry)
    this.#applyTunes(entry, record)
    return entry
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
    const fresh = this.#stageAll(store)
    const oldEntries = new Set([...this.#entries.values(), ...extraEntries.values()])
    this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
    this.#entries = fresh
    for (const entry of oldEntries) this.#destroyEntry(entry)
  }

  #destroyEntry(entry) {
    if (!entry) return
    try { entry.controller?.abort() } catch {}
    try { entry.instance?.destroy?.() } catch {}
    try { entry.element?.remove?.() } catch {}
  }
}
