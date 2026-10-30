// @ts-check
import { editingHostForEvent } from '../shared/editableFields.js'
import { getTextLength, getTextOffset } from '../shared/textOffset.js'
import { shortcutKey } from '../shared/shortcutKey.js'

function sameEditableRange(bookmark, owner) {
  const anchor = bookmark?.anchor
  const focus = bookmark?.focus
  if (!anchor || !focus) return null
  if (
    anchor.blockId !== owner.blockId
    || focus.blockId !== owner.blockId
    || anchor.fieldKey !== owner.fieldKey
    || focus.fieldKey !== owner.fieldKey
  ) return null
  return {
    start: Math.min(anchor.offset, focus.offset),
    end: Math.max(anchor.offset, focus.offset),
  }
}

function sameLogicalSelection(left,right){
  if(!left||!right)return false
  const samePoint=(a,b)=>a?.blockId===b?.blockId
    &&a?.fieldKey===b?.fieldKey
    &&a?.offset===b?.offset
  return samePoint(left.anchor,right.anchor)&&samePoint(left.focus,right.focus)
}

function fieldLength(owner) {
  return owner.mode === 'plain-text' && typeof owner.element?.value === 'string'
    ? owner.element.value.length
    : getTextLength(owner.element)
}

export class KeyboardRouter {
  #root
  #runtime
  #registry
  #reconciler
  #selection
  #view
  #crossSelection
  #controller
  #inlineToolbar
  #inlineCommands
  #isComposing
  #reportError

