// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { resolveValidationMode } from '../shared/validationMode.js'
import { uid } from '../shared/uid.js'
import { DocumentSchema } from './DocumentSchema.js'
import { EDITOR_VERSION } from './constants.js'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const VALID_ALIGN = new Set(['left', 'center', 'right', 'justify'])

function cloneTunes(tunes) {
  if (tunes === undefined) return undefined
  if (!tunes || typeof tunes !== 'object' || Array.isArray(tunes)) {
    throw new TypeError('Block tunes must be an object')
  }
  const owned = cloneEditorData(tunes)
  if (owned.textAlign !== undefined && !VALID_ALIGN.has(owned.textAlign)) {
    delete owned.textAlign
  }
  return Object.keys(owned).length ? owned : undefined
}

function cloneInline(inline) {
  if (inline === undefined) return undefined
  if (!inline || typeof inline !== 'object' || Array.isArray(inline)) {
    throw new TypeError('Block inline payload must be an object')
  }
  return cloneEditorData(inline)
}

function sameJson(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right) } catch { return false }
}

function issueReason(error) {
  const message = String(error?.message ?? error)
  return /future data version/i.test(message) ? 'unsupported-version' : 'invalid-data'
}

export class DocumentRuntime {
  #registry
  #schema
  #store
  #history
  #engine
  #projector
  #ownerDocument
  #validationMode
  #documentMode
  #readOnly
  #createId
  #onValidationError
  #richTextNormalizer
  #preservedTime
  #destroyed = false
  #requestSplit
  #requestExit

  /**
   * Create the canonical v2 document runtime.
   * @param {{
   *   registry: any,
   *   data?: unknown,
   *   ownerDocument?: Document,
   *   validationMode?: 'preserve'|'strict',
   *   documentVersionPolicy?: 'preserve'|'strict',
   *   migrations?: any[],
   *   readOnly?: boolean,
   *   createId?: (prefix: string) => string,
   *   projector?: any,
   *   projectorFactory?: (context: {
   *     store: DocumentStore,
   *     activationResolver: (id: string, record: any) => boolean,
   *     contextFactory: (id: string, type: string, signal: AbortSignal) => any,
   *   }) => any,
   *   selection?: any,
   *   onCommit?: (event: any) => void,
   *   onDiagnostic?: (error: unknown) => void,
   *   onValidationError?: (issue: any) => void,
   *   richTextNormalizer?: (html: string) => string,
   *   requestSplit?: (id: string) => void,
   *   requestExit?: (id: string) => void,
   *   history?: { maxStack?: number },
   * }} options
   */
  constructor(options) {
    if (!options?.registry) throw new TypeError('DocumentRuntime requires an ExtensionRegistry')
    this.#registry = options.registry
    this.#ownerDocument = options.ownerDocument ?? globalThis.document
    this.#validationMode = resolveValidationMode(options.validationMode)
    this.#readOnly = options.readOnly === true
    this.#createId = typeof options.createId === 'function'
      ? options.createId
      : prefix => `${prefix}-${uid()}`
    this.#onValidationError = typeof options.onValidationError === 'function'
      ? options.onValidationError
      : null
    this.#requestSplit = typeof options.requestSplit === 'function' ? options.requestSplit : null
    this.#requestExit = typeof options.requestExit === 'function' ? options.requestExit : null
    this.#richTextNormalizer = typeof options.richTextNormalizer === 'function'
      ? options.richTextNormalizer
      : (this.#ownerDocument
          ? html => normalizeRichText(html, this.#ownerDocument)
          : html => String(html ?? ''))

    this.#schema = new DocumentSchema({
      currentVersion: EDITOR_VERSION,
      versionPolicy: options.documentVersionPolicy ?? 'preserve',
      migrations: options.migrations ?? [],
    })

    const initial = this.#ingest(options.data ?? { version: EDITOR_VERSION, blocks: [] })
    this.#documentMode = initial.mode
    this.#preservedTime = initial.time
    this.#store = new DocumentStore(initial.document)
    this.#history = new HistoryStore(options.history)

    const contextFactory = (id, type, signal) => this.#blockContext(id, type, signal)
    const activationResolver = (id, record) => this.#canActivate(id, record)
    this.#projector = options.projectorFactory
      ? options.projectorFactory({
          store: this.#store,
          activationResolver,
          contextFactory,
        })
      : (options.projector ?? null)

