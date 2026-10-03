// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { invokeObserver } from '../shared/invokeObserver.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { getRichTextLogicalLength, remapRichTextReferences, replaceRichTextRange, replaceRichTextReference, scanRichTextPlaceholders, sliceRichTextRange, splitRichTextRange } from '../shared/richTextOperations.js'
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
  #diagnostics

  /**
   * Create the canonical v2 document runtime.
   * @param {{
   *   registry: any,
   *   data?: unknown,
   *   ownerDocument?: Document,
   *   validationMode?: 'preserve'|'strict',
   *   documentVersionPolicy?: 'preserve'|'strict',
   *   migrations?: readonly any[],
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
   *   diagnostics?: import('./types').DiagnosticsSink,
   *   onValidationError?: (issue: any) => void | Promise<void>,
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
    this.#diagnostics = options.diagnostics ?? null
    this.#richTextNormalizer = typeof options.richTextNormalizer === 'function'
      ? options.richTextNormalizer
      : (this.#ownerDocument
          ? html => normalizeRichText(html, this.#ownerDocument)
          : html => String(html ?? ''))

    this.#schema = new DocumentSchema({
      currentVersion: EDITOR_VERSION,
      versionPolicy: options.documentVersionPolicy ?? 'preserve',
      migrations: options.migrations ?? [],
      diagnostics: this.#diagnostics ?? undefined,
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
      diagnostics: this.#diagnostics ?? undefined,
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
    const startedAt = this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    try {
      const document = this.#store.export()
      if (this.#documentMode === 'preserved') {
        if (this.#preservedTime !== undefined) document.time = this.#preservedTime
        return document
      }
      document.time = Date.now()
      return document
    } catch (error) {
      this.#diagnostics?.emit('save.failed', {
        errorName: this.#diagnostics.errorName(error),
      })
      throw error
    } finally {
      if (startedAt && this.#diagnostics) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('saveMs')) {
          this.#diagnostics.emit('save.slow', { durationMs })
        }
      }
    }
  }

  insert(type, data, index = this.#store.ids().length, options = {}) {
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
    const tunes = cloneTunes(options.tunes)
    if (tunes !== undefined) record.tunes = tunes
    const inline = options.inline === undefined ? undefined : this.#normalizeExternalInline(options.inline, { strict: true })
    if (inline !== undefined) record.inline = inline
    this.#engine.execute({ origin: 'external', name: 'block.insert' }, tx => {
      tx.insert(index, record)
    })
    return id
  }


  /**
   * Insert copied external block records in one canonical transaction.
   * Producer ids/revisions are never reused; invalid optional tunes are ignored.
   * @param {string} anchorId
   * @param {unknown[]} inputs
   * @param {{replaceEmpty?:boolean}} [options]
   * @returns {string[]}
   */
  insertExternalBlocks(anchorId,inputs,options={}){
    this.#assertWritable()
    if(!Array.isArray(inputs)||inputs.length===0)return []
    const ids=this.#store.ids()
    const anchorIndex=ids.indexOf(anchorId)
    if(anchorIndex<0)throw new Error(`Unknown block id: ${anchorId}`)

    const reserved=new Set(ids)
    const allocate=prefix=>{
      for(let attempt=0;attempt<1000;attempt++){
        const id=this.#createId(prefix)
        if(typeof id!=='string'||!id)throw new TypeError('createId() must return a non-empty string')
        if(!reserved.has(id)){reserved.add(id);return id}
      }
      throw new Error('Could not allocate a unique pasted block id')
    }

    const records=[]
    for(const raw of inputs){
      if(!raw||typeof raw!=='object'||Array.isArray(raw)){
        throw new TypeError('Clipboard block must contain a type')
      }
      const input=/** @type {Record<string, any>} */(raw)
      if(typeof input.type!=='string'||!input.type){
        throw new TypeError('Clipboard block must contain a type')
      }
      const definition=this.#registry.getBlockDefinition(input.type)
      if(!definition)throw new Error(`Unknown clipboard block type: ${input.type}`)
      const encoded=this.#normalizeDecodedData(definition,{
        dataVersion:input.dataVersion,
        data:input.data,
      })
      const record=/** @type {any} */({
        id:allocate(input.type),
        type:input.type,
        dataVersion:encoded.dataVersion,
        data:encoded.data,
      })
      try{
        const tunes=cloneTunes(input.tunes)
        if(tunes!==undefined)record.tunes=tunes
      }catch{}
      try{
        const inline=this.#normalizeExternalInline(input.inline,{strict:false})
        const filtered=this.#filterInlineForData(definition,encoded.data,inline)
        if(filtered!==undefined)record.inline=filtered
      }catch{}
      records.push(record)
    }

    const replaceEmpty=options.replaceEmpty===true&&this.isEmpty(anchorId)
    const inserted=[]
    this.#engine.execute({origin:'user',name:'clipboard.blocks'},tx=>{
      let offset=1
      let start=0
      if(replaceEmpty){
        const first={...records[0],id:anchorId}
        tx.update(anchorId,first)
        inserted.push(anchorId)
        start=1
      }
      for(let index=start;index<records.length;index++){
        tx.insert(anchorIndex+offset,records[index])
        inserted.push(records[index].id)
        offset++
      }
    })
    return inserted
  }

  isEmpty(id) {
    const current = this.#store.get(id)
    if (!current || this.activation(id)?.kind !== 'active') return false
    const definition = this.#registry.getBlockDefinition(current.type)
    return definition?.capabilities?.empty?.isEmpty?.(current.data) === true
  }

  createDataId(prefix) {
    const id = this.#createId(prefix)
    if (typeof id !== 'string' || !id) throw new TypeError('createId() must return a non-empty string')
    return id
  }

  splitRichTextField(id, fieldKey, range) {
    const current = this.#store.get(id)
    if (!current || this.activation(id)?.kind !== 'active') return null
    const definition = this.#registry.getBlockDefinition(current.type)
    if (!definition?.schema?.mapRichText || !this.#ownerDocument) return null
    let result = null
    definition.schema.mapRichText(current.data, (html, key) => {
      if (key === fieldKey) {
        result = splitRichTextRange(html, current.inline ?? {}, range ?? { start: 0, end: 0 }, this.#ownerDocument)
      }
      return html
    })
    return result
  }

  /**
   * Atomically split one schema-declared rich-text field into the configured
   * default block. A selected range is deleted before the split. Inline
   * widget references are partitioned between the two block-local maps.
   *
   * @param {string} id
   * @param {string} fieldKey
   * @param {{ start: number, end?: number }} range
   * @returns {string | false}
   */
  splitBlock(id, fieldKey, range) {
    this.#assertWritable()
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') throw new Error(`Preserved block cannot be split: ${id}`)
    const sourceDefinition = this.#registry.getBlockDefinition(current.type)
    if (!sourceDefinition?.schema?.mapRichText) return false

    const defaultType = this.#registry.defaultBlockType
    const targetDefinition = this.#registry.getBlockDefinition(defaultType)
    if (!targetDefinition?.schema?.mapRichText) return false

    const inline = cloneInline(current.inline) ?? {}
    const start = Math.max(0, Math.trunc(range?.start) || 0)
    const end = Math.max(start, Math.trunc(range?.end ?? start) || 0)
    let matched = false
    let trailing = ''
    const sourceData = sourceDefinition.schema.mapRichText(current.data, (html, key) => {
      if (key !== fieldKey) return html
      matched = true
      const split = splitRichTextRange(html, inline, { start, end }, this.#ownerDocument)
      trailing = split.after
      return split.before
    })
    if (!matched) return false

    let targetData = targetDefinition.schema.createDefault()
    let targetField = false
    const defaultLiteralIds = this.#scanBlockRichText(targetDefinition, targetData, {}).literals
    const trailingRefs = scanRichTextPlaceholders(trailing, inline, this.#ownerDocument).references
    const targetRemap = new Map()
    const occupied = new Set(defaultLiteralIds)
    for (const inlineId of trailingRefs) {
      const nextId = occupied.has(inlineId)
        ? this.#allocateInlineId(occupied)
        : inlineId
      occupied.add(nextId)
      if (nextId !== inlineId) targetRemap.set(inlineId, nextId)
    }
    if (targetRemap.size) {
      trailing = remapRichTextReferences(trailing, inline, targetRemap, this.#ownerDocument)
    }

    targetData = targetDefinition.schema.mapRichText(targetData, (html) => {
      if (targetField) return html
      targetField = true
      return trailing
    })
    if (!targetField) return false

    const sourceEncoded = this.#normalizeLocalData(sourceDefinition, sourceData)
    const targetEncoded = this.#normalizeLocalData(targetDefinition, targetData)
    const sourceInline = this.#filterInlineForData(sourceDefinition, sourceEncoded.data, inline)
    const targetSourceInline = this.#remapInlinePayload(inline, targetRemap)
    const targetInline = this.#filterInlineForData(targetDefinition, targetEncoded.data, targetSourceInline)
    const newId = this.#createUniqueBlockId(defaultType)
    const sourceRecord = {
      ...current,
      dataVersion: sourceEncoded.dataVersion,
      data: sourceEncoded.data,
    }
    if (sourceInline === undefined) delete sourceRecord.inline
    else sourceRecord.inline = sourceInline
    delete sourceRecord.revision

    const targetRecord = {
      id: newId,
      type: defaultType,
      dataVersion: targetEncoded.dataVersion,
      data: targetEncoded.data,
    }
    if (current.tunes !== undefined) targetRecord.tunes = cloneTunes(current.tunes)
    if (targetInline !== undefined) targetRecord.inline = targetInline

    const index = this.#store.ids().indexOf(id)
    this.#engine.execute({ origin: 'user', name: 'block.split' }, tx => {
      tx.update(id, sourceRecord)
      tx.insert(index + 1, targetRecord)
    })
    return newId
  }

  /**
   * Atomically merge the immediately following source block into target using
   * the block definition's pure merge capability. Cross-block inline id and
   * literal-token collisions are remapped before the data merge.
   *
   * @param {string} targetId
   * @param {string} sourceId
   * @returns {boolean}
   */
  mergeAdjacent(targetId, sourceId) {
    this.#assertWritable()
    const ids = this.#store.ids()
    const targetIndex = ids.indexOf(targetId)
    const sourceIndex = ids.indexOf(sourceId)
    if (targetIndex < 0 || sourceIndex !== targetIndex + 1) return false

    const target = this.#store.get(targetId)
    const source = this.#store.get(sourceId)
    if (!target || !source || target.type !== source.type) return false
    if (this.activation(targetId)?.kind !== 'active' || this.activation(sourceId)?.kind !== 'active') return false
    const definition = this.#registry.getBlockDefinition(target.type)
    const merge = definition?.capabilities?.merge?.merge
    if (typeof merge !== 'function') return false

    const prepared = this.#prepareInlineMerge(definition, target, source)
    const mergedData = merge(prepared.targetData, prepared.sourceData)
    const encoded = this.#normalizeLocalData(definition, mergedData)
    const mergedInline = this.#filterInlineForData(definition, encoded.data, prepared.inline)
    const next = {
      ...target,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    if (mergedInline === undefined) delete next.inline
    else next.inline = mergedInline
    delete next.revision

    this.#engine.execute({ origin: 'user', name: 'block.merge' }, tx => {
      tx.update(targetId, next)
      tx.remove(sourceId)
    })
    return true
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


  removeBlocks(blockIds) {
    this.#assertWritable()
    if (!Array.isArray(blockIds)) throw new TypeError('removeBlocks() requires an array of block ids')
    const ids = this.#store.ids()
    const requested = new Set(blockIds)
    const removals = ids.filter(id => requested.has(id))
    if (!removals.length) return false

    let fallback = null
    if (removals.length === ids.length) {
      const definition = this.#registry.getBlockDefinition(this.#registry.defaultBlockType)
      const encoded = this.#normalizeLocalData(definition, definition.schema.createDefault())
      fallback = {
        id: this.#createUniqueBlockId(this.#registry.defaultBlockType),
        type: this.#registry.defaultBlockType,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }
    }

    this.#engine.execute({ origin: 'user', name: 'blocks.remove' }, tx => {
      for (const id of removals) tx.remove(id)
      if (fallback) tx.insert(0, fallback)
    })
    return fallback?.id ?? true
  }

  replaceBlock(id, type, data) {
    this.#assertWritable()
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    const definition = this.#registry.getBlockDefinition(type)
    if (!definition) throw new Error(`Unknown block type: ${type}`)
    const encoded = this.#normalizeLocalData(definition, data)
    const next = {
      id,
      type,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    if (current.tunes !== undefined) next.tunes = cloneTunes(current.tunes)
    this.#engine.execute({ origin: 'external', name: 'block.replace' }, tx => {
      tx.update(id, next)
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


  /**
   * Atomically convert one logical selection. Partial selections preserve
   * unselected source fragments, while a non-text target replaces the selected
   * interval with one default target block.
   *
   * @param {{anchor:{blockId:string,fieldKey:string,offset:number},focus:{blockId:string,fieldKey:string,offset:number}}} bookmark
   * @param {{type:string,toolboxItemId?:string}} target
   * @returns {{focusId:string,convertedIds:string[]}|false}
   */
  convertLogicalSelection(bookmark,target){
    this.#assertWritable()
    const ordered=this.#orderedLogicalRange(bookmark)
    if(!ordered||!target||typeof target.type!=='string')return false
    const {start,end}=ordered
    const targetDefinition=this.#registry.getBlockDefinition(target.type)
    if(!targetDefinition)return false

    if(
      start.blockId===end.blockId
      && start.fieldKey===end.fieldKey
      && start.offset===end.offset
    ){
      this.convert(start.blockId,target)
      return {focusId:start.blockId,convertedIds:[start.blockId]}
    }

    if(start.blockId===end.blockId){
      return this.#convertSingleBlockSelection(start,end,target,targetDefinition)
    }
    return this.#convertCrossBlockSelection(start,end,target,targetDefinition)
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
    const startedAt = this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    try {
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
    } finally {
      if (startedAt && this.#diagnostics) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('renderMs')) {
          this.#diagnostics.emit('render.slow', { durationMs })
        }
      }
    }
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


  /**
   * Atomically replace a logical selection that may span multiple blocks.
   * The start/end fragments stay canonical; intermediate blocks are removed in
   * the same transaction. Compatible endpoint blocks are merged through the
   * target block's pure MergeCapability.
   *
   * @param {{anchor:{blockId:string,fieldKey:string,offset:number},focus:{blockId:string,fieldKey:string,offset:number}}} bookmark
   * @param {{kind:'text',text:string}|{kind:'html',html:string}} [replacement]
   * @returns {{blockId:string,fieldKey:string,offset:number}|false}
   */

  /**
   * Execute one block slash command as a single canonical history step.
   * The authored /query range is removed from its schema field first. If the
   * remaining source block is empty it is replaced in place; otherwise the
   * source is preserved and the requested block is inserted immediately after.
   *
   * @param {string} blockId
   * @param {string} fieldKey
   * @param {{start:number,end:number}} range
   * @param {{type:string,toolboxItemId?:string}} target
   * @returns {string|false}
   */
  applySlashBlockCommand(blockId, fieldKey, range, target) {
    this.#assertWritable()
    const current = this.#store.get(blockId)
    if (!current || this.activation(blockId)?.kind !== 'active') return false
    if (!target || typeof target.type !== 'string') return false

    const sourceDefinition = this.#registry.getBlockDefinition(current.type)
    const targetDefinition = this.#registry.getBlockDefinition(target.type)
    if (!sourceDefinition?.schema?.mapRichText || !targetDefinition) return false

    const inline = cloneInline(current.inline) ?? {}
    let matched = false
    const sourceData = sourceDefinition.schema.mapRichText(
      cloneEditorData(current.data),
      (html, key) => {
        if (key !== fieldKey) return html
        matched = true
        return replaceRichTextRange(
          html,
          inline,
          range,
          { kind: /** @type {'text'} */ ('text'), text: '' },
          this.#ownerDocument,
        )
      },
    )
    if (!matched) return false

    const sourceEncoded = this.#normalizeLocalData(sourceDefinition, sourceData)
    const sourceInline = this.#filterInlineForData(sourceDefinition, sourceEncoded.data, inline)
    const sourceNext = {
      ...current,
      dataVersion: sourceEncoded.dataVersion,
      data: sourceEncoded.data,
    }
    if (sourceInline === undefined) delete sourceNext.inline
    else sourceNext.inline = sourceInline
    delete sourceNext.revision

    let targetData = targetDefinition.schema.createDefault()
    if (target.toolboxItemId) {
      const item = targetDefinition.toolbox?.find(candidate => candidate.id === target.toolboxItemId)
      if (!item) return false
      if (item.configure) targetData = item.configure(targetData, {
        createId: prefix => this.createDataId(prefix),
      })
    }
    const targetEncoded = this.#normalizeLocalData(targetDefinition, targetData)
    const sourceEmpty = sourceDefinition.capabilities?.empty?.isEmpty?.(sourceEncoded.data) === true

    if (sourceEmpty) {
      const next = {
        id: blockId,
        type: target.type,
        dataVersion: targetEncoded.dataVersion,
        data: targetEncoded.data,
      }
      if (current.tunes !== undefined) next.tunes = cloneTunes(current.tunes)
      this.#engine.execute({ origin: 'user', name: 'slash.block' }, tx => tx.update(blockId, next))
      return blockId
    }

    const id = this.#createUniqueBlockId(target.type)
    const next = {
      id,
      type: target.type,
      dataVersion: targetEncoded.dataVersion,
      data: targetEncoded.data,
    }
    const index = this.#store.ids().indexOf(blockId)
    this.#engine.execute({ origin: 'user', name: 'slash.block' }, tx => {
      tx.update(blockId, sourceNext)
      tx.insert(index + 1, next)
    })
    return id
  }

  replaceLogicalRange(bookmark, replacement = /** @type {{kind:'text',text:string}|{kind:'html',html:string}} */ ({ kind: 'text', text: '' })) {
    this.#assertWritable()
    const ordered = this.#orderedLogicalRange(bookmark)
    if (!ordered) return false
    const { start, end } = ordered

    if (start.blockId === end.blockId) {
      if (start.fieldKey !== end.fieldKey) return false
      this.replaceRichText(
        start.blockId,
        start.fieldKey,
        { start: start.offset, end: end.offset },
        replacement,
      )
      return { blockId: start.blockId, fieldKey: start.fieldKey, offset: start.offset }
    }

    const ids = this.#store.ids()
    const startIndex = ids.indexOf(start.blockId)
    const endIndex = ids.indexOf(end.blockId)
    if (startIndex < 0 || endIndex <= startIndex) return false

    const startCurrent = this.#store.get(start.blockId)
    const endCurrent = this.#store.get(end.blockId)
    if (!startCurrent || !endCurrent) return false
    if (
      this.activation(start.blockId)?.kind !== 'active'
      || this.activation(end.blockId)?.kind !== 'active'
    ) return false

    const startDefinition = this.#registry.getBlockDefinition(startCurrent.type)
    const endDefinition = this.#registry.getBlockDefinition(endCurrent.type)
    if (!startDefinition?.schema?.mapRichText || !endDefinition?.schema?.mapRichText) return false

    const startInline = cloneInline(startCurrent.inline) ?? {}
    const endInline = cloneInline(endCurrent.inline) ?? {}

    let startMatched = false
    const startData = startDefinition.schema.mapRichText(
      cloneEditorData(startCurrent.data),
      (html, key) => {
        if (key !== start.fieldKey) return html
        startMatched = true
        return replaceRichTextRange(
          html,
          startInline,
          { start: start.offset, end: Number.MAX_SAFE_INTEGER },
          replacement,
          this.#ownerDocument,
        )
      },
    )

    let endMatched = false
    const endData = endDefinition.schema.mapRichText(
      cloneEditorData(endCurrent.data),
      (html, key) => {
        if (key !== end.fieldKey) return html
        endMatched = true
        return replaceRichTextRange(
          html,
          endInline,
          { start: 0, end: end.offset },
          { kind: 'text', text: '' },
          this.#ownerDocument,
        )
      },
    )
    if (!startMatched || !endMatched) return false

    const startEncoded = this.#normalizeLocalData(startDefinition, startData)
    const endEncoded = this.#normalizeLocalData(endDefinition, endData)
    const startNext = {
      ...startCurrent,
      dataVersion: startEncoded.dataVersion,
      data: startEncoded.data,
    }
    const startFilteredInline = this.#filterInlineForData(startDefinition, startEncoded.data, startInline)
    if (startFilteredInline === undefined) delete startNext.inline
    else startNext.inline = startFilteredInline
    delete startNext.revision

    const endNext = {
      ...endCurrent,
      dataVersion: endEncoded.dataVersion,
      data: endEncoded.data,
    }
    const endFilteredInline = this.#filterInlineForData(endDefinition, endEncoded.data, endInline)
    if (endFilteredInline === undefined) delete endNext.inline
    else endNext.inline = endFilteredInline
    delete endNext.revision

    let merged = null
    if (startNext.type === endNext.type) {
      const merge = startDefinition.capabilities?.merge?.merge
      if (typeof merge === 'function') {
        const prepared = this.#prepareInlineMerge(startDefinition, startNext, endNext)
        const mergedData = merge(prepared.targetData, prepared.sourceData)
        const encoded = this.#normalizeLocalData(startDefinition, mergedData)
        const inline = this.#filterInlineForData(startDefinition, encoded.data, prepared.inline)
        merged = {
          ...startNext,
          dataVersion: encoded.dataVersion,
          data: encoded.data,
        }
        if (inline === undefined) delete merged.inline
        else merged.inline = inline
        delete merged.revision
      }
    }

    this.#engine.execute({ origin: 'user', name: 'selection.replace' }, tx => {
      tx.update(start.blockId, merged ?? startNext)
      for (let index = startIndex + 1; index < endIndex; index++) tx.remove(ids[index])
      if (merged) tx.remove(end.blockId)
      else tx.update(end.blockId, endNext)
    })

    return { blockId: start.blockId, fieldKey: start.fieldKey, offset: start.offset }
  }

  replaceRichText(blockId, fieldKey, range, replacement) {
    this.#assertWritable()
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Preserved block cannot be updated: ${blockId}`)
    const definition = this.#registry.getBlockDefinition(current.type)
    if (!definition?.schema?.mapRichText) throw new Error(`Block type has no rich-text fields: ${current.type}`)
    const data = cloneEditorData(current.data)
    let matched = false
    const inline = cloneInline(current.inline) ?? {}
    const nextData = definition.schema.mapRichText(data, (html, key) => {
      if (key !== fieldKey) return html
      matched = true
      return replaceRichTextRange(html, inline, range, replacement, this.#ownerDocument)
    })
    if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
    const encoded = this.#normalizeLocalData(definition, nextData)
    const next = { ...current, dataVersion: encoded.dataVersion, data: encoded.data }
    delete next.revision
    this.#engine.execute({ origin: 'plugin', name: 'rich-text.replace' }, tx => tx.update(blockId, next))
  }

  insertInlineWidget(blockId, fieldKey, range, type, data) {
    this.#assertWritable()
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Preserved block cannot be updated: ${blockId}`)
    const blockDefinition = this.#registry.getBlockDefinition(current.type)
    if (!blockDefinition?.schema?.mapRichText) throw new Error(`Block type has no rich-text fields: ${current.type}`)
    const inlineDefinition = this.#registry.getInlineDefinition(type)
    if (!inlineDefinition) throw new Error(`Unknown inline widget type: ${type}`)

    const encodedWidget = inlineDefinition.schema.encode(
      data === undefined ? inlineDefinition.schema.createDefault() : data,
    )
    const inline = cloneInline(current.inline) ?? {}
    const id = this.#createUniqueInlineId(blockDefinition, current.data, inline)
    inline[id] = {
      type,
      dataVersion: encodedWidget.dataVersion,
      data: encodedWidget.data,
    }

    const blockData = cloneEditorData(current.data)
    let matched = false
    const nextData = blockDefinition.schema.mapRichText(blockData, (html, key) => {
      if (key !== fieldKey) return html
      matched = true
      return replaceRichTextRange(
        html,
        inline,
        range,
        { kind: 'inline-reference', id },
        this.#ownerDocument,
      )
    })
    if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
    const encodedBlock = this.#normalizeLocalData(blockDefinition, nextData)
    const next = {
      ...current,
      dataVersion: encodedBlock.dataVersion,
      data: encodedBlock.data,
      inline,
    }
    delete next.revision
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.insert' }, tx => tx.update(blockId, next))
    return id
  }

  updateInlineWidget(blockId, inlineId, producer) {
    this.#assertWritable()
    if (typeof producer !== 'function') throw new TypeError('Inline widget update producer must be a function')
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Preserved block cannot be updated: ${blockId}`)
    const inline = cloneInline(current.inline) ?? {}
    const ref = Object.hasOwn(inline, inlineId) ? inline[inlineId] : undefined
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.type !== 'string') {
      throw new Error(`Unknown inline widget id: ${inlineId}`)
    }
    const definition = this.#registry.getInlineDefinition(ref.type)
    if (!definition) throw new Error(`Unknown inline widget type: ${ref.type}`)
    const decoded = definition.schema.decode({ dataVersion: ref.dataVersion, data: ref.data })
    const nextData = producer(cloneEditorData(decoded.data))
    const encoded = definition.schema.encode(nextData)
    inline[inlineId] = {
      type: ref.type,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    const next = { ...current, inline }
    delete next.revision
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.update' }, tx => tx.update(blockId, next))
  }

  replaceInlineWidgetWithText(blockId, inlineId, text = '') {
    this.#assertWritable()
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') return false
    const inline = cloneInline(current.inline) ?? {}
    if (!Object.hasOwn(inline, inlineId)) return false
    const definition = this.#registry.getBlockDefinition(current.type)
    if (!definition?.schema?.mapRichText) return false
    const scan = this.#scanBlockRichText(definition, current.data, inline)
    if (!scan.references.has(inlineId)) return false

    const data = definition.schema.mapRichText(cloneEditorData(current.data), html => (
      replaceRichTextReference(html, inline, inlineId, String(text ?? ''), this.#ownerDocument)
    ))
    delete inline[inlineId]
    const encoded = this.#normalizeLocalData(definition, data)
    const filtered = this.#filterInlineForData(definition, encoded.data, inline)
    const next = {
      ...current,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }
    if (filtered === undefined) delete next.inline
    else next.inline = filtered
    delete next.revision
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.replace' }, tx => tx.update(blockId, next))
    return true
  }

  removeInlineWidget(blockId, inlineId) {
    return this.replaceInlineWidgetWithText(blockId, inlineId, '')
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
      const projection = this.#projector?.readBlock?.(id)
      if (!projection) throw new Error('Projection reader is unavailable')
      const readData = Object.hasOwn(projection, 'data') ? projection.data : projection
      const encoded = this.#normalizeLocalData(definition, readData)
      const next = {
        ...current,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }
      if (Object.hasOwn(projection, 'inline')) {
        const nextInline = projection.inline === undefined ? undefined : cloneInline(projection.inline)
        if (nextInline === undefined) delete next.inline
        else next.inline = nextInline
      }
      delete next.revision
      if (
        current.dataVersion === next.dataVersion
        && sameJson(current.data, next.data)
        && sameJson(current.inline, next.inline)
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
        if (block.inline !== undefined) block.inline = this.#normalizeExternalInline(block.inline, { strict: this.#validationMode === 'strict' })
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
    invokeObserver(this.#onValidationError, [issue], observerError => {
      this.#diagnostics?.emit('command.failed', {
        operation: 'onValidationError',
        errorName: this.#diagnostics.errorName(observerError),
      })
    })
  }



  #richTextFields(definition,data,inline){
    const fields=[]
    if(typeof definition?.schema?.mapRichText!=='function')return fields
    definition.schema.mapRichText(cloneEditorData(data),(html,key)=>{
      fields.push({
        key,
        html,
        length:getRichTextLogicalLength(html,inline,this.#ownerDocument),
      })
      return html
    })
    return fields
  }

  #sliceSelection(record,start,end){
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition?.schema?.mapRichText)return null
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    if(!fields.length)return null

    const sliceField=(fieldKey,range)=>{
      const field=fields.find(item=>item.key===fieldKey)
      if(!field)return null
      return sliceRichTextRange(field.html,inline,range,this.#ownerDocument)
    }

    const capability=definition.capabilities?.selectionSlice
    if(capability?.slice){
      const result=capability.slice(
        cloneEditorData(record.data),
        {fieldKey:start.fieldKey,offset:start.offset},
        {fieldKey:end.fieldKey,offset:end.offset},
        {
          createId:prefix=>this.createDataId(prefix),
          sliceField,
        },
      )
      if(!result)return null
      return {
        definition,
        inline,
        before:result.before,
        selected:result.selected,
        after:result.after,
      }
    }

    if(fields.length!==1||start.fieldKey!==fields[0].key||end.fieldKey!==fields[0].key)return null
    const field=fields[0]
    const from=Math.max(0,Math.min(start.offset,field.length))
    const to=Math.max(from,Math.min(end.offset,field.length))
    if(to<=from)return null
    const sliced=sliceRichTextRange(field.html,inline,{start:from,end:to},this.#ownerDocument)
    const withField=html=>definition.schema.mapRichText(
      cloneEditorData(record.data),
      (value,key)=>key===field.key?html:value,
    )
    return {
      definition,
      inline,
      before:from>0?withField(sliced.before):null,
      selected:{kind:/** @type {'rich-text'} */('rich-text'),data:{text:sliced.selected}},
      after:to<field.length?withField(sliced.after):null,
    }
  }

  #endpointSelection(record,point,side){
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition?.schema?.mapRichText)return null
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    if(!fields.length)return null
    if(side==='first'){
      const last=fields[fields.length-1]
      return this.#sliceSelection(record,point,{fieldKey:last.key,offset:last.length})
    }
    const first=fields[0]
    return this.#sliceSelection(record,{fieldKey:first.key,offset:0},point)
  }

  #targetDataFromPayload(targetDefinition,payload,target){
    let data
    const conversion=targetDefinition.capabilities?.conversion
    if(payload&&conversion?.canImport?.(payload)){
      data=conversion.import(payload)
    }else{
      data=targetDefinition.schema.createDefault()
    }
    if(target.toolboxItemId!==undefined){
      const item=targetDefinition.toolbox?.find(entry=>entry.id===target.toolboxItemId)
      if(!item)throw new Error(`Unknown toolbox item "${target.toolboxItemId}" for "${target.type}"`)
      if(item.configure)data=item.configure(data,this.#dataOperationContext())
    }
    return data
  }

  #recordFromData(id,type,definition,data,tunes,inlineSource){
    const encoded=this.#normalizeLocalData(definition,data)
    const record={id,type,dataVersion:encoded.dataVersion,data:encoded.data}
    if(tunes!==undefined)record.tunes=cloneTunes(tunes)
    const inline=this.#filterInlineForData(definition,encoded.data,inlineSource)
    if(inline!==undefined)record.inline=inline
    return record
  }

  #payloadHasContent(payload){
    if(!payload||payload.kind!=='rich-text'||typeof payload.data?.text!=='string')return true
    return getRichTextLogicalLength(payload.data.text,{},this.#ownerDocument)>0
  }

  #convertSingleBlockSelection(start,end,target,targetDefinition){
    const current=this.#store.get(start.blockId)
    if(!current||this.activation(start.blockId)?.kind!=='active')return false
    const sliced=this.#sliceSelection(current,start,end)
    if(!sliced||!this.#payloadHasContent(sliced.selected))return false

    const targetData=this.#targetDataFromPayload(targetDefinition,sliced.selected,target)
    const sourceDefinition=sliced.definition
    const sourceInline=sliced.inline
    const index=this.#store.ids().indexOf(current.id)
    const convertedIds=[]
    let focusId

    this.#engine.execute({origin:'user',name:'selection.convert'},tx=>{
      if(sliced.before){
        const before=this.#recordFromData(
          current.id,current.type,sourceDefinition,sliced.before,current.tunes,sourceInline,
        )
        tx.update(current.id,before)

        const targetId=this.#createUniqueBlockId(target.type)
        const targetRecord=this.#recordFromData(
          targetId,target.type,targetDefinition,targetData,current.tunes,sourceInline,
        )
        tx.insert(index+1,targetRecord)
        convertedIds.push(targetId)
        focusId=targetId

        if(sliced.after){
          const afterId=this.#createUniqueBlockId(current.type)
          const after=this.#recordFromData(
            afterId,current.type,sourceDefinition,sliced.after,current.tunes,sourceInline,
          )
          tx.insert(index+2,after)
        }
      }else{
        const targetRecord=this.#recordFromData(
          current.id,target.type,targetDefinition,targetData,current.tunes,sourceInline,
        )
        tx.update(current.id,targetRecord)
        convertedIds.push(current.id)
        focusId=current.id

        if(sliced.after){
          const afterId=this.#createUniqueBlockId(current.type)
          const after=this.#recordFromData(
            afterId,current.type,sourceDefinition,sliced.after,current.tunes,sourceInline,
          )
          tx.insert(index+1,after)
        }
      }
    })
    return focusId?{focusId,convertedIds}:false
  }

  #convertCrossBlockSelection(start,end,target,targetDefinition){
    const ids=this.#store.ids()
    const firstIndex=ids.indexOf(start.blockId)
    const lastIndex=ids.indexOf(end.blockId)
    if(firstIndex<0||lastIndex<=firstIndex)return false
    const first=this.#store.get(start.blockId)
    const last=this.#store.get(end.blockId)
    if(!first||!last)return false

    const firstSlice=this.#endpointSelection(first,start,'first')
    const lastSlice=this.#endpointSelection(last,end,'last')
    if(!firstSlice||!lastSlice)return false

    const targetConversion=targetDefinition.capabilities?.conversion
    const probe={kind:/** @type {'rich-text'} */('rich-text'),data:{text:''}}
    const textTarget=targetConversion?.canImport?.(probe)===true

    if(!textTarget){
      const targetData=this.#targetDataFromPayload(targetDefinition,null,target)
      const targetId=this.#createUniqueBlockId(target.type)
      this.#engine.execute({origin:'user',name:'selection.convert'},tx=>{
        if(firstSlice.before){
          tx.update(first.id,this.#recordFromData(
            first.id,first.type,firstSlice.definition,firstSlice.before,first.tunes,firstSlice.inline,
          ))
        }else{
          tx.remove(first.id)
        }

        for(let index=firstIndex+1;index<lastIndex;index++){
          const id=ids[index]
          if(tx.get(id))tx.remove(id)
        }

        if(lastSlice.after){
          tx.update(last.id,this.#recordFromData(
            last.id,last.type,lastSlice.definition,lastSlice.after,last.tunes,lastSlice.inline,
          ))
        }else if(tx.get(last.id)){
          tx.remove(last.id)
        }

        const live=tx.list()
        let insertAt
        if(firstSlice.before){
          insertAt=live.findIndex(record=>record.id===first.id)+1
        }else if(lastSlice.after){
          insertAt=live.findIndex(record=>record.id===last.id)
        }else{
          insertAt=Math.min(firstIndex,live.length)
        }
        tx.insert(insertAt,this.#recordFromData(
          targetId,target.type,targetDefinition,targetData,first.tunes,{},
        ))
      })
      return {focusId:targetId,convertedIds:[targetId]}
    }

    /** @type {Array<any>} */
    const pieces=[]
    if(this.#payloadHasContent(firstSlice.selected)){
      pieces.push({
        original:first,
        payload:firstSlice.selected,
        inline:firstSlice.inline,
        position:'first',
      })
    }
    for(let index=firstIndex+1;index<lastIndex;index++){
      const record=this.#store.get(ids[index])
      if(!record||this.activation(record.id)?.kind!=='active')return false
      const definition=this.#registry.getBlockDefinition(record.type)
      const conversion=definition?.capabilities?.conversion
      if(!conversion)return false
      const payload=conversion.export(record.data)
      if(!targetConversion?.canImport?.(payload))return false
      pieces.push({original:record,payload,inline:cloneInline(record.inline)??{},position:'middle'})
    }
    if(this.#payloadHasContent(lastSlice.selected)){
      pieces.push({
        original:last,
        payload:lastSlice.selected,
        inline:lastSlice.inline,
        position:'last',
      })
    }
    if(!pieces.length)return false

    for(const piece of pieces){
      if(!targetConversion?.canImport?.(piece.payload))return false
      piece.data=this.#targetDataFromPayload(targetDefinition,piece.payload,target)
    }

    const convertedIds=[]
    let focusId=null
    this.#engine.execute({origin:'user',name:'selection.convert'},tx=>{
      if(firstSlice.before){
        tx.update(first.id,this.#recordFromData(
          first.id,first.type,firstSlice.definition,firstSlice.before,first.tunes,firstSlice.inline,
        ))
      }

      for(const piece of pieces){
        let id=piece.original.id
        let insert=false
        if(piece.position==='first'&&firstSlice.before){
          id=this.#createUniqueBlockId(target.type)
          insert=true
        }else if(piece.position==='last'&&lastSlice.after){
          id=this.#createUniqueBlockId(target.type)
          insert=true
        }

        const record=this.#recordFromData(
          id,target.type,targetDefinition,piece.data,piece.original.tunes,piece.inline,
        )
        if(insert){
          const live=tx.list()
          const anchorId=piece.position==='first'?first.id:last.id
          const anchor=live.findIndex(item=>item.id===anchorId)
          tx.insert(piece.position==='first'?anchor+1:anchor,record)
        }else{
          tx.update(piece.original.id,record)
        }
        convertedIds.push(id)
        focusId=id
      }

      if(lastSlice.after){
        tx.update(last.id,this.#recordFromData(
          last.id,last.type,lastSlice.definition,lastSlice.after,last.tunes,lastSlice.inline,
        ))
      }
    })
    return focusId?{focusId,convertedIds}:false
  }

  #orderedLogicalRange(bookmark) {
    const anchor = bookmark?.anchor
    const focus = bookmark?.focus
    if (!anchor || !focus) return null
    const ids = this.#store.ids()
    const anchorBlock = ids.indexOf(anchor.blockId)
    const focusBlock = ids.indexOf(focus.blockId)
    if (anchorBlock < 0 || focusBlock < 0) return null

    const compare = (left, right, leftIndex, rightIndex) => {
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
      const record = this.#store.get(left.blockId)
      if (!record) return 0
      const definition = this.#registry.getBlockDefinition(record.type)
      const fields = []
      definition?.schema?.mapRichText?.(cloneEditorData(record.data), (html, key) => {
        fields.push(key)
        return html
      })
      const leftField = fields.indexOf(left.fieldKey)
      const rightField = fields.indexOf(right.fieldKey)
      if (leftField !== rightField) return leftField - rightField
      return (Number(left.offset) || 0) - (Number(right.offset) || 0)
    }

    const direction = compare(anchor, focus, anchorBlock, focusBlock)
    const first = direction <= 0 ? anchor : focus
    const last = direction <= 0 ? focus : anchor
    return {
      start: {
        blockId: first.blockId,
        fieldKey: first.fieldKey,
        offset: Math.max(0, Math.trunc(first.offset) || 0),
      },
      end: {
        blockId: last.blockId,
        fieldKey: last.fieldKey,
        offset: Math.max(0, Math.trunc(last.offset) || 0),
      },
    }
  }

  #assertWritable() {
    if (this.#destroyed) throw new Error('DocumentRuntime is destroyed')
    if (this.#documentMode === 'preserved') {
      throw new Error('Preserved documents are not writable')
    }
  }

  #normalizeExternalInline(value, { strict }) {
    const source = cloneInline(value)
    if (source === undefined) return undefined
    /** @type {Record<string, import('../shared/documentTypes').EditorInlineWidget>} */
    const result = {}
    for (const [id, raw] of Object.entries(source)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.type !== 'string') {
        if (strict) throw new TypeError(`Invalid inline widget entry: ${id}`)
        result[id] = raw
        continue
      }
      const definition = this.#registry.getInlineDefinition(raw.type)
      if (!definition) {
        result[id] = raw
        continue
      }
      try {
        const decoded = definition.schema.decode({ dataVersion: raw.dataVersion, data: raw.data })
        result[id] = { type: raw.type, dataVersion: decoded.dataVersion, data: decoded.data }
      } catch (error) {
        if (strict) throw error
        result[id] = raw
      }
    }
    return Object.keys(result).length ? result : undefined
  }

  #scanBlockRichText(definition, data, inline) {
    const references = new Set()
    const literals = new Set()
    if (typeof definition?.schema?.mapRichText !== 'function') return { references, literals }
    definition.schema.mapRichText(data, html => {
      const scan = scanRichTextPlaceholders(html, inline, this.#ownerDocument)
      for (const id of scan.references) references.add(id)
      for (const id of scan.literals) literals.add(id)
      return html
    })
    return { references, literals }
  }

  #filterInlineForData(definition, data, inline) {
    if (!inline || typeof inline !== 'object' || Array.isArray(inline)) return undefined
    const { references } = this.#scanBlockRichText(definition, data, inline)
    const result = {}
    for (const id of references) {
      if (Object.hasOwn(inline, id)) result[id] = cloneEditorData(inline[id])
    }
    return Object.keys(result).length ? result : undefined
  }

  #remapInlinePayload(inline, remap) {
    const result = {}
    for (const [id, value] of Object.entries(inline ?? {})) {
      result[remap.get(id) ?? id] = cloneEditorData(value)
    }
    return result
  }

  #remapBlockRichText(definition, data, inline, remap) {
    if (!remap.size || typeof definition?.schema?.mapRichText !== 'function') return cloneEditorData(data)
    return definition.schema.mapRichText(data, html => (
      remapRichTextReferences(html, inline, remap, this.#ownerDocument)
    ))
  }

  #allocateInlineId(reserved) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = this.#createId('inline')
      if (typeof id !== 'string' || !id) throw new TypeError('createId() must return a non-empty string')
      if (!reserved.has(id)) return id
    }
    throw new Error('Could not allocate a unique inline widget id')
  }

  #prepareInlineMerge(definition, target, source) {
    const targetInline = cloneInline(target.inline) ?? {}
    const sourceInline = cloneInline(source.inline) ?? {}
    const targetScan = this.#scanBlockRichText(definition, target.data, targetInline)
    const sourceScan = this.#scanBlockRichText(definition, source.data, sourceInline)
    const reserved = new Set([...targetScan.literals, ...sourceScan.literals])

    const targetRemap = new Map()
    for (const id of targetScan.references) {
      if (!Object.hasOwn(targetInline, id)) continue
      const next = reserved.has(id) ? this.#allocateInlineId(reserved) : id
      reserved.add(next)
      if (next !== id) targetRemap.set(id, next)
    }

    const sourceRemap = new Map()
    for (const id of sourceScan.references) {
      if (!Object.hasOwn(sourceInline, id)) continue
      const next = reserved.has(id) ? this.#allocateInlineId(reserved) : id
      reserved.add(next)
      if (next !== id) sourceRemap.set(id, next)
    }

    const targetData = this.#remapBlockRichText(definition, target.data, targetInline, targetRemap)
    const sourceData = this.#remapBlockRichText(definition, source.data, sourceInline, sourceRemap)
    const inline = {}
    for (const id of targetScan.references) {
      if (Object.hasOwn(targetInline, id)) inline[targetRemap.get(id) ?? id] = cloneEditorData(targetInline[id])
    }
    for (const id of sourceScan.references) {
      if (Object.hasOwn(sourceInline, id)) inline[sourceRemap.get(id) ?? id] = cloneEditorData(sourceInline[id])
    }
    return { targetData, sourceData, inline }
  }

  #createUniqueInlineId(blockDefinition, data, inline) {
    const reserved = new Set(Object.keys(inline))
    if (typeof blockDefinition.schema.mapRichText === 'function') {
      const owned = cloneEditorData(data)
      blockDefinition.schema.mapRichText(owned, html => {
        for (const match of String(html ?? '').matchAll(/\{\{([A-Za-z0-9_-]+)\}\}/g)) {
          reserved.add(match[1])
        }
        return html
      })
    }
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = this.#createId('inline')
      if (typeof id !== 'string' || !id) throw new TypeError('createId() must return a non-empty string')
      if (!reserved.has(id)) return id
    }
    throw new Error('Could not allocate a unique inline widget id')
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
      createInlineWidgetContext: (fieldKey, inlineId, inlineType, inlineSignal) => ({
        id: inlineId,
        blockId: id,
        fieldKey,
        signal: inlineSignal,
        getData: () => {
          const record = this.#store.get(id)
          const ref = record?.inline?.[inlineId]
          if (!record || record.type !== type || !ref || ref.type !== inlineType) {
            throw new Error(`Inline widget is no longer active: ${inlineId}`)
          }
          const definition = this.#registry.getInlineDefinition(inlineType)
          if (!definition) throw new Error(`Unknown inline widget type: ${inlineType}`)
          return cloneEditorData(definition.schema.decode({
            dataVersion: ref.dataVersion,
            data: ref.data,
          }).data)
        },
        updateData: producer => {
          if (this.readOnly) return
          this.updateInlineWidget(id, inlineId, producer)
        },
        commitDomMutation: operation => {
          if (this.readOnly || typeof operation !== 'function') return
          this.syncBlockFromProjection(id, operation, {
            origin: 'plugin',
            name: 'inline-widget.dom-mutation',
            preserveSourceProjection: true,
          })
        },
        isReadOnly: () => this.readOnly,
      }),
      signal,
    }
  }
}
