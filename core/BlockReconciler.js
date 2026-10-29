// @ts-check
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { InstanceScope } from './InstanceScope.js'
import { captureInstanceMethod, captureInstanceDestroy } from './instanceMethods.js'
import { ProjectionAnimator } from './ProjectionAnimator.js'
import { captureEditableFields, richTextFieldMap } from './projectionFields.js'
import { scanRichTextPlaceholders } from '../shared/richTextOperations.js'
import { synchronousResult } from '../shared/synchronousResult.js'

const liveBlockRoots=new WeakMap()

/** A target inside a control, widget or unregistered nested editing host may
 * not borrow a surrounding author's field key. Its own registered field is
 * still allowed and is checked before this boundary.
 * @param {Node} target
 */
function isIndependentEditableBoundary(target) {
  const element = /** @type {Element} */ (target)
  if (typeof element?.tagName !== 'string') return false
  const tag = element.tagName
  if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(tag)) return true
  if (element.hasAttribute?.('data-inline-plugin')
    || /** @type {HTMLElement} */ (element).dataset?.inlinePlugin !== undefined) return true
  if (['button', 'menuitem', 'option', 'textbox', 'combobox', 'listbox'].includes(
    element.getAttribute?.('role') ?? '',
  )) return true
  const contentEditable = element.getAttribute?.('contenteditable')
    ?? /** @type {HTMLElement} */ (element).contentEditable
  return contentEditable === 'true' || contentEditable === 'false'
}

/** Restore only the host's original children after an aborted mount.
 * @param {HTMLElement} parent
 * @param {Node[]} expectedChildren
 */
function restoreChildOrder(parent, expectedChildren) {
  const expected=new Set(expectedChildren)
  for(const node of Array.from(parent.childNodes??parent.children??[])){
    if(!expected.has(node)){
      /** @type {ChildNode} */ (node).remove()
    }
  }
  let cursor=parent.firstChild
  for(const node of expectedChildren){
    if(node===cursor)cursor=cursor.nextSibling
    else parent.insertBefore(node,cursor)
  }
}

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

/** Per-attempt rewrite eligibility, never field ownership. Only optional
 * completion consumers pay for this exact descendant/HTML observation. */
function fieldContent(element) {
  const nodes=[]
  const walker=element.ownerDocument.createTreeWalker(element,0xffffffff)
  for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node)
  return {html:element.innerHTML,nodes}
}

function sameFieldContent(element,previous) {
  if(element.innerHTML!==previous.html)return false
  const walker=element.ownerDocument.createTreeWalker(element,0xffffffff)
  let index=0
  for(let node=walker.nextNode();node;node=walker.nextNode())if(previous.nodes[index++]!==node)return false
  return index===previous.nodes.length
}

function snapshotBlockInstance(source, type, destroySource) {
  synchronousResult(source)
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`Block runtime "${type}" returned an invalid instance`)
  }
  const element = source.element
  const read = captureInstanceMethod(source, 'read')
  const update = captureInstanceMethod(source, 'update')
  const editableFields = captureInstanceMethod(source, 'editableFields')
  const afterProjection = captureInstanceMethod(source, 'afterProjection')
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
  if (afterProjection) instance.afterProjection = afterProjection
  if (focus) instance.focus = focus
  return Object.freeze(instance)
}

export class BlockReconciler {
  #container
  #registry
  #contextFactory
  #projectPresentation
  #reportPresentationFailure
  #activationResolver
  #entries = new Map()
  /** @type {Set<() => void>} */
  #pendingProjections = new Set()
  #fieldOwners = new WeakMap()
  #blockOwners = new WeakMap()
  #readOnly
  #inlineProjection
  #animator
  #fieldObserver = null
  #store = null
  #destroyed = false

  constructor({
    container,
    registry,
    contextFactory,
    projectPresentation = operation => operation(),
    reportPresentationFailure = /** @type {(error:unknown,original?:unknown)=>void} */ (() => {}),
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
    this.#projectPresentation = projectPresentation
    this.#reportPresentationFailure = reportPresentationFailure
    this.#activationResolver = typeof activationResolver === 'function'
      ? activationResolver
      : (_id, record) => registry.hasBlock(record.type)
    this.#inlineProjection = inlineProjection
    this.#readOnly = readOnly === true
    this.#animator = new ProjectionAnimator(animationDurations)
    const MutationObserverCtor = container.ownerDocument.defaultView?.MutationObserver
    if (MutationObserverCtor && inlineProjection) {
      // Presentation controls can replace fields without an author transaction.
      // Register and hydrate the new hosts before their next paint or input.
      this.#fieldObserver = new MutationObserverCtor(records => {
        const ids = new Set(records.map(record => this.resolveBlockTarget(record.target)).filter(Boolean))
        for (const id of ids) {
          const entry = this.#entries.get(id)
          if (!entry?.element.isConnected)continue
          const previousFailure=entry.presentationFailure,previousError=previousFailure?.error
          try{this.#refreshFields(id,entry,true,false)}
          catch(error){
            // Only a result published during this call has already reported.
            // An absent/unchanged result cannot suppress an actual delivery.
            const failure=entry.presentationFailure
            const reported=failure&&failure.error===error
              &&(failure!==previousFailure||failure.error!==previousError)
            if(!reported)this.#reportPresentationFailure(error)
          }
        }
      })
      this.#fieldObserver.observe(container, { childList: true, subtree: true })
    }
  }