    this.#engine = new TransactionEngine({
      store: this.#store,
      history: this.#history,
      projector: this.#projector ?? undefined,
      selection: options.selection,
      onCommit: options.onCommit,
      onDiagnostic: options.onDiagnostic,
    })

    this.#projector?.mount?.(this.#store)
    this.#projector?.setReadOnly?.(this.readOnly)
  }

  get documentMode() {
    return this.#documentMode
  }

  get readOnly() {
    return this.#documentMode === 'preserved' || this.#readOnly
  }

  get canUndo() {
    return this.#documentMode === 'editable' && this.#engine.canUndo
  }

  get canRedo() {
    return this.#documentMode === 'editable' && this.#engine.canRedo
  }

  get version() {
    return this.#store.version
  }

  get(id) {
    return this.#store.get(id)
  }

  list() {
    return this.#store.list()
  }

  activation(id) {
    const record = this.#store.peek(id)
    if (!record) return undefined
    return this.#activationFor(record)
  }

  save() {
    const document = this.#store.export()
    if (this.#documentMode === 'preserved') {
      if (this.#preservedTime !== undefined) document.time = this.#preservedTime
      return document
    }
    document.time = Date.now()
    return document
  }

  insert(type, data, index = this.#store.ids().length) {
    this.#assertWritable()
    const definition = this.#registry.getBlockDefinition(type)
    if (!definition) throw new Error(`Unknown block type: ${type}`)
    const encoded = this.#normalizeLocalData(definition, data === undefined ? definition.schema.createDefault() : data)
    const id = this.#createUniqueBlockId(type)
    const record = {
      id,
      type,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    this.#engine.execute({ origin: 'external', name: 'block.insert' }, tx => {
      tx.insert(index, record)
    })
    return id
  }

  update(id, producer) {
    this.#assertWritable()
    if (typeof producer !== 'function') throw new TypeError('Block update producer must be a function')
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') {
      throw new Error(`Preserved block cannot be updated: ${id}`)
    }
    const definition = this.#registry.getBlockDefinition(current.type)
    if (!definition) throw new Error(`Unknown block type: ${current.type}`)

    const snapshot = cloneEditorData(current)
    const patch = producer(snapshot) ?? {}
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Block update producer must return an object')
    }
    if (Object.hasOwn(patch, 'type') || Object.hasOwn(patch, 'id') || Object.hasOwn(patch, 'inline')) {
      throw new TypeError('Block update cannot change id, type, or inline payload')
    }

    const nextData = Object.hasOwn(patch, 'data') ? patch.data : current.data
    const encoded = this.#normalizeLocalData(definition, nextData)
    const nextTunes = Object.hasOwn(patch, 'tunes')
      ? (patch.tunes === null ? undefined : cloneTunes(patch.tunes))
      : current.tunes

    const next = {
      ...current,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    if (nextTunes === undefined) delete next.tunes
    else next.tunes = nextTunes
    delete next.revision

    if (
      current.dataVersion === next.dataVersion
      && sameJson(current.data, next.data)
      && sameJson(current.tunes, next.tunes)
    ) return

    this.#engine.execute({ origin: 'external', name: 'block.update' }, tx => {
      tx.update(id, next)
    })
  }

  move(id, to) {
    this.#assertWritable()
    this.#engine.execute({ origin: 'external', name: 'block.move' }, tx => {
      tx.move(id, to)
    })
  }

  remove(id) {
    this.#assertWritable()
    const ids = this.#store.ids()
    if (!ids.includes(id)) throw new Error(`Unknown block id: ${id}`)

    this.#engine.execute({ origin: 'external', name: 'block.remove' }, tx => {
      tx.remove(id)
      if (ids.length === 1) {
        const definition = this.#registry.getBlockDefinition(this.#registry.defaultBlockType)
        const encoded = this.#normalizeLocalData(definition, definition.schema.createDefault())
        tx.insert(0, {
          id: this.#createUniqueBlockId(this.#registry.defaultBlockType),
          type: this.#registry.defaultBlockType,
          dataVersion: encoded.dataVersion,
          data: encoded.data,
        })
      }
    })
  }

  convert(id, target) {
    this.#assertWritable()
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') {
      throw new Error(`Preserved block cannot be converted: ${id}`)
    }
    if (!target || typeof target !== 'object' || typeof target.type !== 'string') {
      throw new TypeError('Conversion target requires a type')
    }

    const sourceDefinition = this.#registry.getBlockDefinition(current.type)
    const targetDefinition = this.#registry.getBlockDefinition(target.type)
    if (!targetDefinition) throw new Error(`Unknown block type: ${target.type}`)

    let targetData
    const sourceEmpty = sourceDefinition?.capabilities?.empty?.isEmpty?.(current.data) === true
    if (sourceEmpty) {
      targetData = targetDefinition.schema.createDefault()
    } else {
      const sourceConversion = sourceDefinition?.capabilities?.conversion
      const targetConversion = targetDefinition.capabilities?.conversion
      if (!sourceConversion || !targetConversion) {
        throw new Error(`Block conversion is not supported: ${current.type} -> ${target.type}`)
      }
      const payload = sourceConversion.export(current.data)
      if (!targetConversion.canImport(payload)) {
        throw new Error(`Block conversion payload is not supported by "${target.type}"`)
      }
      targetData = targetConversion.import(payload)
    }

    if (target.toolboxItemId !== undefined) {
      const item = targetDefinition.toolbox?.find(entry => entry.id === target.toolboxItemId)
      if (!item) throw new Error(`Unknown toolbox item "${target.toolboxItemId}" for "${target.type}"`)
      if (item.configure) {
        targetData = item.configure(targetData, this.#dataOperationContext())
      }
    }

    const encoded = this.#normalizeLocalData(targetDefinition, targetData)
    const next = {
      id,
      type: target.type,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    if (current.tunes !== undefined) next.tunes = cloneTunes(current.tunes)

    this.#engine.execute({ origin: 'external', name: 'block.convert' }, tx => {
      tx.update(id, next)
    })
  }

  undo() {
    this.#assertWritable()
    return this.#engine.undo()
  }

  redo() {
    this.#assertWritable()
    return this.#engine.redo()
  }

  clear() {
    this.#assertWritable()
    const definition = this.#registry.getBlockDefinition(this.#registry.defaultBlockType)
    const encoded = this.#normalizeLocalData(definition, definition.schema.createDefault())
    const document = {
      version: EDITOR_VERSION,
      blocks: [{
        id: this.#createUniqueBlockId(this.#registry.defaultBlockType),
        type: this.#registry.defaultBlockType,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }],
    }
    this.#engine.execute({ origin: 'external', name: 'document.clear' }, tx => {
      tx.replace(document)
    })
  }

  render(input) {
    const next = this.#ingest(input)
    const crossingMode = next.mode !== this.#documentMode
    if (crossingMode || this.#documentMode === 'preserved' || next.mode === 'preserved') {
      this.#engine.reset(next.document)
      this.#documentMode = next.mode
      this.#preservedTime = next.time
      this.#projector?.setReadOnly?.(this.readOnly)
      return
    }

    this.#engine.execute({ origin: 'external', name: 'document.render' }, tx => {
      tx.replace(next.document)
    })
    this.#preservedTime = undefined
  }

  setReadOnly(value) {
    if (this.#documentMode === 'preserved' && value === false) {
      throw new Error('Preserved documents are always read-only')
    }
    const next = value === true
    if (next === this.#readOnly) return
    this.#projector?.setReadOnly?.(next)
    this.#readOnly = next
  }

  syncBlockFromProjection(id, operation, metadata = {}) {
    this.#assertWritable()
    if (typeof operation !== 'function') throw new TypeError('DOM mutation operation must be a function')
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') throw new Error(`Preserved block cannot be synchronized: ${id}`)
    const definition = this.#registry.getBlockDefinition(current.type)

    try {
      operation()
      const read = this.#projector?.readBlock?.(id)
      if (!read) throw new Error('Projection reader is unavailable')
      const encoded = this.#normalizeLocalData(definition, read)
      const next = {
        ...current,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }
      delete next.revision
      if (
        current.dataVersion === next.dataVersion
        && sameJson(current.data, next.data)
      ) return
      this.#engine.execute({
        origin: metadata.origin ?? 'native-input',
        name: metadata.name ?? 'native-input',
        historyGroup: metadata.historyGroup,
        coalesce: metadata.coalesce === true,
        sourceBlockId: metadata.preserveSourceProjection === true ? id : undefined,
      }, tx => tx.update(id, next))
    } catch (error) {
      this.#projector?.restore?.(this.#store)
      throw error
    }
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#projector?.destroy?.()
  }

  #ingest(input) {
    const normalized = this.#schema.normalize(input)
    const time = normalized.time
    if (normalized.version !== EDITOR_VERSION) {
      return {
        mode: 'preserved',
        time,
        document: {
          version: normalized.version,
          blocks: cloneEditorData(normalized.blocks),
        },
      }
    }

    const blocks = []
    for (const inputBlock of normalized.blocks) {
      if (!inputBlock || typeof inputBlock !== 'object' || Array.isArray(inputBlock)) {
        throw new TypeError('Document blocks must be objects')
      }
      const block = cloneEditorData(inputBlock)
      if (typeof block.id !== 'string' || !block.id) throw new TypeError('Block id must be a non-empty string')
      if (typeof block.type !== 'string' || !block.type) throw new TypeError('Block type must be a non-empty string')
      if (!Object.hasOwn(block, 'data')) throw new TypeError(`Block "${block.id}" must contain data`)

      const definition = this.#registry.getBlockDefinition(block.type)
      if (!definition) {
        blocks.push(block)
        continue
      }

      try {
        const decoded = this.#normalizeDecodedData(definition, {
          dataVersion: block.dataVersion,
          data: block.data,
        })
        block.dataVersion = decoded.dataVersion
        block.data = decoded.data
        const tunes = cloneTunes(block.tunes)
        if (tunes === undefined) delete block.tunes
        else block.tunes = tunes
        if (block.inline !== undefined) block.inline = cloneInline(block.inline)
        blocks.push(block)
      } catch (error) {
        if (this.#validationMode === 'strict') {
          throw new Error(`Invalid block data for "${block.type}" (${block.id})`, { cause: error })
        }
        this.#reportValidation(block, error)
        blocks.push(block)
      }
    }

    if (blocks.length === 0) {
      const definition = this.#registry.getBlockDefinition(this.#registry.defaultBlockType)
      const encoded = this.#normalizeLocalData(definition, definition.schema.createDefault())
      blocks.push({
        id: this.#createUniqueBlockId(this.#registry.defaultBlockType, blocks),
        type: this.#registry.defaultBlockType,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      })
    }

    return {
      mode: 'editable',
      time: undefined,
      document: {
        version: EDITOR_VERSION,
        blocks,
      },
    }
  }

  #normalizeDecodedData(definition, input) {
    const decoded = definition.schema.decode(input)
    let data = decoded.data
    if (typeof definition.schema.mapRichText === 'function') {
      data = definition.schema.mapRichText(data, html => this.#richTextNormalizer(html))
    }
    return {
      dataVersion: decoded.dataVersion,
      data: definition.schema.encode(data).data,
    }
  }

  #normalizeLocalData(definition, data) {
    if (!definition?.schema) throw new TypeError('Block definition has no schema')
    let encoded = definition.schema.encode(data)
    let canonical = encoded.data
    if (typeof definition.schema.mapRichText === 'function') {
      canonical = definition.schema.mapRichText(canonical, html => this.#richTextNormalizer(html))
      encoded = definition.schema.encode(canonical)
    }
    return encoded
  }

  #activationFor(record) {
    if (this.#documentMode === 'preserved') {
      return { kind: 'preserved', reason: 'unsupported-version' }
    }
    const definition = this.#registry.getBlockDefinition(record.type)
    if (!definition) return { kind: 'preserved', reason: 'unknown-type' }
    try {
      definition.schema.decode({
        dataVersion: record.dataVersion,
        data: record.data,
      })
      return { kind: 'active' }
    } catch (error) {
      return { kind: 'preserved', reason: issueReason(error) }
    }
  }

  #canActivate(_id, record) {
    return this.#activationFor(record).kind === 'active'
  }

  #reportValidation(block, error) {
    if (!this.#onValidationError) return
    const issue = Object.freeze({
      blockId: block.id,
      type: block.type,
      reason: issueReason(error),
    })
    try { this.#onValidationError(issue) } catch {}
  }

  #assertWritable() {
    if (this.#destroyed) throw new Error('DocumentRuntime is destroyed')
    if (this.#documentMode === 'preserved') {
      throw new Error('Preserved documents are not writable')
    }
  }

  #createUniqueBlockId(prefix, additional = []) {
    const occupied = new Set(this.#store ? this.#store.ids() : additional.map(block => block.id))
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = this.#createId(prefix)
      if (typeof id !== 'string' || !id) throw new TypeError('createId() must return a non-empty string')
      if (!occupied.has(id)) return id
    }
    throw new Error('Could not allocate a unique block id')
  }

  #dataOperationContext() {
    return Object.freeze({
      createId: prefix => this.#createId(prefix),
    })
  }

  #blockContext(id, type, signal) {
    return {
      getData: () => {
        const record = this.#store.get(id)
        if (!record || record.type !== type) throw new Error(`Block is no longer active: ${id}`)
        return cloneEditorData(record.data)
      },
      updateData: producer => {
        if (this.readOnly) return
        this.update(id, current => ({
          data: producer(cloneEditorData(current.data)),
        }))
      },
      commitDomMutation: operation => {
        if (this.readOnly) return
        this.syncBlockFromProjection(id, operation, { origin: 'plugin', name: 'plugin.dom-mutation' })
      },
      requestSplit: () => {
        if (!this.readOnly) this.#requestSplit?.(id)
      },
      requestExit: () => {
        if (!this.readOnly) this.#requestExit?.(id)
      },
      createId: prefix => this.#createId(prefix),
      signal,
    }
  }
}
