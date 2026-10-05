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
  #conversionCaret = false
  #generation = 0
  #navigationX = null

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
    root.addEventListener('dragstart', event => {
      // Extending our logical range must not become native text drag/drop.
      if (this.#dragStart) event.preventDefault()
    }, { signal })
    this.#document.addEventListener('mousemove', event => this.#onMouseMove(event), { signal })
    this.#document.addEventListener('mouseup', () => this.#onMouseUp(), { signal })
    this.#document.addEventListener('selectionchange', () => this.#ensureCurrent(), { signal })
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
    this.#ensureCurrent()
    if (this.wholeBlockIds.length) return true
    return Boolean(
      this.#bookmark
      && this.#range
      && (
        this.#wholeBlocks
        || this.#bookmark.anchor.blockId !== this.#bookmark.focus.blockId
        || this.#bookmark.anchor.fieldKey !== this.#bookmark.focus.fieldKey
      )
    )
  }

  get dragging() {
    return this.#dragStart !== null
  }

  get wholeBlockIds() {
    this.#ensureCurrent()
    return this.#wholeBlocks ? this.#runtime.ids()
      : !this.#bookmark ? this.#view.selectedIds : []
  }

  get bookmark() {
    this.#ensureCurrent()
    if (!this.#bookmark) return null
    return { anchor: clonePoint(this.#bookmark.anchor), focus: clonePoint(this.#bookmark.focus), ...(this.#conversionCaret ? { conversionCaret: true } : {}) }
  }

  get range() {
    this.#ensureCurrent()
    return this.#range?.cloneRange() ?? null
  }

  text() {
    return this.#range?.toString() ?? ''
  }

  extend(direction, granularity = 'character') {
    if (this.#wholeBlocks || this.#runtime.readOnly) return false
    const native = this.#window?.getSelection?.()
    let bookmark = this.bookmark
    if (!this.active) {
      const anchor = this.#logicalPoint(native?.anchorNode, native?.anchorOffset)
      const focus = this.#logicalPoint(native?.focusNode, native?.focusOffset)
      if (!anchor || !focus || anchor.blockId !== focus.blockId || anchor.fieldKey !== focus.fieldKey) return false
      const local = this.#reconciler.getEditableField(focus.blockId, focus.fieldKey)
      if (!local || local.mode === 'plain-text') return false
      const atEdge = direction === 'backward' ? focus.offset === 0 : focus.offset === getTextLength(local.element)
      if (granularity === 'lineboundary' || (granularity !== 'line' && !atEdge)) return false
      bookmark = { anchor, focus }
    }
    const field = this.#reconciler.getEditableField(bookmark.focus.blockId, bookmark.focus.fieldKey)
    if (!field || field.mode === 'plain-text' || typeof native?.modify !== 'function') return false
    const caret = findNodeAtOffset(field.element, bookmark.focus.offset, 'start')
    const beforeRange=this.#document.createRange()
    beforeRange.setStart(caret.node,caret.offset)
    beforeRange.collapse(true)
    const beforeRect=beforeRange.getBoundingClientRect()
    if(granularity==='line')this.#navigationX??=beforeRect.left
    else this.#navigationX=null
    // Let the browser own grapheme, word and line movement inside one host.
    // A native extended Range across hosts would otherwise be clipped.
    this.#deactivate()
    field.element.focus({ preventScroll: true })
    native.collapse(caret.node, caret.offset)
    native.modify('move', direction, granularity)
    let focus = this.#logicalPoint(native.focusNode, native.focusOffset)
    if (!focus) {
      this.restore(bookmark)
      return false
    }
    const sameHost=focus.blockId === bookmark.focus.blockId && focus.fieldKey === bookmark.focus.fieldKey
    const afterRect=native.rangeCount?native.getRangeAt(0).getBoundingClientRect():beforeRect
    const staysOnLine=granularity==='line'&&sameHost&&Math.abs(afterRect.top-beforeRect.top)<Math.max(1,beforeRect.height/2)
    if (staysOnLine || (granularity==='line'&&!sameHost) || (sameHost && focus.offset === bookmark.focus.offset && granularity !== 'lineboundary')) {
      const fields = this.#runtime.ids().flatMap(blockId => this.#reconciler.getEditableFields(blockId)
        .filter(field => field.mode !== 'plain-text' && field.element.getClientRects().length)
        .map(field => ({ blockId, ...field })))
      const index = fields.findIndex(field => field.blockId === bookmark.focus.blockId && field.key === bookmark.focus.fieldKey)
      const next = fields[index + (direction === 'backward' ? -1 : 1)]
      if (next) {
        focus = { blockId: next.blockId, fieldKey: next.key, offset: direction === 'backward' ? getTextLength(next.element) : 0 }
        if(granularity==='line'){
          next.element.scrollIntoView({block:'nearest',inline:'nearest'})
          const rect=next.element.getBoundingClientRect()
          const lineHeight=Number.parseFloat(this.#window.getComputedStyle(next.element).lineHeight)||beforeRect.height||16
          const y=direction==='backward'?rect.bottom-Math.min(rect.height,lineHeight)/2:rect.top+Math.min(rect.height,lineHeight)/2
          const hit=this.#dragCaretFromPoint(this.#navigationX,y)
          const point=hit?this.#logicalPoint(hit.node,hit.offset):null
          if(point?.blockId===next.blockId&&point.fieldKey===next.key)focus=point
        }
      }
    }
    const restored = this.restore({ anchor: bookmark.anchor, focus })
    if (restored && bookmark.anchor.blockId === focus.blockId && bookmark.anchor.fieldKey === focus.fieldKey) this.#deactivate()
    return restored
  }

  clear() {
    this.#navigationX=null
    this.#dragStart = null
    this.#deactivate()
  }

  selectBlocks(ids) {
    if (!Array.isArray(ids)) throw new TypeError('Selected block ids must be an array')
    for (const id of ids) {
      if (typeof id !== 'string' || !this.#runtime.has(id)) throw new Error(`Unknown block id: ${id}`)
    }
    this.#dragStart = null
    this.#navigationX = null
    this.#deactivate({ clearBlocks: false })
    this.#view.select(ids)
  }

  restore(bookmark) {
    const built = this.#buildRange(bookmark)
    if (!built) return false
    const native = this.#window?.getSelection?.()
    if (!native) return false
    this.#reconciler.getEditableField(bookmark.anchor.blockId, bookmark.anchor.fieldKey)?.element.focus()
    try {
      if (typeof native.setBaseAndExtent === 'function') {
        native.setBaseAndExtent(built.anchor.node, built.anchor.offset, built.focus.node, built.focus.offset)
      } else {
        native.removeAllRanges()
        native.addRange(built.range)
      }
    } catch { return false }
    this.#activate(bookmark, built.range)
    if(bookmark.conversionCaret){
      this.#conversionCaret=true
      this.#reconciler.getEditableField(bookmark.focus.blockId,bookmark.focus.fieldKey)?.element.focus({preventScroll:true})
      native.collapse(built.focus.node,built.focus.offset)
      this.#view.setCurrent(bookmark.focus.blockId)
    }
    return true
  }

  activate(range) {
    if (!range || range.collapsed) return false
    const start = this.#logicalPoint(range.startContainer, range.startOffset)
    const end = this.#logicalPoint(range.endContainer, range.endOffset)
    if (
      !start
      || !end
      || (start.blockId === end.blockId && start.fieldKey === end.fieldKey)
    ) return false

    const native = this.#window?.getSelection?.() ?? null
    const nativeAnchor = native?.anchorNode
      ? this.#logicalPoint(native.anchorNode, native.anchorOffset)
      : null
    const nativeFocus = native?.focusNode
      ? this.#logicalPoint(native.focusNode, native.focusOffset)
      : null
    const nativeRange = native?.rangeCount ? native.getRangeAt(0) : null
    const matchesNative = nativeRange
      && nativeRange.compareBoundaryPoints(0, range) === 0
      && nativeRange.compareBoundaryPoints(2, range) === 0
    const bookmark = matchesNative && nativeAnchor && nativeFocus
      ? { anchor: nativeAnchor, focus: nativeFocus }
      : { anchor: start, focus: end }

    this.#activate(bookmark, range)
    return true
  }

  deactivate() {
    this.#deactivate()
  }

  removeWholeBlocks() {
    const ids = this.wholeBlockIds
    if (!ids.length) return false
    const firstIndex = this.#runtime.indexOf(ids[0])
    const selected = new Set(ids)
    const remaining = this.#runtime.ids().filter(id => !selected.has(id))
    const adjacentId = remaining[Math.min(firstIndex, remaining.length - 1)]
    const currentId = this.#runtime.interact('selection.remove', () => {
      const result = this.#runtime.removeBlocks(ids)
      return result ? adjacentId ?? result : false
    }, blockId => {
      if (!blockId) return null
      const field = this.#reconciler.getEditableFields(blockId)[0]
      const point = { blockId, fieldKey: field?.key ?? '', offset: 0 }
      return { anchor: point, focus: { ...point } }
    })
    if (!currentId) return false
    this.#deactivate()
    this.#view.reconcileInteraction()
    if(currentId){
      this.#view.setCurrent(currentId)
      queueMicrotask(()=>this.#view.focus(currentId,{offset:'start'}))
    }
    return true
  }

  replace(replacement = { kind: 'text', text: '' }) {
    const bookmark = this.bookmark
    const whole = this.wholeBlockIds
    if (!bookmark && !whole.length) return false
    const result = this.#runtime.interact('selection.replace', () => whole.length
      ? this.#runtime.replaceWholeDocument(replacement, whole)
      : this.#runtime.replaceLogicalRange(bookmark, replacement), point => {
        if (!point) return null
        const caret = { blockId: point.blockId, fieldKey: point.fieldKey, offset: point.offset }
        return { anchor: caret, focus: { ...caret } }
      })
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

  beginComposition() {
    if (!this.active || this.#runtime.readOnly) return null
    const bookmark = this.bookmark
    if (!bookmark && this.wholeBlockIds.length) return this.#beginWholeComposition(this.wholeBlockIds)
    const built = this.#buildRange(bookmark)
    const native = this.#window?.getSelection?.()
    if (!built || !native) return null
    const start = this.#comparePoints(bookmark.anchor, bookmark.focus) <= 0 ? bookmark.anchor : bookmark.focus
    const field = this.#reconciler.getEditableField(start.blockId, start.fieldKey)
    if (!field || field.mode === 'plain-text') return null
    const generation = this.#runtime.generation
    const revision = this.#runtime.revision
    const whole = this.#wholeBlocks
    let settled = false
    // Chrome cannot compose into a Range spanning independent editing hosts.
    // Preserve the logical intent while letting its preedit live in one host.
    this.#deactivate()
    field.element.focus({ preventScroll: true })
    native.setBaseAndExtent(built.range.startContainer, built.range.startOffset, built.range.startContainer, built.range.startOffset)
    const restore = () => {
      if (settled || this.#runtime.readOnly || this.#runtime.health !== 'ready'
        || this.#runtime.generation !== generation || this.#runtime.revision !== revision) return false
      settled = true
      if (!this.restore(bookmark)) return false
      this.#wholeBlocks = whole
      if (whole) this.#view.select(this.#runtime.ids())
      return true
    }
    return {
      blockId: start.blockId,
      fieldKey: start.fieldKey,
      commit: text => restore() && this.replace({ kind: 'text', text }),
      cancel: restore,
    }
  }

  split() {
    const bookmark=this.bookmark
    if(!bookmark||this.#wholeBlocks||this.#runtime.readOnly)return false
    const nextId=this.#runtime.interact('selection.split',()=>{
      const point=this.#runtime.replaceLogicalRange(bookmark,{kind:'text',text:''})
      return point?this.#runtime.splitBlock(point.blockId,point.fieldKey,{start:point.offset,end:point.offset}):false
    },id=>{
      const field=this.#reconciler.getEditableFields(id)[0]
      if(!id||!field)return null
      const caret={blockId:id,fieldKey:field.key,offset:0}
      return {anchor:caret,focus:{...caret}}
    })
    if(!nextId)return false
    this.#deactivate()
    this.#view.reconcileInteraction()
    this.#view.setCurrent(nextId)
    queueMicrotask(()=>this.#view.focus(nextId,{offset:'start'}))
    return true
  }

  #beginWholeComposition(ids) {
    const blockId = ids.find(id => this.#reconciler.getEditableFields(id).length)
    const field = blockId ? this.#reconciler.getEditableFields(blockId)[0] : null
    if (!field) return null
    const generation = this.#runtime.generation
    const revision = this.#runtime.revision
    let settled = false
    // Stage preedit in an owner that the selection will replace. Untouched
    // blocks must never retain provisional DOM after the canonical commit.
    this.#deactivate()
    this.#view.focus(blockId, { fieldKey: field.key, offset: 'start' })
    const restore = () => {
      if (settled || this.#runtime.readOnly || this.#runtime.health !== 'ready'
        || this.#runtime.generation !== generation || this.#runtime.revision !== revision) return false
      settled = true
      this.selectBlocks(ids)
      return true
    }
    return {
      blockId, fieldKey: field.key,
      commit: text => restore() && this.replace({ kind: 'text', text }),
      cancel: restore,
    }
  }

  selectAllBlocks() {
    if(!this.#runtime.size)return false
    const firstId=this.#runtime.idAt(0)
    const lastId=this.#runtime.idAt(this.#runtime.size-1)
    if(!firstId||!lastId)return false
    const firstFields = this.#reconciler.getEditableFields(firstId)
    const lastFields = this.#reconciler.getEditableFields(lastId)
    const first = firstFields[0]
    const last = lastFields[lastFields.length - 1]
    if (!first || !last || first.mode === 'plain-text' || last.mode === 'plain-text') {
      const ids = this.#runtime.ids()
      const fields = ids.flatMap(blockId => this.#reconciler.getEditableFields(blockId)
        .filter(field => field.mode !== 'plain-text')
        .map(field => ({ blockId, ...field })))
      const anchor = fields[0]
      const focus = fields[fields.length - 1]
      const firstShell = this.#reconciler.getElement(firstId)
      const lastShell = this.#reconciler.getElement(lastId)
      if (!firstShell || !lastShell) return false
      if (!anchor || !focus) {
        this.selectBlocks(ids)
        return true
      }
      const bookmark = {
        anchor: { blockId: anchor.blockId, fieldKey: anchor.key, offset: 0 },
        focus: { blockId: focus.blockId, fieldKey: focus.key, offset: getTextLength(focus.element) },
      }
      const native = this.#window?.getSelection?.()
      if (!native) return false
      const editingRange = this.#buildRange(bookmark)
      if (!editingRange) return false
      const range = this.#document.createRange()
      range.setStartBefore(firstShell)
      range.setEndAfter(lastShell)
      anchor.element.focus({ preventScroll: true })
      native.removeAllRanges()
      native.addRange(editingRange.range)
      this.#activate(bookmark, range)
      this.#wholeBlocks = true
      this.#view.select(ids)
      return true
    }
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

  #deactivate({ clearBlocks = true } = {}) {
    this.#bookmark = null
    this.#conversionCaret = false
    this.#range = null
    this.#wholeBlocks = false
    this.#root.classList.remove('oe-editor--cross-selecting')
    if (clearBlocks) this.#view.clearSelection()
    this.#hideHighlight()
  }

  #ensureCurrent() {
    if (!this.#bookmark) return
    if (this.#generation !== this.#runtime.generation) {
      this.clear()
      return
    }
    const native = this.#window?.getSelection?.()
    if (!this.#dragStart && !this.#wholeBlocks && native?.rangeCount === 0) {
      this.clear()
      return
    }
    const owner = native?.isCollapsed && native.anchorNode
      ? this.#reconciler.resolveEditableTarget(native.anchorNode)
      : null
    const emptyWholeSelection = this.#wholeBlocks
      && this.#bookmark.anchor.blockId === this.#bookmark.focus.blockId
      && this.#bookmark.anchor.fieldKey === this.#bookmark.focus.fieldKey
      && this.#bookmark.anchor.offset === this.#bookmark.focus.offset
    const retainedCaret = this.#conversionCaret && owner
      && owner.blockId === this.#bookmark.focus.blockId
      && owner.fieldKey === this.#bookmark.focus.fieldKey
      && getTextOffset(owner.element,native.anchorNode,native.anchorOffset) === this.#bookmark.focus.offset
    if (!this.#dragStart && !emptyWholeSelection && !retainedCaret && owner && owner.element === this.#document.activeElement) this.clear()
  }

  #onMouseDown(event) {
    this.#navigationX=null
    if (event.button !== 0) return
    const caret = this.#caretFromPoint(event.clientX, event.clientY)
    const point = caret ? this.#logicalPoint(caret.node, caret.offset) : null
    if (!point) {
      if (event.target && this.#root.contains(event.target)) this.clear()
      return
    }
    this.#deactivate()
    this.#dragStart = { caret, point, generation: this.#runtime.generation, bookmark: null }
  }

  #onMouseMove(event) {
    if (!this.#dragStart || (event.buttons & 1) === 0) return
    if (this.#runtime.readOnly || this.#dragStart.generation !== this.#runtime.generation) {
      this.clear()
      return
    }
    const caret = this.#dragCaretFromPoint(event.clientX, event.clientY)
    const point = caret ? this.#logicalPoint(caret.node, caret.offset) : null
    if (!point) return
    if (point.blockId === this.#dragStart.point.blockId
      && point.fieldKey === this.#dragStart.point.fieldKey) {
      this.#dragStart.bookmark = null
      if (this.active) this.#deactivate()
      return
    }

    const bookmark = { anchor: clonePoint(this.#dragStart.point), focus: clonePoint(point) }
    const built = this.#buildRange(bookmark, this.#dragStart.caret, caret)
    if (!built) return
    this.#dragStart.bookmark = bookmark
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

  #onMouseUp() {
    const drag = this.#dragStart
    this.#dragStart = null
    if (!drag?.bookmark || drag.generation !== this.#runtime.generation || this.#runtime.readOnly) return
    if (!this.#reconciler.resolveEditableTarget(drag.caret.node)) return
    // Native dragging is confined to one editing host. Restore our completed
    // logical range after that native drag releases its selection ownership.
    this.restore(drag.bookmark)
  }

  #activate(bookmark, range) {
    this.#conversionCaret = false
    this.#generation = this.#runtime.generation
    this.#bookmark = { anchor: clonePoint(bookmark.anchor), focus: clonePoint(bookmark.focus) }
    this.#range = range.cloneRange()
    this.#root.classList.add('oe-editor--cross-selecting')
    this.#showHighlight(range)

    const anchorIndex=this.#runtime.indexOf(bookmark.anchor.blockId)
    const focusIndex=this.#runtime.indexOf(bookmark.focus.blockId)
    if(anchorIndex>=0&&focusIndex>=0){
      const from=Math.min(anchorIndex,focusIndex)
      const to=Math.max(anchorIndex,focusIndex)
      this.#view.select(this.#runtime.ids().slice(from,to+1))
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
    return { range, anchor: anchorResolved, focus: focusResolved }
  }

  #resolvePoint(point, bias) {
    const field = this.#reconciler.getEditableField(point.blockId, point.fieldKey)
    if (!field || field.mode === 'plain-text') return null
    return findNodeAtOffset(field.element, point.offset, bias)
  }

  #comparePoints(left, right) {
    const leftBlock=this.#runtime.indexOf(left.blockId)
    const rightBlock=this.#runtime.indexOf(right.blockId)
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

  #dragCaretFromPoint(x, y) {
    // Native hit testing returns non-editable containers in margins and gaps.
    // Keep the drag inside the nearest visible rich-text field, as in v1.
    let nearest = null
    for (const blockId of this.#runtime.ids()) {
      for (const field of this.#reconciler.getEditableFields(blockId)) {
        if (field.mode === 'plain-text') continue
        const rect = field.element.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        const vertical = Math.max(rect.top - y, y - rect.bottom, 0)
        const horizontal = Math.max(rect.left - x, x - rect.right, 0)
        if (!nearest || vertical < nearest.vertical || (vertical === nearest.vertical && horizontal < nearest.horizontal)) {
          nearest = { field, rect, vertical, horizontal }
        }
      }
    }
    if (!nearest) return null
    const { field, rect } = nearest
    if (y < rect.top) return findNodeAtOffset(field.element, 0, 'start')
    if (y > rect.bottom) return findNodeAtOffset(field.element, getTextLength(field.element), 'end')
    const caret = this.#caretFromPoint(
      Math.max(rect.left + 1, Math.min(rect.right - 1, x)),
      Math.max(rect.top + 1, Math.min(rect.bottom - 1, y)),
    )
    return caret && field.element.contains(caret.node) ? caret : null
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
