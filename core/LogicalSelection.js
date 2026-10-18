// @ts-check
import { findNodeAtOffset, getTextLength, getTextOffset } from '../shared/textOffset.js'

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value))
}

export class LogicalSelection {
  #root
  #reconciler

  constructor({ root, reconciler }) {
    if (!root?.ownerDocument) throw new TypeError('LogicalSelection requires an editor root')
    if (!reconciler?.resolveEditableTarget) throw new TypeError('LogicalSelection requires a BlockReconciler')
    this.#root = root
    this.#reconciler = reconciler
  }

  capture() {
    const document = this.#root.ownerDocument
    const active = document.activeElement
    const activeOwner = active ? this.#reconciler.resolveEditableTarget(active) : null
    // Field ownership resolution may synchronously focus another host.
    // An old input cannot supply the bookmark for that newer author gesture.
    if (document.activeElement !== active) return null
    const focusedBlock=active&&!activeOwner?this.#reconciler.resolveBlockTarget?.(active):null
    if (document.activeElement !== active) return null
    if(focusedBlock){
      const fields=this.#reconciler.getEditableFields(focusedBlock)
      if(document.activeElement !== active)return null
      if(!fields.length){
        const point={blockId:focusedBlock,fieldKey:'',offset:0}
        return {anchor:point,focus:{...point}}
      }
    }

    if (activeOwner && activeOwner.mode === 'plain-text') {
      // Read each native property once; DOM getters can reenter a focus event.
      const startOffset=active.selectionStart
      const endOffset=active.selectionEnd
      const direction=active.selectionDirection
      if(document.activeElement !== active)return null
      if(typeof startOffset === 'number' && typeof endOffset === 'number'){
        const start = Math.max(0, startOffset)
        const end = Math.max(start, endOffset)
        const forward = direction !== 'backward'
        const anchor = this.#point(activeOwner, forward ? start : end)
        const focus = this.#point(activeOwner, forward ? end : start)
        return { anchor, focus }
      }
    }

    const selection = document.defaultView?.getSelection() ?? null
    if (!selection) return null
    const anchorNode=selection.anchorNode, focusNode=selection.focusNode
    const anchorOffset=selection.anchorOffset, focusOffset=selection.focusOffset
    if (!anchorNode || !focusNode || document.activeElement !== active) return null
    const unchanged=()=>selection.anchorNode===anchorNode
      &&selection.focusNode===focusNode
      &&selection.anchorOffset===anchorOffset
      &&selection.focusOffset===focusOffset
      &&document.activeElement===active
    const anchorOwner = this.#reconciler.resolveEditableTarget(anchorNode)
    if(!unchanged())return null
    const focusOwner = this.#reconciler.resolveEditableTarget(focusNode)
    if (!anchorOwner || !focusOwner || !unchanged()) return null

    const anchor=this.#point(anchorOwner,getTextOffset(anchorOwner.element,anchorNode,anchorOffset))
    const focus=this.#point(focusOwner,getTextOffset(focusOwner.element,focusNode,focusOffset))
    return unchanged()?{anchor,focus}:null
  }

