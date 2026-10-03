// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { decodeCurrentBlock, decodeCurrentDocument, decodeCurrentInlineMap } from '../shared/DocumentSchema.js'
import { DOCUMENT_FORMAT_VERSION } from '../shared/documentFormat.js'
import { invokeObserver } from '../shared/invokeObserver.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { getRichTextLogicalLength, replaceRichTextRange, replaceRichTextReference, scanRichTextPlaceholders, sliceRichTextRange, splitRichTextRange } from '../shared/richTextOperations.js'
import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
  prepareCanonicalInlineMerge,
  remapCanonicalFragment,
  scanCanonicalRichText,
} from './CanonicalTransforms.js'
import { uid } from '../shared/uid.js'
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
  if (error instanceof RangeError && /document version/i.test(message)) return 'unsupported-document-version'
  if (error instanceof RangeError && /data version/i.test(message)) return 'unsupported-data-version'
  return error instanceof TypeError ? 'invalid-input' : 'invalid-data'
}

export class DocumentRuntime {
  #registry
  #store
  #history
  #engine
  #projector
  #ownerDocument
  #readOnly
  #createId
  #allocateId
  #onValidationError
  #richTextNormalizer
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
    this.#readOnly = options.readOnly === true
    this.#createId = typeof options.createId === 'function'
      ? options.createId
      : prefix => `${prefix}-${uid()}`
    this.#allocateId = createSessionIdAllocator(this.#createId)
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

    const initial = options.data === undefined ? this.#createNewDocument() : this.#ingest(options.data)
    this.#store = new DocumentStore(initial)
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

  get readOnly() {
    return this.#readOnly
  }

  get canUndo() {
    return this.#engine.canUndo
  }

