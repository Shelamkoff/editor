// @ts-check
import { findNodeAtOffset, getTextLength } from '../shared/textOffset.js'

/** True only for an endpoint inside a host-owned inline widget presentation.
 * The parent boundary on either side of the widget remains ordinary text selection.
 * @param {Node} node
 */
function isWidgetEndpoint(node) {
  const element = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
  return Boolean(element?.closest?.('[data-inline-plugin]'))
}

/** @param {Range} left @param {Range} right */
function sameRange(left, right) {
  return left.startContainer === right.startContainer
    && left.startOffset === right.startOffset
    && left.endContainer === right.endContainer
    && left.endOffset === right.endOffset
}

/** @param {string} content @param {number} offset */
function splitsSurrogate(content, offset) {
  if (offset < 1 || offset >= content.length) return false
  const before = content.charCodeAt(offset - 1)
  const after = content.charCodeAt(offset)
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
}

/** A per-mount, private-token view over the editor's existing selection owners.
 * Does not own persisted content, document selection, Range objects or highlights.
 * Tokens carry no editable DOM address and never authorize a different mount.
 */
export class InlineSelectionAuthority {
  #root
  #runtime
  #reconciler
  #read
  #restore
  #lease
  #phase
  #inMutation
  #tokens = new WeakMap()
  #active = false
  #revoked = false

  /**
   * @param {{
   *  root:HTMLElement,
   *  runtime:any,
   *  reconciler:any,
   *  readSelection:()=>{range:Range|null,bookmark:any}|null,
   *  restoreSelection:(bookmark:any)=>boolean,
   *  lease:()=>number,
   *  canAccess?:()=>boolean,
   *  isMutating?:()=>boolean,
   * }} options
   */
  constructor({ root, runtime, reconciler, readSelection, restoreSelection, lease, canAccess = () => true, isMutating = () => false }) {
    this.#root = root
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#read = readSelection
    this.#restore = restoreSelection
    this.#lease = lease
    this.#phase = canAccess
    this.#inMutation = isMutating
  }

