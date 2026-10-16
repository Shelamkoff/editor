// @ts-check
import { containedTextRange } from '../shared/containedTextRange.js'
import { editingHostForEvent } from '../shared/editableFields.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { synchronousResult } from '../shared/synchronousResult.js'

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
  #controller

  constructor({root,runtime,registry,reconciler,projection,selection,diagnostics=null}){
    if(!root?.addEventListener)throw new TypeError('InlineWidgetInputController requires an editor root')
    this.#root=root
    this.#runtime=runtime
    this.#registry=registry
    this.#reconciler=reconciler
    this.#projection=projection
    this.#selection=selection
    this.#diagnostics=diagnostics
    const Ctor=root.ownerDocument.defaultView?.AbortController??AbortController
    this.#controller=new Ctor()
    root.addEventListener('beforeinput',event=>this.#beforeInput(event),{
      capture:true,
      signal:this.#controller.signal,
    })
  }

  destroy(){this.#controller.abort()}

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
