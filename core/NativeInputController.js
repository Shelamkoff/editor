// @ts-check
import { editingHostForEvent } from '../shared/editableFields.js'

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
  #controller
  #composition = null
  #preparedComposition = null
  #endingComposition = null
  #coalesceMs
  #now
  #groupSequence = 0
  #lastGroup = null
  #pendingInput = null

  constructor({ root, runtime, reconciler, crossSelection = null, selection = null, coalesceMs = 300 }) {
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

  setReadOnly(value, discardProjectionEdits = () => this.#runtime.discardProjectionEdits?.()) {
    if (value === true) {
      const discardPreedit = this.#composition !== null || this.#endingComposition !== null
      this.#composition = null
      this.#preparedComposition = null
      this.#endingComposition = null
      this.#lastGroup = null
      this.#pendingInput = null
      if (discardPreedit) discardProjectionEdits()
    }
  }

  handleBeforeInput(event) {
    this.#pendingInput = null
    if (this.#runtime.readOnly || event?.defaultPrevented) return
    if (event?.isComposing || this.#composition) return
    const inputType = typeof event?.inputType === 'string' ? event.inputType : ''
    const owner = this.#resolve(event?.target)
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
    this.#pendingInput = this.#selection ? {
      blockId: owner.blockId, fieldKey: owner.fieldKey,
      generation: this.#runtime.generation, revision: this.#runtime.revision,
      bookmark: this.#selection.capture(),
    } : null
    this.#endingComposition = null
  }

  handleInput(event) {
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
    const pending = this.#pendingInput
    this.#pendingInput = null
    const selectionBefore = pending
      && pending.blockId === owner.blockId && pending.fieldKey === owner.fieldKey
      && pending.generation === this.#runtime.generation && pending.revision === this.#runtime.revision
      ? pending.bookmark : undefined
    const isolated = ['insertFromPaste', 'insertFromDrop', 'deleteByCut'].includes(inputType)
    if (isolated) this.#lastGroup = null
    this.#commit(owner, {
      group: this.#historyGroup(owner),
      preserveSourceProjection: SOURCE_PROJECTION_INPUTS.has(inputType),
      selectionBefore,
    })
    if (isolated) this.#lastGroup = null
  }

  handleCompositionStart(event) {
    if (this.#runtime.readOnly) return
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
      generation: this.#runtime.generation,
      revision: this.#runtime.revision,
      selectionBefore: this.#selection?.capture(),
    }
    this.#pendingInput = null
    this.#endingComposition = null
    this.#lastGroup = null
  }

  handleCompositionKey(event) {
    if (this.#runtime.readOnly || this.#composition || event?.defaultPrevented) return
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

  #commit(owner, { group, preserveSourceProjection, selectionBefore = undefined }) {
    // Paste/cut can rebuild the authoring host after decoding its native edit.
    // Keep the logical caret without retaining untrusted clipboard markup.
    const captured = !preserveSourceProjection ? this.#selection?.capture() : null
    const local = point => point?.blockId === owner.blockId && point?.fieldKey === owner.fieldKey
    const selectionAfter = captured && local(captured.anchor) && local(captured.focus) ? captured : null
    this.#runtime.syncBlockFromProjection(owner.blockId, () => {}, {
      origin: 'native-input',
      name: 'native-input',
      historyGroup: group,
      coalesce: true,
      preserveSourceProjection,
      ...(selectionBefore === undefined ? {} : { selectionBefore }),
      ...(selectionAfter ? { selectionAfter: () => selectionAfter } : {}),
    })
    if (selectionAfter) this.#selection.restore(selectionAfter)
  }
}
