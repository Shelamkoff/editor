// @ts-check
import { editingHostForEvent } from '../shared/editableFields.js'
import { getTextLength } from '../shared/textOffset.js'
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
  #isComposing

  constructor({ root, runtime, registry, reconciler, selection, view, inlineToolbar = null, crossSelection = null, isComposing = () => false }) {
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
    this.#isComposing = typeof isComposing === 'function' ? isComposing : () => false

    const AbortControllerCtor = root.ownerDocument?.defaultView?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    root.addEventListener('keydown', event => this.handleKeydown(event), { signal: this.#controller.signal })
  }

  handleKeydown(event) {
    if (this.#runtime.readOnly || event?.defaultPrevented || event?.isComposing || event?.keyCode === 229 || this.#isComposing()) return

    const ownership = this.#ownership(event)
    if (ownership.kind === 'outside' || ownership.kind === 'auxiliary-native') return

    const key = String(event?.key ?? '')
    const lower = shortcutKey(event)
    const mod = event?.metaKey === true || event?.ctrlKey === true

    if (mod && !event?.altKey) {
      if (
        ownership.kind === 'document-rich-text'
        && this.#inlineToolbar?.handleShortcut?.(event)
      ) return

      if (lower === 'a' && !event?.shiftKey && ownership.owner) {
        if (this.#crossSelection?.wholeBlockIds?.length) {
          this.#crossSelection.clear()
          // Native Ctrl+A selects text in the focused editing host again.
          return
        }
        const owner = ownership.owner
        const bookmark = this.#selection.capture()
        const range = sameEditableRange(bookmark, owner)
        if (
          this.#crossSelection?.active
          || (range && (range.start !== range.end || fieldLength(owner) === 0))
        ) {
          if (this.#crossSelection?.selectAllBlocks()) event.preventDefault?.()
          return
        }
      }

      if (lower === 'z') {
        event.preventDefault?.()
        if (event?.shiftKey) this.#redo()
        else this.#undo()
        return
      }
      if (lower === 'y' && !event?.shiftKey) {
        event.preventDefault?.()
        this.#redo()
        return
      }
    }

    // Explicit caret movement dismisses the logical range even when native
    // movement is clamped at the same endpoint (for example End after conversion).
    if (ownership.owner && !event?.shiftKey && this.#crossSelection?.active
      && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      this.#crossSelection.clear()
    }

    if (event?.shiftKey && (event?.ctrlKey || event?.metaKey) && !event?.altKey
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
    if (event?.metaKey || event?.ctrlKey || event?.altKey) return
    if (!ownership.owner) return

    if (event?.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')
      && this.#crossSelection?.extend(key === 'ArrowLeft' ? 'backward' : 'forward')) {
      event.preventDefault?.()
      return
    }
    if (event?.shiftKey && ['ArrowUp','ArrowDown','Home','End'].includes(key)
      && this.#crossSelection?.extend(
        key === 'ArrowUp' || key === 'Home' ? 'backward' : 'forward',
        key === 'Home' || key === 'End' ? 'lineboundary' : 'line',
      )) {
      event.preventDefault?.()
      return
    }

    const owner = ownership.owner
    if (key === 'Enter' && !event?.shiftKey && this.#crossSelection?.active && this.#crossSelection.split()) {
      event.preventDefault?.()
      return
    }
    const range = sameEditableRange(this.#selection.capture(), owner)
    if (!range) return

    const record = this.#runtime.get(owner.blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const shortcut = definition?.capabilities?.shortcuts?.handle
    if (typeof shortcut === 'function') {
      const action = shortcut({
        key,
        shiftKey: event?.shiftKey === true,
        altKey: event?.altKey === true,
        ctrlKey: event?.ctrlKey === true,
        metaKey: event?.metaKey === true,
        fieldKey: owner.fieldKey,
        selection: range,
        fieldLength: fieldLength(owner),
      }, record.data, {
        createId: prefix => this.#runtime.createDataId(prefix),
        splitField: (fieldKey, selection) => this.#runtime.splitRichTextField(owner.blockId, fieldKey, selection),
        fieldLength: fieldKey => {
          const field = this.#reconciler.getEditableField(owner.blockId, fieldKey)
          return field ? fieldLength(field) : 0
        },
      })
      if (action) {
        const prevent = action.kind !== 'native'
        const handled = this.#applyShortcut(owner.blockId, action)
        if (handled && prevent) event.preventDefault?.()
        if (handled) return
      }
    }

    if (key === 'Enter' && !event?.shiftKey) {
      const handled = this.#runtime.isEmpty(owner.blockId)
        ? this.exit(owner.blockId)
        : this.split(owner.blockId, owner.fieldKey, range)
      if (handled) event.preventDefault?.()
      return
    }

    if (key === 'Backspace' && !event?.shiftKey && range.start === 0 && range.end === 0 && this.#atBlockEdge(owner, false)) {
      if (this.#mergeBackward(owner.blockId)
        || (record.type !== this.#registry.defaultBlockType && this.#runtime.isEmpty(owner.blockId) && this.exit(owner.blockId))) event.preventDefault?.()
      return
    }

    if (key === 'ArrowUp' && !event?.shiftKey && range.start === 0 && range.end === 0 && this.#atBlockEdge(owner, false)) {
      const index=this.#runtime.indexOf(owner.blockId)
      const previousId=this.#runtime.idAt(index-1)
      if(index>0&&previousId){
        event.preventDefault?.()
        const fields=this.#reconciler.getEditableFields(previousId)
        const fieldKey=fields.at(-1)?.key
        this.#view.setCurrent(previousId)
        this.#view.focus(previousId,{
          ...(fieldKey ? { fieldKey } : {}),
          offset: 'end',
        })
      }
      return
    }

    if (
      key === 'ArrowDown'
      && !event?.shiftKey
      && range.start === range.end
      && range.end === fieldLength(owner)
      && this.#atBlockEdge(owner, true)
    ) {
      const index=this.#runtime.indexOf(owner.blockId)
      const nextId=this.#runtime.idAt(index+1)
      if(index>=0&&nextId){
        event.preventDefault?.()
        this.#view.setCurrent(nextId)
        this.#view.focus(nextId,{offset:'start'})
      }
      return
    }

    if (
      key === 'Delete'
      && !event?.shiftKey
      && range.start === range.end
      && range.end === fieldLength(owner)
      && this.#atBlockEdge(owner, true)
    ) {
      if (this.#mergeForward(owner.blockId, owner.fieldKey, range.end)) event.preventDefault?.()
    }
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
      const control=element.closest?.('input, textarea, select, [contenteditable="true"]')
      if(!control||!widget.contains(control))return {kind:'editor-chrome',owner:null}
    }
    if (element.closest?.('input, textarea, select, [contenteditable="true"], [data-inline-plugin]')) {
      return { kind: 'auxiliary-native', owner: null }
    }
    if (element.closest?.('.oe-toolbar, .oe-inline-toolbar, .oe-toolbox, .oe-settings-menu, .oe-slash-menu')) {
      return { kind: 'editor-chrome', owner: null }
    }
    if (
      this.#reconciler.resolveBlockTarget(target)
    ) {
      return { kind: 'editor-chrome', owner: null }
    }
    return { kind: 'editor-chrome', owner: null }
  }

  split(blockId, fieldKey, range) {
    if (this.#runtime.readOnly) return false
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
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    queueMicrotask(() => this.#view.focus(nextId, { offset: 'start' }))
    return true
  }

  exit(blockId, data = undefined) {
    if (this.#runtime.readOnly) return false
    const record = this.#runtime.get(blockId)
    if (!record) return false

    if (data !== undefined) {
      const nextId = this.#mutate('block.exit', () => {
        this.#runtime.update(blockId, () => ({ data }))
        return this.#runtime.insert(this.#registry.defaultBlockType, undefined, this.#runtime.indexOf(blockId) + 1)
      }, id => ({ blockId: id, offset: 'start' }))
      this.#view.reconcileInteraction()
      this.#view.focus(nextId, { offset: 'start' })
      return true
    }

    if (record.type !== this.#registry.defaultBlockType) {
      this.#mutate('block.exit', () => this.#runtime.convert(blockId, { type: this.#registry.defaultBlockType }), () => ({ blockId, offset: 'start' }))
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { offset: 'start' }))
      return true
    }

    const index = this.#view.indexOf(blockId)
    const nextId = this.#mutate('block.insert', () => this.#runtime.insert(this.#registry.defaultBlockType, undefined, index + 1), id => ({ blockId: id, offset: 'start' }))
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    queueMicrotask(() => this.#view.focus(nextId, { offset: 'start' }))
    return true
  }

  destroy() {
    this.#controller.abort()
  }

  appendDefault() {
    if (this.#runtime.readOnly || this.#runtime.health !== 'ready') return false
    const lastId = this.#runtime.idAt(this.#runtime.size - 1)
    const last = lastId ? this.#runtime.get(lastId) : null
    this.#crossSelection?.clear()
    this.#inlineToolbar?.hide()
    if (last?.type === this.#registry.defaultBlockType && this.#runtime.isEmpty(lastId)) {
      this.#view.focus(lastId, { offset: 'start' })
      return true
    }
    // Give an initially unfocused editor a valid history restore point.
    if (!this.#selection.capture() && lastId) this.#view.focus(lastId, { offset: 'end' })
    const id = this.#mutate('block.append', () => this.#runtime.insert(this.#registry.defaultBlockType), result => ({ blockId: result, offset: 'start' }))
    this.#view.reconcileInteraction()
    this.#view.focus(id, { offset: 'start' })
    return true
  }

  #applyShortcut(blockId, action) {
    switch (action.kind) {
      case 'native':
      case 'consume':
        return true
      case 'exit':
        return this.exit(blockId, action.data)
      case 'focus':
        queueMicrotask(() => this.#view.focus(blockId, action.target))
        return true
      case 'update':
        this.#mutate('block.shortcut', () => this.#runtime.update(blockId, () => ({ data: action.data })), () => ({ blockId, ...action.focus }))
        this.#view.reconcileInteraction()
        this.#view.setCurrent(blockId)
        if (action.focus) queueMicrotask(() => this.#view.focus(blockId, action.focus))
        return true
      default:
        return false
    }
  }

  #mergeBackward(blockId) {
    const index=this.#runtime.indexOf(blockId)
    const previousId=this.#runtime.idAt(index-1)
    if(index<=0||!previousId)return false

    const previousField = this.#reconciler.getEditableFields(previousId).at(-1)
    const target = { ...(previousField ? { fieldKey: previousField.key } : {}), offset: previousField ? fieldLength(previousField) : 0 }
    if (this.#runtime.isEmpty(blockId)) {
      this.#mutate('block.remove', () => this.#runtime.remove(blockId), () => ({ blockId: previousId, ...target }))
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previousId)
      queueMicrotask(()=>this.#view.focus(previousId,target))
      return true
    }
    if(this.#mutate('block.merge', () => this.#runtime.mergeAdjacent(previousId,blockId), () => ({ blockId: previousId, ...target }))){
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previousId)
      queueMicrotask(()=>this.#view.focus(previousId,target))
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
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { fieldKey, offset: caretOffset }))
      return true
    }
    if(this.#mutate('block.merge', () => this.#runtime.mergeAdjacent(blockId,nextId), () => ({ blockId, offset: caretOffset }))){
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { fieldKey, offset: caretOffset }))
      return true
    }
    return false
  }

  #mutate(name, operation, focusAfter) {
    const before = this.#selection.capture()
    return this.#runtime.interact(name, operation, result => {
      const target = focusAfter(result)
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
    this.#view.reconcileInteraction()
    // Replaying can recreate the focused widget without a saved text caret.
    // Keep subsequent history shortcuts in the editor when native focus falls to body.
    if(owned&&document.activeElement===document.body)this.#root.focus?.({preventScroll:true})
    return true
  }
}