  get canRedo() {
    return this.#engine.canRedo
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
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      const document = this.#store.export()
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
    const id = this.#createUniqueBlockId(type)
    const inline = options.inline === undefined ? undefined : this.#normalizeExternalInline(options.inline)
    const record = this.#recordFromData(
      id,
      type,
      definition,
      data === undefined ? definition.schema.createDefault() : data,
      options.tunes,
      inline,
    )
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
    const allocate=prefix=>this.#allocateId(prefix,reserved)
    const records=[]
    for(const raw of inputs){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Clipboard block must contain a type')
      const input=/** @type {Record<string, any>} */(raw)
      if(typeof input.type!=='string'||!input.type)throw new TypeError('Clipboard block must contain a type')
      const candidate={id:allocate(input.type),type:input.type,dataVersion:input.dataVersion,data:input.data}
      if(Object.hasOwn(input,'tunes'))candidate.tunes=input.tunes
      if(Object.hasOwn(input,'inline'))candidate.inline=input.inline
      const record=decodeCurrentBlock(candidate,{
        getBlockSchema:type=>this.#registry.getBlockDefinition(type)?.schema,
        getInlineSchema:type=>this.#registry.getInlineDefinition(type)?.schema,
      })
      const definition=this.#registry.getBlockDefinition(record.type)
      records.push(definition
        ? this.#recordFromData(
            record.id, record.type, definition, record.data, record.tunes, record.inline,
          )
        : record)
    }
    const replaceEmpty=options.replaceEmpty===true&&this.isEmpty(anchorId)
    const inserted=[]
    this.#engine.execute({origin:'user',name:'clipboard.blocks'},tx=>{
      let offset=1,start=0
      if(replaceEmpty){
        const first={...records[0],id:anchorId}
        tx.update(anchorId,first);inserted.push(anchorId);start=1
      }
      for(let index=start;index<records.length;index++){
        tx.insert(anchorIndex+offset,records[index]);inserted.push(records[index].id);offset++
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
    return this.#allocateId(prefix)
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
    if (this.activation(id)?.kind !== 'active') throw new Error(`Unregistered block cannot be split: ${id}`)
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
    const defaultTokens = this.#scanBlockRichText(targetDefinition, targetData, {})
    const remappedTrailing = remapCanonicalFragment({
      html: trailing,
      inline,
      reservedIds: [...defaultTokens.references, ...defaultTokens.literals],
      ownerDocument: this.#ownerDocument,
      allocateInlineId: reserved => this.#allocateInlineId(reserved),
    })
    trailing = remappedTrailing.html

    targetData = targetDefinition.schema.mapRichText(targetData, (html) => {
      if (targetField) return html
      targetField = true
      return trailing
    })
    if (!targetField) return false

    const newId = this.#createUniqueBlockId(defaultType)
    const sourceRecord = this.#recordFromData(
      current.id, current.type, sourceDefinition, sourceData, current.tunes, inline,
    )
    const targetRecord = this.#recordFromData(
      newId, defaultType, targetDefinition, targetData, current.tunes, remappedTrailing.inline,
    )

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
    const next = this.#recordFromData(
      target.id, target.type, definition, mergedData, target.tunes, prepared.inline,
    )

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
      throw new Error(`Unregistered block cannot be updated: ${id}`)
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
    const nextTunes = Object.hasOwn(patch, 'tunes')
      ? (patch.tunes === null ? undefined : patch.tunes)
      : current.tunes
    const next = this.#recordFromData(
      id, current.type, definition, nextData, nextTunes, current.inline,
    )

    if (
      current.dataVersion === next.dataVersion
      && sameJson(current.data, next.data)
      && sameJson(current.tunes, next.tunes)
      && sameJson(current.inline, next.inline)
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
        const type = this.#registry.defaultBlockType
        const definition = this.#registry.getBlockDefinition(type)
        tx.insert(0, this.#recordFromData(
          this.#createUniqueBlockId(type),
          type,
          definition,
          definition.schema.createDefault(),
          undefined,
          undefined,
        ))
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
      const type = this.#registry.defaultBlockType
      const definition = this.#registry.getBlockDefinition(type)
      fallback = this.#recordFromData(
        this.#createUniqueBlockId(type),
        type,
        definition,
        definition.schema.createDefault(),
        undefined,
        undefined,
      )
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
    const next = this.#recordFromData(
      id, type, definition, data, current.tunes, current.inline,
    )
    this.#engine.execute({ origin: 'external', name: 'block.replace' }, tx => {
      tx.update(id, next)
    })
  }

  convert(id, target) {
    this.#assertWritable()
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') {
      throw new Error(`Unregistered block cannot be converted: ${id}`)
    }
    if (!target || typeof target !== 'object' || typeof target.type !== 'string') {
      throw new TypeError('Conversion target requires a type')
    }

    const sourceDefinition = this.#registry.getBlockDefinition(current.type)
    const targetDefinition = this.#registry.getBlockDefinition(target.type)
    if (!targetDefinition) throw new Error(`Unknown block type: ${target.type}`)

    let targetData
    let sourcePayload = null
    const sourceEmpty = sourceDefinition?.capabilities?.empty?.isEmpty?.(current.data) === true
    if (sourceEmpty) {
      targetData = targetDefinition.schema.createDefault()
    } else {
      const sourceConversion = sourceDefinition?.capabilities?.conversion
      const targetConversion = targetDefinition.capabilities?.conversion
      if (!sourceConversion || !targetConversion) {
        throw new Error(`Block conversion is not supported: ${current.type} -> ${target.type}`)
      }
      sourcePayload = sourceConversion.export(current.data)
      if (!targetConversion.canImport(sourcePayload)) {
        throw new Error(`Block conversion payload is not supported by "${target.type}"`)
      }
      targetData = targetConversion.import(sourcePayload)
    }

    if (target.toolboxItemId !== undefined) {
      const item = targetDefinition.toolbox?.find(entry => entry.id === target.toolboxItemId)
      if (!item) throw new Error(`Unknown toolbox item "${target.toolboxItemId}" for "${target.type}"`)
      if (item.configure) {
        targetData = item.configure(targetData, this.#dataOperationContext())
      }
    }

    const next = this.#recordFromData(
      id, target.type, targetDefinition, targetData, current.tunes, current.inline,
    )
    this.#assertConversionInlinePreserved(
      sourcePayload,current.inline,targetDefinition,next,
    )

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
    const type = this.#registry.defaultBlockType
    const definition = this.#registry.getBlockDefinition(type)
    const document = {
      version: DOCUMENT_FORMAT_VERSION,
      blocks: [this.#recordFromData(
        this.#createUniqueBlockId(type),
        type,
        definition,
        definition.schema.createDefault(),
        undefined,
        undefined,
      )],
    }
    this.#engine.execute({ origin: 'external', name: 'document.clear' }, tx => {
      tx.replace(document)
    })
  }

  render(input) {
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      const next = this.#ingest(input)
      this.#engine.execute({ origin: 'external', name: 'document.render' }, tx => {
        tx.replace(next)
      })
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

    const sourceNext = this.#recordFromData(
      current.id, current.type, sourceDefinition, sourceData, current.tunes, inline,
    )

    let targetData = targetDefinition.schema.createDefault()
    if (target.toolboxItemId) {
      const item = targetDefinition.toolbox?.find(candidate => candidate.id === target.toolboxItemId)
      if (!item) return false
      if (item.configure) targetData = item.configure(targetData, {
        createId: prefix => this.createDataId(prefix),
      })
    }
    const sourceEmpty = sourceDefinition.capabilities?.empty?.isEmpty?.(sourceNext.data) === true

    if (sourceEmpty) {
      const next = this.#recordFromData(
        blockId, target.type, targetDefinition, targetData, current.tunes, undefined,
      )
      this.#engine.execute({ origin: 'user', name: 'slash.block' }, tx => tx.update(blockId, next))
      return blockId
    }

    const id = this.#createUniqueBlockId(target.type)
    const next = this.#recordFromData(
      id, target.type, targetDefinition, targetData, undefined, undefined,
    )
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

    const startNext = this.#recordFromData(
      startCurrent.id, startCurrent.type, startDefinition, startData, startCurrent.tunes, startInline,
    )
    const endNext = this.#recordFromData(
      endCurrent.id, endCurrent.type, endDefinition, endData, endCurrent.tunes, endInline,
    )

    let merged = null
    if (startNext.type === endNext.type) {
      const merge = startDefinition.capabilities?.merge?.merge
      if (typeof merge === 'function') {
        const prepared = this.#prepareInlineMerge(startDefinition, startNext, endNext)
        const mergedData = merge(prepared.targetData, prepared.sourceData)
        merged = this.#recordFromData(
          startNext.id,
          startNext.type,
          startDefinition,
          mergedData,
          startNext.tunes,
          prepared.inline,
        )
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
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Unregistered block cannot be updated: ${blockId}`)
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
    const next = this.#recordFromData(
      current.id, current.type, definition, nextData, current.tunes, inline,
    )
    this.#engine.execute({ origin: 'plugin', name: 'rich-text.replace' }, tx => tx.update(blockId, next))
  }

  replaceRichTextWithInlineSegments(blockId, fieldKey, range, segments) {
    this.#assertWritable()
    if (!Array.isArray(segments) || segments.length === 0) return false
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') {
      throw new Error(`Unregistered block cannot be updated: ${blockId}`)
    }
    const blockDefinition = this.#registry.getBlockDefinition(current.type)
    if (!blockDefinition?.schema?.mapRichText) {
      throw new Error(`Block type has no rich-text fields: ${current.type}`)
    }

    const defaultType = this.#registry.defaultBlockType
    const defaultDefinition = this.#registry.getBlockDefinition(defaultType)
    const inline = cloneInline(current.inline) ?? {}
    const reservedInline = new Set(Object.keys(inline))
    for (const id of this.#scanBlockRichText(blockDefinition, current.data, inline).literals) {
      reservedInline.add(id)
    }
    if (defaultDefinition?.schema?.mapRichText) {
      for (const id of this.#scanBlockRichText(
        defaultDefinition,
        defaultDefinition.schema.createDefault(),
        {},
      ).literals) reservedInline.add(id)
    }

    const lines = [[]]
    for (const raw of segments) {
      if (!raw || typeof raw !== 'object') throw new TypeError('Inline paste segment must be an object')
      if (raw.kind === 'text') {
        const parts = String(raw.text ?? '').split(/\r\n?|\n/)
        for (let index = 0; index < parts.length; index++) {
          if (parts[index]) lines.at(-1).push({ kind: 'text', text: parts[index] })
          if (index < parts.length - 1) lines.push([])
        }
        continue
      }
      if (raw.kind !== 'widget' || typeof raw.type !== 'string' || !raw.type) {
        throw new TypeError('Inline paste segment must be text or widget')
      }
      const definition = this.#registry.getInlineDefinition(raw.type)
      if (!definition) throw new Error(`Unknown inline widget type: ${raw.type}`)
      const encoded = definition.schema.encode(raw.data)
      const id = this.#allocateInlineId(reservedInline)
      reservedInline.add(id)
      inline[id] = {
        type: raw.type,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }
      lines.at(-1).push({ kind: 'reference', id })
    }

    const serialized = lines.map(line => {
      let text = ''
      let logicalLength = 0
      for (const segment of line) {
        if (segment.kind === 'text') {
          text += segment.text
          logicalLength += segment.text.length
        } else {
          text += `{{${segment.id}}}`
          logicalLength++
        }
      }
      return { text, logicalLength }
    })

    const startOffset = Math.max(0, Math.trunc(range?.start) || 0)
    const endOffset = Math.max(startOffset, Math.trunc(range?.end ?? startOffset) || 0)

    if (serialized.length === 1 || !defaultDefinition?.schema?.mapRichText) {
      let matched = false
      const nextData = blockDefinition.schema.mapRichText(
        cloneEditorData(current.data),
        (html, key) => {
          if (key !== fieldKey) return html
          matched = true
          return replaceRichTextRange(
            html,
            inline,
            { start: startOffset, end: endOffset },
            { kind: 'text', text: serialized.map(line => line.text).join('\n') },
            this.#ownerDocument,
          )
        },
      )
      if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
      const next = this.#recordFromData(
        current.id, current.type, blockDefinition, nextData, current.tunes, inline,
      )
      this.#engine.execute({ origin: 'user', name: 'inline-paste' }, tx => tx.update(blockId, next))
      return {
        blockId,
        fieldKey,
        offset: startOffset + serialized.reduce((sum, line, index) => (
          sum + line.logicalLength + (index ? 1 : 0)
        ), 0),
      }
    }

    let suffix = ''
    let sourceMatched = false
    const sourceData = blockDefinition.schema.mapRichText(
      cloneEditorData(current.data),
      (html, key) => {
        if (key !== fieldKey) return html
        sourceMatched = true
        suffix = splitRichTextRange(
          html,
          inline,
          { start: startOffset, end: endOffset },
          this.#ownerDocument,
        ).after
        return replaceRichTextRange(
          html,
          inline,
          { start: startOffset, end: Number.MAX_SAFE_INTEGER },
          { kind: 'text', text: serialized[0].text },
          this.#ownerDocument,
        )
      },
    )
    if (!sourceMatched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)

    const sourceNext = this.#recordFromData(
      current.id, current.type, blockDefinition, sourceData, current.tunes, inline,
    )

    const records = []
    const occupiedBlocks = new Set(this.#store.ids())
    const allocateBlockId = () => this.#allocateId(defaultType, occupiedBlocks)

    let finalFieldKey = null
    for (let index = 1; index < serialized.length; index++) {
      const line = serialized[index]
      const isLast = index === serialized.length - 1
      let fieldKeyForBlock = null
      const data = defaultDefinition.schema.mapRichText(
        defaultDefinition.schema.createDefault(),
        (html, key) => {
          if (fieldKeyForBlock !== null) return html
          fieldKeyForBlock = key
          const base = isLast ? suffix : ''
          return replaceRichTextRange(
            base,
            inline,
            { start: 0, end: 0 },
            { kind: 'text', text: line.text },
            this.#ownerDocument,
          )
        },
      )
      if (fieldKeyForBlock === null) {
        throw new Error(`Default block type has no rich-text field: ${defaultType}`)
      }
      finalFieldKey = fieldKeyForBlock
      records.push(this.#recordFromData(
        allocateBlockId(), defaultType, defaultDefinition, data, current.tunes, inline,
      ))
    }

    const sourceIndex = this.#store.ids().indexOf(blockId)
    this.#engine.execute({ origin: 'user', name: 'inline-paste' }, tx => {
      tx.update(blockId, sourceNext)
      records.forEach((record, index) => tx.insert(sourceIndex + index + 1, record))
    })

    const last = records.at(-1)
    return {
      blockId: last.id,
      fieldKey: finalFieldKey,
      offset: serialized.at(-1).logicalLength,
    }
  }

  insertInlineWidget(blockId, fieldKey, range, type, data) {
    this.#assertWritable()
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Unregistered block cannot be updated: ${blockId}`)
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
    const next = this.#recordFromData(
      current.id, current.type, blockDefinition, nextData, current.tunes, inline,
    )
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.insert' }, tx => tx.update(blockId, next))
    return id
  }

  updateInlineWidget(blockId, inlineId, producer) {
    this.#assertWritable()
    if (typeof producer !== 'function') throw new TypeError('Inline widget update producer must be a function')
    const current = this.#store.get(blockId)
    if (!current) throw new Error(`Unknown block id: ${blockId}`)
    if (this.activation(blockId)?.kind !== 'active') throw new Error(`Unregistered block cannot be updated: ${blockId}`)
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
    const blockDefinition = this.#registry.getBlockDefinition(current.type)
    const next = this.#recordFromData(
      current.id, current.type, blockDefinition, current.data, current.tunes, inline,
    )
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
    const next = this.#recordFromData(
      current.id, current.type, definition, data, current.tunes, inline,
    )
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.replace' }, tx => tx.update(blockId, next))
    return true
  }

  removeInlineWidget(blockId, inlineId) {
    return this.replaceInlineWidgetWithText(blockId, inlineId, '')
  }

  syncBlocksFromProjection(ids, operation, metadata = {}) {
    this.#assertWritable()
    if (!Array.isArray(ids) || ids.length === 0) return
    if (typeof operation !== 'function') throw new TypeError('DOM mutation operation must be a function')

    const ordered = []
    const seen = new Set()
    for (let index = 0; index < ids.length; index++) {
      if (!Object.hasOwn(ids, index)) throw new TypeError('Projection block ids must be a dense array')
      const id = ids[index]
      if (typeof id !== 'string' || !id) throw new TypeError('Projection block id must be a non-empty string')
      if (seen.has(id)) continue
      const current = this.#store.get(id)
      if (!current) throw new Error(`Unknown block id: ${id}`)
      if (this.activation(id)?.kind !== 'active') throw new Error(`Unregistered block cannot be synchronized: ${id}`)
      seen.add(id)
      ordered.push(id)
    }

    try {
      operation()
      const updates = []
      for (const id of ordered) {
        const current = this.#store.get(id)
        const definition = this.#registry.getBlockDefinition(current.type)
        const projection = this.#projector?.readBlock?.(id)
        if (!projection) throw new Error('Projection reader is unavailable')
        const readData = Object.hasOwn(projection, 'data') ? projection.data : projection
        const inlineSource = Object.hasOwn(projection, 'inline')
          ? (projection.inline === undefined ? undefined : cloneInline(projection.inline))
          : current.inline
        const next = this.#recordFromData(
          current.id, current.type, definition, readData, current.tunes, inlineSource,
        )
        if (
          current.dataVersion !== next.dataVersion
          || !sameJson(current.data, next.data)
          || !sameJson(current.inline, next.inline)
        ) updates.push([id, next])
      }
      if (!updates.length) return
      this.#engine.execute({
        origin: metadata.origin ?? 'user',
        name: metadata.name ?? 'projection.sync',
      }, tx => {
        for (const [id, next] of updates) tx.update(id, next)
      })
    } catch (error) {
      this.#projector?.restore?.(this.#store)
      throw error
    }
  }

  syncBlockFromProjection(id, operation, metadata = {}) {
    this.#assertWritable()
    if (typeof operation !== 'function') throw new TypeError('DOM mutation operation must be a function')
    const current = this.#store.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.activation(id)?.kind !== 'active') throw new Error(`Unregistered block cannot be synchronized: ${id}`)
    const definition = this.#registry.getBlockDefinition(current.type)

    try {
      operation()
      const projection = this.#projector?.readBlock?.(id)
      if (!projection) throw new Error('Projection reader is unavailable')
      const readData = Object.hasOwn(projection, 'data') ? projection.data : projection
      const inlineSource = Object.hasOwn(projection, 'inline')
        ? (projection.inline === undefined ? undefined : cloneInline(projection.inline))
        : current.inline
      const next = this.#recordFromData(
        current.id, current.type, definition, readData, current.tunes, inlineSource,
      )
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

  #createNewDocument() {
    const type=this.#registry.defaultBlockType
    const definition=this.#registry.getBlockDefinition(type)
    if(!definition)throw new Error(`Unknown default block type: ${type}`)
    return {version:DOCUMENT_FORMAT_VERSION,blocks:[this.#recordFromData(
      this.#createUniqueBlockId(type),
      type,
      definition,
      definition.schema.createDefault(),
      undefined,
      undefined,
    )]}
  }

  #ingest(input) {
    let normalized
    try{
      normalized=decodeCurrentDocument(input,{
        getBlockSchema:type=>this.#registry.getBlockDefinition(type)?.schema,
        getInlineSchema:type=>this.#registry.getInlineDefinition(type)?.schema,
      })
    }catch(error){
      this.#reportValidation({},error)
      throw error
    }
    const blocks=normalized.blocks.map(block=>{
      const definition=this.#registry.getBlockDefinition(block.type)
      if(!definition)return block
      let data=block.data
      if(typeof definition.schema.mapRichText==='function'){
        data=definition.schema.mapRichText(data,html=>this.#richTextNormalizer(html))
      }
      const encoded=definition.schema.encode(data)
      const next={...block,dataVersion:encoded.dataVersion,data:encoded.data}
      const tunes=cloneTunes(block.tunes)
      if(tunes===undefined)delete next.tunes
      else next.tunes=tunes
      if(block.inline!==undefined)next.inline=this.#normalizeExternalInline(block.inline)
      if(
        block.dataVersion!==next.dataVersion
        || !sameJson(block.data,next.data)
        || !sameJson(block.tunes,next.tunes)
        || !sameJson(block.inline,next.inline)
      )delete next.revision
      return next
    })
    if(blocks.length===0)return this.#createNewDocument()
    return {version:DOCUMENT_FORMAT_VERSION,blocks}
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
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition)return {kind:'unregistered',reason:'unknown-type'}
    return {kind:'active'}
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
    return assembleCanonicalRecord({
      id,
      type,
      definition,
      data,
      tunes,
      inlineSource,
      ownerDocument:this.#ownerDocument,
      normalizeData:(targetDefinition,targetData)=>this.#normalizeLocalData(targetDefinition,targetData),
      normalizeTunes:cloneTunes,
    })
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

    const before=sliced.before
      ?this.#recordFromData(
          current.id,current.type,sourceDefinition,sliced.before,current.tunes,sourceInline,
        )
      :null
    const targetId=before?this.#createUniqueBlockId(target.type):current.id
    const targetRecord=this.#recordFromData(
      targetId,target.type,targetDefinition,targetData,current.tunes,sourceInline,
    )
    this.#assertConversionInlinePreserved(
      sliced.selected,sourceInline,targetDefinition,targetRecord,
    )
    const after=sliced.after
      ?this.#recordFromData(
          this.#createUniqueBlockId(current.type),
          current.type,
          sourceDefinition,
          sliced.after,
          current.tunes,
          sourceInline,
        )
      :null

    this.#engine.execute({origin:'user',name:'selection.convert'},tx=>{
      if(before){
        tx.update(current.id,before)
        tx.insert(index+1,targetRecord)
        if(after)tx.insert(index+2,after)
      }else{
        tx.update(current.id,targetRecord)
        if(after)tx.insert(index+1,after)
      }
    })
    return {focusId:targetId,convertedIds:[targetId]}
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

    const occupiedIds=new Set(this.#store.ids())
    for(const piece of pieces){
      if(!targetConversion?.canImport?.(piece.payload))return false
      piece.data=this.#targetDataFromPayload(targetDefinition,piece.payload,target)
      piece.insert=(
        (piece.position==='first'&&firstSlice.before)
        ||(piece.position==='last'&&lastSlice.after)
      )
      piece.id=piece.insert
        ?this.#allocateId(target.type,occupiedIds)
        :piece.original.id
      piece.record=this.#recordFromData(
        piece.id,target.type,targetDefinition,piece.data,piece.original.tunes,piece.inline,
      )
      this.#assertConversionInlinePreserved(
        piece.payload,piece.inline,targetDefinition,piece.record,
      )
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
        if(piece.insert){
          const live=tx.list()
          const anchorId=piece.position==='first'?first.id:last.id
          const anchor=live.findIndex(item=>item.id===anchorId)
          tx.insert(piece.position==='first'?anchor+1:anchor,piece.record)
        }else{
          tx.update(piece.original.id,piece.record)
        }
        convertedIds.push(piece.id)
        focusId=piece.id
      }

      if(lastSlice.after){
        tx.update(last.id,this.#recordFromData(
          last.id,last.type,lastSlice.definition,lastSlice.after,last.tunes,lastSlice.inline,
        ))
      }
    })
    return focusId?{focusId,convertedIds}:false
  }

  #assertConversionInlinePreserved(payload,inline,targetDefinition,targetRecord){
    if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string')return
    const references=scanRichTextPlaceholders(
      payload.data.text,
      inline,
      this.#ownerDocument,
    ).references
    if(!references.size)return

    const targetInline=targetRecord.inline??{}
    const targetScan=this.#scanBlockRichText(
      targetDefinition,targetRecord.data,targetInline,
    )
    for(const id of references){
      if(!Object.hasOwn(targetInline,id)||!targetScan.references.has(id)){
        throw new Error(
          `Block conversion cannot preserve inline reference "${id}" in target "${targetRecord.type}"`,
        )
      }
    }
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
  }

  #normalizeExternalInline(value) {
    return decodeCurrentInlineMap(value,{getInlineSchema:type=>this.#registry.getInlineDefinition(type)?.schema})
  }

  #scanBlockRichText(definition, data, inline) {
    return scanCanonicalRichText(definition, data, inline, this.#ownerDocument)
  }

  #allocateInlineId(reserved) {
    return this.#allocateId('inline',reserved)
  }

  #prepareInlineMerge(definition, target, source) {
    return prepareCanonicalInlineMerge({
      definition,
      target,
      source,
      ownerDocument:this.#ownerDocument,
      allocateInlineId:reserved=>this.#allocateInlineId(reserved),
    })
  }

  #createUniqueInlineId(blockDefinition, data, inline) {
    const scan=this.#scanBlockRichText(blockDefinition,data,inline)
    const reserved=new Set([
      ...Object.keys(inline),
      ...scan.references,
      ...scan.literals,
    ])
    return this.#allocateId('inline',reserved)
  }

  #createUniqueBlockId(prefix, additional = []) {
    const occupied = new Set(this.#store ? this.#store.ids() : additional.map(block => block.id))
    return this.#allocateId(prefix,occupied)
  }

  #dataOperationContext() {
    return Object.freeze({
      createId: prefix => this.createDataId(prefix),
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
      createId: prefix => this.createDataId(prefix),
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
