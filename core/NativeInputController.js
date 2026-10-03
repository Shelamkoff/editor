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
  #controller
  #composition = null
  #endingComposition = null
  #coalesceMs
  #now
  #groupSequence = 0
  #lastGroup = null

  constructor({ root, runtime, reconciler, crossSelection = null, coalesceMs = 300 }) {
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
  }

  get isComposing() { return this.#composition !== null }

  setReadOnly(value) {
    if (value === true) {
      this.#composition = null
      this.#endingComposition = null
      this.#lastGroup = null
    }
  }

  handleBeforeInput(event) {
    if (this.#runtime.readOnly) return
    if (event?.isComposing || this.#composition) return
    const inputType = typeof event?.inputType === 'string' ? event.inputType : ''
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      const owner = this.#resolve(event?.target)
      if (!owner) return
      event.preventDefault?.()
      if (inputType === 'historyUndo') this.#runtime.undo()
      else this.#runtime.redo()
      this.#lastGroup = null
      return
    }
    if (
      this.#crossSelection?.active
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
    const owner = this.#resolve(event?.target)
    if (!owner) return
    this.#endingComposition = null
  }

  handleInput(event) {
    if (this.#runtime.readOnly) return
    const owner = this.#resolve(event?.target)
    if (!owner) return

    if (this.#composition || event?.isComposing) return
    if (
      this.#endingComposition
      && this.#endingComposition.blockId === owner.blockId
      && this.#endingComposition.fieldKey === owner.fieldKey
    ) {
      return
    }

    const inputType = typeof event?.inputType === 'string' ? event.inputType : ''
    this.#commit(owner, {
      group: this.#historyGroup(owner),
      preserveSourceProjection: SOURCE_PROJECTION_INPUTS.has(inputType),
    })
  }

  handleCompositionStart(event) {
    if (this.#runtime.readOnly) return
    const owner = this.#resolve(event?.target)
    if (!owner) return
    this.#composition = owner
    this.#endingComposition = null
  }

  handleCompositionEnd(event) {
    if (this.#runtime.readOnly) {
      this.#composition = null
      this.#endingComposition = null
      return
    }

    const owner = this.#composition ?? this.#resolve(event?.target)
    this.#composition = null
    if (!owner) return

    this.#endingComposition = owner
    queueMicrotask(() => {
      const pending = this.#endingComposition
      if (
        !pending
        || pending.blockId !== owner.blockId
        || pending.fieldKey !== owner.fieldKey
        || this.#runtime.readOnly
      ) return
      this.#endingComposition = null
      this.#commit(owner, {
        group: this.#historyGroup(owner, ':composition'),
        preserveSourceProjection: true,
      })
    })
  }

  destroy() {
    this.#controller.abort()
    this.#composition = null
    this.#endingComposition = null
    this.#lastGroup = null
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

  #commit(owner, { group, preserveSourceProjection }) {
    this.#runtime.syncBlockFromProjection(owner.blockId, () => {}, {
      origin: 'native-input',
      name: 'native-input',
      historyGroup: group,
      coalesce: true,
      preserveSourceProjection,
    })
  }
}
