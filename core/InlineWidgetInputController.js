// @ts-check
import { containedTextRange } from '../shared/containedTextRange.js'
import { editingHostForEvent } from '../shared/editableFields.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { synchronousResult } from '../shared/synchronousResult.js'

const NATIVE_INLINE_DELETIONS = new Set([
  'deleteContentBackward','deleteContentForward',
  'deleteWordBackward','deleteWordForward',
  'deleteSoftLineBackward','deleteSoftLineForward',
])
const WORD_OR_LINE_DELETIONS = new Set([
  'deleteWordBackward','deleteWordForward',
  'deleteSoftLineBackward','deleteSoftLineForward',
])

const IMMEDIATE_INPUTS = new Set([
  'deleteContentBackward', 'deleteContentForward',
  'deleteWordBackward', 'deleteWordForward',
  'deleteSoftLineBackward', 'deleteSoftLineForward',
  'insertText', 'insertReplacementText',
])

/** Snapshot and validate a prepared inline edit before owning its event.
 * @param {unknown} input
 */
function captureAction(input) {
  const value = cloneEditorData(synchronousResult(input))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Inline editing handle() must return a valid action or null')
  }
  const kind = value.kind
  if (kind === 'update') {
    if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
      throw new TypeError('Inline editing update must supply data')
    }
  } else if (kind === 'replace-text') {
    if (typeof value.text !== 'string') throw new TypeError('Inline plain-text replacement must contain text')
  } else if (kind !== 'remove') {
    throw new TypeError('Unknown inline editing action')
  }
  if (Object.hasOwn(value, 'caret')
    && (!Number.isInteger(value.caret) || value.caret < 0)) {
    throw new TypeError('Inline editing caret must be a non-negative integer')
  }
  return value
}

export class InlineWidgetInputController {
  #root
  #runtime
  #registry
  #reconciler
  #projection
  #selection
  #diagnostics
  #onNativeSettled
  #nativeEventRoutes=new WeakMap()
  #controller

