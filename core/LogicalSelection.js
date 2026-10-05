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
    const focusedBlock=active&&!activeOwner?this.#reconciler.resolveBlockTarget?.(active):null
    if(focusedBlock&&!this.#reconciler.getEditableFields(focusedBlock).length){
      const point={blockId:focusedBlock,fieldKey:'',offset:0}
      return {anchor:point,focus:{...point}}
    }

    if (
      activeOwner
      && activeOwner.mode === 'plain-text'
      && typeof active.selectionStart === 'number'
      && typeof active.selectionEnd === 'number'
    ) {
      const start = Math.max(0, active.selectionStart)
      const end = Math.max(start, active.selectionEnd)
      const forward = active.selectionDirection !== 'backward'
      const anchor = this.#point(activeOwner, forward ? start : end)
      const focus = this.#point(activeOwner, forward ? end : start)
      return { anchor, focus }
    }

    const selection = document.defaultView?.getSelection() ?? null
    if (!selection?.anchorNode || !selection.focusNode) return null
    const anchorOwner = this.#reconciler.resolveEditableTarget(selection.anchorNode)
    const focusOwner = this.#reconciler.resolveEditableTarget(selection.focusNode)
    if (!anchorOwner || !focusOwner) return null

    return {
      anchor: this.#point(anchorOwner, getTextOffset(
        anchorOwner.element,
        selection.anchorNode,
        selection.anchorOffset,
      )),
      focus: this.#point(focusOwner, getTextOffset(
        focusOwner.element,
        selection.focusNode,
        selection.focusOffset,
      )),
    }
  }

  restore(bookmark) {
    if (!bookmark?.anchor || !bookmark?.focus) return false
    if(bookmark.anchor.blockId===bookmark.focus.blockId
      &&bookmark.anchor.fieldKey===''&&bookmark.focus.fieldKey===''
      &&!this.#reconciler.getEditableFields(bookmark.anchor.blockId).length){
      const block=this.#reconciler.getElement(bookmark.anchor.blockId)
      if(!block)return false
      // A plugin's default focus may be an auxiliary URL/file chooser. History
      // restores ownership of the block command, not that control's DOM history.
      this.#clearNativeSelection()
      block.tabIndex=-1
      block.focus({preventScroll:true})
      return this.#root.ownerDocument.activeElement===block
    }
    const target = this.#resolvePoint(bookmark.anchor)
    if (target && this.#root.ownerDocument.activeElement !== target.owner.element) {
      // The plugin must expose a hidden editing host before native focus can
      // restore its caret (Code view, Raw preview, closed Spoiler content).
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
      this.#clearNativeSelection()
      const length = typeof element.value === 'string' ? element.value.length : 0
      const a = clamp(anchor.offset,0,length)
      const f = clamp(focus.offset,0,length)
      element.focus()
      element.setSelectionRange(Math.min(a,f),Math.max(a,f),a<=f?'forward':'backward')
      return true
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
      if(typeof selection.setBaseAndExtent==='function'){
        selection.setBaseAndExtent(a.node,a.offset,f.node,f.offset)
      }else{
        const range=document.createRange()
        range.setStart(a.node,a.offset)
        range.setEnd(f.node,f.offset)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      return true
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
      if(this.#reconciler.getElement(blockId))this.#clearNativeSelection()
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

  #resolvePoint(point){
    const fields=this.#reconciler.getEditableFields(point.blockId)
    if(!fields.length)return null
    let owner=fields.find(field=>field.key===point.fieldKey)
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