  /** Called after the owning tool/panel has successfully acquired its resources. */
  activate() {
    if (this.#revoked) return false
    this.#active = true
    return true
  }

  /** Permanent retirement also invalidates every previously issued token. */
  revoke() {
    this.#active = false
    this.#revoked = true
    this.#tokens = new WeakMap()
  }

  /** A detached, fresh range view; never a stored mutation address. */
  get range() {
    if (!this.#available()) return null
    const current = this.#read()
    if (!this.#validCurrent(current) || !this.#available()) return null
    const snapshot = current.range.cloneRange()
    // A native selection reader, DOM resolver or Range cloning hook can
    // synchronously retire this tool's selection authority.
    return this.#available() ? snapshot : null
  }

  /**
   * @param {Range} [range]
   * @returns {import('../inline-tools/types').InlineSelectionBookmark|null}
   */
  capture(range = undefined) {
    if (!this.#available()) return null
    const token = this.#runtime.prepareExtensionValue(() => {
      const current = this.#read()
      if (!this.#validCurrent(current) || (range !== undefined && !sameRange(range, current.range))) return null
      const bookmark = current.bookmark
      const anchor = this.#copyPoint(bookmark.anchor)
      const focus = this.#copyPoint(bookmark.focus)
      if (!anchor || !focus || !this.#resolve(anchor) || !this.#resolve(focus)) return null
      const token = Object.freeze({})
      this.#tokens.set(token, {
        anchor, focus,
        conversionCaret: bookmark.conversionCaret === true,
        lease: this.#lease(),
        generation: this.#runtime.generation,
        revision: this.#runtime.revision,
      })
      return /** @type {import('../inline-tools/types').InlineSelectionBookmark} */ (/** @type {unknown} */ (token))
    })
    // Preparation and its teardown are external callbacks. A newly revoked
    // mount must never publish a token, even if its internal snapshot was valid.
    // The runtime revision/generation or selection lease can also change
    // *during* capture of the token's metadata: reject already-stale rights.
    return token && this.#matches(this.#tokens.get(token)) ? token : null
  }

  /** Validate private provenance and current endpoints without moving focus.
   * @param {import('../inline-tools/types').InlineSelectionBookmark} token
   */
  isValid(token) {
    if (!this.#available() || !token || typeof token !== 'object') return false
    const captured = this.#tokens.get(token)
    return this.#matches(captured)
      && this.#currentOwns(captured)
      && Boolean(this.#resolve(captured.anchor) && this.#resolve(captured.focus))
      // Endpoint resolution may synchronously detach/revoke the mount.
      && this.#matches(captured)
  }

  /** Internal host-only resolution of a settled logical result.
   * Does not restore focus, publish selection, or rebase an old token. The
   * caller must already own the successful synchronous transaction result.
   * @param {{anchor:any,focus:any}} bookmark
   * @returns {Range|null}
   */
  resolveOwnResult(bookmark) {
    if (!this.#available()) return null
    const resolved = this.#runtime.prepareExtensionValue(() => {
      const anchor = this.#copyPoint(bookmark?.anchor)
      const focus = this.#copyPoint(bookmark?.focus)
      if (!anchor || !focus) return null
      return this.#resolvedRange(anchor, focus)
    })
    // A host-only range still belongs to this exact active presentation.
    return this.#available() ? resolved : null
  }

  /**
   * @param {import('../inline-tools/types').InlineSelectionBookmark} token
   * @param {import('../inline-tools/types').InlineSelectionRestoreOptions} [options]
   */
  restore(token, options = undefined) {
    // Prove issuer/phase first. Caller accessors must not run for stale/foreign tokens.
    if (!this.#available() || !token || typeof token !== 'object') return false
    const captured = this.#tokens.get(token)
    if (!this.#matches(captured) || !this.#currentOwns(captured)) return false

    const candidate = this.#runtime.prepareExtensionValue(() => {
      if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
        throw new TypeError('Inline selection restore options must be an object')
      }
      const delta = options?.endOffsetDelta ?? 0
      if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
        throw new TypeError('endOffsetDelta must be a finite integer')
      }
      if (delta !== 0 && !this.#inMutation()) {
        throw new TypeError('endOffsetDelta requires an active formatting mutation')
      }
      const first = captured.anchor
      const second = captured.focus
      const ordered = this.#compare(first, second) <= 0 ? [first, second] : [second, first]
      const anchor = { ...first }
      const focus = { ...second }
      const end = ordered[1] === first ? anchor : focus
      end.offset += delta
      if (end.offset < 0) return null
      if (ordered[0].blockId === ordered[1].blockId
        && ordered[0].fieldKey === ordered[1].fieldKey
        && end.offset < ordered[0].offset) {
        return null
      }
      const resolvedAnchor = this.#resolve(anchor)
      const resolvedFocus = this.#resolve(focus)
      if (!resolvedAnchor || !resolvedFocus) return null
      return { anchor, focus, ...(captured.conversionCaret ? { conversionCaret: true } : {}) }
    })
    if (!candidate || !this.#matches(captured) || !this.#currentOwns(captured)
      // Native verification may revoke the mount inside #currentOwns().
      // Recheck *after* that observer before moving the browser caret.
      || !this.#matches(captured)) return false
    return this.#restore(candidate) === true
  }

  /** @param {any} point */
  #copyPoint(point) {
    if (!point || typeof point.blockId !== 'string' || typeof point.fieldKey !== 'string'
      || !Number.isInteger(point.offset) || point.offset < 0) return null
    return { blockId: point.blockId, fieldKey: point.fieldKey, offset: point.offset }
  }

  /** @param {{blockId:string,fieldKey:string,offset:number}} point */
  #resolve(point) {
    const field = this.#reconciler.getEditableField(point.blockId, point.fieldKey)
    if (!field || field.mode !== 'rich-text' || !field.element
      || !this.#root.contains(field.element) || !field.element.isConnected) return null
    const element = field.element
    if (element.contentEditable !== 'true' && element.getAttribute?.('contenteditable') !== 'true') return null
    if (element.hidden || element.closest?.('[hidden],[inert]')) return null
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element)
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return null
    const length = getTextLength(element)
    if (point.offset < 0 || point.offset > length) return null
    const resolved = findNodeAtOffset(field.element, point.offset, 'end')
    if (!resolved || isWidgetEndpoint(resolved.node)) return null
    if (resolved.node.nodeType === 3
      && splitsSurrogate(resolved.node.textContent ?? '', resolved.offset)) return null
    return resolved
  }