  constructor({root,runtime,registry,reconciler,projection,selection,diagnostics=null,onNativeSettled=null}){
    if(!root?.addEventListener)throw new TypeError('InlineWidgetInputController requires an editor root')
    this.#root=root
    this.#runtime=runtime
    this.#registry=registry
    this.#reconciler=reconciler
    this.#projection=projection
    this.#selection=selection
    this.#diagnostics=diagnostics
    this.#onNativeSettled=typeof onNativeSettled==='function'?onNativeSettled:null
    const Ctor=root.ownerDocument.defaultView?.AbortController??AbortController
    this.#controller=new Ctor()
    root.addEventListener('beforeinput',event=>this.#beforeInput(event),{
      capture:true,
      signal:this.#controller.signal,
    })
  }

  destroy(){this.#controller.abort()}

  /** Keep event-local routing distinct from the pending input envelope.
   * Other native input observers continue to receive the event.
   */
  markNativeInputEvent(event,result){
    if(event&&typeof event==='object'){
      this.#nativeEventRoutes.set(event,Object.freeze({
        status:result?.status??'failed',
        inside:result?.inside===true,
      }))
    }
  }

  nativeInputRoute(event){
    return event&&typeof event==='object'
      ?this.#nativeEventRoutes.get(event)??null:null
  }

  /** Capture the existing field and every owned native-edit-eligible
   * occurrence before the browser modifies a mixed label/author selection.
   * This uses the existing NativeInputController pending envelope.
   */
  captureNativeDeletion(owner,event,native){
    if(!owner||owner.mode!=='rich-text'||this.#runtime.readOnly
      ||this.#runtime.canAccessFormattingSelection?.()!==true
      ||event?.defaultPrevented||event?.isComposing
      ||!NATIVE_INLINE_DELETIONS.has(event?.inputType))return null
    const field=this.#reconciler.getEditableField(owner.blockId,owner.fieldKey)
    if(!field||field.element!==owner.element||!field.element?.isConnected
      ||!this.#root.contains(field.element)||!field.element.contains(native?.anchorNode))return null
    const state=this.#projection.captureNativeField(owner.blockId,owner.fieldKey,field.element)
    if(!state?.occurrences?.some(entry=>entry.optedIn))return null
    const eventHost=editingHostForEvent(this.#root,event.target)
    if(eventHost!==field.element){
      const owned=this.#projection.resolveWidgetElement(event.target)
      if(!state.occurrences.some(entry=>entry.element===owned))return null
    }

    let range=null, supplied=null
    try{supplied=event.getTargetRanges?.()[0]??null}catch{return null}
    const candidate=supplied??(!native.isCollapsed&&native.rangeCount?native.getRangeAt(0):null)
    if(candidate){
      if(!field.element.contains(candidate.startContainer)
        ||!field.element.contains(candidate.endContainer))return null
      try{
        range=field.element.ownerDocument.createRange()
        range.setStart(candidate.startContainer,candidate.startOffset)
        range.setEnd(candidate.endContainer,candidate.endOffset)
      }catch{return null}
      const crosses=state.occurrences.some(entry=>{
        try{
          if(!range.intersectsNode(entry.element))return false
          return !(entry.element.contains(range.startContainer)
            &&entry.element.contains(range.endContainer))
        }catch{return false}
      })
      if(!crosses)return null
    }else if(!WORD_OR_LINE_DELETIONS.has(event.inputType))return null

    const current=this.#runtime.get(owner.blockId)
    if(!current)return null
    return Object.freeze({
      blockId:owner.blockId,fieldKey:owner.fieldKey,blockType:current.type,
      fieldElement:field.element,occurrences:state.occurrences,
      generation:this.#runtime.generation,revision:this.#runtime.revision,
      selectionBefore:this.#selection?.capture()??null,
      inputType:event.inputType,
      originalEvent:event,
      eventHost:field.element,
      trusted:event.isTrusted===true,
      applyChanges:changes=>this.#projection.applyNativeInlineChanges(owner.blockId,owner.fieldKey,changes),
    })
  }

  /** Only the matching native input may settle this captured operation.
   * A stale event remains owned and must not enter generic field persistence.
   */
  completeNativeDeletion(snapshot,event){
    if(!snapshot)return {status:'stale'}
    const field=this.#reconciler.getEditableField(snapshot.blockId,snapshot.fieldKey)
    if(this.#runtime.readOnly||!field||field.element!==snapshot.fieldElement
      ||snapshot.generation!==this.#runtime.generation
      ||snapshot.revision!==this.#runtime.revision)return {status:'stale'}

    const observed=this.#observedLabelSelection(snapshot)
    const owned={...snapshot,settle:(changes,status)=>{
      this.#projection.retireNativeInlineChanges(snapshot.blockId,changes)
      this.#settleNativeNotices(snapshot,changes,status,observed)
    }}
    try{
      const result=this.#runtime.reconcileNativeInlineInput(owned,()=>
        this.#prepareNativeChanges(snapshot))
      const finalOwner=observed?.focus?.id??observed?.anchor?.id??null
      const finalOccurrence=snapshot.occurrences.find(source=>source.id===finalOwner)
      return {...result,inside:result.status!=='stale'&&Boolean(
        finalOccurrence?.optedIn&&this.#projection.isCurrentNativeOccurrence(
          snapshot.blockId,snapshot.fieldKey,finalOccurrence))}
    }catch(error){
      this.#report(error)
      throw error
    }
  }

  /** Discard only current committed projection drift, never a replacement. */
  discardStaleNativeDeletion(snapshot){
    if(!snapshot||this.#runtime.readOnly)return
    const field=this.#reconciler.getEditableField(snapshot.blockId,snapshot.fieldKey)
    const current=this.#runtime.get(snapshot.blockId)
    if(field?.element!==snapshot.fieldElement
      ||current?.type!==snapshot.blockType)return
    this.#runtime.discardProjectionEdits?.()
  }

  #prepareNativeChanges(snapshot){
    const changes=[]
    for(const source of snapshot.occurrences){
      if(!this.#projection.isCurrentNativeOccurrence(
        snapshot.blockId,snapshot.fieldKey,source,{allowDetached:true})){
        throw new Error('Native inline occurrence lifetime changed before settlement')
      }
      if(source.element.isConnected&&!snapshot.fieldElement.contains(source.element)){
        throw new Error('Native inline occurrence moved to another field')
      }
      if(!snapshot.fieldElement.contains(source.element)){
        changes.push({...source,action:{kind:'remove'}})
        continue
      }
      const after=source.element.textContent??''
      if(after===source.beforeText)continue
      if(!source.optedIn)throw new Error('Non-opted inline widget label changed natively')
      const definition=this.#registry.getInlineDefinition(source.type)
      const editing=definition?.editing
      const method=editing?.reconcileNative
      if(typeof method!=='function')throw new Error('Native inline reconciliation capability is unavailable')
      const result=synchronousResult(Reflect.apply(method,editing,[{
        inputType:snapshot.inputType,beforeText:source.beforeText,text:after,
      },cloneEditorData(source.data)]))
      changes.push({...source,action:captureAction(result)})
    }
    return changes
  }

  #observedLabelSelection(snapshot){
    const selection=this.#root.ownerDocument.defaultView?.getSelection?.()
    if(!selection?.anchorNode||!selection.focusNode)return null
    const offsetFor=(node,offset)=>{
      for(const entry of snapshot.occurrences){
        if(!entry.element.contains(node))continue
        try{
          const range=this.#root.ownerDocument.createRange()
          range.selectNodeContents(entry.element)
          range.setEnd(node,offset)
          return {id:entry.id,offset:range.toString().length}
        }catch{return null}
      }
      return null
    }
    return {
      anchor:offsetFor(selection.anchorNode,selection.anchorOffset),
      focus:offsetFor(selection.focusNode,selection.focusOffset),
    }
  }

  #settleNativeNotices(snapshot,changes,status,observed){
    if(this.#controller.signal.aborted||this.#runtime.readOnly)return
    const finalOwner=observed?.focus?.id??observed?.anchor?.id??null
    const targets=new Set(changes.filter(c=>c.action.kind==='update').map(c=>c.id))
    if(finalOwner)targets.add(finalOwner)
    if(finalOwner){
      const matching=snapshot.occurrences.find(source=>source.id===finalOwner)
      if(matching && this.#projection.isCurrentNativeOccurrence(snapshot.blockId,snapshot.fieldKey,matching)){
        const text=matching.element.firstChild
        if(text?.nodeType===3){
          const a=observed.anchor?.id===finalOwner?Math.max(0,Math.min(observed.anchor.offset,text.length)):null
          const f=observed.focus?.id===finalOwner?Math.max(0,Math.min(observed.focus.offset,text.length)):null
          const native=this.#root.ownerDocument.defaultView?.getSelection?.()
          if(a!==null&&f!==null&&native?.setBaseAndExtent){
            native.setBaseAndExtent(text,a,text,f)
          }
        }
      }
    }
    if(targets.size){
      try{this.#onNativeSettled?.()}catch(error){this.#report(error)}
    }
    const ordered=[...targets].filter(id=>id!==finalOwner)
    if(finalOwner&&targets.has(finalOwner))ordered.push(finalOwner)
    for(const id of ordered){
      const source=snapshot.occurrences.find(entry=>entry.id===id)
      if(!source?.optedIn||!this.#projection.isCurrentNativeOccurrence(
        snapshot.blockId,snapshot.fieldKey,source))continue
      const label=source.element.textContent??''
      const notice={inputType:snapshot.inputType,text:label,
        labelChanged:label!==source.beforeText,
        caret:observed?.focus?.id===id?observed.focus.offset:null}
      try{
        this.#runtime.observeExtension(()=>
          this.#projection.notifyNativeInlineEdit(snapshot.blockId,id,notice))
      }catch(error){this.#report(error)}
    }
  }

  #report(error){
    this.#diagnostics?.emit('command.failed',{
      operation:'inline-widget.immediate',
      errorName:this.#diagnostics.errorName(error),
    })
  }

  #beforeInput(event){
    if(this.#runtime.readOnly||event.defaultPrevented||event.isComposing
      ||event.cancelable!==true)return
    const eventTarget=event.target
    if(!eventTarget||!this.#root.contains(eventTarget)
      ||eventTarget.closest?.('input, textarea, select, button'))return
    const inputType=typeof event.inputType==='string'?event.inputType:''
    if(!IMMEDIATE_INPUTS.has(inputType))return
    if(this.#runtime.canAccessFormattingSelection?.()!==true)return

    // Resolve the actual incoming event's registered editing field first;
    // never borrow a selection retained in an unrelated editor/control.
    const ownerHost=editingHostForEvent(this.#root,eventTarget)
    const native=this.#root.ownerDocument.defaultView?.getSelection?.()
    const target=this.#projection.resolveWidgetInputTarget(native,inputType)
    if(!target)return
    const field=this.#reconciler?.getEditableField(target.blockId,target.fieldKey)
    if(!field||field.mode!=='rich-text'||!field.element?.isConnected
      ||!this.#root.contains(field.element)
      ||!field.element.contains(target.element)
      ||!field.element.contains(native?.anchorNode)
      ||!target.element.isConnected||!target.element.isContentEditable)return
    const directWidget=eventTarget===target.element||target.element.contains(eventTarget)
    if(ownerHost!==field.element&&!directWidget)return
    if(!field.element.contains(eventTarget))return

    const definition=this.#registry.getInlineDefinition(target.type)
    const editing=definition?.editing
    if(typeof editing?.handle!=='function')return
    const capturedHandle=editing.handle
    const startGeneration=this.#runtime.generation
    const startRevision=this.#runtime.revision

    let action
    try{
      action=this.#runtime.prepareExtensionValue(()=>{
        const range=event.getTargetRanges?.()[0]??null
        const deletionRange=inputType.startsWith('delete')||inputType==='insertReplacementText'
          ?containedTextRange(target.element,range):null
        // A browser interval spanning neighboring author text is not a label
        // edit and must never be narrowed to a one-character fallback.
        if(range && !deletionRange && (inputType.startsWith('delete')
          ||inputType==='insertReplacementText'))return null
        const input={
          inputType,
          position:target.position,
          offset:target.offset,
          text:target.element.textContent??'',
          data:typeof event.data==='string'?event.data:null,
          ...(deletionRange?{deletionRange}:{}),
        }
        const resolved=synchronousResult(Reflect.apply(capturedHandle,editing,[input,cloneEditorData(target.data)]))
        return resolved===null?null:captureAction(resolved)
      })
    }catch(error){
      // Only this proven-owned event is consumed. A rejected extension action
      // must not fall through to native deletion or a later generic commit.
      event.preventDefault()
      event.stopImmediatePropagation?.()
      this.#report(error)
      return
    }
    if(action===null)return
    event.preventDefault()
    event.stopImmediatePropagation?.()

    if(this.#runtime.readOnly||this.#runtime.generation!==startGeneration
      ||this.#runtime.revision!==startRevision
      ||this.#projection.resolveWidgetElement(target.element)!==target.element)return

    if(action.kind==='update'){
      this.#withCaret(target,action,()=>this.#runtime.updateInlineWidget(
        target.blockId,target.inlineId,()=>action.data))
      return
    }
    if(action.kind==='remove'){
      this.#withCaret(target,action,()=>this.#runtime.removeInlineWidget(target.blockId,target.inlineId))
      return
    }
    this.#withCaret(target,action,()=>this.#runtime.replaceInlineWidgetWithText(
      target.blockId,target.inlineId,action.text))
  }

  #withCaret(target,action,operation){
    const inside=action.kind==='update'
    const localCaret=Number.isInteger(action.caret)?action.caret:null
    const offset=inside
      ?target.logicalOffset+1
      :target.logicalOffset+(action.kind==='replace-text'
        ?Math.max(0,Math.min(localCaret??0,action.text.length)):0)
    const point={blockId:target.blockId,fieldKey:target.fieldKey,offset}
    const result=this.#runtime.interact('inline.edit',operation,()=>({anchor:point,focus:{...point}}))
    if(result===false)return

    const generation=this.#runtime.generation,revision=this.#runtime.revision
    const field=this.#reconciler.getEditableField(target.blockId,target.fieldKey)?.element
    queueMicrotask(()=>{
      if(this.#controller.signal.aborted||this.#runtime.readOnly
        ||generation!==this.#runtime.generation||revision!==this.#runtime.revision)return
      if(this.#reconciler.getEditableField(target.blockId,target.fieldKey)?.element!==field
        ||!field?.isConnected)return
      if(inside){
        if(this.#projection.resolveWidgetElement(target.element)!==target.element)return
        const node=target.element.firstChild
        if(localCaret!==null&&node?.nodeType===3){
          const caret=Math.max(0,Math.min(localCaret,node.textContent?.length??0))
          const native=field.ownerDocument.defaultView?.getSelection?.()
          if(native?.setBaseAndExtent){
            native.setBaseAndExtent(node,caret,node,caret)
            return
          }
        }
      }
      this.#selection.setCaret(target.blockId,{fieldKey:target.fieldKey,offset})
    })
  }
}