  mount(store) {
    this.#assertLive()
    const previousStore = this.#store
    const previousEntries = this.#entries
    this.#store = store
    let fresh
    try {
      fresh = this.#stageAll(store, { candidate: true, stageInline: true, generation: store.generation })
      // Detached staging may synchronously publish another full projection.
      this.#assertPublicationOwner(previousEntries,'Block mount owner changed during staging')
    } catch (error) {
      if(fresh)for(const entry of fresh.values())this.#destroyEntry(entry)
      if(!this.#destroyed&&this.#entries===previousEntries)this.#store=previousStore
      throw error
    }

    const oldContainerChildren=Array.from(this.#container.childNodes??this.#container.children??[])
    try {
      this.#assertPublicationOwner(previousEntries,'Block mount owner changed before publication')
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#assertPublicationOwner(previousEntries,'Block mount owner changed during publication')
      this.#entries = fresh
      for (const entry of fresh.values()) {
        this.#applyPreparedInline(entry)
        this.#assertPublicationOwner(fresh,'Block mount owner changed during inline publication')
      }
      for (const entry of fresh.values()) {
        this.#activateEntry(entry)
        this.#assertPublicationOwner(fresh,'Block mount owner changed during activation')
      }
      for (const entry of fresh.values()) this.#completeFields(entry)
      for (const entry of fresh.values()) {
        this.#finalizePreparedInline(entry)
        this.#assertPublicationOwner(fresh,'Block mount owner changed during finalization')
      }
      for (const entry of fresh.values()) entry.lifetime.candidate = null
    } catch (error) {
      const cleanupErrors=[]
      for(const entry of fresh.values()){
        try{this.#recoverPreparedInline(entry)}catch(failure){cleanupErrors.push(failure)}
      }
      for(const entry of fresh.values()){
        try{this.#destroyEntry(entry)}catch(failure){cleanupErrors.push(failure)}
      }
      if(this.#destroyed){
        // Terminal teardown has revoked the old editor. Never publish or
        // restore its detached children after a reentrant destroy().
        for(const entry of previousEntries.values())this.#destroyEntry(entry)
        this.#entries.clear()
        this.#store=null
      }else if(this.#entries===fresh||this.#entries===previousEntries){
        this.#entries=previousEntries
        this.#store=previousStore
        try{restoreChildOrder(this.#container,oldContainerChildren)}
        catch(failure){cleanupErrors.push(failure)}
      }else{
        // A reentrant successor has published a different owner map. Its
        // DOM/store are authoritative; retire only displaced predecessors.
        const successorOwners=new Set(this.#entries.values())
        for(const entry of previousEntries.values()){
          if(!successorOwners.has(entry))this.#destroyEntry(entry)
        }
      }
      if(cleanupErrors.length){
        throw new AggregateError([error,...cleanupErrors], 'Block mount failed and DOM recovery was incomplete')
      }
      throw error
    }

    for (const entry of previousEntries.values()) this.#destroyEntry(entry)
    this.#assertPublicationOwner(fresh,'Block mount owner changed after predecessor cleanup')
    this.#animator.enable()
  }

  getElement(id) {
    return this.#entries.get(id)?.element
  }

  /** Complete an exact native-owned field after final DOM/cache normalization.
   * This is an internal projection handoff, not a document mutation/event.
   * @param {string} id
   * @param {import('../plugin-kit/types').EditableField} field
   */
  completeFieldProjection(id,field) {
    const entry=this.#entries.get(id)
    if(!entry?.instance.afterProjection)return
    this.#completeFields(entry,[field])
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
      // WeakMap keys remain valid while callers retain detached DOM nodes.
      // An old shell must never authorize commands for an active successor,
      // including a new block that happens to reuse the same canonical ID.
      if (blockId && this.#entries.get(blockId)?.element===node
        && node.parentNode===this.#container) return blockId
      node = node.parentNode
    }
    return null
  }

  focus(id, target) {
    const entry = this.#entries.get(id)
    if (!this.#isCurrentMountedEntry(id,entry) || entry.unregistered) return false
    try {
      const result=this.#projectPresentation(() => {
        if (typeof entry.instance.focus === 'function') {
          entry.instance.focus(target)
          return true
        }
        // focus() is optional. An already registered editable field can be
        // focused without a plugin hook; an unknown key never redirects to
        // a sibling. Caret placement still belongs to LogicalSelection.
        const fields = this.getEditableFields(id)
        const field = target?.fieldKey !== undefined
          ? fields.find(candidate => candidate.key === target.fieldKey)
          : fields[0]
        if (!field || !this.#isCurrentMountedEntry(id,entry)) return false
        field.element.focus({ preventScroll: true })
        return field.element.ownerDocument.activeElement === field.element
      })
      return this.#isCurrentMountedEntry(id,entry) ? result : false
    } catch (error) {
      console.error('Block focus failed', error)
      return false
    }
  }

  getEditableFields(id) {
    const entry = this.#entries.get(id)
    if (!this.#isCurrentMountedEntry(id,entry)) {
      if(entry?.presentationFailure)this.#projectPresentation(()=>this.#revalidateSettledFields(id,entry,entry.presentationFailure))
      return []
    }
    this.#refreshFields(id, entry, true)
    return this.#isCurrentMountedEntry(id,entry) ? [...(entry.fields ?? [])] : []
  }

  resolveInlineWidgetElement(target) {
    return this.#inlineProjection?.resolveWidgetElement(target) ?? null
  }

  resolveEditableTarget(target) {
    let node = target
    while (node && node !== this.#container) {
      const owner = this.#currentFieldOwner(node)
      if (owner) return owner
      // Do not climb out of a native control or another editing host into
      // the first ancestor field and treat the control's event/selection as
      // authored text. A newly remounted registered input may still resolve
      // after the on-demand field refresh below.
      if (isIndependentEditableBoundary(node)) break
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
        const owner = this.#currentFieldOwner(node)
        if (owner) return owner
        if (isIndependentEditableBoundary(node)) return null
        node = node.parentNode
      }
    }
    return null
  }

  readBlock(id) {
    const entry = this.#entries.get(id)
    if (!entry) throw new Error(`Unknown projected block id: ${id}`)
    if(entry.element.parentNode!==this.#container){
      throw new Error('Projected block is no longer mounted: '+id)
    }
    const assertOwner=()=>{
      if(!this.#isCurrentMountedEntry(id,entry)){
        throw new Error('Projected block ownership changed during read: '+id)
      }
    }
    const data = cloneEditorData(entry.instance.read())
    assertOwner()
    const observedFields = captureEditableFields(entry.instance.editableFields?.() ?? [])
    assertOwner()
    const fields=entry.presentationFailure?observedFields.filter(field=>entry.fields.some(accepted=>
      field.key===accepted.key&&field.element===accepted.element&&field.mode===accepted.mode)):observedFields
    this.#validateFieldOwnership(entry,fields)
    if (!this.#inlineProjection || entry.unregistered) {
      return { data, inline: entry.record.inline === undefined ? undefined : cloneEditorData(entry.record.inline) }
    }
    const result=this.#inlineProjection.serializeBlock(
      id,
      entry.record,
      entry.definition,
      fields,
      data,
    )
    assertOwner()
    return result
  }


  prepare({ store, draft, changes, sourceBlockId, generation, origin }) {
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

    const expectedEntries = this.#entries
    const previousEntries = new Map(expectedEntries)
    const replaceDocument = changes.some(change => change.kind === 'document.replace')
    const restoring = origin === 'history'
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
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation, restoring:restoring||Boolean(before&&!current) })
          staged.set(id, entry)
          insertions.push({ id, entry, after })
          continue
        }

        if (replaceDocument || before.type !== after.type) {
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation, restoring })
          staged.set(id, entry)
          replacements.push({ id, before: current, after: entry, beforeRecord: before, afterRecord: after })
          continue
        }

        const dataChanged = !sameJson(before.data, after.data)
        if (dataChanged && typeof current.instance.update !== 'function') {
          const entry = this.#createEntry(after, { candidate: true, stageInline: true, generation, restoring })
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

    let finalOrder
    let removalSnapshots
    try {
      finalOrder = structuralChange||insertions.length>0 ? draft.ids() : null
      removalSnapshots = removals.flatMap(item => {
        const snapshot = this.#animator.captureRemoval(
          item.entry.element,
          currentIndexes.get(item.id) ?? currentOrder.length,
        )
        return snapshot ? [snapshot] : []
      })
      // Detached candidates already own plugin resources at this point.
      // Revoke them on any fault before entering the pending-owner ledger.
      this.#assertLive()
    } catch (error) {
      for(const entry of staged.values())this.#destroyEntry(entry)
      throw error
    }

    let applied = false
    /** @type {Map<string, any> | null} */
    let publishedEntries = null
    let recovered = false
    let finalized = false
    let discarded = false
    // The reconciler owns detached staged entries and replaced predecessors
    // until the prepared operation has settled. Do not leave a retired
    // candidate behind when the editor is destroyed between these phases.
    const retire = () => {
      if (recovered || finalized || discarded) return
      recovered = true
      this.#pendingProjections.delete(retire)
      for (const entry of staged.values()) this.#destroyEntry(entry)
      for (const entry of previousEntries.values()) this.#destroyEntry(entry)
    }
    this.#pendingProjections.add(retire)

    return {
      apply: () => {
        this.#assertLive()
        if (applied || recovered || finalized || discarded) throw new Error('Prepared block projection cannot be applied twice')
        if (this.#entries !== expectedEntries) {
          discarded = true
          this.#pendingProjections.delete(retire)
          for (const entry of staged.values()) this.#destroyEntry(entry)
          throw new Error('Prepared block projection owner is stale')
        }
        applied = true
        const nextEntries = new Map(previousEntries)

        for (const item of updates) {
          const failedPresentation=item.entry.presentationFailure
          const captured=item.dataChanged&&item.id!==sourceBlockId&&item.entry.instance.afterProjection
            ?this.#captureFieldContent(item.entry):null
          item.entry.lifetime.candidate = item.after
          if (item.dataChanged && item.id !== sourceBlockId) {
            item.entry.instance.update(item.after.data, item.before.data)
          }
          item.entry.record = item.after
          this.#refreshFields(item.id, item.entry)
          const rewrittenFields=captured?new Set(item.entry.fields.filter(field=>field.mode==='rich-text'
            &&(!captured.has(field.element)||!sameFieldContent(field.element,captured.get(field.element)))).map(field=>field.element)):null
          if (this.#inlineProjection && !item.entry.unregistered) {
            this.#inlineProjection.reconcileBlock(
              item.id,
              item.after,
              item.entry.definition,
              item.entry.fields,
              item.entry.baseContext,
              { preserveSourceProjection: item.id === sourceBlockId, projectionRoot: item.entry.element,
                rewrittenFields,
                completeField:item.entry.instance.afterProjection?field=>this.#completeFields(item.entry,[field]):null,
              },
            )
          } else if(rewrittenFields)this.#completeFields(item.entry,item.entry.fields.filter(field=>rewrittenFields.has(field.element)))
          if(failedPresentation&&!item.entry.presentationFailure)this.#restoreRecoveredFieldModes(item.entry,failedPresentation)
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

        // DOM hooks may have synchronously retired this reconciler. A late
        // transaction must not publish fresh block entries after destroy().
        this.#assertLive()
        if (this.#entries !== expectedEntries) {
          throw new Error('Prepared block projection owner changed during apply')
        }
        publishedEntries = nextEntries
        this.#entries = nextEntries
        for(const entry of staged.values())this.#completeFields(entry)
      },

      recover: () => {
        // Discard and finalize are terminal; late recovery cannot undo a
        // published document or restore resources already disposed.
        if (recovered || finalized || discarded) return
        if (this.#destroyed) { retire(); return }
        // A newer projection may have claimed some of this one's entries.
        // The older prepared handle cannot restore DOM or dispose owners
        // that are now part of the successor's published map.
        if (applied && this.#entries !== (publishedEntries ?? expectedEntries)) {
          // A successor can publish while this apply() is still mutating DOM,
          // before we record publishedEntries. Only the failed operation's
          // own unpublished resources may be released by its recovery.
          recovered = true
          this.#pendingProjections.delete(retire)
          if (!publishedEntries) {
            for (const entry of staged.values()) this.#destroyEntry(entry)
          }
          return
        }
        if (!applied) {
          for (const entry of staged.values()) this.#destroyEntry(entry)
          recovered = true
          this.#pendingProjections.delete(retire)
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
              restoring: true,
            }))
          }
        } catch (error) {
          for (const entry of restored.values()) this.#destroyEntry(entry)
          throw error
        }