  constructor({ root, runtime, registry, reconciler, selection, view, inlineToolbar = null, inlineCommands = null, crossSelection = null, isComposing = () => false,
    reportError = error => console.error('Keyboard shortcut failed', error) }) {
    if (!root?.addEventListener) throw new TypeError('KeyboardRouter requires an event root')
    if (!runtime?.splitBlock || !runtime?.mergeAdjacent) throw new TypeError('KeyboardRouter requires a DocumentRuntime')
    if (!registry?.getBlockDefinition) throw new TypeError('KeyboardRouter requires an ExtensionRegistry')
    if (!reconciler?.resolveEditableTarget) throw new TypeError('KeyboardRouter requires a BlockReconciler')
    if (!selection?.capture) throw new TypeError('KeyboardRouter requires LogicalSelection')
    if (!view?.focus) throw new TypeError('KeyboardRouter requires EditorViewModel')

    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#crossSelection = crossSelection
    this.#inlineToolbar = inlineToolbar
    this.#inlineCommands = inlineCommands
    this.#isComposing = typeof isComposing === 'function' ? isComposing : () => false
    this.#reportError = reportError

    const AbortControllerCtor = root.ownerDocument?.defaultView?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    root.addEventListener('keydown', event => this.handleKeydown(event), { signal: this.#controller.signal })
  }

  handleKeydown(event) {
    // Captured DOM callbacks can still arrive after their listener signal
    // is revoked. A terminal keyboard owner may not consume native keys.
    if (this.#controller.signal.aborted || this.#runtime.readOnly || event?.defaultPrevented || event?.isComposing || event?.keyCode === 229 || this.#isComposing()) return

    const ownerModeEpoch = this.#runtime.modeEpoch
    const stillOwnKey = () => this.#canPresent()
      && this.#runtime.modeEpoch === ownerModeEpoch
    const ownership = this.#ownership(event)
    // A target resolver may synchronously retire the keyboard owner or
    // replace control mode while returning its previously valid field.
    if (!stillOwnKey()) return
    if (ownership.kind === 'outside' || ownership.kind === 'auxiliary-native') return

    let keys
    try{
      keys=this.#runtime.prepareExtensionValue(()=>({
        key:String(event?.key??''),code:String(event?.code??''),shiftKey:event?.shiftKey===true,
        altKey:event?.altKey===true,ctrlKey:event?.ctrlKey===true,metaKey:event?.metaKey===true,
      }))
    }catch(error){
      event.preventDefault?.()
      try{this.#reportError(error)}catch{}
      return
    }
    if (!stillOwnKey()) return
    const key = keys.key
    const lower = shortcutKey(keys)
    const mod = keys.metaKey || keys.ctrlKey

    if (mod && !keys.altKey) {
      if (ownership.kind === 'document-rich-text') {
        const handled = this.#inlineToolbar?.handleShortcut?.(event)
        // A plugin/tool shortcut can replace edit mode while returning false.
        // That response cannot authorize an old Mod+Z/Y or structural key.
        if (!stillOwnKey() || handled) return
      }

      if (lower === 'a' && !keys.shiftKey && ownership.owner) {
        if (this.#crossSelection?.wholeBlockIds?.length) {
          if (!stillOwnKey()) return
          this.#crossSelection.clear()
          // Native Ctrl+A selects text in the focused editing host again.
          return
        }
        const owner = ownership.owner
        const bookmark = this.#selection.capture()
        if (!stillOwnKey()) return
        const range = sameEditableRange(bookmark, owner)
        if (
          this.#crossSelection?.active
          || (range && (range.start !== range.end || fieldLength(owner) === 0))
        ) {
          // Reading field size and selection state may invoke host getters.
          // Never claim a whole-block selection with a retired key lease.
          if (!stillOwnKey()) return
          if (this.#crossSelection?.selectAllBlocks()) event.preventDefault?.()
          return
        }
      }

      if (lower === 'z') {
        event.preventDefault?.()
        if (keys.shiftKey) this.#redo()
        else this.#undo()
        return
      }
      if (lower === 'y' && !keys.shiftKey) {
        event.preventDefault?.()
        this.#redo()
        return
      }
    }

    // Explicit caret movement dismisses the logical range even when native
    // movement is clamped at the same endpoint (for example End after conversion).
    if (ownership.owner && !keys.shiftKey && this.#crossSelection?.active
      && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      this.#crossSelection.clear()
    }

    if (keys.shiftKey && (keys.ctrlKey || keys.metaKey) && !keys.altKey
      && (key === 'ArrowLeft' || key === 'ArrowRight')
      && this.#crossSelection?.extend(key === 'ArrowLeft' ? 'backward' : 'forward', 'word')) {
      event.preventDefault?.()
      return
    }
    // A selected range is deleted as a whole, including word-delete shortcuts.
    // Yielding Ctrl+Delete/Backspace lets the browser clip it to one editing host.
    if (this.#crossSelection?.active && (key === 'Backspace' || key === 'Delete')) {
      event.preventDefault?.()
      if (this.#crossSelection.wholeBlockIds?.length) {
        this.#crossSelection.removeWholeBlocks()
        return
      }
      this.#crossSelection.replace({ kind: 'text', text: '' })
      return
    }
    if (keys.metaKey || keys.ctrlKey || keys.altKey) return
    if (!ownership.owner) return

    if (keys.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')
      && this.#crossSelection?.extend(key === 'ArrowLeft' ? 'backward' : 'forward')) {
      event.preventDefault?.()
      return
    }
    if (keys.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')
      && ownership.owner.mode === 'rich-text' && this.#crossSelection) {
      if (!this.#hideToolbarForVerticalSelection(ownership.owner) || !stillOwnKey()) return
    }
    if (keys.shiftKey && ['ArrowUp','ArrowDown','Home','End'].includes(key)
      && this.#crossSelection?.extend(
        key === 'ArrowUp' || key === 'Home' ? 'backward' : 'forward',
        key === 'Home' || key === 'End' ? 'lineboundary' : 'line',
      )) {
      event.preventDefault?.()
      return
    }

    const owner = ownership.owner
    if (key === 'Enter' && !keys.shiftKey && this.#crossSelection?.active && this.#crossSelection.split()) {
      event.preventDefault?.()
      return
    }
    const authorSelection = this.#selection.capture()
    const range = sameEditableRange(authorSelection, owner)
    if (!range) return

    const record = this.#runtime.get(owner.blockId)
    if(this.#handleShortcut(owner,event,range,keys))return
    if (!stillOwnKey()) return

    // Recognized typed patterns take priority over native delimiters in v2.
    // The word replacement and trailing space are one canonical history action.
    if ((key === ' ' || key === 'Enter')
      && owner.mode === 'rich-text' && range.start === range.end
      && this.#inlineCommands?.commitTypedPattern) {
      const modeEpoch = this.#runtime.modeEpoch
      let converted
      try {
        converted = this.#convertTypedPattern(owner, range, key)
      } catch (error) {
        // A recognized pattern whose plugin preparation fails is owned by
        // this key, unless the callback itself revoked that event owner.
        if (this.#canPresent() && this.#runtime.modeEpoch === modeEpoch) {
          event.preventDefault?.()
        }
        try { this.#reportError(error) } catch {}
        return
      }
      // A matched command may synchronously destroy the editor in its commit
      // observer. A failed matcher may round-trip control mode without
      // changing the document. Neither can consume or continue the old key.
      if (!this.#canPresent() || this.#runtime.modeEpoch !== modeEpoch) return
      if (converted) {
        event.preventDefault?.()
        return
      }
      // A matcher can choose a newer caret even when declining conversion.
      // Neither the former structural range nor native delimiter insertion may
      // then edit that superseding selection on this key's behalf.
      const currentSelection = this.#selection.capture()
      if (!stillOwnKey()) return
      if (!sameLogicalSelection(authorSelection, currentSelection)) {
        event.preventDefault?.()
        return
      }
    }

    if (key === 'Enter' && !keys.shiftKey) {
      const handled=this.#handleStructuralKey(event,()=>this.#runtime.isEmpty(owner.blockId)
        ?this.exit(owner.blockId):this.split(owner.blockId,owner.fieldKey,range))
      if(handled)event.preventDefault?.()
      return
    }

    if (key === 'Backspace' && !keys.shiftKey && range.start === 0 && range.end === 0 && this.#atBlockEdge(owner, false)) {
      const handled=this.#handleStructuralKey(event,()=>this.#mergeBackward(owner.blockId)
        ||(record.type!==this.#registry.defaultBlockType&&this.#runtime.isEmpty(owner.blockId)&&this.exit(owner.blockId)))
      if(handled)event.preventDefault?.()
      return
    }

    if (key === 'ArrowUp' && !keys.shiftKey && range.start === 0 && range.end === 0 && this.#atBlockEdge(owner, false)) {
      const index=this.#runtime.indexOf(owner.blockId)
      const previousId=this.#runtime.idAt(index-1)
      if(index>0&&previousId){
        event.preventDefault?.()
        const fields=this.#reconciler.getEditableFields(previousId)
        const fieldKey=fields.at(-1)?.key
        this.#view.setCurrent(previousId)
        // setCurrent can synchronously publish a newer explicit author focus.
        // Never move the caret after another block reclaimed that decision.
        if (!stillOwnKey() || this.#view.currentId !== previousId) return
        this.#view.focus(previousId,{
          ...(fieldKey ? { fieldKey } : {}),
          offset: 'end',
        })
      }
      return
    }

    if (
      key === 'ArrowDown'
      && !keys.shiftKey
      && range.start === range.end
      && range.end === fieldLength(owner)
      && this.#atBlockEdge(owner, true)
    ) {
      const index=this.#runtime.indexOf(owner.blockId)
      const nextId=this.#runtime.idAt(index+1)
      if(index>=0&&nextId){
        event.preventDefault?.()
        this.#view.setCurrent(nextId)
        if (!stillOwnKey() || this.#view.currentId !== nextId) return
        this.#view.focus(nextId,{offset:'start'})
      }
      return
    }

    if (
      key === 'Delete'
      && !keys.shiftKey
      && range.start === range.end
      && range.end === fieldLength(owner)
      && this.#atBlockEdge(owner, true)
    ) {
      if (this.#handleStructuralKey(event,()=>this.#mergeForward(owner.blockId,owner.fieldKey,range.end))) {
        event.preventDefault?.()
      }
    }
  }

  #convertTypedPattern(owner, range, key) {
    const native = this.#root.ownerDocument.defaultView?.getSelection?.()
    const node = /** @type {Text | null | undefined} */ (native?.anchorNode)
    const offset = native?.anchorOffset
    if (!native?.isCollapsed || node?.nodeType !== 3
      || typeof node.data !== 'string' || typeof offset !== 'number' || !Number.isInteger(offset)
      || offset <= 0 || offset > node.data.length
      || !owner.element.contains?.(node)
      || node.parentElement?.closest?.('[data-inline-plugin]')
      || this.#reconciler.resolveInlineWidgetElement?.(node)
      || getTextOffset(owner.element, node, offset) !== range.end) return false

    // Match only the current native text node, as the v1 word matcher did;
    // never consume a widget label, sibling editing host or selected range.
    let start = offset - 1
    while (start > 0 && node.data[start - 1] !== ' ' && node.data[start - 1] !== '\u00a0') start--
    const word = node.data.slice(start, offset)
    if (!word || word.length > range.end) return false
    return this.#inlineCommands?.commitTypedPattern?.(word, {
      blockId: owner.blockId,
      fieldKey: owner.fieldKey,
      range: { start: range.end - word.length, end: range.end },
    }, key) === true
  }

  #ownership(event) {
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
    const target = path.find(node => node && typeof node.closest === 'function') ?? event?.target
    if (!target || (typeof this.#root.contains === 'function' && !this.#root.contains(target))) return { kind: 'outside', owner: null }

    const owner = this.#reconciler.resolveEditableTarget(target)
    if (owner) {
      if (owner.mode === 'plain-text') {
        const element = /** @type {Element} */ (target)
        if (target === owner.element || owner.element.contains?.(element)) {
          return { kind: 'document-plain-text', owner }
        }
      } else if (owner.mode === 'rich-text') {
        if (typeof target.closest !== 'function') return { kind: 'document-rich-text', owner }
        const host = editingHostForEvent(this.#root, target)
        if (host === owner.element) return { kind: 'document-rich-text', owner }
      }
    }

    const element = /** @type {Element} */ (target)
    const widget=this.#reconciler.resolveInlineWidgetElement?.(target)
    if(widget){
      // Native controls inside a widget own their keyboard history. They
      // cannot replay canonical Undo merely because the enclosing widget
      // participates in author content.
      const native=element.closest?.('input, textarea, select, button, [role="button"]')
      if(native && widget.contains(native))return {kind:'auxiliary-native',owner:null}
      const control=element.closest?.('input, textarea, select, [contenteditable="true"]')
      if(!control||!widget.contains(control))return {kind:'editor-chrome',owner:null}
    }
    if (element.closest?.('input, textarea, select, [contenteditable="true"], [data-inline-plugin]')) {
      return { kind: 'auxiliary-native', owner: null }
    }
    if (element.closest?.('.oe-toolbar, .oe-inline-toolbar, .oe-toolbox, .oe-settings-menu, .oe-slash-menu')) {
      return { kind: 'editor-chrome', owner: null }
    }
    // A button in a block's non-editable chrome is an auxiliary native
    // control. Explicit toolbar chrome remains a document-history owner.
    if(element.closest?.('button, [role="button"]')) {
      return {kind:'auxiliary-native',owner:null}
    }
    if (
      this.#reconciler.resolveBlockTarget(target)
    ) {
      return { kind: 'editor-chrome', owner: null }
    }
    return { kind: 'editor-chrome', owner: null }
  }

  split(blockId, fieldKey, range) {
    if (this.#controller.signal.aborted || this.#runtime.readOnly) return false
    const bookmark = range
      ? { start: range.start, end: range.end ?? range.start }
      : sameEditableRange(
          this.#selection.capture(),
          this.#reconciler.getEditableField(blockId, fieldKey)
            ? { blockId, fieldKey, ...this.#reconciler.getEditableField(blockId, fieldKey) }
            : {},
        )
    if (!bookmark || typeof fieldKey !== 'string' || !fieldKey) return false
    const nextId = this.#mutate('block.split', () => this.#runtime.splitBlock(blockId, fieldKey, bookmark), id => ({ blockId: id, offset: 'start' }))
    if (!nextId) return false
    if (!this.#canPresent()) return true
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    this.#restoreShortcutFocus({blockId:nextId,offset:'start'})
    return true
  }

  exit(blockId, data = undefined) {
    if (this.#controller.signal.aborted || this.#runtime.readOnly) return false
    const nextId=this.#mutate('block.exit',()=>this.#runtime.exitBlock(blockId,data),id=>id?({blockId:id,offset:'start'}):null)
    if(!nextId)return false
    if(!this.#canPresent())return true
    this.#view.reconcileInteraction()
    if(this.#runtime.has(nextId))this.#view.setCurrent(nextId)
    this.#restoreShortcutFocus({blockId:nextId,offset:'start'})
    return true
  }

  destroy() {
    this.#controller.abort()
  }

  appendDefault() {
    if (this.#controller.signal.aborted || this.#runtime.readOnly
      || this.#runtime.health !== 'ready') return false
    const modeEpoch = this.#runtime.modeEpoch
    const lastId = this.#runtime.idAt(this.#runtime.size - 1)
    const last = lastId ? this.#runtime.get(lastId) : null
    this.#crossSelection?.clear()
    // Clearing the old range can synchronously destroy the editor or switch
    // control mode. Do not continue into a retired toolbar or focus operation.
    if (!this.#canPresent() || this.#runtime.modeEpoch !== modeEpoch) return false
    this.#inlineToolbar?.hide()
    if (!this.#canPresent() || this.#runtime.modeEpoch !== modeEpoch) return false
    if (last?.type === this.#registry.defaultBlockType && this.#runtime.isEmpty(lastId)) {
      this.#view.focus(lastId, { offset: 'start' })
      return true
    }
    // Give an initially unfocused editor a valid history restore point.
    if (!this.#selection.capture() && lastId) this.#view.focus(lastId, { offset: 'end' })
    const id = this.#mutate('block.append', () => this.#runtime.insert(this.#registry.defaultBlockType), result => ({ blockId: result, offset: 'start' }))
    if (!id) return false
    if (!this.#canPresent()) return true
    this.#view.reconcileInteraction()
    this.#view.focus(id, { offset: 'start' })
    return true
  }

  #handleStructuralKey(event,operation){
    try{return operation()}
    catch(error){
      // A declared plugin's empty-block decision is owned by this keypress.
      // A failed decision must not fall through to native editing-host
      // mutation without a corresponding canonical history transaction.
      event.preventDefault?.()
      try{this.#reportError(error)}catch{}
      return false
    }
  }

  #handleShortcut(owner,event,range,keys){
    let result
    try{
      result=this.#mutate('block.shortcut',tx=>{
        const action=this.#runtime.prepareExtensionValue(()=>{
          const lengths=new Map(this.#reconciler.getEditableFields(owner.blockId).map(field=>[field.key,fieldLength(field)]))
          return this.#runtime.prepareShortcutAction(tx,owner.blockId,{
            key:keys.key,shiftKey:keys.shiftKey,altKey:keys.altKey,ctrlKey:keys.ctrlKey,metaKey:keys.metaKey,
            fieldKey:owner.fieldKey,selection:range,fieldLength:lengths.get(owner.fieldKey)??0,
          },lengths)
        })
        if(action===null)return {handled:false}
        if(action.kind!=='native')event.preventDefault?.()
        if(action.kind==='update'){
          this.#runtime.update(owner.blockId,()=>({data:action.data}))
          return {handled:true,reconcile:true,historyTarget:{blockId:owner.blockId,...action.focus},
            focus:action.focus?{blockId:owner.blockId,...action.focus}:null}
        }
        if(action.kind==='exit'){
          const id=this.#runtime.exitBlock(owner.blockId,action.data)
          const focus=id?{blockId:id,offset:'start'}:null
          return {handled:true,reconcile:true,historyTarget:focus,focus}
        }
        return {handled:true,focus:action.kind==='focus'?{blockId:owner.blockId,...action.target}:null}
      },result=>result.historyTarget??null)
    }catch(error){
      event.preventDefault?.()
      try{this.#reportError(error)}catch{}
      return true
    }
    if(!this.#canPresent())return result?.handled===true
    if(result.reconcile){
      this.#view.reconcileInteraction()
      if(result.historyTarget&&this.#runtime.has(result.historyTarget.blockId))this.#view.setCurrent(result.historyTarget.blockId)
    }
    if(result.focus)this.#restoreShortcutFocus(result.focus)
    return result.handled
  }

  #hideToolbarForVerticalSelection(owner) {
    if (!this.#inlineToolbar) return true
    const document = this.#root.ownerDocument
    const generation = this.#runtime.generation, revision = this.#runtime.revision
    const modeEpoch = this.#runtime.modeEpoch, active = document.activeElement
    const native = document.defaultView?.getSelection?.()
    const anchorNode = native?.anchorNode, anchorOffset = native?.anchorOffset
    const focusNode = native?.focusNode, focusOffset = native?.focusOffset
    const bookmark = this.#selection.capture()
    if (!bookmark || !anchorNode || !focusNode) return false
    const points = [bookmark.anchor, bookmark.focus]
    const fields = points.map(point => this.#reconciler.getEditableField(point.blockId, point.fieldKey)?.element)
    if (fields.some(field => !field)) return false
    const ownsState = () => this.#canPresent()
      && this.#runtime.generation === generation && this.#runtime.revision === revision
      && this.#runtime.modeEpoch === modeEpoch && document.activeElement === active
      && native.anchorNode === anchorNode && native.anchorOffset === anchorOffset
      && native.focusNode === focusNode && native.focusOffset === focusOffset
    const ownsFields = () => this.#reconciler.getEditableField(owner.blockId, owner.fieldKey)?.element === owner.element
      && points.every((point, index) => this.#reconciler.getEditableField(point.blockId, point.fieldKey)?.element === fields[index])
    if (!ownsState() || !ownsFields() || !ownsState()) return false
    // The floating toolbar can cover the target text line. Dismiss it before
    // native hit testing; action-panel teardown can synchronously replace the
    // document, mounted field, focus or range, so the old key must be rechecked.
    this.#inlineToolbar.hide()
    return ownsState()
      && sameLogicalSelection(bookmark, this.#selection.capture())
      && ownsFields() && ownsState()
  }

  #canPresent() {
    // A canonical transaction can publish to a host observer that destroys
    // the editor synchronously. Keep that commit, but never reconcile or
    // focus the detached DOM owned by the retired keyboard router.
    return !this.#controller.signal.aborted
      && this.#runtime.health !== 'destroyed'
      && this.#runtime.health !== 'failed'
      && !this.#runtime.readOnly
  }

  #restoreShortcutFocus(target){
    const generation=this.#runtime.generation,revision=this.#runtime.revision
    const modeEpoch=this.#runtime.modeEpoch
    const mounted=this.#view.element?.(target.blockId)
    const authorSelection=this.#selection.capture()
    queueMicrotask(()=>{
      if(this.#controller.signal.aborted||this.#runtime.readOnly
        ||this.#runtime.generation!==generation||this.#runtime.revision!==revision
        ||this.#runtime.modeEpoch!==modeEpoch||!this.#runtime.has(target.blockId)
        ||(mounted&&this.#view.element?.(target.blockId)!==mounted)
        ||(this.#view.currentId&&this.#view.currentId!==target.blockId)
        // A user may move the caret within the same target block without an
        // authored revision or changing the current block. Do not steal it.
        ||(authorSelection&&!sameLogicalSelection(authorSelection,this.#selection.capture())))return
      this.#view.focus(target.blockId,target)
    })
  }

  #mergeBackward(blockId) {
    const index=this.#runtime.indexOf(blockId)
    const previousId=this.#runtime.idAt(index-1)
    if(index<=0||!previousId)return false

    const previousField = this.#reconciler.getEditableFields(previousId).at(-1)
    const target = { ...(previousField ? { fieldKey: previousField.key } : {}), offset: previousField ? fieldLength(previousField) : 0 }
    if (this.#runtime.isEmpty(blockId)) {
      this.#mutate('block.remove', () => this.#runtime.remove(blockId), () => ({ blockId: previousId, ...target }))
      if (!this.#canPresent()) return true
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previousId)
      this.#restoreShortcutFocus({blockId:previousId,...target})
      return true
    }
    if(this.#mutate('block.merge', () => this.#runtime.mergeAdjacent(previousId,blockId), () => ({ blockId: previousId, ...target }))){
      if (!this.#canPresent()) return true
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previousId)
      this.#restoreShortcutFocus({blockId:previousId,...target})
      return true
    }
    return false
  }

  #mergeForward(blockId, fieldKey, caretOffset) {
    const index=this.#runtime.indexOf(blockId)
    const nextId=this.#runtime.idAt(index+1)
    if(index<0||!nextId)return false

    if(this.#runtime.isEmpty(nextId)){
      this.#mutate('block.remove', () => this.#runtime.remove(nextId), () => ({ blockId, offset: caretOffset }))
      if (!this.#canPresent()) return true
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      this.#restoreShortcutFocus({blockId,fieldKey,offset:caretOffset})
      return true
    }
    if(this.#mutate('block.merge', () => this.#runtime.mergeAdjacent(blockId,nextId), () => ({ blockId, offset: caretOffset }))){
      if (!this.#canPresent()) return true
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      this.#restoreShortcutFocus({blockId,fieldKey,offset:caretOffset})
      return true
    }
    return false
  }

  #mutate(name, operation, focusAfter) {
    const modeEpoch = this.#runtime.modeEpoch
    const before = this.#selection.capture()
    // The native selection reader can synchronously destroy this router or
    // complete a control-mode round trip while returning an old bookmark.
    // Never enter a canonical transaction with that retired authority.
    if (!this.#canPresent() || this.#runtime.modeEpoch !== modeEpoch) return undefined
    return this.#runtime.interact(name, operation, result => {
      const target = focusAfter(result)
      if(!target)return null
      const fields = target.blockId ? this.#reconciler.getEditableFields(target.blockId) : []
      const fieldKey = target.fieldKey ?? (before?.anchor.blockId === target.blockId ? before.anchor.fieldKey : null)
      const field = fieldKey ? fields.find(field => field.key === fieldKey) ?? fields[0] : fields[0]
      if (!field) return null
      const length = fieldLength(field)
      const offset = target.offset === 'end' ? length
        : target.offset === 'start' || target.offset === undefined ? 0
          : Math.max(0, Math.min(length, Number(target.offset) || 0))
      const point = { blockId: target.blockId, fieldKey: field.key, offset }
      return { anchor: point, focus: { ...point } }
    })
  }

  #atBlockEdge(owner, end) {
    const fields = this.#reconciler.getEditableFields(owner.blockId)
    const index = fields.findIndex(field => field.key === owner.fieldKey)
    if (index < 0) return false
    return (end ? fields.slice(index + 1) : fields.slice(0, index)).every(field => fieldLength(field) === 0)
  }

  #undo() { return this.#replayHistory('undo') }

  #redo() { return this.#replayHistory('redo') }

  #replayHistory(action) {
    const document=this.#root.ownerDocument
    const owned=this.#root.contains?.(document.activeElement)===true
    if (!this.#runtime[action]()) return false
    if (!this.#canPresent()) return true
    this.#view.reconcileInteraction()
    if (!this.#canPresent()) return true
    // Replaying can recreate the focused widget without a saved text caret.
    // Keep subsequent history shortcuts in the editor when native focus falls to body.
    if(owned&&document.activeElement===document.body)this.#root.focus?.({preventScroll:true})
    return true
  }
}
