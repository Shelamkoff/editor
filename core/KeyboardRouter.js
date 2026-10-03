// @ts-check
import { editingHostForEvent } from '../shared/editableFields.js'
import { getTextLength } from '../shared/textOffset.js'

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
  return owner.mode === 'plain-text'
    ? String(owner.element?.value ?? '').length
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
    const lower = key.toLowerCase()
    const mod = event?.metaKey === true || event?.ctrlKey === true

    if (mod && !event?.altKey) {
      if (
        ownership.kind === 'document-rich-text'
        && this.#inlineToolbar?.handleShortcut?.(event)
      ) return

      if (lower === 'a' && !event?.shiftKey && ownership.owner) {
        const owner = ownership.owner
        const bookmark = this.#selection.capture()
        const range = sameEditableRange(bookmark, owner)
        if (
          this.#crossSelection?.active
          || (range && range.start === 0 && range.end === fieldLength(owner))
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

    if (event?.metaKey || event?.ctrlKey || event?.altKey) return
    if (ownership.kind !== 'document-rich-text' || !ownership.owner) return

    if (this.#crossSelection?.active && (key === 'Backspace' || key === 'Delete')) {
      event.preventDefault?.()
      this.#crossSelection.replace({ kind: 'text', text: '' })
      return
    }

    const owner = ownership.owner
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

    if (key === 'Backspace' && !event?.shiftKey && range.start === 0 && range.end === 0) {
      if (this.#mergeBackward(owner.blockId)) event.preventDefault?.()
      return
    }

    if (key === 'ArrowUp' && !event?.shiftKey && range.start === 0 && range.end === 0) {
      const records = this.#runtime.list()
      const index = records.findIndex(record => record.id === owner.blockId)
      if (index > 0) {
        event.preventDefault?.()
        const previous = records[index - 1]
        const fields = this.#reconciler.getEditableFields(previous.id)
        const fieldKey = fields.at(-1)?.key
        this.#view.setCurrent(previous.id)
        this.#view.focus(previous.id, {
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
    ) {
      const records = this.#runtime.list()
      const index = records.findIndex(record => record.id === owner.blockId)
      if (index >= 0 && index < records.length - 1) {
        event.preventDefault?.()
        const next = records[index + 1]
        this.#view.setCurrent(next.id)
        this.#view.focus(next.id, { offset: 'start' })
      }
      return
    }

    if (
      key === 'Delete'
      && !event?.shiftKey
      && range.start === range.end
      && range.end === fieldLength(owner)
    ) {
      if (this.#mergeForward(owner.blockId, range.end)) event.preventDefault?.()
    }
  }

  #ownership(event) {
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
    const target = path.find(node => node && typeof node.closest === 'function') ?? event?.target
    if (!target || !this.#root.contains(target)) return { kind: 'outside', owner: null }

    const owner = this.#reconciler.resolveEditableTarget(target)
    if (owner) {
      if (owner.mode === 'plain-text') {
        const element = /** @type {Element} */ (target)
        if (target === owner.element || owner.element.contains?.(element)) {
          return { kind: 'document-plain-text', owner }
        }
      } else if (owner.mode === 'rich-text') {
        const host = editingHostForEvent(this.#root, target)
        if (host === owner.element) return { kind: 'document-rich-text', owner }
      }
    }

    const element = /** @type {Element} */ (target)
    if (element.closest?.('.oe-toolbar, .oe-inline-toolbar, .oe-toolbox, .oe-settings-menu, .oe-slash-menu')) {
      return { kind: 'editor-chrome', owner: null }
    }
    if (
      element.closest?.('input, textarea, select, [contenteditable="true"], [data-inline-plugin]')
      || this.#reconciler.resolveBlockTarget(target)
    ) {
      return { kind: 'auxiliary-native', owner: null }
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
    const nextId = this.#runtime.splitBlock(blockId, fieldKey, bookmark)
    if (!nextId) return false
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    queueMicrotask(() => this.#view.focus(nextId, { offset: 'start' }))
    return true
  }

  exit(blockId) {
    if (this.#runtime.readOnly) return false
    const record = this.#runtime.get(blockId)
    if (!record) return false

    if (record.type !== this.#registry.defaultBlockType) {
      this.#runtime.convert(blockId, { type: this.#registry.defaultBlockType })
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { offset: 'start' }))
      return true
    }

    const index = this.#view.indexOf(blockId)
    const nextId = this.#runtime.insert(this.#registry.defaultBlockType, undefined, index + 1)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    queueMicrotask(() => this.#view.focus(nextId, { offset: 'start' }))
    return true
  }

  destroy() {
    this.#controller.abort()
  }

  #applyShortcut(blockId, action) {
    switch (action.kind) {
      case 'native':
      case 'consume':
        return true
      case 'exit':
        return this.exit(blockId)
      case 'focus':
        queueMicrotask(() => this.#view.focus(blockId, action.target))
        return true
      case 'update':
        this.#runtime.update(blockId, () => action.data)
        this.#view.reconcileInteraction()
        this.#view.setCurrent(blockId)
        if (action.focus) queueMicrotask(() => this.#view.focus(blockId, action.focus))
        return true
      default:
        return false
    }
  }

  #mergeBackward(blockId) {
    const records = this.#runtime.list()
    const index = records.findIndex(record => record.id === blockId)
    if (index <= 0) return false
    const previous = records[index - 1]

    if (this.#runtime.mergeAdjacent(previous.id, blockId)) {
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previous.id)
      queueMicrotask(() => this.#view.focus(previous.id, { offset: 'end' }))
      return true
    }

    if (this.#runtime.isEmpty(blockId)) {
      this.#runtime.remove(blockId)
      this.#view.reconcileInteraction()
      this.#view.setCurrent(previous.id)
      queueMicrotask(() => this.#view.focus(previous.id, { offset: 'end' }))
      return true
    }
    return false
  }

  #mergeForward(blockId, caretOffset) {
    const records = this.#runtime.list()
    const index = records.findIndex(record => record.id === blockId)
    if (index < 0 || index >= records.length - 1) return false
    const next = records[index + 1]

    if (this.#runtime.mergeAdjacent(blockId, next.id)) {
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { offset: caretOffset }))
      return true
    }

    if (this.#runtime.isEmpty(next.id)) {
      this.#runtime.remove(next.id)
      this.#view.reconcileInteraction()
      this.#view.setCurrent(blockId)
      queueMicrotask(() => this.#view.focus(blockId, { offset: caretOffset }))
      return true
    }
    return false
  }

  #undo() {
    if (!this.#runtime.undo()) return false
    this.#view.reconcileInteraction()
    return true
  }

  #redo() {
    if (!this.#runtime.redo()) return false
    this.#view.reconcileInteraction()
    return true
  }
}
