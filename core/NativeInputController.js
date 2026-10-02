// @ts-check

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

function historyGroup(owner, suffix = '') {
  return `native:${owner.blockId}:${owner.fieldKey}${suffix}`
}

export class NativeInputController {
  #root
  #runtime
  #reconciler
  #controller
  #composition = null
  #endingComposition = null

  constructor({ root, runtime, reconciler }) {
    if (!root?.addEventListener) throw new TypeError('NativeInputController requires an event root')
    if (!runtime?.syncBlockFromProjection) throw new TypeError('NativeInputController requires a DocumentRuntime')
    if (!reconciler?.resolveEditableTarget) throw new TypeError('NativeInputController requires a BlockReconciler')

    this.#root = root
    this.#runtime = runtime
    this.#reconciler = reconciler

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
    }
  }

  handleBeforeInput(event) {
    if (this.#runtime.readOnly) return
    const owner = this.#resolve(event?.target)
    if (!owner) return
    if (event?.isComposing || this.#composition) return
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
      group: historyGroup(owner),
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
        group: historyGroup(owner, ':composition'),
        preserveSourceProjection: true,
      })
    })
  }

  destroy() {
    this.#controller.abort()
    this.#composition = null
    this.#endingComposition = null
  }

  #resolve(target) {
    if (!target || typeof target !== 'object') return null
    return this.#reconciler.resolveEditableTarget(target)
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
