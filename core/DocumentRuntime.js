// @ts-check
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
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
  #selection
  #ownerDocument
  #readOnly
  #createId
  #allocateId
  #onValidationError
  #richTextNormalizer
  #destroyed = false
  #controlFailed = false
  #editingProjection = false
  #changingReadOnly = false
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
   *     contextFactory: (id: string, type: string, signal: AbortSignal, readRecord: () => any) => any,
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
    this.#selection = options.selection ?? null
    this.#richTextNormalizer = typeof options.richTextNormalizer === 'function'
      ? options.richTextNormalizer
      : (this.#ownerDocument
          ? html => normalizeRichText(html, this.#ownerDocument)
          : html => String(html ?? ''))

    const initial = options.data === undefined ? this.#createNewDocument() : this.#ingest(options.data)
    this.#store = new DocumentStore(initial)
    this.#history = new HistoryStore(options.history)

    const contextFactory = (id, type, signal, readRecord, scope) => this.#blockContext(id, type, signal, readRecord, scope)
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
      onCommit: typeof options.onCommit === 'function'
        ? event => options.onCommit(Object.freeze({
            ...event,
            history: Object.freeze({
              canUndo: this.canUndo,
              canRedo: this.canRedo,
            }),
          }))
        : undefined,
      diagnostics: this.#diagnostics ?? undefined,
    })

    try {
      this.#projector?.mount?.(this.#store)
      this.#projector?.setReadOnly?.(this.readOnly)
    } catch (error) {
      try { this.#projector?.destroy?.() } catch {}
      throw error
    }
  }

  get readOnly() {
    return this.#readOnly
  }

  get health() {
    if (this.#destroyed) return 'destroyed'
    if (this.#controlFailed) return 'failed'
    return this.#engine?.health ?? 'ready'
  }

  get generation() {
    return this.#store?.generation ?? 0
  }

  get revision() {
    return this.#store?.revision ?? 0
  }

  get canUndo() {
    return this.health === 'ready' && !this.#readOnly && this.#engine.canUndo
  }

  get canRedo() {
    return this.health === 'ready' && !this.#readOnly && this.#engine.canRedo
  }

  get version() {
    return this.#store.version
  }

  get size() {
    return this.#store.size
  }

  has(id) {
    return this.#store.has(id)
  }

  idAt(index) {
    return this.#store.idAt(index)
  }

  indexOf(id) {
    return this.#store.indexOf(id)
  }

  ids() {
    return this.#store.ids()
  }

  peek(id) {
    return this.#store.peek(id)
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

  /** Commit a controller action with its planned caret after projection. */
  interact(name, operation, selectionAfter) {
    this.#assertInteractionMutation()
    return this.#engine.execute({ origin: 'user', name, selectionAfter }, operation)
  }

  insert(type, data, index = undefined, options = {}, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    return this.#engine.execute({ origin: 'external', name: 'block.insert' }, tx => {
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
      tx.insert(index === undefined ? tx.list().length : index, record)
      return id
    })
  }


  /**
   * Apply fully prepared text/file resolver results in one paste transaction.
   * @param {string} blockId
   * @param {string} fieldKey
   * @param {{start:number,end:number}} range
   * @param {Array<{type:string,result:import('../plugin-kit/types').PasteResult<Record<string,unknown>>}>} entries
   * @returns {{blockId:string,inserted:string[],focus?:{fieldKey:string,offset:number}}}
   */
  applyPasteResults(blockId,fieldKey,range,entries){
    this.#assertInteractionMutation()
    if(!Array.isArray(entries)||entries.length===0)throw new TypeError('Paste results must be a non-empty array')
    const current=this.#store.get(blockId)
    if(!current)throw new Error(`Unknown block id: ${blockId}`)
    if(this.activation(blockId)?.kind!=='active')throw new Error(`Unregistered block cannot receive paste results: ${blockId}`)

    let rich=null
    const local=[]
    for(let index=0;index<entries.length;index++){
      if(!Object.hasOwn(entries,index))throw new TypeError('Paste results must be dense')
      const entry=entries[index]
      const result=entry?.result
      if(!result||typeof result!=='object'||Array.isArray(result))throw new TypeError('Paste resolver returned an invalid result')
      if(result.kind==='rich-text'){
        if(rich)throw new Error('Paste plan may contain at most one rich-text result')
        if(!result.replacement||typeof result.replacement!=='object')throw new TypeError('Paste rich-text result is invalid')
        rich=result.replacement
        continue
      }
      if(result.kind!=='block')throw new TypeError('Paste result kind must be block or rich-text')
      if(typeof entry.type!=='string'||!entry.type)throw new TypeError('Paste block result is missing a type')
      const definition=this.#registry.getBlockDefinition(entry.type)
      if(!definition)throw new Error(`Paste block type is not registered: ${entry.type}`)
      // Validate local data before allocating any persisted block identity.
      this.#normalizeLocalData(definition,result.data)
      local.push({type:entry.type,definition,data:result.data})
    }

    let targetNext=current
    if(rich){
      targetNext=this.#replaceBlockRichTextRange(
        current,
        {blockId,fieldKey,offset:Math.max(0,Math.trunc(range?.start)||0)},
        {blockId,fieldKey,offset:Math.max(0,Math.trunc(range?.end)||0)},
        rich,
      )
      if(!targetNext)throw new Error('Paste target is not a valid rich-text range')
    }

    const replaceEmpty=!rich&&local.length>0&&this.isEmpty(blockId)
    const reserved=new Set(this.#store.ids())
    const prepared=local.map((entry,index)=>{
      const id=replaceEmpty&&index===0?blockId:this.#allocateId(entry.type,reserved)
      return this.#recordFromData(id,entry.type,entry.definition,entry.data,undefined,undefined)
    })

    const anchorIndex=this.#store.ids().indexOf(blockId)
    const inserted=[]
    this.#engine.execute({origin:'user',name:'clipboard.paste'},tx=>{
      if(rich)tx.update(blockId,targetNext)
      let start=0
      if(replaceEmpty){
        tx.update(blockId,prepared[0])
        inserted.push(blockId)
        start=1
      }
      let offset=1
      for(let index=start;index<prepared.length;index++){
        tx.insert(anchorIndex+offset,prepared[index])
        inserted.push(prepared[index].id)
        offset++
      }
    })

    const focus = rich && !inserted.length ? {
      fieldKey,
      offset: Math.max(0, Math.trunc(range.start) || 0)
        + (rich.kind === 'text' ? rich.text.length : getRichTextLogicalLength(rich.html, {}, this.#ownerDocument)),
    } : undefined
    return {
      blockId:inserted.at(-1)??blockId,
      inserted,
      ...(focus ? { focus } : {}),
    }
  }

  insertLocalBlocks(anchorId,inputs,options={}){
    this.#assertInteractionMutation()
    if(!Array.isArray(inputs)||inputs.length===0)return []
    const ids=this.#store.ids()
    const anchorIndex=ids.indexOf(anchorId)
    if(anchorIndex<0)throw new Error(`Unknown block id: ${anchorId}`)

    const validated=inputs.map((input,index)=>{
      if(!input||typeof input!=='object'||Array.isArray(input)){
        throw new TypeError(`Local block input[${index}] must be an object`)
      }
      if(typeof input.type!=='string'||!input.type){
        throw new TypeError(`Local block input[${index}] must contain a type`)
      }
      const definition=this.#registry.getBlockDefinition(input.type)
      if(!definition)throw new Error(`Local block type is not registered: ${input.type}`)
      // Validate the complete local payload before allocating persisted block ids.
      this.#normalizeLocalData(definition,input.data)
      const tunes=input.tunes===undefined?undefined:cloneTunes(input.tunes)
      const inline=input.inline===undefined?undefined:this.#normalizeExternalInline(input.inline)
      return {type:input.type,definition,data:input.data,tunes,inline}
    })

    const reserved=new Set(ids)
    const records=validated.map(input=>{
      const id=this.#allocateId(input.type,reserved)
      return this.#recordFromData(
        id,input.type,input.definition,input.data,input.tunes,input.inline,
      )
    })

    const replaceEmpty=options.replaceEmpty===true&&this.isEmpty(anchorId)
    const inserted=[]
    this.#engine.execute({origin:'user',name:options.name??'blocks.insert-local'},tx=>{
      let offset=1,start=0
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

  /**
   * Insert copied external block records in one canonical transaction.
   * Producer ids/revisions are never reused; invalid optional tunes are ignored.
   * @param {string} anchorId
   * @param {unknown[]} inputs
   * @param {{replaceEmpty?:boolean}} [options]
   * @returns {string[]}
   */
  insertExternalBlocks(anchorId,inputs,options={}){
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
    return this.#engine.execute({ origin: 'user', name: 'block.split' }, tx => this.#splitBlockDraft(tx,id,fieldKey,range))
  }

  #splitBlockDraft(tx,id,fieldKey,range) {
    // A preceding range replacement can already have changed this block in
    // the current transaction. Read its draft, so Enter remains one action.
    const current = tx.get(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.#activationFor(current)?.kind !== 'active') throw new Error(`Unregistered block cannot be split: ${id}`)
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

    const index = tx.list().findIndex(block => block.id === id)
    tx.update(id, sourceRecord)
    tx.insert(index + 1, targetRecord)
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
    this.#assertInteractionMutation()
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

  update(id, producer, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    if (typeof producer !== 'function') throw new TypeError('Block update producer must be a function')
    this.#engine.execute({ origin: 'external', name: 'block.update' }, tx => {
      const current = tx.get(id)
      if (!current) throw new Error(`Unknown block id: ${id}`)
      if (!this.#registry.hasBlock(current.type)) {
        throw new Error(`Unregistered block cannot be updated: ${id}`)
      }
      const definition = this.#registry.getBlockDefinition(current.type)
      if (!definition) throw new Error(`Unknown block type: ${current.type}`)

      const snapshot = cloneEditorData(current)
      const patch = producer(snapshot) ?? {}
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('Block update producer must return an object')
      }
      if (typeof patch.then === 'function') throw new TypeError('Block update producer must be synchronous')
      if (Object.hasOwn(patch, 'type') || Object.hasOwn(patch, 'id') || Object.hasOwn(patch, 'inline')) {
        throw new TypeError('Block update cannot change id, type, or inline payload')
      }

      const latest = tx.get(id)
      if (!latest || latest.type !== current.type) throw new Error('Block update target changed during its producer')
      const nextData = Object.hasOwn(patch, 'data') ? patch.data : latest.data
      const nextTunes = Object.hasOwn(patch, 'tunes')
        ? (patch.tunes === null ? undefined : patch.tunes)
        : latest.tunes
      const next = this.#recordFromData(
        id, current.type, definition, nextData, nextTunes, latest.inline,
      )

      if (
        latest.dataVersion === next.dataVersion
        && sameJson(latest.data, next.data)
        && sameJson(latest.tunes, next.tunes)
        && sameJson(latest.inline, next.inline)
      ) return
      tx.update(id, next)
    })
  }

  move(id, to, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    this.#engine.execute({ origin: 'external', name: 'block.move' }, tx => {
      tx.move(id, to)
    })
  }

  remove(id, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    return this.#engine.execute({ origin: 'external', name: 'block.remove' }, tx => {
      const ids = tx.list().map(block => block.id)
      if (!ids.includes(id)) throw new Error(`Unknown block id: ${id}`)
      const index = ids.indexOf(id)
      let focusId = ids[index + 1] ?? ids[index - 1]
      let fallback = null
      if (ids.length === 1) {
        const type = this.#registry.defaultBlockType
        const definition = this.#registry.getBlockDefinition(type)
        fallback = this.#recordFromData(
          this.#createUniqueBlockId(type), type, definition, definition.schema.createDefault(), undefined, undefined,
        )
        focusId = fallback.id
      }
      tx.remove(id)
      if (fallback) tx.insert(0, fallback)
      return focusId
    })
  }


  removeBlocks(blockIds, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
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

  /**
   * Replace a whole-document interaction selection with one default block.
   * @param {{kind:'text',text:string}|{kind:'html',html:string}} replacement
   * @returns {{blockId:string,fieldKey:string,offset:number}|false}
   */
  replaceWholeDocument(replacement, blockIds = this.#store.ids()) {
    this.#assertInteractionMutation()
    const selected = new Set(blockIds)
    const ids = this.#store.ids().filter(id => selected.has(id))
    if (!ids.length) return false
    const index = this.#store.ids().indexOf(ids[0])
    const type = this.#registry.defaultBlockType
    const definition = this.#registry.getBlockDefinition(type)
    if (!definition?.schema?.mapRichText) return false
    let fieldKey = null
    const data = definition.schema.mapRichText(definition.schema.createDefault(), (html, key) => {
      if (fieldKey !== null) return html
      fieldKey = key
      return replaceRichTextRange('', {}, { start: 0, end: 0 }, replacement, this.#ownerDocument)
    })
    if (fieldKey === null) return false
    const blockId = this.#createUniqueBlockId(type)
    const record = this.#recordFromData(blockId, type, definition, data, undefined, undefined)
    this.#engine.execute({ origin: 'user', name: 'selection.replace-all' }, tx => {
      for (const id of ids) tx.remove(id)
      tx.insert(index, record)
    })
    return {
      blockId, fieldKey,
      offset: replacement.kind === 'text' ? replacement.text.length : getRichTextLogicalLength(replacement.html, {}, this.#ownerDocument),
    }
  }

  replaceBlock(id, type, data, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
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

  convert(id, target, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    this.#engine.execute({ origin: 'external', name: 'block.convert' }, tx => {
      const current = tx.get(id)
      if (!current) throw new Error(`Unknown block id: ${id}`)
      if (this.#activationFor(current)?.kind !== 'active') {
        throw new Error(`Unregistered block cannot be converted: ${id}`)
      }
      if (!target || typeof target !== 'object' || typeof target.type !== 'string') {
        throw new TypeError('Conversion target requires a type')
      }

      const sourceDefinition = this.#registry.getBlockDefinition(current.type)
      const targetDefinition = this.#registry.getBlockDefinition(target.type)
      if (!targetDefinition) throw new Error(`Unknown block type: ${target.type}`)
      if(current.type===target.type&&target.toolboxItemId===undefined)return

      // As in the block menu, every registered target is available. A target
      // imports transferable content when it can; otherwise it starts with its
      // own schema defaults. Never bypass the inline-reference preservation check.
      const sourcePayload = sourceDefinition?.capabilities?.conversion?.export(current.data) ?? null
      const targetData = this.#targetDataFromPayload(targetDefinition, sourcePayload, target, current.type===target.type?current.data:undefined)

      const next = this.#recordFromData(
        id, target.type, targetDefinition, targetData, current.tunes, current.inline,
      )
      this.#assertConversionInlinePreserved(
        sourcePayload,current.inline,targetDefinition,next,
      )
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
    this.#assertInteractionMutation()
    const ordered=this.#orderedLogicalRange(bookmark)
    if(!ordered||!target||typeof target.type!=='string')return false
    const {start,end}=ordered
    const targetDefinition=this.#registry.getBlockDefinition(target.type)
    if(!targetDefinition)return false
    if(start.blockId===end.blockId&&this.#store.get(start.blockId)?.type===target.type&&target.toolboxItemId===undefined)return false

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
    this.#assertInteractionMutation()
    return this.#engine.undo()
  }

  redo() {
    this.#assertInteractionMutation()
    return this.#engine.redo()
  }

  clear() {
    this.#assertHostMutation()
    this.#engine.execute({ origin: 'external', name: 'document.clear' }, tx => {
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
      tx.replace(document)
    })
  }

  render(input) {
    this.#assertHostMutation()
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      this.#engine.execute({ origin: 'external', name: 'document.render' }, tx => {
        tx.replace(this.#ingest(input))
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

  /** @param {boolean} value @param {(discardProjectionEdits: () => void) => void} [afterApply] */
  setReadOnly(value, afterApply) {
    this.#assertHostMutation()
    if (typeof value !== 'boolean') throw new TypeError('setReadOnly() requires a boolean')
    if (this.#engine.phase !== 'idle') throw new Error(`Cannot change read-only mode during ${this.#engine.phase} phase`)
    const next = value === true
    if (next === this.#readOnly) return
    const selectionBefore = this.#captureSelection()
    this.#changingReadOnly = true
    try {
      try {
        this.#projector?.setReadOnly?.(next)
        this.#readOnly = next
      } catch (error) {
        if (error instanceof ReadOnlyRecoveryError) this.#controlFailed = true
        this.#restoreSelection(selectionBefore)
        throw error
      }
      // Composition updates its controls and publishes observations under the
      // same guard. Queued commands can run once the transition returns.
      afterApply?.(() => {
        if (!this.#changingReadOnly) throw new Error('Read-only transition is no longer active')
        this.#discardProjectionEdits()
      })
    } finally {
      this.#changingReadOnly = false
    }
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
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
    const ordered = this.#orderedLogicalRange(bookmark)
    if (!ordered) return false
    const { start, end } = ordered
    const ids = this.#store.ids()
    const startIndex = ids.indexOf(start.blockId)
    const endIndex = ids.indexOf(end.blockId)
    if (startIndex < 0 || endIndex < startIndex) return false

    const startCurrent = this.#store.get(start.blockId)
    const endCurrent = this.#store.get(end.blockId)
    if (!startCurrent || !endCurrent) return false
    if (
      this.activation(start.blockId)?.kind !== 'active'
      || this.activation(end.blockId)?.kind !== 'active'
    ) return false

    const caretOffset = start.offset + (replacement.kind === 'text'
      ? replacement.text.length
      : getRichTextLogicalLength(replacement.html, {}, this.#ownerDocument))

    if (start.blockId === end.blockId) {
      const next = this.#replaceBlockRichTextRange(
        startCurrent,start,end,replacement,
      )
      if (!next) return false
      this.#engine.execute({ origin: 'user', name: 'selection.replace' }, tx => {
        tx.update(start.blockId,next)
      })
      return { blockId: start.blockId, fieldKey: start.fieldKey, offset: caretOffset }
    }

    const startDefinition = this.#registry.getBlockDefinition(startCurrent.type)
    const endDefinition = this.#registry.getBlockDefinition(endCurrent.type)
    const startFields = this.#richTextFields(
      startDefinition,startCurrent.data,cloneInline(startCurrent.inline)??{},
    )
    const endFields = this.#richTextFields(
      endDefinition,endCurrent.data,cloneInline(endCurrent.inline)??{},
    )
    if (!startFields.length || !endFields.length) return false

    const lastStartField = startFields[startFields.length - 1]
    const firstEndField = endFields[0]
    const startNext = this.#replaceBlockRichTextRange(
      startCurrent,
      start,
      { blockId:start.blockId, fieldKey:lastStartField.key, offset:lastStartField.length },
      replacement,
    )
    const endNext = this.#replaceBlockRichTextRange(
      endCurrent,
      { blockId:end.blockId, fieldKey:firstEndField.key, offset:0 },
      end,
      { kind:'text', text:'' },
    )
    if (!startNext || !endNext) return false

    let merged = null
    if (startNext.type === endNext.type) {
      const merge = startDefinition?.capabilities?.merge?.merge
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
    return { blockId: start.blockId, fieldKey: start.fieldKey, offset: caretOffset }
  }

  prepareLogicalClipboardSlice(bookmark, wholeBlockIds = []){
    const ids=this.#store.ids()
    if (wholeBlockIds.length) {
      const selected = ids.filter(id => wholeBlockIds.includes(id))
      if (selected.length !== wholeBlockIds.length || selected.some((id, index) => id !== wholeBlockIds[index])) return null
      const first = this.#store.get(selected[0])
      const definition = this.#registry.getBlockDefinition(first.type)
      const field = this.#richTextFields(definition, first.data, cloneInline(first.inline) ?? {})[0]
      return Object.freeze({
        generation: this.#store.generation,
        revision: this.#store.revision,
        bookmark: bookmark ? cloneEditorData(bookmark) : null,
        startIndex: ids.indexOf(first.id),
        parts: selected.map(id => ({ kind: 'block', block: this.#store.get(id) })),
        blocks: selected.map(id => Object.freeze({ id, remaining: null })),
        focus: Object.freeze({ blockId: first.id, fieldKey: field?.key ?? '', offset: 0 }),
        compound: true,
      })
    }
    const ordered=this.#orderedLogicalRange(bookmark)
    if(!ordered)return null
    const {start,end}=ordered
    const startIndex=ids.indexOf(start.blockId)
    const endIndex=ids.indexOf(end.blockId)
    if(startIndex<0||endIndex<startIndex)return null

    const parts=[]
    const blocks=[]
    let compound=false
    let focus={blockId:start.blockId,fieldKey:start.fieldKey,offset:start.offset}

    if(startIndex===endIndex){
      const record=this.#store.get(start.blockId)
      if(!record)return null
      const slice=this.#prepareClipboardBlockSlice(record,start,end)
      if(!slice)return null
      parts.push(...slice.parts)
      blocks.push({id:record.id,remaining:slice.remaining})
      compound=slice.compound
      if(slice.focus)focus={blockId:record.id,...slice.focus}
    }else{
      const startRecord=this.#store.get(start.blockId)
      const endRecord=this.#store.get(end.blockId)
      if(!startRecord||!endRecord)return null
      const startDefinition=this.#registry.getBlockDefinition(startRecord.type)
      const endDefinition=this.#registry.getBlockDefinition(endRecord.type)
      const startFields=this.#richTextFields(
        startDefinition,startRecord.data,cloneInline(startRecord.inline)??{},
      )
      const endFields=this.#richTextFields(
        endDefinition,endRecord.data,cloneInline(endRecord.inline)??{},
      )
      if(!startFields.length||!endFields.length)return null

      const startSlice=this.#prepareClipboardBlockSlice(
        startRecord,
        start,
        {
          blockId:start.blockId,
          fieldKey:startFields.at(-1).key,
          offset:startFields.at(-1).length,
        },
      )
      const endSlice=this.#prepareClipboardBlockSlice(
        endRecord,
        {blockId:end.blockId,fieldKey:endFields[0].key,offset:0},
        end,
      )
      if(!startSlice||!endSlice)return null
      parts.push(...startSlice.parts)
      blocks.push({id:startRecord.id,remaining:startSlice.remaining})
      compound=compound||startSlice.compound
      if(startSlice.focus)focus={blockId:startRecord.id,...startSlice.focus}

      for(let index=startIndex+1;index<endIndex;index++){
        const record=this.#store.get(ids[index])
        if(!record)return null
        parts.push({kind:'block',block:record})
        blocks.push({id:record.id,remaining:null})
      }

      parts.push(...endSlice.parts)
      blocks.push({id:endRecord.id,remaining:endSlice.remaining})
      compound=compound||endSlice.compound
    }

    if(!parts.length)return null
    return Object.freeze({
      generation:this.#store.generation,
      revision:this.#store.revision,
      bookmark:cloneEditorData(bookmark),
      startIndex,
      parts:cloneEditorData(parts),
      blocks:blocks.map(entry=>Object.freeze({
        id:entry.id,
        remaining:entry.remaining===null?null:cloneEditorData(entry.remaining),
      })),
      focus:Object.freeze({...focus}),
      compound,
    })
  }

  exportLogicalClipboardParts(bookmark){
    return this.prepareLogicalClipboardSlice(bookmark)?.parts??null
  }

  applyPreparedClipboardCut(plan){
    this.#assertInteractionMutation()
    this.#assertCurrentClipboardPlan(plan)
    const entries=plan.blocks.map(entry=>({
      id:entry.id,
      remaining:entry.remaining===null?null:cloneEditorData(entry.remaining),
    }))

    // Deleting a cross-block selection may leave two endpoint residuals.
    // Collapse them only when the owning type explicitly declares a lossless
    // merge contract; this is the same canonical merge used by keyboard
    // deletion and conversion.
    if(entries.length>1){
      const first=entries[0]
      const last=entries.at(-1)
      if(first.remaining&&last.remaining&&first.id!==last.id&&first.remaining.type===last.remaining.type){
        const definition=this.#registry.getBlockDefinition(first.remaining.type)
        const merge=definition?.capabilities?.merge?.merge
        if(typeof merge==='function'){
          const prepared=this.#prepareInlineMerge(definition,first.remaining,last.remaining)
          const mergedData=merge(prepared.targetData,prepared.sourceData)
          first.remaining=this.#recordFromData(
            first.id,
            first.remaining.type,
            definition,
            mergedData,
            first.remaining.tunes,
            prepared.inline,
          )
          last.remaining=null
        }
      }
    }

    const removals=new Set(entries.filter(entry=>entry.remaining===null).map(entry=>entry.id))
    const survivors=this.#store.ids().filter(id=>!removals.has(id))
    let fallback=null
    if(!survivors.length){
      const type=this.#registry.defaultBlockType
      const definition=this.#registry.getBlockDefinition(type)
      fallback=this.#recordFromData(
        this.#allocateId(type,new Set(this.#store.ids())),
        type,
        definition,
        definition.schema.createDefault(),
        undefined,
        undefined,
      )
    }

    this.#engine.execute({origin:'user',name:'clipboard.cut'},tx=>{
      for(const entry of entries){
        if(entry.remaining===null){
          if(tx.get(entry.id))tx.remove(entry.id)
        }else{
          tx.update(entry.id,entry.remaining)
        }
      }
      if(fallback&&tx.list().length===0)tx.insert(0,fallback)
    })

    const preferred=entries.find(entry=>entry.remaining!==null)?.id
      ??fallback?.id
      ??this.#store.ids()[Math.min(plan.startIndex,this.#store.ids().length-1)]
      ??this.#store.ids().at(-1)
      ??null
    return preferred?{blockId:preferred,focus:plan.focus}:null
  }

  replacePreparedClipboardSlice(plan,parts){
    this.#assertInteractionMutation()
    this.#assertCurrentClipboardPlan(plan)
    if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')

    if(!plan.compound&&!parts.some(part=>part?.kind==='local-block')){
      return this.replaceLogicalRangeWithClipboardParts(plan.bookmark,parts)
    }

    const reserved=new Set(this.#store.ids())
    const incoming=parts.map(part=>{
      if(part?.kind==='block')return this.#materializeClipboardBlock(part.block,reserved)
      if(part?.kind==='rich-text')return this.#materializeClipboardRichText(part,reserved)
      if(part?.kind==='local-block'){
        if(typeof part.type!=='string'||!part.type)throw new TypeError('Local clipboard block is missing a type')
        const definition=this.#registry.getBlockDefinition(part.type)
        if(!definition)throw new Error(`Local clipboard block type is not registered: ${part.type}`)
        this.#normalizeLocalData(definition,part.data)
        const id=this.#allocateId(part.type,reserved)
        return this.#recordFromData(id,part.type,definition,part.data,undefined,undefined)
      }
      throw new TypeError('Clipboard part must be block, local-block, or rich-text')
    })

    this.#engine.execute({origin:'user',name:'clipboard.fragment'},tx=>{
      for(const entry of plan.blocks){
        if(entry.remaining===null){
          if(tx.get(entry.id))tx.remove(entry.id)
        }else{
          tx.update(entry.id,entry.remaining)
        }
      }

      const startEntry=plan.blocks[0]
      const live=tx.list()
      let insertAt
      if(startEntry?.remaining!==null&&tx.get(startEntry.id)){
        insertAt=live.findIndex(record=>record.id===startEntry.id)+1
      }else{
        insertAt=Math.min(plan.startIndex,live.length)
      }
      for(const record of incoming)tx.insert(insertAt++,record)
    })

    const blockId=incoming.at(-1)?.id
      ??plan.blocks.find(entry=>entry.remaining!==null)?.id
      ??this.#store.ids()[Math.min(plan.startIndex,this.#store.ids().length-1)]
      ??this.#store.ids().at(-1)
    return blockId?{blockId,inserted:incoming.map(record=>record.id)}:false
  }


  exportRichTextFragment(blockId,fieldKey,range){
    const current=this.#store.get(blockId)
    if(!current)throw new Error(`Unknown block id: ${blockId}`)
    if(this.activation(blockId)?.kind!=='active')throw new Error(`Unregistered block cannot export rich text: ${blockId}`)
    const definition=this.#registry.getBlockDefinition(current.type)
    if(!definition?.schema?.mapRichText)throw new Error(`Block type has no rich-text fields: ${current.type}`)
    const inline=cloneInline(current.inline)??{}
    let selected=null
    definition.schema.mapRichText(cloneEditorData(current.data),(html,key)=>{
      if(key===fieldKey)selected=sliceRichTextRange(html,inline,range,this.#ownerDocument).selected
      return html
    })
    if(selected===null)throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
    const scan=scanRichTextPlaceholders(selected,inline,this.#ownerDocument)
    const selectedInline={}
    for(const id of scan.references){
      if(Object.hasOwn(inline,id))selectedInline[id]=cloneEditorData(inline[id])
    }
    return {
      html:selected,
      ...(Object.keys(selectedInline).length?{inline:selectedInline}:{}),
    }
  }

  replaceRichTextFragment(blockId,fieldKey,range,fragment){
    this.#assertInteractionMutation()
    const current=this.#store.get(blockId)
    if(!current)throw new Error(`Unknown block id: ${blockId}`)
    const next=this.#recordWithRichTextFragment(current,fieldKey,range,fragment)
    this.#engine.execute({origin:'user',name:'clipboard.rich-text'},tx=>tx.update(blockId,next))
    return true
  }

  insertClipboardParts(blockId,fieldKey,range,parts){
    this.#assertInteractionMutation()
    if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')
    const current=this.#store.get(blockId)
    if(!current)throw new Error(`Unknown block id: ${blockId}`)
    if(this.activation(blockId)?.kind!=='active')throw new Error(`Unregistered block cannot receive clipboard data: ${blockId}`)

    const reserved=new Set(this.#store.ids())
    const preparedBlocks=[]
    let targetNext=current
    let partIndex=0

    if(parts[0]?.kind==='rich-text'){
      targetNext=this.#recordWithRichTextFragment(current,fieldKey,range,parts[0])
      partIndex=1
    }else if((Math.trunc(range?.end)||0)>(Math.trunc(range?.start)||0)){
      targetNext=this.#replaceBlockRichTextRange(
        current,
        {blockId,fieldKey,offset:Math.max(0,Math.trunc(range.start)||0)},
        {blockId,fieldKey,offset:Math.max(0,Math.trunc(range.end)||0)},
        {kind:'text',text:''},
      )
      if(!targetNext)throw new Error('Clipboard target selection is not a rich-text range')
    }

    for(;partIndex<parts.length;partIndex++){
      const part=parts[partIndex]
      if(part?.kind==='block'){
        preparedBlocks.push(this.#materializeClipboardBlock(part.block,reserved))
        continue
      }

      if(part?.kind!=='rich-text'||typeof part.html!=='string'){
        throw new TypeError('Clipboard part must be block or rich-text')
      }
      preparedBlocks.push(this.#materializeClipboardRichText(part,reserved))
    }

    const targetChanged=!sameJson(current,targetNext)
    const replaceEmpty=parts[0]?.kind==='block'
      &&range.start===range.end
      &&this.isEmpty(blockId)
      &&preparedBlocks.length>0
    const anchorIndex=this.#store.ids().indexOf(blockId)
    const inserted=[]
    this.#engine.execute({origin:'user',name:'clipboard.fragment'},tx=>{
      let offset=1
      let start=0
      if(replaceEmpty){
        const first={...preparedBlocks[0],id:blockId}
        tx.update(blockId,first)
        inserted.push(blockId)
        start=1
      }else if(targetChanged){
        tx.update(blockId,targetNext)
      }
      for(let index=start;index<preparedBlocks.length;index++){
        tx.insert(anchorIndex+offset,preparedBlocks[index])
        inserted.push(preparedBlocks[index].id)
        offset++
      }
    })
    const focus = !inserted.length && parts[0]?.kind === 'rich-text' ? {
      fieldKey,
      offset: Math.max(0, Math.trunc(range.start) || 0)
        + getRichTextLogicalLength(parts[0].html, parts[0].inline, this.#ownerDocument),
    } : undefined
    return {
      blockId:inserted.at(-1)??blockId,
      inserted,
      ...(focus ? { focus } : {}),
    }
  }


  replaceLogicalRangeWithClipboardParts(bookmark,parts){
    this.#assertInteractionMutation()
    if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')
    const ordered=this.#orderedLogicalRange(bookmark)
    if(!ordered)return false
    const {start,end}=ordered

    if(start.blockId===end.blockId&&parts.length===1&&parts[0]?.kind==='rich-text'){
      const current=this.#store.get(start.blockId)
      if(!current)return false
      let next=this.#recordWithRichTextFragment(
        current,start.fieldKey,{start:start.offset,end:start.fieldKey===end.fieldKey?end.offset:Number.MAX_SAFE_INTEGER},parts[0],
      )
      if(start.fieldKey!==end.fieldKey){
        const fields=this.#richTextFields(
          this.#registry.getBlockDefinition(current.type),current.data,cloneInline(current.inline)??{},
        )
        const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
        const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
        if(startIndex<0||endIndex<=startIndex)return false
        next=this.#replaceBlockRichTextRange(
          next,
          {blockId:next.id,fieldKey:fields[startIndex+1].key,offset:0},
          {blockId:next.id,fieldKey:end.fieldKey,offset:end.offset},
          {kind:'text',text:''},
        )
        if(!next)return false
      }
      this.#engine.execute({origin:'user',name:'clipboard.fragment'},tx=>tx.update(current.id,next))
      return {blockId:current.id,inserted:[],focus:{
        fieldKey:start.fieldKey,
        offset:start.offset+getRichTextLogicalLength(parts[0].html,parts[0].inline,this.#ownerDocument),
      }}
    }

    const ids=this.#store.ids()
    const startIndex=ids.indexOf(start.blockId)
    const endIndex=ids.indexOf(end.blockId)
    if(startIndex<0||endIndex<startIndex)return false
    const startRecord=this.#store.get(start.blockId)
    const endRecord=this.#store.get(end.blockId)
    if(!startRecord||!endRecord)return false

    const startDefinition=this.#registry.getBlockDefinition(startRecord.type)
    const endDefinition=this.#registry.getBlockDefinition(endRecord.type)
    const startFields=this.#richTextFields(startDefinition,startRecord.data,cloneInline(startRecord.inline)??{})
    const endFields=this.#richTextFields(endDefinition,endRecord.data,cloneInline(endRecord.inline)??{})
    if(!startFields.length||!endFields.length)return false
    const startFieldIndex=startFields.findIndex(field=>field.key===start.fieldKey)
    const endFieldIndex=endFields.findIndex(field=>field.key===end.fieldKey)
    if(startFieldIndex<0||endFieldIndex<0)return false

    const firstPart=parts[0]
    let before
    let consumedFirst=false
    if(firstPart?.kind==='rich-text'){
      before=this.#recordWithRichTextFragment(
        startRecord,start.fieldKey,{start:start.offset,end:Number.MAX_SAFE_INTEGER},firstPart,
      )
      if(startFieldIndex<startFields.length-1){
        before=this.#replaceBlockRichTextRange(
          before,
          {blockId:before.id,fieldKey:startFields[startFieldIndex+1].key,offset:0},
          {blockId:before.id,fieldKey:startFields.at(-1).key,offset:startFields.at(-1).length},
          {kind:'text',text:''},
        )
      }
      consumedFirst=true
    }else{
      const split=this.#splitClipboardResiduals(
        startRecord,
        start,
        {blockId:start.blockId,fieldKey:startFields.at(-1).key,offset:startFields.at(-1).length},
      )
      before=split?.before??null
    }

    const lastPart=parts.at(-1)
    const consumedLast=parts.length>(consumedFirst?1:0)&&lastPart?.kind==='rich-text'
    let after
    if(consumedLast){
      after=this.#recordWithRichTextFragment(
        endRecord,end.fieldKey,{start:0,end:end.offset},lastPart,
      )
      if(endFieldIndex>0){
        after=this.#replaceBlockRichTextRange(
          after,
          {blockId:after.id,fieldKey:endFields[0].key,offset:0},
          {blockId:after.id,fieldKey:endFields[endFieldIndex-1].key,offset:endFields[endFieldIndex-1].length},
          {kind:'text',text:''},
        )
      }
    }else if(start.blockId===end.blockId){
      const split=this.#splitClipboardResiduals(startRecord,start,end)
      after=split?.after??null
    }else{
      const split=this.#splitClipboardResiduals(
        endRecord,
        {blockId:end.blockId,fieldKey:endFields[0].key,offset:0},
        end,
      )
      after=split?.after??null
    }

    const reserved=new Set(ids)
    const insertedRecords=[]
    const partEnd=consumedLast?parts.length-1:parts.length
    for(let index=consumedFirst?1:0;index<partEnd;index++){
      const part=parts[index]
      if(part?.kind==='block')insertedRecords.push(this.#materializeClipboardBlock(part.block,reserved))
      else if(part?.kind==='rich-text')insertedRecords.push(this.#materializeClipboardRichText(part,reserved))
      else throw new TypeError('Clipboard part must be block or rich-text')
    }

    // A pure rich-text cross-block replacement may collapse endpoint residuals
    // back into one block when the owning type declares a merge contract.
    if(
      consumedFirst
      &&insertedRecords.length===0
      &&before
      &&after
      &&before.type===after.type
    ){
      const merge=startDefinition?.capabilities?.merge?.merge
      if(typeof merge==='function'){
        const prepared=this.#prepareInlineMerge(startDefinition,before,after)
        const mergedData=merge(prepared.targetData,prepared.sourceData)
        before=this.#recordFromData(
          before.id,before.type,startDefinition,mergedData,before.tunes,prepared.inline,
        )
        after=null
      }
    }

    const beforeKeep=before&&!this.#isClipboardResidualEmpty(before)
    const afterKeep=after&&!this.#isClipboardResidualEmpty(after)
    const inserted=[]
    let sameBlockAfter=null
    if(start.blockId===end.blockId&&afterKeep){
      sameBlockAfter={
        ...after,
        id:this.#allocateId(after.type,reserved),
      }
    }

    this.#engine.execute({origin:'user',name:'clipboard.fragment'},tx=>{
      if(beforeKeep)tx.update(start.blockId,before)
      else tx.remove(start.blockId)

      if(start.blockId!==end.blockId){
        for(let index=startIndex+1;index<endIndex;index++){
          if(tx.get(ids[index]))tx.remove(ids[index])
        }
        if(afterKeep)tx.update(end.blockId,after)
        else if(tx.get(end.blockId))tx.remove(end.blockId)
      }

      const live=tx.list()
      let insertAt
      if(beforeKeep){
        insertAt=live.findIndex(record=>record.id===start.blockId)+1
      }else if(start.blockId!==end.blockId&&afterKeep){
        insertAt=live.findIndex(record=>record.id===end.blockId)
      }else{
        insertAt=Math.min(startIndex,live.length)
      }
      for(const record of insertedRecords){
        tx.insert(insertAt++,record)
        inserted.push(record.id)
      }

      if(sameBlockAfter){
        tx.insert(insertAt,sameBlockAfter)
        inserted.push(sameBlockAfter.id)
      }
    })

    if(parts.length===1&&firstPart?.kind==='rich-text'&&beforeKeep){
      return {blockId:start.blockId,inserted,focus:{
        fieldKey:start.fieldKey,
        offset:start.offset+getRichTextLogicalLength(firstPart.html,firstPart.inline,this.#ownerDocument),
      }}
    }
    const focusId=inserted.at(-1)??(afterKeep&&start.blockId!==end.blockId?end.blockId:start.blockId)
    return {blockId:focusId,inserted}
  }

  replaceRichText(blockId, fieldKey, range, replacement) {
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
    if (typeof producer !== 'function') throw new TypeError('Inline widget update producer must be a function')
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.update' }, tx => {
      const current = tx.get(blockId)
      if (!current) throw new Error(`Unknown block id: ${blockId}`)
      if (!this.#registry.hasBlock(current.type)) throw new Error(`Unregistered block cannot be updated: ${blockId}`)
      const ref = Object.hasOwn(current.inline ?? {}, inlineId) ? current.inline[inlineId] : undefined
      if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.type !== 'string') {
        throw new Error(`Unknown inline widget id: ${inlineId}`)
      }
      const definition = this.#registry.getInlineDefinition(ref.type)
      if (!definition) throw new Error(`Unknown inline widget type: ${ref.type}`)
      const decoded = definition.schema.decode({ dataVersion: ref.dataVersion, data: ref.data })
      const nextData = producer(cloneEditorData(decoded.data))
      const latest = tx.get(blockId)
      const inline = cloneInline(latest?.inline) ?? {}
      const latestRef = Object.hasOwn(inline, inlineId) ? inline[inlineId] : undefined
      if (!latest || latest.type !== current.type || latestRef?.type !== ref.type) {
        throw new Error('Inline widget update target changed during its producer')
      }
      const encoded = definition.schema.encode(nextData)
      inline[inlineId] = {
        type: ref.type,
        dataVersion: encoded.dataVersion,
        data: encoded.data,
      }
      const blockDefinition = this.#registry.getBlockDefinition(current.type)
      const next = this.#recordFromData(
        latest.id, latest.type, blockDefinition, latest.data, latest.tunes, inline,
      )
      if (
        latest.dataVersion === next.dataVersion
        && sameJson(latest.data, next.data)
        && sameJson(latest.tunes, next.tunes)
        && sameJson(latest.inline, next.inline)
      ) return
      tx.update(blockId, next)
    })
  }

  replaceInlineWidgetWithText(blockId, inlineId, text = '') {
    this.#assertInteractionMutation()
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
    this.#assertInteractionMutation()
    if (!Array.isArray(ids) || ids.length === 0) return undefined
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

    const selectionBefore = metadata.selectionBefore === undefined
      ? this.#captureSelection()
      : cloneEditorData(metadata.selectionBefore)
    this.#editingProjection = true
    try {
      const result = operation()
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        throw new TypeError('Projection edit operation must be synchronous')
      }

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

      if (updates.length) {
        const projectedSelection = metadata.selectionAfter === undefined ? this.#captureSelection() : null
        const selectionAfter = metadata.selectionAfter ?? (() => {
          this.#restoreSelection(projectedSelection)
          return projectedSelection
        })
        this.#editingProjection = false
        this.#engine.execute({
          origin: metadata.origin ?? 'user',
          name: metadata.name ?? 'projection.sync',
          selectionBefore,
          selectionAfter,
          historyGroup: metadata.historyGroup,
          coalesce: metadata.coalesce === true,
          sourceBlockId: metadata.preserveSourceProjection === true && ordered.length === 1
            ? ordered[0]
            : undefined,
        }, tx => {
          for (const [id, next] of updates) tx.update(id, next)
        })
      }
      return result
    } catch (error) {
      this.#editingProjection = true
      try {
        this.#projector?.restore?.(this.#store)
      } catch (recoveryError) {
        this.#controlFailed = true
        throw new AggregateError([error, recoveryError], 'Projection edit failed and recovery also failed')
      }
      this.#restoreSelection(selectionBefore)
      throw error
    } finally {
      this.#editingProjection = false
    }
  }

  syncBlockFromProjection(id, operation, metadata = {}) {
    return this.syncBlocksFromProjection([id], operation, metadata)
  }

  discardProjectionEdits() {
    this.#assertHostMutation()
    this.#discardProjectionEdits()
  }

  #discardProjectionEdits() {
    if (this.#engine.phase !== 'idle') throw new Error(`Cannot restore projection during ${this.#engine.phase} phase`)
    this.#editingProjection = true
    try {
      this.#projector?.restore?.(this.#store)
    } catch (error) {
      this.#controlFailed = true
      throw error
    } finally {
      this.#editingProjection = false
    }
  }

  getTextAlign(ids) {
    const unique = [...new Set(ids ?? [])]
    if (!unique.length) return 'left'
    let value = null
    for (const id of unique) {
      const record = this.#store.get(id)
      if (!record) throw new Error(`Unknown block id: ${id}`)
      const align = ['center', 'right', 'justify'].includes(record.tunes?.textAlign)
        ? record.tunes.textAlign
        : 'left'
      if (value === null) value = align
      else if (value !== align) return 'mixed'
    }
    return value ?? 'left'
  }

  setTextAlign(ids, value) {
    this.#assertInteractionMutation()
    if (value !== null && !['left', 'center', 'right', 'justify'].includes(value)) {
      throw new TypeError('Text alignment must be left, center, right, justify, or null')
    }
    const ordered = [...new Set(ids ?? [])]
    const updates = []
    for (const id of ordered) {
      const current = this.#store.get(id)
      if (!current) throw new Error(`Unknown block id: ${id}`)
      if (this.activation(id)?.kind !== 'active') throw new Error(`Unregistered block cannot be aligned: ${id}`)
      const definition = this.#registry.getBlockDefinition(current.type)
      const tunes = cloneTunes(current.tunes) ?? {}
      if (value === null || value === 'left') delete tunes.textAlign
      else tunes.textAlign = value
      const next = this.#recordFromData(
        id, current.type, definition, current.data,
        Object.keys(tunes).length ? tunes : undefined,
        current.inline,
      )
      if (!sameJson(current.tunes, next.tunes)) updates.push([id, next])
    }
    if (!updates.length) return false
    this.#engine.execute({ origin: 'user', name: 'format.text-align' }, tx => {
      for (const [id, next] of updates) tx.update(id, next)
    })
    return true
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



  #assertCurrentClipboardPlan(plan){
    if(!plan||typeof plan!=='object')throw new TypeError('Clipboard plan is invalid')
    if(plan.generation!==this.#store.generation||plan.revision!==this.#store.revision){
      throw new Error('Clipboard target is stale')
    }
  }

  #prepareClipboardBlockSlice(record,start,end){
    if(this.activation(record.id)?.kind!=='active')return null
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition?.schema?.mapRichText)return null
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
    const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
    if(startIndex<0||endIndex<startIndex)return null

    const selected=new Map()
    for(let index=startIndex;index<=endIndex;index++){
      const field=fields[index]
      const range={
        start:index===startIndex?Math.max(0,start.offset):0,
        end:index===endIndex?Math.max(0,end.offset):field.length,
      }
      const slice=sliceRichTextRange(field.html,inline,range,this.#ownerDocument)
      selected.set(field.key,Object.freeze({
        fieldKey:field.key,
        before:slice.before,
        selected:slice.selected,
        after:slice.after,
        whole:range.start===0&&range.end>=field.length,
      }))
    }

    const capability=definition.capabilities?.clipboard
    if(!capability){
      if(selected.size!==1)return null
      const field=selected.values().next().value
      const part=this.#clipboardRichTextPart(field.selected,inline)
      const remaining=this.#replaceBlockRichTextRange(
        record,start,end,{kind:'text',text:''},
      )
      if(!remaining)return null
      return {
        parts:[part],
        remaining:this.#isClipboardResidualEmpty(remaining)?null:remaining,
        focus:{fieldKey:start.fieldKey,offset:start.offset},
        compound:false,
      }
    }

    const result=capability.slice(cloneEditorData(record.data),{
      createId:prefix=>this.createDataId(prefix),
      field:key=>selected.get(key)??null,
    })
    if(!result||typeof result!=='object'||Array.isArray(result)){
      throw new TypeError(`Clipboard capability for "${record.type}" returned an invalid result`)
    }
    if(!Array.isArray(result.parts)||result.parts.length===0){
      throw new TypeError(`Clipboard capability for "${record.type}" must return parts`)
    }
    for(let index=0;index<result.parts.length;index++){
      if(!Object.hasOwn(result.parts,index))throw new TypeError('Clipboard capability parts must be dense')
    }

    const parts=result.parts.map(part=>{
      if(part?.kind==='rich-text'){
        if(typeof part.html!=='string')throw new TypeError('Clipboard rich-text part must contain html')
        return this.#clipboardRichTextPart(part.html,inline)
      }
      if(part?.kind==='local-block'){
        const local=this.#recordFromData(
          record.id,record.type,definition,part.data,record.tunes,record.inline,
        )
        return {kind:'block',block:local}
      }
      throw new TypeError('Clipboard capability part must be local-block or rich-text')
    })

    let remaining=null
    if(result.remaining!==null){
      remaining=this.#recordFromData(
        record.id,record.type,definition,result.remaining,record.tunes,record.inline,
      )
    }
    const focus=result.focus&&typeof result.focus==='object'
      ?cloneEditorData(result.focus)
      :{fieldKey:start.fieldKey,offset:start.offset}
    return {parts,remaining,focus,compound:true}
  }

  #clipboardRichTextPart(html,inline){
    const scan=scanRichTextPlaceholders(html,inline,this.#ownerDocument)
    const selectedInline={}
    for(const id of scan.references){
      if(Object.hasOwn(inline,id))selectedInline[id]=cloneEditorData(inline[id])
    }
    return {
      kind:'rich-text',
      html,
      ...(Object.keys(selectedInline).length?{inline:selectedInline}:{}),
    }
  }

  #materializeClipboardBlock(input,reserved){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Clipboard block part is invalid')
    if(typeof input.type!=='string'||!input.type)throw new TypeError('Clipboard block type must be non-empty')
    const id=this.#allocateId(input.type,reserved)
    const candidate={id,type:input.type,dataVersion:input.dataVersion,data:input.data}
    if(Object.hasOwn(input,'tunes'))candidate.tunes=input.tunes
    if(Object.hasOwn(input,'inline'))candidate.inline=input.inline
    const decoded=decodeCurrentBlock(candidate,{
      getBlockSchema:type=>this.#registry.getBlockDefinition(type)?.schema,
      getInlineSchema:type=>this.#registry.getInlineDefinition(type)?.schema,
    })
    const definition=this.#registry.getBlockDefinition(decoded.type)
    return definition
      ?this.#recordFromData(
          decoded.id,decoded.type,definition,decoded.data,decoded.tunes,decoded.inline,
        )
      :decoded
  }

  #splitClipboardResiduals(record,start,end){
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition?.schema?.mapRichText)return null
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
    const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
    if(startIndex<0||endIndex<startIndex)return null

    const beforeData=definition.schema.mapRichText(cloneEditorData(record.data),(html,key)=>{
      const index=fields.findIndex(field=>field.key===key)
      if(index<startIndex)return html
      if(index>startIndex)return ''
      return sliceRichTextRange(
        html,inline,{start:0,end:start.offset},this.#ownerDocument,
      ).selected
    })
    const afterData=definition.schema.mapRichText(cloneEditorData(record.data),(html,key)=>{
      const index=fields.findIndex(field=>field.key===key)
      if(index>endIndex)return html
      if(index<endIndex)return ''
      return sliceRichTextRange(
        html,inline,{start:end.offset,end:Number.MAX_SAFE_INTEGER},this.#ownerDocument,
      ).selected
    })
    return {
      before:this.#recordFromData(
        record.id,record.type,definition,beforeData,record.tunes,inline,
      ),
      after:this.#recordFromData(
        record.id,record.type,definition,afterData,record.tunes,inline,
      ),
    }
  }

  #isClipboardResidualEmpty(record){
    const definition=this.#registry.getBlockDefinition(record.type)
    const empty=definition?.capabilities?.empty?.isEmpty
    return typeof empty==='function'?empty(record.data)===true:false
  }


  #recordWithRichTextFragment(current,fieldKey,range,fragment){
    if(!fragment||typeof fragment!=='object'||Array.isArray(fragment)||typeof fragment.html!=='string'){
      throw new TypeError('Rich-text clipboard fragment must contain html')
    }
    if(this.activation(current.id)?.kind!=='active'){
      throw new Error(`Unregistered block cannot be updated: ${current.id}`)
    }
    const definition=this.#registry.getBlockDefinition(current.type)
    if(!definition?.schema?.mapRichText)throw new Error(`Block type has no rich-text fields: ${current.type}`)
    const currentInline=cloneInline(current.inline)??{}
    const sourceInline=fragment.inline===undefined
      ?{}
      :this.#normalizeExternalInline(fragment.inline)??{}
    const scan=this.#scanBlockRichText(definition,current.data,currentInline)
    const reserved=new Set([
      ...Object.keys(currentInline),
      ...scan.references,
      ...scan.literals,
    ])
    const remapped=remapCanonicalFragment({
      html:fragment.html,
      inline:sourceInline,
      reservedIds:reserved,
      ownerDocument:this.#ownerDocument,
      allocateInlineId:ids=>this.#allocateInlineId(ids),
    })
    const inline={...currentInline,...remapped.inline}
    let matched=false
    const nextData=definition.schema.mapRichText(cloneEditorData(current.data),(html,key)=>{
      if(key!==fieldKey)return html
      matched=true
      return replaceRichTextRange(
        html,currentInline,range,{kind:'html',html:remapped.html},this.#ownerDocument,
      )
    })
    if(!matched)throw new Error(`Unknown rich-text field "${fieldKey}" for block "${current.id}"`)
    return this.#recordFromData(
      current.id,current.type,definition,nextData,current.tunes,inline,
    )
  }

  #materializeClipboardRichText(part,reserved){
    const inline=part.inline===undefined?{}:this.#normalizeExternalInline(part.inline)??{}
    const payload={kind:/** @type {'rich-text'} */('rich-text'),data:{text:part.html}}
    const ordered=[
      this.#registry.defaultBlockType,
      ...this.#registry.blockTypes.filter(type=>type!==this.#registry.defaultBlockType),
    ]
    for(const type of ordered){
      const definition=this.#registry.getBlockDefinition(type)
      const conversion=definition?.capabilities?.conversion
      if(!conversion?.canImport?.(payload))continue
      const data=conversion.import(payload)
      const id=this.#allocateId(type,reserved)
      const record=this.#recordFromData(id,type,definition,data,undefined,inline)
      this.#assertConversionInlinePreserved(payload,inline,definition,record)
      return record
    }
    throw new Error('No registered block type can materialize clipboard rich-text')
  }


  #replaceBlockRichTextRange(record,start,end,replacement){
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition?.schema?.mapRichText)return null
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
    const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
    if(startIndex<0||endIndex<startIndex)return null
    const nextData=definition.schema.mapRichText(
      cloneEditorData(record.data),
      (html,key)=>{
        const index=fields.findIndex(field=>field.key===key)
        if(index<startIndex||index>endIndex)return html
        if(startIndex===endIndex){
          return replaceRichTextRange(
            html,inline,{start:start.offset,end:end.offset},replacement,this.#ownerDocument,
          )
        }
        if(index===startIndex){
          return replaceRichTextRange(
            html,inline,{start:start.offset,end:Number.MAX_SAFE_INTEGER},replacement,this.#ownerDocument,
          )
        }
        if(index===endIndex){
          return replaceRichTextRange(
            html,inline,{start:0,end:end.offset},{kind:'text',text:''},this.#ownerDocument,
          )
        }
        return replaceRichTextRange(
          html,inline,{start:0,end:Number.MAX_SAFE_INTEGER},{kind:'text',text:''},this.#ownerDocument,
        )
      },
    )
    return this.#recordFromData(
      record.id,record.type,definition,nextData,record.tunes,inline,
    )
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

  #targetDataFromPayload(targetDefinition,payload,target,baseData=undefined){
    let data
    const conversion=targetDefinition.capabilities?.conversion
    if(baseData!==undefined){
      data=cloneEditorData(baseData)
    }else if(payload&&conversion?.canImport?.(payload)){
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

    // A compound owner keeps its assets and stable item identities once. The
    // owning clipboard capability already describes removing this exact text
    // interval without duplicating the surrounding card, rows or media.
    if((sliced.before||sliced.after)&&sourceDefinition.capabilities?.clipboard){
      const residual=this.#prepareClipboardBlockSlice(current,start,end)
      if(!residual)return false
      const targetId=residual.remaining?this.#createUniqueBlockId(target.type):current.id
      const targetRecord=this.#recordFromData(
        targetId,target.type,targetDefinition,targetData,current.tunes,sourceInline,
      )
      this.#assertConversionInlinePreserved(
        sliced.selected,sourceInline,targetDefinition,targetRecord,
      )
      this.#engine.execute({origin:'user',name:'selection.convert'},tx=>{
        if(residual.remaining){
          tx.update(current.id,residual.remaining)
          tx.insert(index+1,targetRecord)
        }else tx.update(current.id,targetRecord)
      })
      return {focusId:targetId,convertedIds:[targetId]}
    }

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
    // Importing a caption does not make a media/compound target a text block.
    // Grouping is declared by the target independently of payload compatibility.
    if(targetConversion?.selectionMode!=='per-block'){
      let payload=null
      const selected=[]
      if(targetConversion?.joinSelection){
        if(this.#payloadHasContent(firstSlice.selected))selected.push({payload:firstSlice.selected,inline:firstSlice.inline})
        for(let index=firstIndex+1;index<lastIndex;index++){
          const record=this.#store.get(ids[index])
          if(!record||this.activation(record.id)?.kind!=='active')return false
          const conversion=this.#registry.getBlockDefinition(record.type)?.capabilities?.conversion
          if(!conversion)return false
          selected.push({payload:conversion.export(record.data),inline:cloneInline(record.inline)??{}})
        }
        if(this.#payloadHasContent(lastSlice.selected))selected.push({payload:lastSlice.selected,inline:lastSlice.inline})
        if(!selected.length)return false
        payload=targetConversion.joinSelection(selected.map(part=>cloneEditorData(part.payload)),{ownerDocument:this.#ownerDocument})
        if(!targetConversion.canImport(payload))return false
      }
      const targetData=this.#targetDataFromPayload(targetDefinition,payload,target)
      const targetId=this.#createUniqueBlockId(target.type)
      const targetRecord=this.#recordFromData(targetId,target.type,targetDefinition,targetData,first.tunes,{})
      for(const part of selected)this.#assertConversionInlinePreserved(part.payload,part.inline,targetDefinition,targetRecord)
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
        tx.insert(insertAt,targetRecord)
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
      if(record.type!==target.type&&!targetConversion?.canImport?.(payload))return false
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
      const sameType=piece.original.type===target.type&&target.toolboxItemId===undefined
      if(!sameType&&!targetConversion?.canImport?.(piece.payload))return false
      // A matching owner is already in the requested type. Preserve its data
      // rather than round-tripping its fields through a neutral text payload.
      // For endpoints, the existing plugin clipboard contract owns the exact
      // selected structure (items, captions and metadata); generic rich fields
      // provide the fallback without hard-coding plugin names.
      piece.data=sameType
        ?piece.position==='middle'
          ?piece.original.data
          :this.#selectedSourceData(
            piece.original,
            piece.position==='first'?start:null,
            piece.position==='last'?end:null,
          )
        :this.#targetDataFromPayload(targetDefinition,piece.payload,target)
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

  #selectedSourceData(record,start,end){
    const definition=this.#registry.getBlockDefinition(record.type)
    const inline=cloneInline(record.inline)??{}
    const fields=this.#richTextFields(definition,record.data,inline)
    const first=start??{fieldKey:fields[0].key,offset:0}
    const last=end??{fieldKey:fields.at(-1).key,offset:fields.at(-1).length}
    if(definition.capabilities?.clipboard){
      const sliced=this.#prepareClipboardBlockSlice(record,first,last)
      if(sliced?.parts.length===1&&sliced.parts[0].kind==='block')return sliced.parts[0].block.data
    }
    const from=fields.findIndex(field=>field.key===first.fieldKey)
    const to=fields.findIndex(field=>field.key===last.fieldKey)
    return definition.schema.mapRichText(cloneEditorData(record.data),(html,key)=>{
      const index=fields.findIndex(field=>field.key===key)
      if(index<from||index>to)return ''
      return sliceRichTextRange(html,inline,{
        start:index===from?first.offset:0,
        end:index===to?last.offset:fields[index].length,
      },this.#ownerDocument).selected
    })
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

  #captureSelection() {
    try { return cloneEditorData(this.#selection?.capture?.() ?? null) }
    catch (error) {
      this.#diagnostics?.emit('command.failed', { operation: 'projection.selection.capture', errorName: this.#diagnostics.errorName(error) })
      return null
    }
  }

  #restoreSelection(bookmark) {
    if (!bookmark || !this.#selection?.restore) return
    try { this.#selection.restore(cloneEditorData(bookmark)) }
    catch (error) {
      this.#diagnostics?.emit('command.failed', { operation: 'projection.selection.restore', errorName: this.#diagnostics.errorName(error) })
    }
  }

  #mutationPhase() {
    if (this.#editingProjection) return 'protected-projection-edit'
    if (this.#changingReadOnly) return 'read-only-transition'
    return this.#engine?.phase ?? 'idle'
  }

  #assertHostMutation() {
    if (this.#destroyed) throw new Error('DocumentRuntime is destroyed')
    if (this.health === 'failed') throw new Error('DocumentRuntime is failed')
    if (this.#editingProjection) throw new Error('Cannot mutate document during protected projection edit')
    if (this.#changingReadOnly) throw new Error('Cannot mutate document during read-only transition')
    const phase = this.#engine?.phase ?? 'idle'
    if (phase !== 'idle' && phase !== 'building') throw new Error(`Cannot mutate document during ${phase} phase`)
  }

  #assertInteractionMutation() {
    this.#assertHostMutation()
    if (this.#readOnly) throw new Error('DocumentRuntime is read-only')
  }

  #assertMutationAuthority(authority) {
    if (authority === 'host') {
      this.#assertHostMutation()
      return
    }
    if (authority !== 'interaction') throw new TypeError('Unknown mutation authority')
    this.#assertInteractionMutation()
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

  #blockContext(id, type, signal, readRecord, scope) {
    if (!scope?.createAuthority) throw new TypeError('Block instance scope is unavailable')
    scope.configure({
      readOnly: this.#readOnly,
      health: () => this.health,
      phase: () => this.#mutationPhase(),
      currentGeneration: () => this.#store.generation,
      signal,
    })

    const currentRecord = () => {
      const record = typeof readRecord === 'function'
        ? readRecord()
        : this.#store.get(id)
      if (!record || record.type !== type) throw new Error(`Block is no longer active: ${id}`)
      return record
    }

    const authority = scope.createAuthority({
      readData: () => currentRecord().data,
      updateData: producer => {
        this.update(id, current => ({
          data: producer(current.data),
        }))
      },
      commitDomMutation: operation => {
        this.syncBlockFromProjection(id, operation, {
          origin: 'plugin',
          name: 'plugin.dom-mutation',
        })
      },
      createId: prefix => this.createDataId(prefix),
    })

    let context
    context = Object.freeze({
      ...authority,
      ownerDocument: this.#ownerDocument,
      signal,
      requestSplit: () => scope.runMutation(() => this.#requestSplit?.(id)),
      requestExit: () => scope.runMutation(() => this.#requestExit?.(id)),
      createInlineWidgetContext: (fieldKey, inlineId, inlineType, inlineSignal, inlineScope) => {
        if (!inlineScope?.createAuthority) throw new TypeError('Inline instance scope is unavailable')
        inlineScope.configure({
          generation: scope.generation,
          readOnly: this.#readOnly,
          health: () => this.health,
          phase: () => this.#mutationPhase(),
          currentGeneration: () => this.#store.generation,
          signal: inlineSignal,
          parent: scope,
        })
        const inlineAuthority = inlineScope.createAuthority({
          readData: () => {
            const record = currentRecord()
            const ref = record.inline?.[inlineId]
            if (!ref || ref.type !== inlineType) {
              throw new Error(`Inline widget is no longer active: ${inlineId}`)
            }
            const definition = this.#registry.getInlineDefinition(inlineType)
            if (!definition) throw new Error(`Unknown inline widget type: ${inlineType}`)
            return definition.schema.decode({
              dataVersion: ref.dataVersion,
              data: ref.data,
            }).data
          },
          updateData: producer => this.updateInlineWidget(id, inlineId, producer),
          commitDomMutation: operation => {
            this.syncBlockFromProjection(id, operation, {
              origin: 'plugin',
              name: 'inline-widget.dom-mutation',
              preserveSourceProjection: true,
            })
          },
          createId: prefix => this.createDataId(prefix),
        })
        return Object.freeze({
          ...inlineAuthority,
          id: inlineId,
          blockId: id,
          fieldKey,
          signal: inlineSignal,
        })
      },
    })
    return context
  }
}
