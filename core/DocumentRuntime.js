// @ts-check
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
import { prepareHtmlImport as prepareHtmlImportCandidates } from './HtmlImportRouter.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { decodeCurrentInlineMap } from '../shared/DocumentSchema.js'
import { documentValidationIssue } from '../shared/documentValidationIssue.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { richTextFieldMap } from './projectionFields.js'
import { DOCUMENT_FORMAT_VERSION } from '../shared/documentFormat.js'
import { invokeObserver } from '../shared/invokeObserver.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { ensureRichTextReferenceSuffix, getRichTextLogicalLength, replaceRichTextRange, replaceRichTextReference, scanRichTextPlaceholders, splitRichTextRange } from '../shared/richTextOperations.js'
import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
  prepareCanonicalInlineMerge,
  remapCanonicalFragment,
  scanCanonicalRichText,
  captureDocumentView,
  canonicalRecordsEqual,
} from './CanonicalTransforms.js'
import { richTextFields, orderedLogicalRange, sliceSelection, endpointSelection, prepareRemoveBlocks, prepareReplaceWholeDocument, prepareReplaceLogicalRange } from './LogicalRangePlans.js'
import { selectedSourceData, prepareClipboardBlockSlice, prepareClipboardSlice, prepareClipboardCut, prepareReplaceClipboardSlice, prepareInsertClipboardParts, prepareReplaceClipboardRange, prepareInsertLocalBlocks, preparePasteResults, prepareInlineSegments } from './ClipboardPlans.js'
import { uid } from '../shared/uid.js'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'
import { prepareCurrentDocument, prepareNewDocument } from './DocumentIngestion.js'

function deepFreezeClipboardValue(value) {
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))deepFreezeClipboardValue(child)
    Object.freeze(value)
  }
  return value
}

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

export class DocumentRuntime {
  #clipboardHandles = new WeakMap()
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
  #projectingPresentation = false
  #changingReadOnly = false
  #preparationDepth = 0
  #observationDepth = 0
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
   *     projectPresentation: (operation: () => any) => any,
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
    this.#allocateId = createSessionIdAllocator(prefix=>this.prepareExtensionValue(()=>Reflect.apply(this.#createId,undefined,[prefix])))
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

    const initial = this.#prepareDocument(() => {
      const data = options.data
      return data === undefined ? prepareNewDocument(this.#ingestionServices())
        : prepareCurrentDocument(data, this.#ingestionServices())
    })
    this.#store = new DocumentStore(initial)
    this.#history = new HistoryStore(options.history)

