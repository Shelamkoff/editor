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
import { ensureRichTextReferenceSuffix, getRichTextPlainText, replaceRichTextRange, replaceRichTextReference, scanRichTextPlaceholders, splitRichTextRange } from '../shared/richTextOperations.js'
import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
  prepareCanonicalInlineMerge,
  remapCanonicalFragment,
  scanCanonicalRichText,
  captureDocumentView,
  canonicalRecordsEqual,
} from './CanonicalTransforms.js'
import { prepareRemoveBlocks, prepareReplaceWholeDocument, prepareReplaceLogicalRange } from './LogicalRangePlans.js'
import { prepareClipboardSlice, prepareClipboardCut, prepareReplaceClipboardSlice, prepareInsertClipboardParts, preparePasteResults, prepareReplaceClipboardRange, prepareInsertLocalBlocks, prepareInlineSegments } from './ClipboardPlans.js'
import { conversionTargetData, convertedCanonicalRecord, prepareSelectionConversion } from './SelectionConversionPlans.js'
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

/** A capability result must be settled before any structural draft choice.
 * @param {any} definition
 * @param {any} data
 * @param {Document} ownerDocument
 */
function emptyBlockDecision(definition,data,ownerDocument){
  const empty=definition?.capabilities?.empty
  if(typeof empty?.isEmpty!=='function')return false
  const result=synchronousResult(empty.isEmpty(data,{ownerDocument}))
  if(typeof result!=='boolean'){
    throw new TypeError('Block empty.isEmpty() must return a boolean')
  }
  return result
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
  #modeEpoch = 0
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
  #diagnosticObservationDepth = 0
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
   *     reportPresentationFailure: (error: unknown, original?: unknown) => void,
   *   }) => any,
   *   selection?: any,
   *   onCommit?: (event: any) => void,
   *   diagnostics?: import('./types').DiagnosticsSink,
   *   onValidationError?: (issue: any) => void | Promise<void>,
   *   richTextNormalizer?: (html: string) => string,
   *   requestSplit?: (id: string) => void,
   *   requestExit?: (id: string) => void,
   *   history?: { maxStack?: number, maxBytes?: number },
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

    const contextFactory = (id, type, signal, readRecord, scope, assertReadOwner) => this.#blockContext(id, type, signal, readRecord, scope, assertReadOwner)
    const activationResolver = (id, record) => this.#canActivate(id, record)
    this.#projector = options.projectorFactory
      ? options.projectorFactory({
          store: this.#store,
          activationResolver,
          contextFactory,
          reportPresentationFailure:(error,original=error)=>{
            this.#reportValidation(original)
            this.#reportDiagnosticError('projection.presentation',error)
          },
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

  // Revokes control continuations across read-only round trips without
  // treating presentation-mode changes as authored document revisions.
  get modeEpoch() {
    return this.#modeEpoch
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
    const startedAt = this.#observeDiagnostics(sink => sink.now())
    try {
      const document = this.#store.export()
      document.time = Date.now()
      return document
    } catch (error) {
      this.#observeDiagnostics(sink => sink.emit('save.failed', {
        errorName: sink.errorName(error),
      }))
      throw error
    } finally {
      this.#emitSlowDiagnostic(startedAt, 'saveMs', 'save.slow')
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
        this.#reportDiagnosticError('extension.prepare', error)
      })
    } finally { this.#preparationDepth-- }
  }

  /** Internal observation guard; the invoking owner contains callback failures. */
  observeExtension(operation) {
    this.#observationDepth++
    try { return operation() }
    finally { this.#observationDepth-- }
  }

  /** Internal formatting-port phase gate; ordinary actions cannot reuse protected DOM authority. */
  canAccessFormattingSelection(ownedMutation = false) {
    if (this.health !== 'ready' || this.#readOnly || this.#destroyed) return false
    const phase = this.#mutationPhase()
    return phase === 'idle' || (ownedMutation === true && phase === 'protected-projection-edit')
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
    // Effective protected contexts still outrank a failed engine. Only its
    // settled terminal phase admits disposal, never ordinary control work.
    if (allowFailed && phase === 'failed') return
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
      const replace=current&&emptyBlockDecision(sourceDefinition,cloneEditorData(current.data),this.#ownerDocument)
      if(replace){
        if(current.type===type&&toolboxItemId===undefined)return {edits:[],result:current.id}
        const next=convertedCanonicalRecord(this.#planningServices(),current,{type,toolboxItemId},new Set(view.ids))
        return {edits:this.#updatedRecord(current.id,current,next),result:current.id}
      }
      const data=conversionTargetData(this.#planningServices(),definition,null,{type,toolboxItemId},undefined,new Set(view.ids))
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
    if(typeof definition?.capabilities?.empty?.isEmpty!=='function')return false
    // Keyboard eligibility is queried outside any edit transaction. The same
    // prepared decision contract also applies to toolbox and slash plans.
    return this.prepareExtensionValue(()=>emptyBlockDecision(definition,current.data,this.#ownerDocument))
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
        ownerDocument,
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
        const next=convertedCanonicalRecord(this.#planningServices(),current,{type},new Set(view.ids))
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

  update(id, producer, authority = 'interaction', options = undefined) {
    this.#assertMutationAuthority(authority)
    if (typeof producer !== 'function') throw new TypeError('Block update producer must be a function')
    const token = options?.historyContinuation
    // A task may finish after unrelated actions. Such metadata commits still
    // succeed, but may not rewrite an older history entry.
    const continuation = token && this.#store.revision === token.baseRevision
      ? { ...token, blockId: id }
      : undefined
    this.#engine.execute({
      // A block instance's data authority owns its edits; the public host API
      // remains external. This prevents async plugin completion from adopting
      // an unrelated host URL edit into the same Undo action.
      origin: authority === 'interaction' && options?.pluginOrigin === true
        ? 'plugin'
        : 'external',
      name: 'block.update',
      ...(continuation ? { continuation } : {}),
    }, tx => {
      // This private read only locates the active draft record. Ownership
      // transfers once below, when the producer receives its mutable snapshot.
      const current = tx.peek(id)
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

        const latest = tx.peek(id)
        if (!latest || latest.type !== current.type) throw new Error('Block update target changed during its producer')
        // A partial update must still give schema code detached mutable data;
        // metadata/tunes/inline reads do not require another whole-record copy.
        const nextData = Object.hasOwn(patch, 'data') ? patch.data : cloneEditorData(latest.data)
        const requestedTunes = Object.hasOwn(patch, 'tunes') ? patch.tunes : latest.tunes
        const nextTunes = requestedTunes === null ? undefined : requestedTunes
        const next = this.#recordFromData(
          id, current.type, definition, nextData, nextTunes, latest.inline,
        )
        return { latest, next }
      })
      const { latest, next } = prepared

      // Canonical JSON object key order is semantically irrelevant. Match
      // other prepared editor operations; only genuine data/tune/inline edits
      // should create a block revision or history entry.
      if (canonicalRecordsEqual(latest, next)) return
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
      const next=convertedCanonicalRecord(this.#planningServices(),current,{type,toolboxItemId},new Set(view.ids))
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
    return this.#executePrepared({origin:'user',name:'selection.convert'},view=>
      prepareSelectionConversion(
        this.#planningServices(),
        view,
        bookmark == null ? null : cloneEditorData(bookmark),
        target == null ? target : cloneEditorData(target),
      ))
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
    const startedAt = this.#observeDiagnostics(sink => sink.now())
    try {
      this.#engine.execute({ origin: 'external', name: 'document.render' }, tx => {
        tx.replace(this.#prepareDocument(() => prepareCurrentDocument(input, this.#ingestionServices())))
      })
    } finally {
      this.#emitSlowDiagnostic(startedAt, 'renderMs', 'render.slow')
    }
  }

  /** @param {boolean} value @param {(discardProjectionEdits: () => void) => void} [afterApply] */
  setReadOnly(value, afterApply) {
    this.#assertHostMutation()
    if (typeof value !== 'boolean') throw new TypeError('setReadOnly() requires a boolean')
    if (this.#engine.phase !== 'idle') throw new Error(`Cannot change read-only mode during ${this.#engine.phase} phase`)
    const next = value === true
    if (next === this.#readOnly) return
    // Invalidate queued commands even if the mode changes back before their
    // microtask runs, or a fallible transition later needs recovery.
    this.#modeEpoch++
    // Selection capture may invoke application-owned DOM/selection callbacks.
    // Guard the entire transition *before* that first external boundary so
    // nested host writes and mode changes cannot get an unprotected window.
    this.#changingReadOnly = true
    try {
      const selectionBefore = this.#captureSelection()
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
      const sourceEmpty = emptyBlockDecision(sourceDefinition,cloneEditorData(sourceNext.data),this.#ownerDocument)

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
    // Capturing may clear a stale cross-block selection and publish its
    // observer before the engine starts. Those callbacks cannot borrow the
    // admitted update's idle rights; its author producer runs after capture.
    const selection = this.prepareExtensionValue(() => this.#captureSelection())
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

  /** One internal, atomic native inline edit. It reuses the existing
   * protected projection transaction and recovery boundary; no second
   * persisted-data or extension API is introduced.
   */
  reconcileNativeInlineInput(snapshot, prepare) {
    this.#assertInteractionMutation()
    if (!snapshot || typeof prepare !== 'function') {
      throw new TypeError('Native inline reconciliation requires its captured owner and preparation')
    }
    const blockId = snapshot.blockId
    const fieldKey = snapshot.fieldKey
    const current = this.#store.get(blockId)
    const field = this.#projector?.getEditableField?.(blockId, fieldKey)
    if (!current || current.type !== snapshot.blockType
      || !field || field.element !== snapshot.fieldElement
      || this.#store.generation !== snapshot.generation
      || this.revision !== snapshot.revision) return { status: 'stale' }

    const beforeRevision = this.revision
    let candidateInline = null
    let capturedChanges = []
    this.syncBlockFromProjection(blockId, () => {
      const output = this.prepareExtensionValue(() => {
        const current = this.#store.get(blockId)
        if (!current || current.type !== snapshot.blockType) {
          throw new Error('Native inline source changed during reconciliation')
        }
        const raw = synchronousResult(prepare())
        if (!Array.isArray(raw)) throw new TypeError('Native inline changes must be an array')
        const sidecar = cloneInline(current.inline) ?? {}
        const changes = [], seen = new Set()
        for (let index = 0; index < raw.length; index++) {
          if (!Object.hasOwn(raw,index)) throw new TypeError('Native inline changes must be dense')
          const change = raw[index]
          const source = snapshot.occurrences.find(candidate => candidate.id === change?.id)
          if (!source || seen.has(source.id) || change.type !== source.type
            || change.element !== source.element || change.instance !== source.instance
            || !Object.hasOwn(sidecar,source.id) || sidecar[source.id].type !== source.type) {
            throw new TypeError('Native inline edit cannot address another occurrence')
          }
          seen.add(source.id)
          const action = cloneEditorData(synchronousResult(change.action))
          if (!action || typeof action !== 'object' || Array.isArray(action)) {
            throw new TypeError('Invalid native inline action')
          }
          if (action.kind === 'update') {
            if (!action.data || typeof action.data !== 'object' || Array.isArray(action.data)) {
              throw new TypeError('Native inline payload update requires an object')
            }
            const definition = this.#registry.getInlineDefinition(source.type)
            if (!definition?.schema) throw new Error('Native inline definition is no longer registered')
            const encoded = cloneEditorData(synchronousResult(definition.schema.encode(action.data)))
            const decoded = cloneEditorData(synchronousResult(definition.schema.decode(encoded)))
            Object.defineProperty(sidecar,source.id,{value:{
              type:source.type,dataVersion:encoded.dataVersion,data:encoded.data,
            },enumerable:true,configurable:true,writable:true})
            changes.push({id:source.id,type:source.type,element:source.element,
              instance:source.instance,action:{kind:'update',data:decoded.data}})
          } else if (action.kind === 'remove' || action.kind === 'replace-text') {
            if (action.kind === 'replace-text' && typeof action.text !== 'string') {
              throw new TypeError('Native inline replacement must be plain text')
            }
            delete sidecar[source.id]
            changes.push({id:source.id,type:source.type,element:source.element,
              instance:source.instance,action})
          } else throw new TypeError('Unknown native inline edit action')
        }
        return {sidecar,changes}
      })
      candidateInline = output.sidecar
      capturedChanges = output.changes
      snapshot.applyChanges(capturedChanges)
    }, {
      origin: 'native-input',
      name: 'inline.native-reconcile',
      selectionBefore: snapshot.selectionBefore,
      preserveSourceProjection: true,
      nativeInlineCandidate: () => candidateInline,
      finalizeNativeProjection: next => snapshot.finalizeChanges?.(capturedChanges,next.inline),
    })
    const status = this.revision === beforeRevision ? 'unchanged' : 'committed'
    snapshot.settle?.(capturedChanges,status)
    return {status}
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
      if (!this.#store.has(id)) throw new Error(`Unknown block id: ${id}`)
      if (this.activation(id)?.kind !== 'active') throw new Error(`Unregistered block cannot be synchronized: ${id}`)
      seen.add(id)
      ordered.push(id)
    }

    // Selection capture and bookmark accessors are callback boundaries too.
    // Protect them before the admitted DOM producer can observe a mode change
    // or an unrelated write that slipped in after its initial admission.
    this.#editingProjection = true
    let selectionBefore
    try {
      const bookmark = metadata.selectionBefore
      selectionBefore = bookmark === undefined ? this.#captureSelection() : cloneEditorData(bookmark)
    } catch (error) {
      // Input capture failed before any DOM action. Release the guard without
      // borrowing the projection recovery owner for an unstarted edit.
      this.#editingProjection = false
      throw error
    }
    try {
      const result = synchronousResult(operation(), error => {
        this.#reportDiagnosticError('projection.edit', error)
      })

      const updates = []
      let completedSourceFieldKey
      for (const id of ordered) {
        const current = this.#store.peek(id)
        const definition = this.#registry.getBlockDefinition(current.type)
        const projection = this.#projector?.readBlock?.(id)
        if (!projection) throw new Error('Projection reader is unavailable')
        const readData = Object.hasOwn(projection, 'data') ? projection.data : projection
        const nativeInline = metadata.nativeInlineCandidate?.(id)
        const inlineSource = nativeInline !== undefined
          ? cloneInline(nativeInline)
          : Object.hasOwn(projection, 'inline')
            ? (projection.inline === undefined ? undefined : cloneInline(projection.inline))
            : current.inline
        const next = this.#recordFromData(
          current.id, current.type, definition, readData, current.tunes, inlineSource,
        )
        // Native projection reads may preserve meaning with a different
        // JSON key order. Completion may still be needed for settled native
        // author DOM, but only an actual semantic change creates history.
        const changed = !canonicalRecordsEqual(current, next)
        if (metadata.finalizeNativeProjection) completedSourceFieldKey=metadata.finalizeNativeProjection(next, changed)
        if (changed) updates.push([id, next])
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
          ...(completedSourceFieldKey===undefined?{}:{completedSourceFieldKey}),
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
    // Revoke pending Undo/Redo microtasks before teardown of mounted fields.
    // A successful immediate history restore remains committed, but its
    // deferred selection callback must not access this retired DOM owner.
    this.#engine?.destroy()
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
        this.#reportDiagnosticError('onValidationError', observerError)
      })
    } finally { this.#observationDepth-- }
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
      this.#reportDiagnosticError('projection.selection.capture', error)
      return null
    }
  }

  #restoreSelection(bookmark) {
    if (!bookmark || !this.#selection?.restore) return
    try { this.#selection.restore(cloneEditorData(bookmark)) }
    catch (error) {
      this.#reportDiagnosticError('projection.selection.restore', error)
    }
  }

  /** Only observe telemetry; a fallible sink has no document or control authority.
   * @template T
   * @param {(sink: import('./types').DiagnosticsSink) => T} operation
   * @returns {T | undefined}
   */
  #observeDiagnostics(operation) {
    if (!this.#diagnostics || this.#diagnosticObservationDepth) return undefined
    this.#diagnosticObservationDepth++
    try { return operation(this.#diagnostics) }
    catch { return undefined }
    finally { this.#diagnosticObservationDepth-- }
  }

  /** @param {string} operation @param {unknown} error */
  #reportDiagnosticError(operation, error) {
    this.#observeDiagnostics(sink => sink.emit('command.failed', {
      operation, errorName: sink.errorName(error),
    }))
  }

  /** @param {number | undefined} startedAt
   * @param {'saveMs' | 'renderMs'} threshold
   * @param {'save.slow' | 'render.slow'} code
   */
  #emitSlowDiagnostic(startedAt, threshold, code) {
    // A clock returning exactly zero is a valid start, unlike a missing clock.
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return
    this.#observeDiagnostics(sink => {
      const durationMs = sink.now() - startedAt
      if (Number.isFinite(durationMs) && durationMs >= sink.threshold(threshold)) {
        sink.emit(code, { durationMs })
      }
    })
  }

  /** @returns {import('./types.js').RuntimeMutationContext} */
  #mutationPhase() {
    if (this.#diagnosticObservationDepth) return 'diagnostic-observation'
    if (this.#observationDepth) return 'validation-observation'
    if (this.#projectingPresentation) return 'presentation-projection'
    if (this.#preparationDepth) return 'extension-preparation'
    if (this.#editingProjection) return 'protected-projection-edit'
    if (this.#changingReadOnly) return 'read-only-transition'
    return this.#engine?.phase ?? 'idle'
  }

  #assertHostMutation() {
    if (this.#diagnosticObservationDepth) throw new Error('Cannot mutate document during diagnostic observation')
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

  #blockContext(id, type, signal, readRecord, scope, assertReadOwner = () => {}) {
    if (!scope?.createAuthority) throw new TypeError('Block instance scope is unavailable')
    scope.configure({
      readOnly: this.#readOnly,
      health: () => this.health,
      phase: () => this.#mutationPhase(),
      currentGeneration: () => this.#store.generation,
      currentRevision: () => this.#store.revision,
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
      prepareValue: operation => this.prepareExtensionValue(operation),
      readData: () => {
        assertReadOwner()
        return currentRecord().data
      },
      updateData: (producer, options) => {
        this.update(id, current => ({
          data: producer(current.data),
        }), 'interaction', { ...options, pluginOrigin: true })
      },
      commitDomMutation: operation => {
        this.syncBlockFromProjection(id, operation, {
          origin: 'plugin',
          name: 'plugin.dom-mutation',
        })
      },
      createId: prefix => this.createDataId(prefix),
    })

    let readingFieldText = false
    const getFieldText = fieldKey => {
      const epoch = scope.interactionEpoch, generation = scope.generation
      const assertOwner = () => {
        scope.assertReadable()
        assertReadOwner()
        if (scope.interactionEpoch !== epoch || scope.generation !== generation) {
          throw new Error('Canonical field text owner changed during its read')
        }
      }
      assertOwner()
      if (readingFieldText) throw new Error('Cannot reenter canonical field text derivation')
      if (typeof fieldKey !== 'string' || !fieldKey) throw new TypeError('Canonical rich-text field key must be nonempty')
      readingFieldText = true
      try {
        const text = this.prepareExtensionValue(() => {
          const record = currentRecord()
          const fields = richTextFieldMap(this.#registry.getBlockDefinition(type), record.data)
          assertOwner()
          if (!fields.has(fieldKey)) throw new RangeError('Unknown canonical rich-text field: ' + fieldKey)
          return getRichTextPlainText(fields.get(fieldKey), record.inline, this.#ownerDocument, inlineId => {
            assertOwner()
            const ref = record.inline[inlineId]
            const definition = this.#registry.getInlineDefinition(ref.type)
            if (!definition?.toText) return '{{' + inlineId + '}}'
            const data = deepFreezeClipboardValue(definition.schema.decode({ dataVersion: ref.dataVersion, data: ref.data }).data)
            assertOwner()
            const result = definition.toText(data)
            assertOwner()
            return result
          })
        })
        assertOwner()
        return text
      } finally { readingFieldText = false }
    }

    let context
    context = Object.freeze({
      ...authority,
      getData: () => {
        const data = authority.getData()
        assertReadOwner()
        return data
      },
      getFieldText,
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
          prepareValue: operation => this.prepareExtensionValue(operation),
          captureUpdateOptions: options => {
            const trailingText = options?.trailingText ?? ''
            if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) {
              throw new TypeError('Inline trailing text must be a single-line string')
            }
            return { trailingText }
          },
          readData: () => {
            const record = currentRecord()
            const ref = Object.hasOwn(record.inline??{},inlineId)?record.inline[inlineId]:undefined
            if (!ref || ref.type !== inlineType) {
              throw new Error(`Inline widget is no longer active: ${inlineId}`)
            }
            const definition = this.#registry.getInlineDefinition(inlineType)
            if (!definition) throw new Error(`Unknown inline widget type: ${inlineType}`)
            // InstanceScope captures the complete decoded result through the
            // runtime preparation port, before its final readability check.
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