  restore(bookmark) {
    if (!bookmark?.anchor || !bookmark?.focus) return false
    if(bookmark.anchor.blockId===bookmark.focus.blockId
      &&bookmark.anchor.fieldKey===''&&bookmark.focus.fieldKey===''
      &&!this.#reconciler.getEditableFields(bookmark.anchor.blockId).length){
      const blockId=bookmark.anchor.blockId
      const block=this.#reconciler.getElement(blockId)
      if(!block)return false
      // A plugin's default focus may be an auxiliary URL/file chooser. History
      // restores ownership of the block command, not that control's DOM history.
      try{
        this.#clearNativeSelection()
        if(this.#reconciler.getElement(blockId)!==block)return false
        block.tabIndex=-1
        block.focus({preventScroll:true})
        return this.#root.ownerDocument.activeElement===block
          &&this.#reconciler.getElement(blockId)===block
      }catch{
        return false
      }
    }
    // Validate both keyed endpoints before invoking any potentially
    // side-effectful plugin focus. A half-retired range must not steal focus
    // from the author's current field merely because its anchor still exists.
    const initialAnchor = this.#resolvePoint(bookmark.anchor)
    const initialFocus = this.#resolvePoint(bookmark.focus)
    if (!initialAnchor || !initialFocus) return false
    if (this.#root.ownerDocument.activeElement !== initialAnchor.owner.element) {
      // The plugin may reveal a hidden rich-text editing surface on focus.
      this.#reconciler.focus?.(bookmark.anchor.blockId, { fieldKey: bookmark.anchor.fieldKey })
    }
    const anchor = this.#resolvePoint(bookmark.anchor)
    const focus = this.#resolvePoint(bookmark.focus)
    if (!anchor || !focus) return false

    if (
      anchor.owner.element === focus.owner.element
      && anchor.owner.mode === 'plain-text'
      && typeof anchor.owner.element.setSelectionRange === 'function'
    ) {
      const element = anchor.owner.element
      try {
        this.#clearNativeSelection()
        const length = typeof element.value === 'string' ? element.value.length : 0
        const a = clamp(anchor.offset,0,length)
        const f = clamp(focus.offset,0,length)
        element.focus()
        // A native focus event may remount the same block ID or move focus to
        // a newer editing host. Never setSelectionRange on retired inputs.
        if (this.#root.ownerDocument.activeElement !== element
          || !this.#sameCurrentOwners(bookmark,anchor,focus)) return false
        element.setSelectionRange(Math.min(a,f),Math.max(a,f),a<=f?'forward':'backward')
        return this.#sameCurrentOwners(bookmark,anchor,focus)
          && this.#root.ownerDocument.activeElement === element
      } catch {
        return false
      }
    }

    const document=this.#root.ownerDocument
    const selection=document.defaultView?.getSelection()??null
    if(!selection)return false

    const a=findNodeAtOffset(anchor.owner.element,anchor.offset,'start')
    const f=anchor.owner.element===focus.owner.element&&anchor.offset===focus.offset
      ? a
      : findNodeAtOffset(focus.owner.element,focus.offset,'end')

    try{
      // A DOM Selection does not restore document.activeElement after a
      // focused editing host was removed and recreated by undo/redo.
      // Focus the anchor host first, then restore the logical range.
      anchor.owner.element.focus?.({ preventScroll: true })
      // The focus callback may replace the mounted host without changing its
      // logical block/field address, or synchronously focus another editor.
      // Do not write the old text node boundaries into the successor DOM.
      if (document.activeElement !== anchor.owner.element
        || !this.#sameCurrentOwners(bookmark,anchor,focus)) return false
      if(typeof selection.setBaseAndExtent==='function'){
        selection.setBaseAndExtent(a.node,a.offset,f.node,f.offset)
      }else if(typeof selection.collapse==='function'
        &&typeof selection.extend==='function'){
        // A DOM Range always orders its endpoints; with a backward anchor
        // the old setStart/setEnd fallback collapsed the user's selection.
        // Native collapse + extend retains anchor/focus direction.
        selection.collapse(a.node,a.offset)
        selection.extend(f.node,f.offset)
      }else{
        const range=document.createRange()
        range.setStart(a.node,a.offset)
        range.setEnd(f.node,f.offset)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      // Native selection APIs may synchronously dispatch focus/selection
      // listeners. A newer mounted occurrence or collapsed author focus
      // must not inherit the old caret command's successful return value.
      const collapsed = bookmark.anchor.blockId === bookmark.focus.blockId
        && bookmark.anchor.fieldKey === bookmark.focus.fieldKey
        && bookmark.anchor.offset === bookmark.focus.offset
      return this.#sameCurrentOwners(bookmark,anchor,focus)
        && (!collapsed || document.activeElement === anchor.owner.element)
    }catch{
      return false
    }
  }

  setCaret(blockId,target={}) {
    const fields=this.#reconciler.getEditableFields(blockId)
    const owner=target.fieldKey
      ? fields.find(field=>field.key===target.fieldKey)
      : fields[0]
    if(!owner){
      // An explicitly keyed target that disappeared is a failed request,
      // not permission to retire the user's existing native text selection.
      // Fieldless block caret requests still clear our old editing range.
      if(!target.fieldKey && this.#reconciler.getElement(blockId))this.#clearNativeSelection()
      return false
    }
    const length=owner.mode==='plain-text'&&typeof owner.element.value==='string'
      ? owner.element.value.length
      : getTextLength(owner.element)
    const offset=target.offset==='end'
      ? length
      : target.offset==='start'||target.offset===undefined
        ? 0
        : clamp(Number(target.offset)||0,0,length)
    return this.restore({
      anchor:this.#point({blockId,fieldKey:owner.key,element:owner.element,mode:owner.mode},offset),
      focus:this.#point({blockId,fieldKey:owner.key,element:owner.element,mode:owner.mode},offset),
    })
  }

  #clearNativeSelection(){
    const native=this.#root.ownerDocument.defaultView?.getSelection()
    // A control or fieldless block has no DOM text caret. Retire only our
    // previous range; another editor's native selection is not ours to clear.
    if(native?.anchorNode&&this.#root.contains(native.anchorNode))native.removeAllRanges()
  }

  #point(owner,offset){
    return {
      blockId:owner.blockId,
      fieldKey:owner.fieldKey,
      offset:Math.max(0,Math.trunc(offset)||0),
    }
  }

  #sameCurrentOwners(bookmark,anchor,focus){
    const nowAnchor=this.#resolvePoint(bookmark.anchor)
    const nowFocus=this.#resolvePoint(bookmark.focus)
    return Boolean(nowAnchor&&nowFocus
      &&nowAnchor.owner.element===anchor.owner.element
      &&nowAnchor.owner.mode===anchor.owner.mode
      &&nowFocus.owner.element===focus.owner.element
      &&nowFocus.owner.mode===focus.owner.mode)
  }

  #resolvePoint(point){
    const fields=this.#reconciler.getEditableFields(point.blockId)
    if(!fields.length)return null
    let owner=fields.find(field=>field.key===point.fieldKey)
    // History or host replacement can retire a keyed field while keeping the
    // block alive. Never relocate an explicit old field address to its sibling.
    if(!owner&&point.fieldKey)return null
    if(!owner)owner=fields[0]
    const length=owner.mode==='plain-text'&&typeof owner.element.value==='string'
      ? owner.element.value.length
      : getTextLength(owner.element)
    return {
      owner:{
        blockId:point.blockId,
        fieldKey:owner.key,
        element:owner.element,
        mode:owner.mode,
      },
      offset:clamp(Number(point.offset)||0,0,length),
    }
  }
}