    const contextFactory = (id, type, signal, readRecord, scope) => this.#blockContext(id, type, signal, readRecord, scope)
    const activationResolver = (id, record) => this.#canActivate(id, record)
    this.#projector = options.projectorFactory
      ? options.projectorFactory({
          store: this.#store,
          activationResolver,
          contextFactory,
          projectPresentation: operation => {
            const previous = this.#projectingPresentation
            this.#projectingPresentation = true
            try { return this.prepareExtensionValue(operation) }
            finally { this.#projectingPresentation = previous }
          },
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

  /** Shared internal boundary for completely captured synchronous extension values.
   * @template T
   * @param {() => T} operation
   * @returns {T}
   */
  prepareExtensionValue(operation) {
    if (typeof operation !== 'function') throw new TypeError('Preparation requires an operation')
    this.#preparationDepth++
    try {
      return synchronousResult(operation(), error => {
        this.#diagnostics?.emit('command.failed', {
          operation: 'extension.prepare', errorName: this.#diagnostics.errorName(error),
        })
      })
    } finally { this.#preparationDepth-- }
  }

  /** Internal observation guard; the invoking owner contains callback failures. */
  observeExtension(operation) {
    this.#observationDepth++
    try { return operation() }
    finally { this.#observationDepth-- }
  }

  /** Public adapters call this before observing any caller-owned input. */
  assertCommandAuthority(authority = 'host') {
    this.#assertMutationAuthority(authority)
  }

  /** Guard public control dispatch while preserving owner-driven internal recovery. */
  assertControlAuthority({ allowFailed = false } = {}) {
    if (this.#destroyed) throw new Error('DocumentRuntime is destroyed')
    if (!allowFailed && this.health === 'failed') throw new Error('DocumentRuntime is failed')
    const phase = this.#mutationPhase()
    if (phase !== 'idle' && phase !== 'building') throw new Error(`Cannot mutate document during ${phase} phase`)
  }

  insert(type, data, index = undefined, options = {}, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    return this.#executePrepared({ origin: 'external', name: 'block.insert' }, view => {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) throw new Error(`Unknown block type: ${type}`)
      const id = this.#allocateId(type,new Set(view.ids))
      const inlineInput=options.inline
      const inline = inlineInput === undefined ? undefined : this.#normalizeExternalInline(inlineInput)
      const record = this.#recordFromData(
        id,
        type,
        definition,
        data === undefined ? definition.schema.createDefault() : data,
        options.tunes,
        inline,
      )
      const insertAt=index===undefined?view.ids.length:index
      if(!Number.isInteger(insertAt)||insertAt<0||insertAt>view.ids.length)throw new RangeError('Insert index is out of range')
      return {edits:[{kind:'insert',index:insertAt,record}],result:record.id}
    })
  }

  /** Prepare one toolbox choice against its accepted interaction's current draft. */
  insertToolboxBlock(anchorId, target) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'toolbox.block'},view=>{
      const current=anchorId?view.peek(anchorId):undefined
      if(anchorId&&!current)return {edits:[],result:false}
      const type=target?.type
      const toolboxItemId=target?.toolboxItemId
      if(typeof type!=='string')throw new TypeError('Toolbox target requires a type')
      const definition=this.#registry.getBlockDefinition(type)
      if(!definition)throw new Error(`Unknown block type: ${type}`)
      const sourceDefinition=current?this.#registry.getBlockDefinition(current.type):undefined
      const replace=current&&sourceDefinition?.capabilities?.empty?.isEmpty?.(cloneEditorData(current.data))===true
      if(replace){
        if(current.type===type&&toolboxItemId===undefined)return {edits:[],result:current.id}
        const next=this.#convertedRecord(current,{type,toolboxItemId})
        return {edits:this.#updatedRecord(current.id,current,next),result:current.id}
      }
      const data=this.#targetDataFromPayload(definition,null,{type,toolboxItemId})
      const id=this.#allocateId(type,new Set(view.ids))
      const record=this.#recordFromData(id,type,definition,data,undefined,undefined)
      const index=anchorId?view.ids.indexOf(anchorId)+1:view.ids.length
      return {edits:[{kind:'insert',index,record}],result:id}
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
  applyPasteResults(blockId,fieldKey,range,entries) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'clipboard.paste'},view=>preparePasteResults(this.#planningServices(),view,blockId,fieldKey,cloneEditorData(range),cloneEditorData(entries)))
  }

  /** Resolve the active-draft target and own every synchronous HTML capability result.
   * @param {string} html
   * @param {string} anchorId
   */
  prepareHtmlImport(html, anchorId) {
    return this.prepareExtensionValue(() => {
      const view = captureDocumentView(this.#engine.currentReadSource)
      const currentType = view.peek(anchorId)?.type ?? null
      const candidate = prepareHtmlImportCandidates(html, {
        ownerDocument: this.#ownerDocument,
        registry: this.#registry,
        currentType,
        createId: prefix => this.#allocateId(prefix),
      })
      return candidate === null ? null : cloneEditorData(candidate)
    })
  }

  insertLocalBlocks(anchorId,inputs,options={}) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'blocks.insert-local'},view=>prepareInsertLocalBlocks(this.#planningServices(),view,anchorId,cloneEditorData(inputs),cloneEditorData(options)))
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

  /** Capture a shortcut decision inside its owning controller transaction. */
  prepareShortcutAction(source, blockId, input, fieldLengths) {
    return this.prepareExtensionValue(()=>{
      const view=captureDocumentView({ids:source.ids,peek:source.peek})
      const current=view.peek(blockId)
      const definition=current?this.#registry.getBlockDefinition(current.type):undefined
      const handle=definition?.capabilities?.shortcuts?.handle
      if(typeof handle!=='function')return null
      const fields=richTextFieldMap(definition,current.data)
      const lengths=new Map(fieldLengths)
      const ownerDocument=this.#ownerDocument
      const inline=cloneInline(current.inline)??{}
      const context=Object.freeze({
        createId:prefix=>this.#allocateId(prefix),
        fieldLength:key=>lengths.get(key)??0,
        splitField:(key,range)=>this.prepareExtensionValue(()=>fields.has(key)&&ownerDocument
          ?splitRichTextRange(fields.get(key),inline,range,ownerDocument):null),
      })
      const action=cloneEditorData(synchronousResult(handle(cloneEditorData(input),cloneEditorData(current.data),context)))
      if(action===null)return null
      if(!action||typeof action!=='object'||Array.isArray(action))throw new TypeError('Shortcut action must be an object or null')
      const keys={native:['kind'],consume:['kind'],exit:['kind','data'],focus:['kind','target'],update:['kind','data','focus']}[action.kind]
      if(!keys||Object.keys(action).some(key=>!keys.includes(key)))throw new TypeError('Invalid shortcut action')
      if(action.kind==='update'||Object.hasOwn(action,'data')){
        if(!action.data||typeof action.data!=='object'||Array.isArray(action.data))throw new TypeError('Shortcut data must be an object')
      }
      const target=action.kind==='focus'?action.target:action.focus
      if(action.kind==='focus'||target!==undefined){
        if(!target||typeof target!=='object'||Array.isArray(target)
          ||(target.fieldKey!==undefined&&(typeof target.fieldKey!=='string'||!target.fieldKey))
          ||(target.offset!==undefined&&target.offset!=='start'&&target.offset!=='end'
            &&(typeof target.offset!=='number'||!Number.isFinite(target.offset)||target.offset<0))){
          throw new TypeError('Invalid shortcut focus target')
        }
      }
      return action
    })
  }

  /** Prepare the structural result of an accepted exit request. */
  exitBlock(blockId, data=undefined) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'block.exit'},view=>{
      const current=view.peek(blockId)
      if(!current||!this.#registry.hasBlock(current.type))return {edits:[],result:false}
      const type=this.#registry.defaultBlockType
      if(data===undefined&&current.type!==type){
        const next=this.#convertedRecord(current,{type})
        return {edits:this.#updatedRecord(blockId,current,next),result:blockId}
      }
      const edits=[]
      if(data!==undefined){
        const definition=this.#registry.getBlockDefinition(current.type)
        const next=this.#recordFromData(blockId,current.type,definition,data,current.tunes,current.inline)
        edits.push(...this.#updatedRecord(blockId,current,next))
      }
      const definition=this.#registry.getBlockDefinition(type)
      const id=this.#allocateId(type,new Set(view.ids))
      const record=this.#recordFromData(id,type,definition,definition.schema.createDefault(),undefined,undefined)
      edits.push({kind:'insert',index:view.ids.indexOf(blockId)+1,record})
      return {edits,result:id}
    })
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
    return this.#executePrepared({ origin: 'user', name: 'block.split' }, view => {
    const noSplit={edits:[],result:false}
    // A preceding range replacement can already have changed this block in
    // the current transaction. Read its draft, so Enter remains one action.
    const current = view.peek(id)
    if (!current) throw new Error(`Unknown block id: ${id}`)
    if (this.#activationFor(current)?.kind !== 'active') throw new Error(`Unregistered block cannot be split: ${id}`)
    const sourceDefinition = this.#registry.getBlockDefinition(current.type)
    if (!sourceDefinition?.schema?.mapRichText) return noSplit

    const defaultType = this.#registry.defaultBlockType
    const targetDefinition = this.#registry.getBlockDefinition(defaultType)
    if (!targetDefinition?.schema?.mapRichText) return noSplit

    const inline = cloneInline(current.inline) ?? {}
    const start = Math.max(0, Math.trunc(range?.start) || 0)
    const end = Math.max(start, Math.trunc(range?.end ?? start) || 0)
    let matched = false
    let trailing = ''
    const sourceData = sourceDefinition.schema.mapRichText(cloneEditorData(current.data), (html, key) => {
      if (key !== fieldKey) return html
      matched = true
      const split = splitRichTextRange(html, inline, { start, end }, this.#ownerDocument)
      trailing = split.after
      return split.before
    })
    if (!matched) return noSplit

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
    if (!targetField) return noSplit

    const newId = this.#allocateId(defaultType,new Set(view.ids))
    const sourceRecord = this.#recordFromData(
      current.id, current.type, sourceDefinition, sourceData, current.tunes, inline,
    )
    const targetRecord = this.#recordFromData(
      newId, defaultType, targetDefinition, targetData, current.tunes, remappedTrailing.inline,
    )

    const index = view.ids.indexOf(id)
    return {edits:[...this.#updatedRecord(id,current,sourceRecord),{kind:'insert',index:index+1,record:targetRecord}],result:newId}
    })
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
    return this.#executePrepared({ origin: 'user', name: 'block.merge' }, view => {
      const noMerge = { edits: [], result: false }
      const ids = view.ids
      const targetIndex = ids.indexOf(targetId)
      const sourceIndex = ids.indexOf(sourceId)
      if (targetIndex < 0 || sourceIndex !== targetIndex + 1) return noMerge

      const target = view.peek(targetId)
      const source = view.peek(sourceId)
      if (!target || !source || target.type !== source.type) return noMerge
      if (!this.#registry.hasBlock(target.type) || !this.#registry.hasBlock(source.type)) return noMerge
      const definition = this.#registry.getBlockDefinition(target.type)
      const merge = definition?.capabilities?.merge?.merge
      if (typeof merge !== 'function') return noMerge

      const prepared = this.#prepareInlineMerge(definition, target, source)
      const mergedData = merge(prepared.targetData, prepared.sourceData)
      const next = this.#recordFromData(
        target.id, target.type, definition, mergedData, target.tunes, prepared.inline,
      )

      return { edits: [...this.#updatedRecord(targetId, target, next), { kind: 'remove', id: sourceId }], result: true }
    })
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
      const prepared = this.prepareExtensionValue(() => {
        synchronousResult(patch)
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          throw new TypeError('Block update producer must return an object')
        }
        if (Object.hasOwn(patch, 'type') || Object.hasOwn(patch, 'id') || Object.hasOwn(patch, 'inline')) {
          throw new TypeError('Block update cannot change id, type, or inline payload')
        }

        const latest = tx.get(id)
        if (!latest || latest.type !== current.type) throw new Error('Block update target changed during its producer')
        const nextData = Object.hasOwn(patch, 'data') ? patch.data : latest.data
        const requestedTunes = Object.hasOwn(patch, 'tunes') ? patch.tunes : latest.tunes
        const nextTunes = requestedTunes === null ? undefined : requestedTunes
        const next = this.#recordFromData(
          id, current.type, definition, nextData, nextTunes, latest.inline,
        )
        return { latest, next }
      })
      const { latest, next } = prepared

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
    return this.#executePrepared({ origin: 'external', name: 'block.remove' }, view => {
      const ids = view.ids
      if (!ids.includes(id)) throw new Error(`Unknown block id: ${id}`)
      const index = ids.indexOf(id)
      let focusId = ids[index + 1] ?? ids[index - 1]
      let fallback = null
      if (ids.length === 1) {
        const type = this.#registry.defaultBlockType
        const definition = this.#registry.getBlockDefinition(type)
        fallback = this.#recordFromData(
          this.#allocateId(type,new Set(ids)), type, definition, definition.schema.createDefault(), undefined, undefined,
        )
        focusId = fallback.id
      }
      const edits=fallback?[{kind:'remove',id},{kind:'insert',index:0,record:fallback}]:[{kind:'remove',id}]
      return {edits,result:focusId}
    })
  }

  removeBlocks(blockIds,authority='interaction') {
    this.#assertMutationAuthority(authority)
    return this.#executePrepared({origin:'user',name:'blocks.remove'},view=>prepareRemoveBlocks(this.#planningServices(),view,cloneEditorData(blockIds)))
  }

  /**
   * Replace a whole-document interaction selection with one default block.
   * @param {{kind:'text',text:string}|{kind:'html',html:string}} replacement
   * @returns {{blockId:string,fieldKey:string,offset:number}|false}
   */
  replaceWholeDocument(replacement,blockIds=undefined) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'selection.replace-all'},view=>prepareReplaceWholeDocument(this.#planningServices(),view,cloneEditorData(replacement),blockIds===undefined?undefined:cloneEditorData(blockIds)))
  }

  convert(id, target, authority = 'interaction') {
    this.#assertMutationAuthority(authority)
    return this.#executePrepared({ origin: 'external', name: 'block.convert' }, view => {
      const current = view.peek(id)
      if (!current) throw new Error(`Unknown block id: ${id}`)
      if (this.#activationFor(current)?.kind !== 'active') {
        throw new Error(`Unregistered block cannot be converted: ${id}`)
      }
      const type=target?.type
      const toolboxItemId=target?.toolboxItemId
      if (!target || typeof target !== 'object' || typeof type !== 'string') {
        throw new TypeError('Conversion target requires a type')
      }

      const targetDefinition = this.#registry.getBlockDefinition(type)
      if (!targetDefinition) throw new Error(`Unknown block type: ${type}`)
      if(current.type===type&&toolboxItemId===undefined)return {edits:[],result:current}

      // As in the block menu, every registered target is available. A target
      // imports transferable content when it can; otherwise it starts with its
      // own schema defaults. Never bypass the inline-reference preservation check.
      const next=this.#convertedRecord(current,{type,toolboxItemId})
      const edits=this.#updatedRecord(id,current,next)
      return {edits,result:edits.length?next:current}
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
    const ordered=this.prepareExtensionValue(()=>orderedLogicalRange(this.#planningServices(),captureDocumentView(this.#store),bookmark))
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
      const document = this.prepareExtensionValue(() => prepareNewDocument(this.#ingestionServices()))
      tx.replace(document)
    })
  }

  render(input) {
    this.#assertHostMutation()
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      this.#engine.execute({ origin: 'external', name: 'document.render' }, tx => {
        tx.replace(this.#prepareDocument(() => prepareCurrentDocument(input, this.#ingestionServices())))
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
    return this.#executePrepared({ origin: 'user', name: 'slash.block' }, view => {
      const noChange={edits:[],result:false}
      const current = view.peek(blockId)
      if (!current || !this.#registry.hasBlock(current.type)) return noChange
      const type=target?.type
      const toolboxItemId=target?.toolboxItemId
      if (!target || typeof type !== 'string') return noChange

      const sourceDefinition = this.#registry.getBlockDefinition(current.type)
      const targetDefinition = this.#registry.getBlockDefinition(type)
      if (!sourceDefinition?.schema?.mapRichText || !targetDefinition) return noChange
      const ownedRange=cloneEditorData(range)

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
            ownedRange,
            { kind: /** @type {'text'} */ ('text'), text: '' },
            this.#ownerDocument,
          )
        },
      )
      if (!matched) return noChange

      const sourceNext = this.#recordFromData(
        current.id, current.type, sourceDefinition, sourceData, current.tunes, inline,
      )

      let targetData = targetDefinition.schema.createDefault()
      if (toolboxItemId) {
        const item = targetDefinition.toolbox?.find(candidate => candidate.id === toolboxItemId)
        if (!item) return noChange
        if (item.configure) targetData = item.configure(targetData, {
          createId: prefix => this.#allocateId(prefix),
        })
      }
      const sourceEmpty = sourceDefinition.capabilities?.empty?.isEmpty?.(sourceNext.data) === true

      if (sourceEmpty) {
        const next = this.#recordFromData(
          blockId, type, targetDefinition, targetData, current.tunes, undefined,
        )
        return {edits:this.#updatedRecord(blockId,current,next),result:blockId}
      }

      const id = this.#allocateId(type,new Set(view.ids))
      const next = this.#recordFromData(
        id, type, targetDefinition, targetData, undefined, undefined,
      )
      const index = view.ids.indexOf(blockId)
      return {edits:[...this.#updatedRecord(blockId,current,sourceNext),{kind:'insert',index:index+1,record:next}],result:id}
    })
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

  replaceLogicalRange(bookmark,replacement={kind:'text',text:''}) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'selection.replace'},view=>prepareReplaceLogicalRange(this.#planningServices(),view,cloneEditorData(bookmark),cloneEditorData(replacement)))
  }

  prepareLogicalClipboardSlice(bookmark,wholeBlockIds=[]) {
    return this.prepareExtensionValue(()=>{
      const view=captureDocumentView(this.#engine.currentReadSource)
      const plan=prepareClipboardSlice(this.#planningServices(),view,cloneEditorData(bookmark),cloneEditorData(wholeBlockIds))
      if(!plan)return null
      const handle=deepFreezeClipboardValue(cloneEditorData({parts:plan.parts,bookmark:plan.bookmark,focus:plan.focus}))
      this.#clipboardHandles.set(handle,{plan,generation:this.#store.generation,revision:this.#store.revision,orderedIds:view.ids,sources:view.references()})
      return handle
    })
  }

  exportLogicalClipboardParts(bookmark) {
    const handle=this.prepareLogicalClipboardSlice(bookmark)
    return handle?cloneEditorData(handle.parts):null
  }

  applyPreparedClipboardCut(handle) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'clipboard.cut'},view=>{
      const prepared=this.#clipboardHandles.get(handle)
      if(!prepared)throw new TypeError('Clipboard handle is not issued by this runtime')
      if(prepared.generation!==this.#store.generation||prepared.revision!==this.#store.revision
        ||prepared.orderedIds.length!==view.ids.length||prepared.orderedIds.some((id,index)=>id!==view.ids[index])
        ||[...prepared.sources].some(([id,record])=>view.peek(id)!==record))throw new Error('Clipboard target is stale')
      return prepareClipboardCut(this.#planningServices(),view,prepared.plan)
    })
  }

  replacePreparedClipboardSlice(handle,parts) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'clipboard.fragment'},view=>{
      const prepared=this.#clipboardHandles.get(handle)
      if(!prepared)throw new TypeError('Clipboard handle is not issued by this runtime')
      if(prepared.generation!==this.#store.generation||prepared.revision!==this.#store.revision
        ||prepared.orderedIds.length!==view.ids.length||prepared.orderedIds.some((id,index)=>id!==view.ids[index])
        ||[...prepared.sources].some(([id,record])=>view.peek(id)!==record))throw new Error('Clipboard target is stale')
      return prepareReplaceClipboardSlice(this.#planningServices(),view,prepared.plan,cloneEditorData(parts))
    })
  }

  insertClipboardParts(blockId,fieldKey,range,parts) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'clipboard.fragment'},view=>prepareInsertClipboardParts(this.#planningServices(),view,blockId,fieldKey,cloneEditorData(range),cloneEditorData(parts)))
  }

  replaceLogicalRangeWithClipboardParts(bookmark,parts) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'clipboard.fragment'},view=>prepareReplaceClipboardRange(this.#planningServices(),view,cloneEditorData(bookmark),cloneEditorData(parts)))
  }

  replaceRichText(blockId, fieldKey, range, replacement) {
    this.#assertInteractionMutation()
    this.#executePrepared({ origin: 'plugin', name: 'rich-text.replace' }, view => {
      const current = view.peek(blockId)
      if (!current) throw new Error(`Unknown block id: ${blockId}`)
      if (!this.#registry.hasBlock(current.type)) throw new Error(`Unregistered block cannot be updated: ${blockId}`)
      const definition = this.#registry.getBlockDefinition(current.type)
      if (!definition?.schema?.mapRichText) throw new Error(`Block type has no rich-text fields: ${current.type}`)
      const ownedRange=cloneEditorData(range)
      const ownedReplacement=cloneEditorData(replacement)
      const data = cloneEditorData(current.data)
      let matched = false
      const inline = cloneInline(current.inline) ?? {}
      const nextData = definition.schema.mapRichText(data, (html, key) => {
        if (key !== fieldKey) return html
        matched = true
        return replaceRichTextRange(html, inline, ownedRange, ownedReplacement, this.#ownerDocument)
      })
      if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
      const next = this.#recordFromData(
        current.id, current.type, definition, nextData, current.tunes, inline,
      )
      return {edits:this.#updatedRecord(blockId,current,next),result:undefined}
    })
  }

  replaceRichTextWithInlineSegments(blockId,fieldKey,range,segments) {
    this.#assertInteractionMutation()
    return this.#executePrepared({origin:'user',name:'inline-paste'},view=>prepareInlineSegments(this.#planningServices(),view,blockId,fieldKey,cloneEditorData(range),cloneEditorData(segments)))
  }

  insertInlineWidget(blockId, fieldKey, range, type, data, options = {}) {
    this.#assertInteractionMutation()
    return this.#executePrepared({ origin: 'plugin', name: 'inline-widget.insert' }, view => {
      const trailingText = options.trailingText ?? ''
      if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) throw new TypeError('Inline trailing text must be a single-line string')
      const current = view.peek(blockId)
      if (!current) throw new Error(`Unknown block id: ${blockId}`)
      if (!this.#registry.hasBlock(current.type)) throw new Error(`Unregistered block cannot be updated: ${blockId}`)
      const blockDefinition = this.#registry.getBlockDefinition(current.type)
      if (!blockDefinition?.schema?.mapRichText) throw new Error(`Block type has no rich-text fields: ${current.type}`)
      const inlineDefinition = this.#registry.getInlineDefinition(type)
      if (!inlineDefinition) throw new Error(`Unknown inline widget type: ${type}`)
      const ownedRange=cloneEditorData(range)

      const encodedWidget = inlineDefinition.schema.encode(
        data === undefined ? inlineDefinition.schema.createDefault() : data,
      )
      const inline = cloneInline(current.inline) ?? {}
      const id = this.#createUniqueInlineId(blockDefinition, current.data, inline)
      Object.defineProperty(inline, id, { value: {
        type,
        dataVersion: encodedWidget.dataVersion,
        data: encodedWidget.data,
      }, enumerable: true, configurable: true, writable: true })

      const blockData = cloneEditorData(current.data)
      let matched = false
      const nextData = blockDefinition.schema.mapRichText(blockData, (html, key) => {
        if (key !== fieldKey) return html
        matched = true
        const result = replaceRichTextRange(
          html,
          inline,
          ownedRange,
          { kind: 'inline-reference', id },
          this.#ownerDocument,
        )
        return trailingText ? ensureRichTextReferenceSuffix(result, inline, id, trailingText, this.#ownerDocument).html : result
      })
      if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
      const next = this.#recordFromData(
        current.id, current.type, blockDefinition, nextData, current.tunes, inline,
      )
      return {edits:this.#updatedRecord(blockId,current,next),result:id}
    })
  }

  updateInlineWidget(blockId, inlineId, producer, options = {}) {
    this.#assertInteractionMutation()
    if (typeof producer !== 'function') throw new TypeError('Inline widget update producer must be a function')
    let trailingText=''
    const selection = this.#captureSelection()
    let selectionAfter = selection
    this.#engine.execute({ origin: 'plugin', name: 'inline-widget.update',
      selectionBefore: selection, selectionAfter: () => selectionAfter,
    }, tx => {
      const initial=this.prepareExtensionValue(()=>{
        const current = captureDocumentView({ids:tx.ids,peek:tx.peek}).peek(blockId)
        if (!current) throw new Error(`Unknown block id: ${blockId}`)
        if (!this.#registry.hasBlock(current.type)) throw new Error(`Unregistered block cannot be updated: ${blockId}`)
        const ref = Object.hasOwn(current.inline ?? {}, inlineId) ? current.inline[inlineId] : undefined
        if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.type !== 'string') {
          throw new Error(`Unknown inline widget id: ${inlineId}`)
        }
        const definition = this.#registry.getInlineDefinition(ref.type)
        if (!definition) throw new Error(`Unknown inline widget type: ${ref.type}`)
        trailingText=options.trailingText??''
        const fieldKey=options.fieldKey
        if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) throw new TypeError('Inline trailing text must be a single-line string')
        const decoded = definition.schema.decode({ dataVersion: ref.dataVersion, data: ref.data })
        return {current,ref,definition,decoded,fieldKey}
      })
      const {current,ref,definition,decoded}=initial
      const nextData = producer(cloneEditorData(decoded.data))
      const prepared=this.prepareExtensionValue(()=>{
        const latest = captureDocumentView({ids:tx.ids,peek:tx.peek}).peek(blockId)
        const inline = cloneInline(latest?.inline) ?? {}
        const latestRef = Object.hasOwn(inline, inlineId) ? inline[inlineId] : undefined
        if (!latest || latest.type !== current.type || latestRef?.type !== ref.type) {
          throw new Error('Inline widget update target changed during its producer')
        }
        const encoded = definition.schema.encode(synchronousResult(nextData))
        Object.defineProperty(inline, inlineId, { value: {
          type: ref.type,
          dataVersion: encoded.dataVersion,
          data: encoded.data,
        }, enumerable: true, configurable: true, writable: true })
        const blockDefinition = this.#registry.getBlockDefinition(current.type)
        let blockData = latest.data
        if (trailingText) {
          let matched = false
          blockData = blockDefinition.schema.mapRichText(cloneEditorData(blockData), (html, fieldKey) => {
            if (fieldKey !== initial.fieldKey) return html
            const result = ensureRichTextReferenceSuffix(html, inline, inlineId, trailingText, this.#ownerDocument)
            if (!result) throw new Error('Inline occurrence is no longer present in its field')
            matched = true
            const point = { blockId, fieldKey, offset: result.offset }
            selectionAfter = { anchor: point, focus: { ...point } }
            return result.html
          })
          if (!matched) throw new Error('Inline occurrence has no matching rich-text field')
        }
        const next = this.#recordFromData(
          latest.id, latest.type, blockDefinition, blockData, latest.tunes, inline,
        )
        return {latest,next}
      })
      if (!canonicalRecordsEqual(prepared.latest,prepared.next))tx.update(blockId, prepared.next)
    })
    if (trailingText) this.#restoreSelection(selectionAfter)
  }

  replaceInlineWidgetWithText(blockId, inlineId, text = '') {
    this.#assertInteractionMutation()
    return this.#executePrepared({ origin: 'plugin', name: 'inline-widget.replace' }, view => {
      const noChange={edits:[],result:false}
      const current = view.peek(blockId)
      if (!current) throw new Error(`Unknown block id: ${blockId}`)
      if (!this.#registry.hasBlock(current.type)) return noChange
      const inline = cloneInline(current.inline) ?? {}
      if (!Object.hasOwn(inline, inlineId)) return noChange
      const definition = this.#registry.getBlockDefinition(current.type)
      if (!definition?.schema?.mapRichText) return noChange
      const scan = this.#scanBlockRichText(definition, current.data, inline)
      if (!scan.references.has(inlineId)) return noChange
      const replacement=String(text??'')

      const data = definition.schema.mapRichText(cloneEditorData(current.data), html => (
        replaceRichTextReference(html, inline, inlineId, replacement, this.#ownerDocument)
      ))
      delete inline[inlineId]
      const next = this.#recordFromData(
        current.id, current.type, definition, data, current.tunes, inline,
      )
      return {edits:this.#updatedRecord(blockId,current,next),result:true}
    })
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
      const result = synchronousResult(operation(), error => {
        this.#diagnostics?.emit('command.failed', {
          operation: 'projection.edit', errorName: this.#diagnostics.errorName(error),
        })
      })

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
    return this.#executePrepared({ origin: 'user', name: 'format.text-align' }, view => {
      if (value !== null && !['left', 'center', 'right', 'justify'].includes(value)) {
        throw new TypeError('Text alignment must be left, center, right, justify, or null')
      }
      const ordered = [...new Set(ids ?? [])]
      const edits = []
      for (const id of ordered) {
        const current = view.peek(id)
        if (!current) throw new Error(`Unknown block id: ${id}`)
        if (!this.#registry.hasBlock(current.type)) throw new Error(`Unregistered block cannot be aligned: ${id}`)
        const tunes = cloneTunes(current.tunes) ?? {}
        if (value === null || value === 'left') delete tunes.textAlign
        else tunes.textAlign = value
        const next = { ...current }
        if(Object.keys(tunes).length)next.tunes=tunes
        else delete next.tunes
        if(!sameJson(current.tunes,next.tunes))delete next.revision
        edits.push(...this.#updatedRecord(id, current, next))
      }
      return { edits, result: edits.length > 0 }
    })
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#clipboardHandles = new WeakMap()
    this.#projector?.destroy?.()
  }

  #planningServices() {
    return {
      ownerDocument:this.#ownerDocument,
      defaultBlockType:this.#registry.defaultBlockType,
      blockTypes:this.#registry.blockTypes,
      getBlockDefinition:type=>this.#registry.getBlockDefinition(type),
      getInlineDefinition:type=>this.#registry.getInlineDefinition(type),
      allocateId:(prefix,reserved)=>this.#allocateId(prefix,reserved),
      allocateInlineId:reserved=>this.#allocateInlineId(reserved),
      recordFromData:(id,type,definition,data,tunes,inline)=>this.#recordFromData(id,type,definition,data,tunes,inline),
      normalizeLocalData:(definition,data)=>this.#normalizeLocalData(definition,data),
      normalizeExternalInline:inline=>this.#normalizeExternalInline(inline),
      normalizeTunes:cloneTunes,
      scanBlockRichText:(definition,data,inline)=>this.#scanBlockRichText(definition,data,inline),
      prepareInlineMerge:(definition,target,source)=>this.#prepareInlineMerge(definition,target,source),
      assertConversionInlinePreserved:(payload,inline,definition,record)=>this.#assertConversionInlinePreserved(payload,inline,definition,record),
    }
  }

  #ingestionServices() {
    return {
      defaultBlockType: this.#registry.defaultBlockType,
      getBlockDefinition: type => this.#registry.getBlockDefinition(type),
      getInlineDefinition: type => this.#registry.getInlineDefinition(type),
      normalizeData: (definition, data) => this.#normalizeLocalData(definition, data),
      normalizeTunes: cloneTunes,
      createBlockId: type => this.#createUniqueBlockId(type),
      assembleRecord: (id, type, definition, data) => this.#recordFromData(id, type, definition, data, undefined, undefined),
    }
  }

  #prepareDocument(operation) {
    try { return this.prepareExtensionValue(operation) }
    catch (error) {
      this.#reportValidation(error)
      throw error
    }
  }

  #normalizeLocalData(definition, data) {
    return this.prepareExtensionValue(() => {
      if (!definition?.schema) throw new TypeError('Block definition has no schema')
      let encoded = definition.schema.encode(data)
      let canonical = encoded.data
      if (typeof definition.schema.mapRichText === 'function') {
        canonical = definition.schema.mapRichText(canonical, html => this.#richTextNormalizer(html))
        encoded = definition.schema.encode(canonical)
      }
      return encoded
    })
  }

  #activationFor(record) {
    const definition=this.#registry.getBlockDefinition(record.type)
    if(!definition)return {kind:'unregistered',reason:'unknown-type'}
    return {kind:'active'}
  }

  #canActivate(_id, record) {
    return this.#activationFor(record).kind === 'active'
  }

  #reportValidation(error) {
    if (!this.#onValidationError) return
    const issue = documentValidationIssue(error)
    if (!issue) return
    this.#observationDepth++
    try {
      invokeObserver(this.#onValidationError, [issue], observerError => {
        this.#diagnostics?.emit('command.failed', {
          operation: 'onValidationError',
          errorName: this.#diagnostics.errorName(observerError),
        })
      })
    } finally { this.#observationDepth-- }
  }

  #targetDataFromPayload(targetDefinition,payload,target,baseData=undefined){
    let data
    const candidate=payload==null?null:cloneEditorData(payload)
    const conversion=targetDefinition.capabilities?.conversion
    if(baseData!==undefined){
      data=cloneEditorData(baseData)
    }else if(candidate&&conversion?.canImport?.(cloneEditorData(candidate))){
      data=conversion.import(cloneEditorData(candidate))
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

  #convertedRecord(current,target){
    const sourceDefinition=this.#registry.getBlockDefinition(current.type)
    const targetDefinition=this.#registry.getBlockDefinition(target.type)
    if(!targetDefinition)throw new Error(`Unknown block type: ${target.type}`)
    const payload=cloneEditorData(sourceDefinition?.capabilities?.conversion?.export(cloneEditorData(current.data))??null)
    const data=this.#targetDataFromPayload(targetDefinition,payload,target,current.type===target.type?current.data:undefined)
    const next=this.#recordFromData(current.id,target.type,targetDefinition,data,current.tunes,current.inline)
    this.#assertConversionInlinePreserved(payload,current.inline,targetDefinition,next)
    return next
  }

  #recordFromData(id,type,definition,data,tunes,inlineSource){
    return this.prepareExtensionValue(() => assembleCanonicalRecord({
      id,
      type,
      definition,
      data,
      tunes,
      inlineSource,
      ownerDocument:this.#ownerDocument,
      normalizeData:(targetDefinition,targetData)=>this.#normalizeLocalData(targetDefinition,targetData),
      normalizeTunes:cloneTunes,
    }))
  }

  #executePrepared(metadata, prepare) {
    return this.#engine.execute(metadata, tx => {
      const plan = this.prepareExtensionValue(() => prepare(captureDocumentView({ids:tx.ids,peek:tx.peek})))
      for (const edit of plan.edits) {
        if (edit.kind === 'update') tx.update(edit.id, edit.record)
        else if (edit.kind === 'remove') tx.remove(edit.id)
        else if (edit.kind === 'insert') tx.insert(edit.index, edit.record)
        else throw new TypeError('Unknown canonical edit kind')
      }
      return plan.result
    })
  }

  #updatedRecord(id, current, next) {
    return canonicalRecordsEqual(current, next) ? [] : [{ kind: 'update', id, record: next }]
  }

  #payloadHasContent(payload){
    if(!payload||payload.kind!=='rich-text'||typeof payload.data?.text!=='string')return true
    return getRichTextLogicalLength(payload.data.text,{},this.#ownerDocument)>0
  }

  #convertSingleBlockSelection(start,end,target,targetDefinition){
    const current=this.#store.get(start.blockId)
    if(!current||this.activation(start.blockId)?.kind!=='active')return false
    const sliced=sliceSelection(this.#planningServices(),current,start,end)
    if(!sliced||!this.#payloadHasContent(sliced.selected))return false

    const targetData=this.#targetDataFromPayload(targetDefinition,sliced.selected,target)
    const sourceDefinition=sliced.definition
    const sourceInline=sliced.inline
    const index=this.#store.ids().indexOf(current.id)

    // A compound owner keeps its assets and stable item identities once. The
    // owning clipboard capability already describes removing this exact text
    // interval without duplicating the surrounding card, rows or media.
    if((sliced.before||sliced.after)&&sourceDefinition.capabilities?.clipboard){
      const residual=prepareClipboardBlockSlice(this.#planningServices(),current,start,end)
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

    const firstSlice=endpointSelection(this.#planningServices(),first,start,'first')
    const lastSlice=endpointSelection(this.#planningServices(),last,end,'last')
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
          :selectedSourceData(this.#planningServices(),
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
    if (this.#observationDepth) return 'validation-observation'
    if (this.#projectingPresentation) return 'presentation-projection'
    if (this.#preparationDepth) return 'extension-preparation'
    if (this.#editingProjection) return 'protected-projection-edit'
    if (this.#changingReadOnly) return 'read-only-transition'
    return this.#engine?.phase ?? 'idle'
  }

  #assertHostMutation() {
    if (this.#observationDepth) throw new Error('Cannot mutate document during validation observation')
    if (this.#projectingPresentation) throw new Error('Cannot mutate document during presentation projection')
    if (this.#preparationDepth) throw new Error('Cannot mutate document during extension preparation')
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
    return this.prepareExtensionValue(() => decodeCurrentInlineMap(value,{getInlineSchema:type=>this.#registry.getInlineDefinition(type)?.schema}))
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
      createId: prefix => this.#allocateId(prefix),
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
            const ref = Object.hasOwn(record.inline??{},inlineId)?record.inline[inlineId]:undefined
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
          updateData: (producer, options) => this.updateInlineWidget(id, inlineId, producer, { trailingText: options?.trailingText, fieldKey }),
          commitDomMutation: operation => {
            this.syncBlockFromProjection(id, operation, {
              origin: 'plugin',
              name: 'inline-widget.dom-mutation',
              preserveSourceProjection: true,
            })
          },
        })
        return Object.freeze({
          getData: inlineAuthority.getData,
          updateData: inlineAuthority.updateData,
          commitDomMutation: inlineAuthority.commitDomMutation,
          beginTask: inlineAuthority.beginTask,
          isReadOnly: inlineAuthority.isReadOnly,
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
