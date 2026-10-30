// @ts-check
import { editingHostForEvent } from '../shared/editableFields.js'
import { isRichTextCaretPadding } from '../shared/richTextCaretPadding.js'

const SOURCE_PROJECTION_INPUTS = new Set([
  'insertText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'insertCompositionText',
])

export class NativeInputController {
  #root
  #runtime
  #reconciler
  #crossSelection
  #selection
  #projection
  #inlineWidgetInput
  #onControlledInput
  #controller
  #composition = null
  #preparedComposition = null
  #endingComposition = null
  #coalesceMs
  #now
  #groupSequence = 0
  #lastGroup = null
  #pendingInput = null

  constructor({ root, runtime, reconciler, crossSelection = null, selection = null, projection = null, inlineWidgetInput = null, onControlledInput = null, coalesceMs = 300 }) {
    if (!root?.addEventListener) throw new TypeError('NativeInputController requires an event root')
    if (!runtime?.syncBlockFromProjection) throw new TypeError('NativeInputController requires a DocumentRuntime')
    if (!reconciler?.resolveEditableTarget) throw new TypeError('NativeInputController requires a BlockReconciler')
    if (!Number.isFinite(coalesceMs) || coalesceMs < 0) {
      throw new RangeError('Native input coalesce interval must be a finite number greater than or equal to 0')
    }

    this.#root = root
    this.#runtime = runtime
    this.#reconciler = reconciler
    this.#crossSelection = crossSelection
    this.#selection = selection
    this.#projection = projection
    this.#inlineWidgetInput = inlineWidgetInput
    this.#onControlledInput = typeof onControlledInput === 'function' ? onControlledInput : null
    this.#coalesceMs = coalesceMs
    const performanceNow = root.ownerDocument?.defaultView?.performance?.now?.bind(root.ownerDocument.defaultView.performance)
    this.#now = performanceNow ?? Date.now

    const AbortControllerCtor = root.ownerDocument?.defaultView?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    const signal = this.#controller.signal

    root.addEventListener('beforeinput', event => this.handleBeforeInput(event), { signal })
    root.addEventListener('input', event => this.handleInput(event), { signal })
    root.addEventListener('compositionstart', event => this.handleCompositionStart(event), { signal })
    root.addEventListener('compositionend', event => this.handleCompositionEnd(event), { signal })
    root.addEventListener('keydown', event => this.handleCompositionKey(event), { signal })
    root.addEventListener('mousedown', () => { this.#preparedComposition = null }, { signal })
  }

  get isComposing() { return this.#composition !== null }

  /** Observe an existing native envelope without granting mutation rights.
   * @param {string} blockId
   * @param {string} fieldKey
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  canPreservePresentationField(blockId,fieldKey,element) {
    if(this.#controller.signal.aborted||this.#runtime.readOnly
      ||this.#runtime.health!=='ready'||!element?.isConnected
      ||!this.#root.contains(element))return false
    const current=envelope=>envelope?.trusted===true
      &&envelope.generation===this.#runtime.generation
      &&envelope.revision===this.#runtime.revision
      &&envelope.modeEpoch===this.#runtime.modeEpoch
    for(const session of [this.#composition,this.#endingComposition]){
      if(current(session)&&session.owner.blockId===blockId
        &&session.owner.fieldKey===fieldKey&&session.owner.element===element)return true
    }
    const pending=this.#pendingInput
    if(pending?.kind==='field')return current(pending)
      &&pending.blockId===blockId&&pending.fieldKey===fieldKey
      &&pending.element===element&&!pending.originalEvent.defaultPrevented
    if(pending?.kind==='inline'){
      const snapshot=pending.snapshot
      return pending.valid&&current({...snapshot,modeEpoch:pending.modeEpoch})
        &&snapshot.blockId===blockId&&snapshot.fieldKey===fieldKey
        &&snapshot.fieldElement===element&&!snapshot.originalEvent.defaultPrevented
    }
    return false
  }

  /** Called when the earlier root-capture inline owner consumes beforeinput
   * and stops propagation before this controller's bubble listener can retire
   * its old native input envelope. No canonical command is performed here.
   */
  retirePendingInput() {
    this.#pendingInput = null
  }

  setReadOnly(value, discardProjectionEdits = () => this.#runtime.discardProjectionEdits?.()) {
    if (value === true) {
      const discardPreedit = this.#composition !== null || this.#endingComposition !== null
      this.#composition = null
      this.#preparedComposition = null
      this.#endingComposition = null
      this.#lastGroup = null
      if (this.#pendingInput?.kind === 'inline') this.#pendingInput.valid = false
      else this.#pendingInput = null
      if (discardPreedit) discardProjectionEdits()
    }
  }

  handleBeforeInput(event) {
    // A browser may have captured this handler before teardown. Terminal
    // owners must not claim native editing/history events after destruction.
    if (this.#controller.signal.aborted) return
    this.#pendingInput = null
    if (this.#runtime.readOnly || event?.defaultPrevented) return
    if (event?.isComposing || this.#composition) return
    const inputType = typeof event?.inputType === 'string' ? event.inputType : ''
    const owner = this.#resolve(event?.target)
      ?? (inputType.startsWith('delete') ? this.#resolveNativeInlineOwner(event?.target) : null)
    if (!owner) return
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      event.preventDefault?.()
      if (inputType === 'historyUndo') this.#runtime.undo()
      else this.#runtime.redo()
      this.#lastGroup = null
      return
    }
    if ((owner.mode === 'rich-text' || this.#crossSelection?.wholeBlockIds?.length)
      && this.#crossSelection?.active && inputType.startsWith('delete')) {
      event.preventDefault?.()
      event.stopImmediatePropagation?.()
      this.#lastGroup = null
      this.#endingComposition = null
      if (this.#crossSelection.wholeBlockIds?.length) this.#crossSelection.removeWholeBlocks()
      else this.#crossSelection.replace({ kind: 'text', text: '' })
      return
    }
    if (owner.mode === 'rich-text' && (inputType === 'insertParagraph' || inputType === 'insertLineBreak')) {
      if (this.#crossSelection?.active && this.#crossSelection.replace({ kind: 'html', html: '<br>' })) {
        event.preventDefault?.()
        event.stopImmediatePropagation?.()
        this.#lastGroup = null
        this.#endingComposition = null
        return
      }
      const bookmark = this.#selection?.capture()
      const local = point => point?.blockId === owner.blockId && point?.fieldKey === owner.fieldKey
      if (bookmark && local(bookmark.anchor) && local(bookmark.focus)) {
        const result = this.#runtime.interact('input.line-break',
          () => this.#runtime.replaceLogicalRange(bookmark, { kind: 'html', html: '<br>' }),
          point => point ? { anchor: point, focus: { ...point } } : null,
        )
        if (result) {
          event.preventDefault?.()
          event.stopImmediatePropagation?.()
          this.#lastGroup = null
          this.#endingComposition = null
          this.#selection.setCaret(result.blockId, { fieldKey: result.fieldKey, offset: result.offset })
          return
        }
      }
    }
    if (
      (owner.mode === 'rich-text' || this.#crossSelection?.wholeBlockIds?.length)
      && this.#crossSelection?.active
      && (inputType === 'insertText' || inputType === 'insertReplacementText')
    ) {
      event.preventDefault?.()
      event.stopImmediatePropagation?.()
      this.#endingComposition = null
      this.#lastGroup = null
      this.#crossSelection.replace({
        kind: 'text',
        text: typeof event?.data === 'string' ? event.data : '',
      })
      return
    }
    if (this.#insertAfterAuthoredBreak(owner, event, inputType)) return
    if (this.#insertAtWidgetBoundary(owner, event, inputType)) return
    const native = this.#root.ownerDocument.defaultView?.getSelection?.()
    const inline = this.#inlineWidgetInput?.captureNativeDeletion(owner,event,native)
    if (inline) {
      this.#pendingInput = {kind:'inline',snapshot:inline,valid:true,modeEpoch:this.#runtime.modeEpoch}
      this.#lastGroup = null
      this.#endingComposition = null
      return
    }
    this.#pendingInput = this.#selection ? {
      kind:'field',
      blockId: owner.blockId, fieldKey: owner.fieldKey, element:owner.element,
      trusted:event?.isTrusted===true,originalEvent:event,modeEpoch:this.#runtime.modeEpoch,
      generation: this.#runtime.generation, revision: this.#runtime.revision,
      bookmark: this.#selection.capture(),
    } : null
    this.#endingComposition = null
  }

  #insertAfterAuthoredBreak(owner, event, inputType) {
    if (owner.mode !== 'rich-text' || inputType !== 'insertText' || typeof event.data !== 'string' || !event.data
      || event.type !== 'beforeinput' || !event.cancelable || !event.isTrusted || event.isComposing) return false
    const document = this.#root.ownerDocument, native = document.defaultView?.getSelection?.()
    if (!native?.isCollapsed || native.rangeCount !== 1 || native.anchorNode?.nodeType !== 1) return false
    const node = native.anchorNode, offset = native.anchorOffset, br = node.childNodes[offset - 1]
    if (br?.nodeType !== 1 || br.nodeName !== 'BR' || isRichTextCaretPadding(br)) return false
    // The terminal padding already gives the browser a stable native typing
    // position. Keep that existing path and its normal input event intact.
    if (isRichTextCaretPadding(node.childNodes[offset])) return false
    const range = native.getRangeAt(0), selectionBefore = this.#selection?.capture()
    const local = point => point?.blockId === owner.blockId && point?.fieldKey === owner.fieldKey
    const current = this.#resolve(node)
    if (!range.collapsed || !selectionBefore || !local(selectionBefore.anchor) || !local(selectionBefore.focus)
      || current?.element !== owner.element || current.mode !== owner.mode
      || current.blockId !== owner.blockId || current.fieldKey !== owner.fieldKey
      || document.activeElement !== owner.element || !owner.element.contains(br)
      || !native.isCollapsed || native.anchorNode !== node || native.anchorOffset !== offset
      || native.focusNode !== node || native.focusOffset !== offset
      || range.startContainer !== node || range.startOffset !== offset) return false
    // Chromium can move typing after a marked BR into the next visual text
    // run even when the caret remains inside the break's formatting wrapper.
    // Keep the authored DOM boundary, then use the existing native commit path.
    event.preventDefault()
    event.stopImmediatePropagation?.()
    const text = document.createTextNode(event.data)
    range.insertNode(text)
    native.setBaseAndExtent(text, text.data.length, text, text.data.length)
    this.#endingComposition = null
    this.#commit(owner, { group: this.#historyGroup(owner), preserveSourceProjection: true, selectionBefore })
    this.#onControlledInput?.()
    return true
  }

  #insertAtWidgetBoundary(owner, event, inputType) {
    if (owner.mode !== 'rich-text' || inputType !== 'insertText' || typeof event.data !== 'string' || !event.data) return false
    const document = this.#root.ownerDocument, native = document.defaultView?.getSelection?.()
    const target = this.#projection?.resolveWidgetInputTarget(native, inputType)
    if (!target || !target.element.isContentEditable || target.blockId !== owner.blockId || target.fieldKey !== owner.fieldKey) return false
    let side = target.position
    if (side === 'inside') {
      const range = document.createRange()
      range.selectNodeContents(target.element)
      range.setEnd(native.anchorNode, native.anchorOffset)
      const offset = range.toString().length
      if (offset === 0) side = 'before'
      else if (offset === target.element.textContent.length) side = 'after'
      else return false
    }
    // An editable pill's boundary has native affinity to its label. Insert
    // outside the widget, preserving the native formatting boundary.
    const selectionBefore = this.#selection?.capture()
    event.preventDefault()
    event.stopImmediatePropagation?.()
    const node = document.createTextNode(event.data)
    if (!target.element.contains(native.anchorNode)) native.getRangeAt(0).insertNode(node)
    else if (side === 'before') target.element.before(node)
    else target.element.after(node)
    native.setBaseAndExtent(node, node.data.length, node, node.data.length)
    this.#endingComposition = null
    this.#commit(owner, { group: this.#historyGroup(owner), preserveSourceProjection: true, selectionBefore })
    this.#onControlledInput?.()
    return true
  }

  handleInput(event) {
    if (this.#controller.signal.aborted) return
    // The pending inline envelope must be classified before read-only,
    // composition, widget targeting or ordinary field-owner early returns.
    // A matching stale native input stays consumed: it may never enter the
    // generic field serializer against a replacement projection.
    const pending = this.#pendingInput
    this.#pendingInput = null
    if (pending?.kind === 'inline') {
      const snapshot = pending.snapshot
      const matching = event?.inputType === snapshot.inputType
        && (event?.isTrusted === true) === snapshot.trusted
        && (event?.target === snapshot.eventHost
          || snapshot.eventHost.contains?.(event?.target))
      if (matching) {
        const stale = !pending.valid || this.#runtime.readOnly
          || this.#composition !== null || event?.isComposing === true
          || snapshot.originalEvent.defaultPrevented === true
          || snapshot.generation !== this.#runtime.generation
          || snapshot.revision !== this.#runtime.revision
        let settled={status:'stale'}
        if (stale) {
          try {
            this.#inlineWidgetInput?.discardStaleNativeDeletion(snapshot)
          } catch {
            // This event is still owned even if restoring current committed
            // projection failed. Never route it through generic persistence.
            settled={status:'failed'}
          }
        } else {
          try {
            settled=this.#inlineWidgetInput?.completeNativeDeletion(snapshot,event)
              ??{status:'failed'}
          }catch {
            // The protected runtime already owns recovery and diagnostics.
            settled={status:'failed'}
          }
        }
        this.#inlineWidgetInput?.markNativeInputEvent?.(event,settled)
        this.#lastGroup = null
        return
      }
    }
    if (this.#runtime.readOnly) return
    const owner = this.#resolve(event?.target)
    if (!owner) return

    if (this.#composition || event?.isComposing) return
    if (
      this.#endingComposition
      && this.#endingComposition.owner.blockId === owner.blockId
      && this.#endingComposition.owner.fieldKey === owner.fieldKey
    ) {
      return
    }

    const inputType = typeof event?.inputType === 'string' ? event.inputType : ''
    const completedNativeInput = pending?.kind === 'field' && pending.trusted && event?.isTrusted === true
      && pending.blockId === owner.blockId && pending.fieldKey === owner.fieldKey && pending.element === owner.element
      && pending.generation === this.#runtime.generation && pending.revision === this.#runtime.revision
      && pending.modeEpoch === this.#runtime.modeEpoch && !pending.originalEvent.defaultPrevented
      && pending.originalEvent.inputType === inputType
    const selectionBefore = pending?.kind === 'field'
      && pending.blockId === owner.blockId && pending.fieldKey === owner.fieldKey
      && pending.generation === this.#runtime.generation && pending.revision === this.#runtime.revision
      ? pending.bookmark : undefined
    const isolated = ['insertFromPaste', 'insertFromDrop', 'deleteByCut'].includes(inputType)
    if (isolated) this.#lastGroup = null
    this.#commit(owner, {
      group: this.#historyGroup(owner),
      preserveSourceProjection: SOURCE_PROJECTION_INPUTS.has(inputType),
      completeNativeNoop: completedNativeInput,
      selectionBefore,
    })
    if (isolated) this.#lastGroup = null
  }

  handleCompositionStart(event) {
    if (this.#controller.signal.aborted || this.#runtime.readOnly) return
    const owner = this.#resolve(event?.target)
    if (!owner) return
    let replacement = this.#preparedComposition
    this.#preparedComposition = null
    if (replacement && (replacement.blockId !== owner.blockId || replacement.fieldKey !== owner.fieldKey)) replacement = null
    replacement ??= owner.mode === 'rich-text' || this.#crossSelection?.wholeBlockIds?.length
      ? this.#crossSelection?.beginComposition?.() ?? null : null
    this.#composition = {
      owner: replacement ? this.#resolve(this.#root.ownerDocument.activeElement) ?? owner : owner,
      replacement,
      trusted:event?.isTrusted===true,modeEpoch:this.#runtime.modeEpoch,
      generation: this.#runtime.generation,
      revision: this.#runtime.revision,
      selectionBefore: this.#selection?.capture(),
    }
    if (this.#pendingInput?.kind === 'inline') this.#pendingInput.valid = false
    else this.#pendingInput = null
    this.#endingComposition = null
    this.#lastGroup = null
  }

  handleCompositionKey(event) {
    if (this.#controller.signal.aborted || this.#runtime.readOnly
      || this.#composition || event?.defaultPrevented) return
    if (event?.keyCode !== 229) {
      this.#preparedComposition = null
      return
    }
    const owner = this.#resolve(event?.target)
    if ((owner?.mode === 'rich-text' || (owner && this.#crossSelection?.wholeBlockIds?.length)) && this.#crossSelection?.active) {
      this.#preparedComposition = this.#crossSelection.beginComposition?.() ?? null
    }
  }

  handleCompositionEnd(event) {
    if (this.#controller.signal.aborted) return
    if (this.#runtime.readOnly) {
      this.#composition = null
      this.#preparedComposition = null
      this.#endingComposition = null
      return
    }

    const session = this.#composition
    this.#composition = null
    this.#preparedComposition = null
    if (!session) return
    const { owner, replacement } = session
    const text = typeof event?.data === 'string' ? event.data : ''

    this.#endingComposition = session
    queueMicrotask(() => {
      if (this.#endingComposition !== session) return
      this.#endingComposition = null
      if (
        this.#runtime.readOnly
        || this.#runtime.generation !== session.generation
        || this.#runtime.revision !== session.revision
      ) return
      if (replacement) {
        if (text) replacement.commit(text)
        else replacement.cancel()
        return
      }
      this.#commit(owner, {
        group: this.#historyGroup(owner, ':composition'),
        preserveSourceProjection: true,
        selectionBefore: session.selectionBefore,
      })
    })
  }

  destroy() {
    this.#controller.abort()
    this.#composition = null
    this.#preparedComposition = null
    this.#endingComposition = null
    this.#lastGroup = null
    this.#pendingInput = null
  }

  #historyGroup(owner, suffix = '') {
    const key = `${owner.blockId}:${owner.fieldKey}${suffix}`
    const now = this.#now()
    const previous = this.#lastGroup
    if (previous && previous.key === key && now - previous.at <= this.#coalesceMs) {
      previous.at = now
      return previous.group
    }
    const group = `native:${key}:${++this.#groupSequence}`
    this.#lastGroup = { key, group, at: now }
    return group
  }

  /** Inline labels may be the actual beforeinput target even though the
   * generic native editing-host resolver intentionally rejects widget-local
   * control events. For deletion capture only, normalize that target to the
   * same registered rich field which owns its mounted occurrence.
   */
  #resolveNativeInlineOwner(target) {
    if (!target || !this.#projection?.resolveWidgetElement
      || target.closest?.('input, textarea, select, button, [contenteditable="false"]')) return null
    const widget = this.#projection.resolveWidgetElement(target)
    if (!widget?.isConnected || !widget.isContentEditable) return null
    // The widget root is an independent DOM owner and must not resolve as
    // authored text. For this deletion-only bridge, resolve its *parent*
    // field instead, then verify the mounted widget occurrence belongs to
    // that same currently registered rich editing host.
    const owner = this.#reconciler.resolveEditableTarget(widget.parentNode)
    if (!owner || owner.mode !== 'rich-text' || !owner.element?.contains?.(widget)) return null
    const current = this.#reconciler.getEditableField?.(owner.blockId, owner.fieldKey)
    if (current?.element !== owner.element || current.mode !== 'rich-text'
      || !current.element.contains(widget)
      || !this.#root.contains?.(widget)) return null
    return owner
  }

  #resolve(target) {
    if (!target || typeof target !== 'object') return null
    const owner = this.#reconciler.resolveEditableTarget(target)
    if (!owner) return null
    if (owner.mode === 'plain-text') {
      return target === owner.element || owner.element.contains?.(target) ? owner : null
    }
    if (owner.mode !== 'rich-text') return null
    if (typeof target.closest !== 'function') return owner
    return editingHostForEvent(this.#root, target) === owner.element ? owner : null
  }

  #commit(owner, { group, preserveSourceProjection, completeNativeNoop = false, selectionBefore = undefined }) {
    if (this.#controller.signal.aborted) return
    // A trusted completed edit can replace author DOM without changing its
    // canonical value. Retain the existing descriptor across the guarded read.
    const completeField = completeNativeNoop && preserveSourceProjection && owner.mode === 'rich-text'
    let field
    // Paste/cut can rebuild the authoring host after decoding its native edit.
    // Keep the logical caret without retaining untrusted clipboard markup.
    const captured = !preserveSourceProjection ? this.#selection?.capture() : null
    const local = point => point?.blockId === owner.blockId && point?.fieldKey === owner.fieldKey
    const selectionAfter = captured && local(captured.anchor) && local(captured.focus) ? captured : null
    this.#runtime.syncBlockFromProjection(owner.blockId, () => {
      if (!completeField) return
      field = this.#reconciler.getEditableField(owner.blockId, owner.fieldKey)
      if (!field || field.key !== owner.fieldKey || field.element !== owner.element || field.mode !== owner.mode) {
        throw new Error('Native completion lost its captured field owner')
      }
    }, {
      origin: 'native-input',
      name: 'native-input',
      historyGroup: group,
      coalesce: true,
      preserveSourceProjection,
      ...(completeField ? { finalizeNativeProjection: (_next, changed) => {
        if (!changed) this.#reconciler.completeFieldProjection?.(owner.blockId, field)
      } } : {}),
      ...(selectionBefore === undefined ? {} : { selectionBefore }),
      ...(selectionAfter ? { selectionAfter: () => selectionAfter } : {}),
    })
    if (selectionAfter) this.#selection.restore(selectionAfter)
  }
}