        const nextEntries = new Map(previousEntries)
        for (const [id, entry] of restored) nextEntries.set(id, entry)

        const currentRecoveryEntries=this.#entries
        try {
          this.#container.replaceChildren(...store.ids().map(id => {
            const entry = nextEntries.get(id)
            if (!entry) throw new Error(`Recovery is missing block entry: ${id}`)
            return entry.element
          }))
          this.#entries = nextEntries

          for (const entry of restored.values()) this.#applyPreparedInline(entry)
          for (const entry of restored.values()) this.#activateEntry(entry)
          for (const entry of restored.values()) this.#completeFields(entry)
          for (const entry of restored.values()) this.#finalizePreparedInline(entry)

          const keep = new Set(nextEntries.values())
          const candidates = new Set([
            ...currentRecoveryEntries.values(),
            ...staged.values(),
            ...previousEntries.values(),
          ])
          for (const entry of candidates) if (!keep.has(entry)) this.#destroyEntry(entry)
          recovered = true
          this.#pendingProjections.delete(retire)
        } catch (error) {
          // A DOM adapter may change the host and then report failure. The
          // attempted recovery's newly-created owners are not published and
          // must be cleaned before the same handle can retry.
          if(!this.#destroyed&&this.#entries===nextEntries){
            this.#entries=currentRecoveryEntries
          }
          for(const entry of restored.values()){
            try{this.#recoverPreparedInline(entry)}catch{}
            this.#destroyEntry(entry)
          }
          throw error
        }
      },

      finalize: () => {
        this.#assertLive()
        if (finalized || recovered) return
        if (!applied) throw new Error('Cannot finalize an unapplied block projection')
        if (this.#entries !== (publishedEntries ?? expectedEntries)) {
          recovered = true
          this.#pendingProjections.delete(retire)
          if (!publishedEntries) {
            for (const entry of staged.values()) this.#destroyEntry(entry)
          }
          throw new Error('Prepared block projection owner is stale')
        }

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
        this.#pendingProjections.delete(retire)
      },

      discard: () => {
        if (discarded || finalized || recovered) return
        if (applied) return
        discarded = true
        this.#pendingProjections.delete(retire)
        for (const entry of staged.values()) this.#destroyEntry(entry)
      },
    }
  }

  restore(store) {
    this.#assertLive()
    const previousStore=this.#store
    const previousEntries=this.#entries
    this.#store=store
    try{this.#restore(store,new Map())}
    catch(error){
      // The successor's store cannot be rolled back by a stale outer call.
      if(!this.#destroyed&&this.#entries===previousEntries)this.#store=previousStore
      throw error
    }
  }

  setReadOnly(value) {
    this.#assertLive()
    const next = value === true
    if (next === this.#readOnly) return

    const changed = []
    const modeSnapshots=[]
    const disabledModes=new Map()
    let modeBoundaryFailed=false
    try {
      for (const entry of this.#entries.values()) {
        changed.push(entry)
        const snapshots=this.#captureFieldModes(entry)
        modeSnapshots.push(...snapshots)
        const disabled=this.#captureDisabledFields(entry)
        disabledModes.set(entry,disabled)
        entry.instance.setReadOnly(next)
        this.#applyOwnedFieldModes(entry,snapshots)
        this.#disableFailedFields(entry,disabled)
        this.#refreshFields(entry.record.id, entry, true, true, next)
      }
      const modeFields=[...this.#entries].map(([id,entry])=>({id,entry,fields:entry.fields,
        owners:new Map(entry.fields.map(field=>[field.element,this.#fieldOwners.get(field.element)])),
      }))
      const beforeAccept=()=>{
        for (const entry of this.#entries.values()) entry.scope?.setReadOnly?.(next)
        for(const {id,entry,fields,owners} of modeFields){
          const ancestryCache=new Map()
          if(this.#isCurrentMountedEntry(id,entry)&&fields.every(field=>{
            const owner=owners.get(field.element)
            return owner?.blockId===id&&owner.fieldKey===field.key&&owner.mode===field.mode
              &&this.#hasFieldAncestry(owner,entry,ancestryCache)
          }))continue
          modeBoundaryFailed=true
          const error=new Error('Read-only field left its accepted ownership boundary')
          this.#reportPresentationFailure(error)
          throw error
        }
        try { for(const {entry,fields} of modeFields)this.#completeFields(entry,fields) }
        catch(error) { modeBoundaryFailed=true; throw error }
      }
      if(this.#inlineProjection?.setReadOnly)this.#inlineProjection.setReadOnly(next,beforeAccept)
      else beforeAccept()
      this.#readOnly = next
    } catch (error) {
      // Failure occurrence is independent of the thrown payload: null,
      // undefined and every other falsy value still require reconstruction.
      // A child owner can already have reported its own failed rollback.
      const failures = error instanceof ReadOnlyRecoveryError ? [...error.errors] : [error]
      let needsRestore = error instanceof ReadOnlyRecoveryError||modeBoundaryFailed
      if(modeBoundaryFailed){
        for(const [id,entry] of this.#entries){
          try{this.#revalidateSettledFields(id,entry,entry.presentationFailure??null,false)}
          catch(failure){failures.push(failure)}
        }
      }
      for (let index = changed.length - 1; index >= 0; index--) {
        try { changed[index].instance.setReadOnly(this.#readOnly) }
        catch (failure) {
          needsRestore = true
          failures.push(failure)
        }
      }
      for(const snapshot of modeSnapshots)snapshot.owner.ancestors=snapshot.ancestors
      for(const entry of changed)this.#disableFailedFields(entry,disabledModes.get(entry)??[])
      if (needsRestore && this.#store) {
        try { this.#restore(this.#store, new Map()) }
        catch (failure) {
          throw new ReadOnlyRecoveryError([...failures, failure], 'Read-only transition and recovery failed')
        }
      }
      throw error instanceof ReadOnlyRecoveryError ? error.errors[0] : error
    }
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#fieldObserver?.disconnect()
    this.#fieldObserver = null
    // Hide the previously owned shell registry before plugin destroy hooks
    // can reenter and inspect retired block references.
    const owned=[...this.#entries.values()]
    this.#entries.clear()
    for (const entry of owned) this.#destroyEntry(entry)
    for (const retire of [...this.#pendingProjections])retire()
    this.#pendingProjections.clear()
    this.#inlineProjection?.destroy?.()
    this.#animator.destroy()
    // Each owned shell is already detached by #destroyEntry. Do not clear
    // the host container: the application may have mounted its own nodes.
  }

  #assertLive() {
    if (this.#destroyed) throw new Error('BlockReconciler is destroyed')
  }

  /** @param {Map<string, any>} expected @param {string} message */
  #assertPublicationOwner(expected,message){
    this.#assertLive()
    if(this.#entries!==expected)throw new Error(message)
  }

  #stageAll(source, { candidate = false, stageInline = false, generation = source.generation, restoring = false } = {}) {
    const staged = new Map()
    try {
      for (const id of source.ids()) {
        const record = source.peek(id)
        if (!record) throw new Error(`Canonical block is missing: ${id}`)
        staged.set(id, this.#createEntry(record, { candidate, stageInline, generation, restoring }))
      }
      return staged
    } catch (error) {
      for (const entry of staged.values()) this.#destroyEntry(entry)
      throw error
    }
  }

  #createEntry(record, { candidate = false, stageInline = false, generation = this.#store?.generation ?? 0, restoring = false } = {}) {
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
    let borrowedLiveRoot = false

    try {
      const readRecord = () => lifetime.candidate ?? this.#store?.peek(record.id) ?? record
      const base = this.#contextFactory(record.id, record.type, controller.signal, readRecord, scope) ?? {}
      const context = Object.freeze({
        ...base,
        // A fresh user block may load metadata once; a replay/recovery
        // projection must not repeat automatic side effects.
        restoring: restoring === true,
        ownerDocument: base.ownerDocument ?? ownerDocument,
        signal: base.signal ?? controller.signal,
        isReadOnly: typeof base.isReadOnly === 'function'
          ? base.isReadOnly
          : () => this.#readOnly,
      })
      sourceInstance = runtime.create(record.data, context)
      destroySource = captureInstanceDestroy(sourceInstance)
      instance = snapshotBlockInstance(sourceInstance, record.type, destroySource)
      const root=instance.element
      const HTMLElementCtor=ownerDocument.defaultView?.HTMLElement??globalThis.HTMLElement
      // A Comment, SVGElement, DocumentFragment or arbitrary object can have
      // ownerDocument and be appendable, but is not a valid editor block root.
      if(!root||root.ownerDocument!==ownerDocument
        ||(HTMLElementCtor&&!(root instanceof HTMLElementCtor))){
        throw new TypeError('Block runtime "'+record.type+'" must return an HTMLElement in the owning document')
      }
      if(liveBlockRoots.has(root)){
        borrowedLiveRoot=true
        throw new TypeError('Block runtime "'+record.type+'" must return a fresh HTMLElement')
      }
      if(root.parentNode||root.isConnected){
        throw new TypeError('Block runtime "'+record.type+'" must return a detached HTMLElement')
      }
      element = ownerDocument.createElement('div')
      element.className = 'oe-block'
      element.dataset.blockId = record.id
      element.dataset.blockType = record.type
      element.appendChild(instance.element)
      liveBlockRoots.set(instance.element,scope)

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
          entry.fields,
          context,
          generation,
          { projectionRoot: entry.element },
        )
      }
      return entry
    } catch (error) {
      try { scope.revoke() } catch {}
      try { controller.abort() } catch {}
      // A rejected alias still belongs to the original live instance.
      if(!borrowedLiveRoot)try { destroySource?.() } catch {}
      try { element?.remove?.() } catch {}
      if(instance?.element&&liveBlockRoots.get(instance.element)===scope)liveBlockRoots.delete(instance.element)
      throw error
    }
  }

  #activateEntry(entry) {
    entry?.scope?.activate?.()
  }

  #captureFieldContent(entry) {
    const id=entry.record.id,fields=entry.fields.filter(field=>field.mode==='rich-text')
    const owners=new Map(fields.map(field=>[field.element,this.#fieldOwners.get(field.element)]))
    const assertOwned=()=>{
      if(!this.#isCurrentMountedEntry(id,entry)||fields.some(field=>{
        const owner=owners.get(field.element)
        return !owner||this.#fieldOwners.get(field.element)!==owner||!this.#hasFieldAncestry(owner,entry)
      }))throw new Error('Field rewrite observation lost its accepted owner')
    }
    assertOwned()
    const captured=new Map(fields.map(field=>[field.element,fieldContent(field.element)]))
    assertOwned()
    return captured
  }

  #completeFields(entry,completed=entry.fields,fields=entry.fields,ownsField=null,contentState=null) {
    if(!entry.instance.afterProjection)return
    const id=entry.record.id
    const owners=ownsField?null:new Map(fields.map(field=>[field.element,this.#fieldOwners.get(field.element)]))
    const owns=ownsField??(field=>{
      const owner=owners.get(field.element)
      return this.#fieldOwners.get(field.element)===owner&&owner?.blockId===id
        &&owner.fieldKey===field.key&&owner.mode===field.mode&&this.#hasFieldAncestry(owner,entry)
    })
    const assertOwned=()=>{
      if(this.#isCurrentMountedEntry(id,entry)&&fields.every(owns))return
      this.#revalidateSettledFields(id,entry,null,false)
      throw new Error('Completed field left its accepted ownership boundary')
    }
    this.#projectPresentation(()=>{
      const contents=new Map(fields.filter(field=>field.mode==='rich-text')
        .map(field=>[field.element,fieldContent(field.element)]))
      if(contentState)contentState.contents=contents
      assertOwned()
      for(const field of completed){
        if(field.mode!=='rich-text')continue
        assertOwned()
        if(!fields.includes(field))throw new Error('Completed field descriptor is no longer current')
        let failed=false,error
        try { entry.instance.afterProjection(field) }
        catch(failure) { failed=true; error=failure }
        try {
          assertOwned()
          for(const [element,content] of contents){
            if(!sameFieldContent(element,content))throw new Error('Field completion changed author content')
          }
        } catch(failure) {
          if(failed)throw new AggregateError([error,failure],'Field completion and ownership validation failed',{cause:error})
          throw failure
        }
        if(failed)throw error
      }
    })
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

  /** An editable address is valid only for a currently mounted descriptor.
   * A WeakMap entry alone does not revoke when its retired node is retained.
   * @param {Node} node
   */
  /** Validate DOM authority for either dynamic registration or a read.
   * @param {any} entry
   * @param {Array<any>} fields
   */
  #validateFieldOwnership(entry,fields){
    const HTMLElementCtor=this.#container.ownerDocument.defaultView?.HTMLElement??globalThis.HTMLElement
    for(const field of fields){
      if(HTMLElementCtor&&!(field.element instanceof HTMLElementCtor)){
        throw new TypeError('Editable field must be an HTMLElement in the owning document')
      }
      if(field.element.ownerDocument!==this.#container.ownerDocument
        ||!entry.element.contains(field.element)){
        throw new TypeError('Editable field must belong to its owning block DOM')
      }
    }
  }

  /** Synchronous extension callbacks may replace or destroy their owner. */
  #isCurrentMountedEntry(id,entry) {
    return Boolean(!this.#destroyed&&entry
      &&this.#entries.get(id)===entry
      &&entry.element.parentNode===this.#container)
  }

  #currentFieldOwner(node) {
    const owner=this.#fieldOwners.get(node)
    if(!owner)return null
    const entry=this.#entries.get(owner.blockId)
    if(!entry || entry.element.parentNode!==this.#container
      || !entry.element.contains(node)) return null
    const current=entry.fields?.some(field=>field.element===node
      && field.key===owner.fieldKey && field.mode===owner.mode)
    return current&&this.#hasFieldAncestry(owner,entry)?{blockId:owner.blockId,fieldKey:owner.fieldKey,element:owner.element,mode:owner.mode}:null
  }

  #refreshFields(id, entry, projectPresentation = false, forceProjection = false, readOnly = this.#readOnly) {
    return this.#projectPresentation(() => this.#registerFields(id, entry, projectPresentation, forceProjection, readOnly))
  }

  #registerFields(id, entry, projectPresentation, forceProjection, readOnly) {
    let fields
    try{fields=captureEditableFields(entry.instance.editableFields?.()??[])}
    catch(error){
      if(entry.scope?.active)this.#revalidateSettledFields(id,entry,entry.presentationFailure??null,false)
      throw error
    }
    const sameFields=(left,right)=>left?.length===right?.length&&left.every((field,index)=>
      field.key===right[index]?.key&&field.element===right[index]?.element&&field.mode===right[index]?.mode)
    const previousFields=entry.fields??[]
    const failed=entry.presentationFailure
    if(failed&&sameFields(fields,failed.fields)&&this.#sameFailedContent(entry,failed)){
      this.#revalidateSettledFields(id,entry,failed)
      failed.record=entry.record
      if(forceProjection&&this.#inlineProjection){
        const owners=new Map(entry.fields.map(field=>[field.element,this.#fieldOwners.get(field.element)]))
        try{
          this.#inlineProjection.reconcileBlock(id,entry.record,entry.definition,entry.fields,entry.baseContext,{
            projectionRoot:entry.element,
            canRetainField:field=>{
              const owner=owners.get(field.element)
              return this.#isCurrentMountedEntry(id,entry)&&owner?.blockId===id&&owner.fieldKey===field.key
                &&owner.mode===field.mode&&this.#hasFieldAncestry(owner,entry)
            },
          })
        }catch(error){
          this.#reportPresentationFailure(error)
          throw new ReadOnlyRecoveryError([error],'Read-only field projection requires recovery')
        }
      }
      // A legitimate edit of a healthy sibling must not publish the failed
      // descriptor or silently retry unchanged failed canonical content.
      return
    }
    const changed=!sameFields(fields,previousFields)
    if(!changed&&!failed&&!forceProjection&&entry.scope?.active){
      this.#revalidateSettledFields(id,entry)
      return
    }
    try{this.#validateFieldOwnership(entry,fields)}
    catch(error){
      if(entry.scope?.active)this.#revalidateSettledFields(id,entry,failed??null,false)
      throw error
    }
    const previousByElement=new Map(previousFields.map(field=>[field.element,field]))
    const failedByElement=new Map(failed?.fields.map(field=>[field.element,field])??[])
    const capturedOwners=new Map(fields.map(field=>{
      const prior=previousByElement.get(field.element),failedField=failedByElement.get(field.element)
      const previous=prior?.key===field.key&&prior?.mode===field.mode
      const failedOwner=failedField?.key===field.key&&failedField?.mode===field.mode
        ?failed.owners?.get(field.element):null
      return [field.element,previous?this.#fieldOwners.get(field.element):failedOwner??this.#makeFieldOwner(id,entry,field)]
    }))
    const ownsField=field=>{
      const owner=capturedOwners.get(field.element)
      return this.#isCurrentMountedEntry(id,entry)&&owner?.blockId===id&&owner.fieldKey===field.key
        &&owner.mode===field.mode&&this.#hasFieldAncestry(owner,entry)
    }
    if(!projectPresentation&&failed&&fields.some(field=>!ownsField(field))){
      throw new Error('Failed presentation field left its canonical recovery boundary')
    }
    const publish=(next,retain=false)=>{
      for(const field of entry.fields??[])this.#fieldOwners.delete(field.element)
      entry.fields=next
      for(const field of next){
        if(retain)this.#fieldOwners.set(field.element,capturedOwners.get(field.element))
        else this.#fieldOwners.set(field.element,this.#makeFieldOwner(id,entry,field))
      }
    }
    if(projectPresentation&&(changed||forceProjection)&&entry.scope?.active&&this.#inlineProjection){
      let retained=[]
      const completion={contents:null}
      try{
        this.#inlineProjection.reconcileBlock(id,entry.record,entry.definition,fields,entry.baseContext,{
          projectionRoot:entry.element,
          presentationFields:forceProjection?null:previousFields,
          knownPresentationFields:failed?.fields??previousFields,
          onFailedFields:healthy=>{
            retained=healthy
            // A completion can corrupt an untouched sibling's contents while
            // leaving its host lease intact. Retire those exact occurrences
            // through the existing cleanup owner, including callback fallout.
            for(;;){
              const damaged=retained.filter(field=>completion.contents?.has(field.element)
                &&!sameFieldContent(field.element,completion.contents.get(field.element)))
              if(!damaged.length)break
              const lost=new Set(damaged)
              retained=retained.filter(field=>!lost.has(field))
              this.#inlineProjection.retirePresentationFields(id,damaged)
            }
            publish(retained,true)
          },
          canRetainField:ownsField,
          completeField:!forceProjection&&entry.instance.afterProjection
            ?field=>this.#completeFields(entry,[field],fields,ownsField,completion):null,
        })
      }catch(error){
        if(forceProjection){
          this.#reportPresentationFailure(error)
          throw new ReadOnlyRecoveryError([error],'Read-only field projection requires recovery')
        }
        let reported=error
        const disabled=[]
        const retainedElements=new Set(retained.map(field=>field.element))
        try{
          for(const field of fields){
            if(retainedElements.has(field.element))continue
            if(!ownsField(field)){
              throw new Error('Failed presentation field left its recovery boundary')
            }
            const boundary=this.#fieldBoundary(field.element).split('\u0000');boundary[0]='false'
            disabled.push({...field,value:field.element.getAttribute('contenteditable'),owner:capturedOwners.get(field.element),
              boundary:boundary.join('\u0000'),
              parents:this.#fieldParents(field.element,entry.element).map(node=>({node,boundary:this.#fieldBoundary(node),blockOwner:liveBlockRoots.get(node)??this.#blockOwners.get(node)})),
            })
            field.element.contentEditable='false'
            if(!ownsField(field))throw new Error('Failed presentation field left its recovery boundary')
            field.element.replaceChildren()
          }
        }catch(recoveryError){
          reported=new AggregateError([error,recoveryError],'Presentation field recovery failed',{cause:error})
        }
        // Field clearing can run disconnected callbacks after inline cleanup.
        // Keep the original leases and finish revoking any newly lost fields.
        for(;;){
          const lost=retained.filter(field=>!ownsField(field))
          if(!lost.length)break
          const lostFields=new Set(lost)
          retained=retained.filter(field=>!lostFields.has(field))
          publish(retained,true)
          this.#inlineProjection.retirePresentationFields(id,lost)
        }
        entry.presentationFailure={fields,error:reported,record:entry.record,disabled,owners:capturedOwners}
        publish(retained,true)
        if(!this.#isCurrentMountedEntry(id,entry))this.#retirePresentationEntry(id,entry)
        this.#reportPresentationFailure(reported,error)
        throw reported
      }
    }
    publish(fields)
    entry.presentationFailure=null
    if(projectPresentation&&failed)this.#restoreRecoveredFieldModes(entry,failed,readOnly)
  }

  #fieldParents(element,root){
    const parents=[]
    for(let node=element.parentNode;node;node=node.parentNode){
      parents.push(node)
      if(node===root)break
    }
    return parents
  }

  #captureFieldModes(entry){
    const owners=new Set([
      ...entry.fields.map(field=>this.#fieldOwners.get(field.element)),
      ...(entry.presentationFailure?.owners?.values()??[]),
    ])
    return [...owners].filter(owner=>owner&&this.#hasFieldAncestry(owner,entry)).map(owner=>({
      owner,ancestors:owner.ancestors,parents:this.#fieldParents(owner.element,entry.element),
    }))
  }

  #applyOwnedFieldModes(entry,snapshots){
    if(!this.#isCurrentMountedEntry(entry.record.id,entry))return
    for(const {owner,ancestors,parents} of snapshots){
      const currentParents=this.#fieldParents(owner.element,entry.element)
      if(currentParents.length!==parents.length||currentParents.some((node,index)=>node!==parents[index]))continue
      const current=this.#makeFieldOwner(owner.blockId,entry,{key:owner.fieldKey,element:owner.element,mode:owner.mode})
      if(current.ancestors.length!==ancestors.length||current.ancestors.some((item,index)=>{
        const before=ancestors[index]
        if(item.node!==before.node||item.blockOwner!==before.blockOwner)return true
        if(item.boundary===before.boundary)return false
        const [editable,...rest]=item.boundary.split('\u0000')
        const [oldEditable,...oldRest]=before.boundary.split('\u0000')
        return !['true','false'].includes(editable)||!['true','false'].includes(oldEditable)
          ||rest.some((value,part)=>value!==oldRest[part])
      }))continue
      owner.ancestors=current.ancestors
    }
  }

  #captureDisabledFields(entry){
    if(!this.#isCurrentMountedEntry(entry.record.id,entry))return []
    return (entry.presentationFailure?.disabled??[]).filter(field=>
      this.#fieldBoundary(field.element)===field.boundary&&this.#hasFieldAncestry(field.owner,entry))
  }

  #disableFailedFields(entry,captured){
    if(!this.#isCurrentMountedEntry(entry.record.id,entry))return
    const current=new Set(entry.presentationFailure?.disabled??[])
    for(const field of captured){
      if(!current.has(field)||!this.#hasFieldAncestry(field.owner,entry))continue
      const boundary=this.#fieldBoundary(field.element).split('\u0000')
      if(!['true','false',field.value??''].includes(boundary[0]))continue
      boundary[0]='false'
      if(boundary.join('\u0000')===field.boundary)field.element.contentEditable='false'
    }
  }

  #fieldBoundary(node){
    return node.nodeType===1?[node.getAttribute('contenteditable'),node.getAttribute('data-inline-plugin'),node.getAttribute('role')].join('\u0000'):''
  }

  #makeFieldOwner(id,entry,field,ancestryCache=null){
    const parent=field.element.parentNode
    let ancestors=ancestryCache?.get(parent)
    if(!ancestors){
      ancestors=[]
      for(let node=parent;node;node=node.parentNode){
      if(node===entry.element||isIndependentEditableBoundary(node)||this.#blockOwners.has(node)||liveBlockRoots.has(node)){
        ancestors.push({node,boundary:this.#fieldBoundary(node),blockOwner:liveBlockRoots.get(node)??this.#blockOwners.get(node)})
      }
        if(node===entry.element)break
      }
      ancestryCache?.set(parent,ancestors)
    }
    return {blockId:id,fieldKey:field.key,element:field.element,mode:field.mode,ancestors}
  }

  #hasFieldAncestry(owner,entry,ancestryCache=null){
    const current=this.#makeFieldOwner(owner.blockId,entry,{
      key:owner.fieldKey,element:owner.element,mode:owner.mode,
    },ancestryCache)
    return current.ancestors.at(-1)?.node===entry.element
      &&current.ancestors.length===owner.ancestors.length
      &&current.ancestors.every((item,index)=>item.node===owner.ancestors[index].node
        &&item.boundary===owner.ancestors[index].boundary
        &&item.blockOwner===owner.ancestors[index].blockOwner)
  }

  #retirePresentationEntry(id,entry){
    for(const field of entry.fields??[])this.#fieldOwners.delete(field.element)
    entry.fields=[]
    if(this.#entries.get(id)!==entry)return
    this.#entries.delete(id)
    this.#inlineProjection?.destroyBlock(id)
    this.#destroyEntry(entry,true)
  }

  #revalidateSettledFields(id,entry,failed=null,settle=true){
    const lostFields=()=>{
      // This index is only a readonly scan of this call's current ancestors.
      // Destroy callbacks below discard it before another ownership check.
      const ancestryCache=new Map()
      return entry.fields.filter(field=>{
        const owner=this.#fieldOwners.get(field.element)
        return !this.#isCurrentMountedEntry(id,entry)||owner?.blockId!==id||owner.fieldKey!==field.key
          ||owner.mode!==field.mode||!this.#hasFieldAncestry(owner,entry,ancestryCache)
      })
    }
    let invalid=lostFields()
    if(!invalid.length&&this.#isCurrentMountedEntry(id,entry))return
    let error
    if(settle){
      const boundaryError=new Error('Presentation field left its accepted ownership boundary')
      error=failed
        ?new AggregateError([failed.error,boundaryError],'Presentation field ownership recovery failed',{cause:failed.error})
        :boundaryError
      const failure=failed??{fields:entry.fields,record:entry.record,disabled:[],
        owners:new Map(entry.fields.map(field=>[field.element,this.#fieldOwners.get(field.element)])),
      }
      failure.error=error
      entry.presentationFailure=failure
    }
    for(;;){
      const invalidFields=new Set(invalid)
      for(const field of invalid)this.#fieldOwners.delete(field.element)
      entry.fields=entry.fields.filter(field=>!invalidFields.has(field))
      this.#inlineProjection?.retirePresentationFields(id,invalid)
      invalid=lostFields()
      if(!invalid.length)break
    }
    if(!this.#isCurrentMountedEntry(id,entry))this.#retirePresentationEntry(id,entry)
    if(!settle)return
    this.#reportPresentationFailure(error)
    throw error
  }

  #restoreRecoveredFieldModes(entry,failed,readOnly=this.#readOnly){
    if(!this.#isCurrentMountedEntry(entry.record.id,entry))return
    const currentFields=new Map(entry.fields.map(field=>[field.element,field]))
    for(const field of failed.disabled??[]){
      const descriptor=currentFields.get(field.element)
      const current=descriptor?.key===field.key&&descriptor?.mode===field.mode&&this.#hasFieldAncestry(field.owner,entry)
      if((current?readOnly:!this.#isRetiredField(field))||this.#fieldBoundary(field.element)!==field.boundary)continue
      if(field.value===null)field.element.removeAttribute('contenteditable')
      else field.element.setAttribute('contenteditable',field.value)
    }
  }

  #isRetiredField(field){
    let node=field.element
    for(const parent of field.parents??[]){
      if(node.parentNode===null)return true
      if(node.parentNode!==parent.node||this.#fieldBoundary(parent.node)!==parent.boundary
        ||(liveBlockRoots.get(parent.node)??this.#blockOwners.get(parent.node))!==parent.blockOwner)return false
      node=parent.node
    }
    return false
  }

  #sameFailedContent(entry,failed){
    if(failed.record===entry.record)return true
    if(failed.record.type!==entry.record.type||failed.record.dataVersion!==entry.record.dataVersion)return false
    const before=richTextFieldMap(entry.definition,failed.record.data)
    const after=richTextFieldMap(entry.definition,entry.record.data)
    const healthyFields=new Map(entry.fields.map(field=>[field.element,field]))
    for(const field of failed.fields){
      if(healthyFields.get(field.element)?.key===field.key)continue
      if(field.mode!=='rich-text')return sameJson(failed.record,entry.record)
      const html=before.get(field.key)
      if(html!==after.get(field.key))return false
      for(const [id] of scanRichTextPlaceholders(html??'',failed.record.inline??{},this.#container.ownerDocument).occurrences){
        if(!sameJson(failed.record.inline?.[id],entry.record.inline?.[id]))return false
      }
    }
    return true
  }

  #applyTunes(entry, record) {
    const style = entry.element?.style
    if (!style) return
    const align = record.tunes?.textAlign
    style.textAlign = ['left', 'center', 'right', 'justify'].includes(align) ? align : ''
  }

  #restore(store, extraEntries) {
    const previousEntries=this.#entries
    const oldContainerChildren=Array.from(this.#container.childNodes??this.#container.children??[])
    let fresh
    try{
      fresh=this.#stageAll(store,{candidate:false,stageInline:true,generation:store.generation,restoring:true})
      this.#assertPublicationOwner(previousEntries,'Block restoration owner changed during staging')
    }catch(error){
      if(fresh)for(const entry of fresh.values())this.#destroyEntry(entry)
      throw error
    }
    const oldEntries = new Set([...previousEntries.values(), ...extraEntries.values()])

    try {
      this.#assertPublicationOwner(previousEntries,'Block restoration owner changed before publication')
      this.#container.replaceChildren(...store.ids().map(id => fresh.get(id).element))
      this.#assertPublicationOwner(previousEntries,'Block restoration owner changed during publication')
      this.#entries = fresh
      for (const entry of fresh.values()){
        this.#applyPreparedInline(entry)
        this.#assertPublicationOwner(fresh,'Block restoration owner changed during inline publication')
      }
      for (const entry of fresh.values()){
        this.#activateEntry(entry)
        this.#assertPublicationOwner(fresh,'Block restoration owner changed during activation')
      }
      for (const entry of fresh.values())this.#completeFields(entry)
      for (const entry of fresh.values()){
        this.#finalizePreparedInline(entry)
        this.#assertPublicationOwner(fresh,'Block restoration owner changed during finalization')
      }
    } catch (error) {
      const failures=[]
      for (const entry of fresh.values()){
        try{this.#recoverPreparedInline(entry)}catch(failure){failures.push(failure)}
      }
      for (const entry of fresh.values()){
        try{this.#destroyEntry(entry)}catch(failure){failures.push(failure)}
      }
      if(!this.#destroyed&&(this.#entries===fresh||this.#entries===previousEntries)){
        if(this.#entries===fresh)this.#entries=previousEntries
        try{restoreChildOrder(this.#container,oldContainerChildren)}
        catch(failure){failures.push(failure)}
      }else{
        const successorOwners=new Set(this.#entries.values())
        for(const entry of oldEntries){
          if(!successorOwners.has(entry))this.#destroyEntry(entry)
        }
      }
      if(failures.length){
        throw new AggregateError([error,...failures],'Block restoration and rollback both failed')
      }
      throw error
    }

    for (const entry of oldEntries) this.#destroyEntry(entry)
    this.#assertPublicationOwner(fresh,'Block restoration owner changed after predecessor cleanup')
  }

  #destroyEntry(entry,onlyOwnedRoot=false) {
    if (!entry) return
    try { this.#discardPreparedInline(entry) } catch {}
    try { entry.scope?.revoke?.() } catch {}
    try { entry.controller?.abort() } catch {}
    try { entry.instance?.destroy?.() } catch {}
    try { if(!onlyOwnedRoot||entry.element?.parentNode===this.#container)entry.element?.remove?.() } catch {}
    if(entry.scope&&liveBlockRoots.get(entry.instance?.element)===entry.scope){
      liveBlockRoots.delete(entry.instance.element)
    }
  }
}
