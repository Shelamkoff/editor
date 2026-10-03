// @ts-check
import { findNodeAtOffset, getTextLength, getTextOffset } from '../shared/textOffset.js'

const HIGHLIGHT_KEY = 'oe-cross-select-v2'

function clonePoint(point) {
  return point ? { blockId: point.blockId, fieldKey: point.fieldKey, offset: point.offset } : null
}

export class SelectionController {
  #root
  #runtime
  #reconciler
  #view
  #document
  #window
  #controller
  #dragStart = null
  #bookmark = null
  #range = null
  #wholeBlocks = false

  constructor({ root, runtime, reconciler, view }) {
    if (!root?.ownerDocument) throw new TypeError('SelectionController requires an editor root')
    this.#root = root
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#view = view
    this.#document = root.ownerDocument
    this.#window = this.#document.defaultView
    const AbortControllerCtor = this.#window?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    const signal = this.#controller.signal

    root.addEventListener('mousedown', event => this.#onMouseDown(event), { signal })
    this.#document.addEventListener('mousemove', event => this.#onMouseMove(event), { signal })
    this.#document.addEventListener('mouseup', () => { this.#dragStart = null }, { signal })
    this.#document.addEventListener('mousedown', event => {
      const target = event.target
      if (target && typeof target === 'object' && 'nodeType' in target && !root.contains(target)) {
        this.clear()
        const native = this.#window?.getSelection?.()
        if (native?.anchorNode && root.contains(native.anchorNode)) native.removeAllRanges()
      }
    }, { capture: true, signal })
  }

  get active() {
    return Boolean(this.#bookmark && this.#range && this.#bookmark.anchor.blockId !== this.#bookmark.focus.blockId)
  }

  get wholeBlockIds() {
    return this.#wholeBlocks ? this.#runtime.list().map(record => record.id) : []
  }

  get bookmark() {
    if (!this.#bookmark) return null
    return { anchor: clonePoint(this.#bookmark.anchor), focus: clonePoint(this.#bookmark.focus) }
  }

  get range() {
    return this.#range?.cloneRange() ?? null
  }

  text() {
    return this.#range?.toString() ?? ''
  }

  clear() {
    this.#dragStart = null
    this.#deactivate()
  }

  restore(bookmark) {
    const built = this.#buildRange(bookmark)
    if (!built) return false
    this.#activate(bookmark, built.range)
    return true
  }

  removeWholeBlocks() {
    const ids = this.wholeBlockIds
    if (!ids.length) return false
    const result = this.#runtime.removeBlocks(ids)
    if (!result) return false
    this.#deactivate()
    this.#view.reconcileInteraction()
    const current = this.#runtime.list()[0]
    if (current) {
      this.#view.setCurrent(current.id)
      queueMicrotask(() => this.#view.focus(current.id, { offset: 'start' }))
    }
    return true
  }

  replace(replacement = { kind: 'text', text: '' }) {
    const bookmark = this.bookmark
    if (!bookmark) return false
    const result = this.#runtime.replaceLogicalRange(bookmark, replacement)
    if (!result) return false
    this.#deactivate()
    this.#view.reconcileInteraction()
    this.#view.setCurrent(result.blockId)
    queueMicrotask(() => this.#view.focus(result.blockId, {
      fieldKey: result.fieldKey,
      offset: result.offset,
    }))
    return true
  }

  selectAllBlocks() {
    const records = this.#runtime.list()
    if (!records.length) return false
    const firstId = records[0].id
    const lastId = records[records.length - 1].id
    const firstFields = this.#reconciler.getEditableFields(firstId)
    const lastFields = this.#reconciler.getEditableFields(lastId)
    const first = firstFields[0]
    const last = lastFields[lastFields.length - 1]
    if (!first || !last || first.mode === 'plain-text' || last.mode === 'plain-text') return false
    const bookmark = {
      anchor: { blockId: firstId, fieldKey: first.key, offset: 0 },
      focus: { blockId: lastId, fieldKey: last.key, offset: getTextLength(last.element) },
    }
    const restored = this.restore(bookmark)
    if (restored) this.#wholeBlocks = true
    return restored
  }

  destroy() {
    this.clear()
    this.#controller.abort()
  }

  #deactivate() {
    this.#bookmark = null
    this.#range = null
    this.#wholeBlocks = false
    this.#root.classList.remove('oe-editor--cross-selecting')
    this.#view.clearSelection()
    this.#hideHighlight()
  }

  #onMouseDown(event) {
    if (event.button !== 0) return
    const caret = this.#caretFromPoint(event.clientX, event.clientY)
    const point = caret ? this.#logicalPoint(caret.node, caret.offset) : null
    if (!point) {
      if (event.target && this.#root.contains(event.target)) this.clear()
      return
    }
    this.#deactivate()
    this.#dragStart = { caret, point }
  }

  #onMouseMove(event) {
    if (!this.#dragStart || (event.buttons & 1) === 0) return
    const caret = this.#caretFromPoint(event.clientX, event.clientY)
    const point = caret ? this.#logicalPoint(caret.node, caret.offset) : null
    if (!point) return
    if (point.blockId === this.#dragStart.point.blockId) {
      if (this.active) this.#deactivate()
      return
    }

    const bookmark = { anchor: clonePoint(this.#dragStart.point), focus: clonePoint(point) }
    const built = this.#buildRange(bookmark, this.#dragStart.caret, caret)
    if (!built) return
    event.preventDefault()
    this.#activate(bookmark, built.range)

    const selection = this.#window?.getSelection?.()
    if (selection && typeof selection.setBaseAndExtent === 'function') {
      try {
        selection.setBaseAndExtent(
          this.#dragStart.caret.node,
          this.#dragStart.caret.offset,
          caret.node,
          caret.offset,
        )
      } catch {}
    }
  }

  #activate(bookmark, range) {
    this.#bookmark = { anchor: clonePoint(bookmark.anchor), focus: clonePoint(bookmark.focus) }
    this.#range = range.cloneRange()
    this.#root.classList.add('oe-editor--cross-selecting')
    this.#showHighlight(range)

    const records = this.#runtime.list()
    const anchorIndex = records.findIndex(record => record.id === bookmark.anchor.blockId)
    const focusIndex = records.findIndex(record => record.id === bookmark.focus.blockId)
    if (anchorIndex >= 0 && focusIndex >= 0) {
      const from = Math.min(anchorIndex, focusIndex)
      const to = Math.max(anchorIndex, focusIndex)
      this.#view.select(records.slice(from, to + 1).map(record => record.id))
    }
  }

  #logicalPoint(node, offset) {
    const owner = this.#reconciler.resolveEditableTarget(node)
    if (!owner) return null
    return {
      blockId: owner.blockId,
      fieldKey: owner.fieldKey,
      offset: getTextOffset(owner.element, node, offset),
    }
  }

  #buildRange(bookmark, anchorCaret = null, focusCaret = null) {
    const anchor = bookmark?.anchor
    const focus = bookmark?.focus
    if (!anchor || !focus) return null
    const anchorResolved = anchorCaret ?? this.#resolvePoint(anchor, 'start')
    const focusResolved = focusCaret ?? this.#resolvePoint(focus, 'end')
    if (!anchorResolved || !focusResolved) return null

    const order = this.#comparePoints(anchor, focus)
    const start = order <= 0 ? anchorResolved : focusResolved
    const end = order <= 0 ? focusResolved : anchorResolved
    const range = this.#document.createRange()
    try {
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
    } catch {
      return null
    }
    return { range }
  }

  #resolvePoint(point, bias) {
    const field = this.#reconciler.getEditableField(point.blockId, point.fieldKey)
    if (!field || field.mode === 'plain-text') return null
    return findNodeAtOffset(field.element, point.offset, bias)
  }

  #comparePoints(left, right) {
    const records = this.#runtime.list()
    const leftBlock = records.findIndex(record => record.id === left.blockId)
    const rightBlock = records.findIndex(record => record.id === right.blockId)
    if (leftBlock !== rightBlock) return leftBlock - rightBlock
    const fields = this.#reconciler.getEditableFields(left.blockId)
    const leftField = fields.findIndex(field => field.key === left.fieldKey)
    const rightField = fields.findIndex(field => field.key === right.fieldKey)
    if (leftField !== rightField) return leftField - rightField
    return left.offset - right.offset
  }

  #caretFromPoint(x, y) {
    if (typeof this.#document.caretPositionFromPoint === 'function') {
      const point = this.#document.caretPositionFromPoint(x, y)
      return point ? { node: point.offsetNode, offset: point.offset } : null
    }
    const legacy = Reflect.get(this.#document, 'caretRangeFromPoint')
    if (typeof legacy === 'function') {
      const range = legacy.call(this.#document, x, y)
      return range ? { node: range.startContainer, offset: range.startOffset } : null
    }
    return null
  }

  #showHighlight(range) {
    const HighlightCtor = this.#window?.Highlight
    const highlights = this.#window?.CSS?.highlights
    if (HighlightCtor && highlights) highlights.set(HIGHLIGHT_KEY, new HighlightCtor(range))
  }

  #hideHighlight() {
    this.#window?.CSS?.highlights?.delete?.(HIGHLIGHT_KEY)
  }
}