  /** Resolve authored logical endpoints in their current keyed fields.
   * This never changes browser selection or highlight state.
   * @param {{blockId:string,fieldKey:string,offset:number}} anchor
   * @param {{blockId:string,fieldKey:string,offset:number}} focus
   */
  #resolvedRange(anchor, focus) {
    const a = this.#resolve(anchor)
    const b = this.#resolve(focus)
    if (!a || !b) return null
    const forward = this.#compare(anchor, focus) <= 0
    const start = forward ? a : b
    const end = forward ? b : a
    const range = this.#root.ownerDocument.createRange()
    try {
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
    } catch { return null }
    return range
  }

  /** @param {{blockId:string,fieldKey:string,offset:number}} first @param {{blockId:string,fieldKey:string,offset:number}} second */
  #compare(first, second) {
    const a = this.#runtime.indexOf(first.blockId)
    const b = this.#runtime.indexOf(second.blockId)
    if (a !== b) return a - b
    const fields = this.#reconciler.getEditableFields(first.blockId)
    const x = fields.findIndex(field => field.key === first.fieldKey)
    const y = fields.findIndex(field => field.key === second.fieldKey)
    return x - y || first.offset - second.offset
  }

  /** @param {{range:Range|null,bookmark:any}|null} current */
  #validCurrent(current) {
    if (!current?.range || current.range.collapsed || !current.bookmark?.anchor || !current.bookmark?.focus) return false
    const range = current.range
    if (isWidgetEndpoint(range.startContainer) || isWidgetEndpoint(range.endContainer)) return false
    if (!this.#root.contains(range.startContainer) || !this.#root.contains(range.endContainer)) return false
    const anchor = this.#copyPoint(current.bookmark.anchor)
    const focus = this.#copyPoint(current.bookmark.focus)
    if (!anchor || !focus) return false
    const expected = this.#resolvedRange(anchor, focus)
    if (!expected) return false
    // Equivalent DOM boundaries may be represented by a parent element offset
    // or a descendant text node. Compare actual positions, not node identity.
    // Native Range exposes this method; restricted test adapters may omit it.
    if (typeof range.compareBoundaryPoints === 'function') {
      try {
        return range.compareBoundaryPoints(0, expected) === 0
          && range.compareBoundaryPoints(2, expected) === 0
      } catch { return false }
    }
    return true
  }

  /** A genuine changed native selection must expire the token immediately,
   * even before the browser's queued selectionchange notification arrives.
   * Inside the owning protected DOM callback, intermediate wrapper edits are
   * intentionally repaired from this same token.
   * @param {any} metadata
   */
  #currentOwns(metadata) {
    if (this.#inMutation()) return true
    const current = this.#read()
    if (!this.#validCurrent(current)) return false
    const a = this.#copyPoint(current.bookmark.anchor)
    const f = this.#copyPoint(current.bookmark.focus)
    return Boolean(a && f
      && a.blockId === metadata.anchor.blockId && a.fieldKey === metadata.anchor.fieldKey && a.offset === metadata.anchor.offset
      && f.blockId === metadata.focus.blockId && f.fieldKey === metadata.focus.fieldKey && f.offset === metadata.focus.offset)
  }

  /** @param {any} metadata */
  #matches(metadata) {
    return Boolean(metadata && this.#available()
      && metadata.lease === this.#lease()
      && metadata.generation === this.#runtime.generation
      && metadata.revision === this.#runtime.revision
      // The monotonic lease and runtime getters are callback boundaries too.
      && this.#active && !this.#revoked)
  }

  #available() {
    if (!this.#active || this.#revoked || !this.#root.isConnected
      || this.#runtime.health !== 'ready' || this.#runtime.readOnly) return false
    // canAccess() is another host callback. It can synchronously retire the
    // mount or change its effective control mode while returning true.
    const allowed = this.#phase()
    return Boolean(allowed) && this.#active && !this.#revoked
      && this.#root.isConnected && this.#runtime.health === 'ready'
      && !this.#runtime.readOnly && this.#active && !this.#revoked
  }
}
