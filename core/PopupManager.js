import { EditorEvent } from './editorEvents.js'

/** @typedef {import('./types').InlinePluginContext} InlinePluginContextContract */
/**
 * Manages floating popups for inline plugins (color picker, etc.).
 * Positions popup near an anchor element, handles outside-click dismissal.
 *
 * @implements {InlinePluginContextContract}
 */
export class PopupManager {
  /** @type {HTMLElement | null} */
  #anchor = null
  /** @type {import('./types').IBlock | undefined} */
  #anchorBlock
  /** @type {MutationObserver | null} */
  #anchorObserver = null
  /** @type {(() => void)[]} */
  #unsubscribers = []
  #destroyed = false
  /** Newer show/hide calls supersede a replacement interrupted by cleanup. */
  #generation = 0
  /** @type {HTMLElement | null} */
  #activePopup = null

  /** @type {((e: MouseEvent) => void) | null} */
  #outsideClickHandler = null

  /** @type {(() => void) | null} */
  #activeCleanup = null

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {string} */
  #changedEvent

  /** @type {HTMLElement | null} */
  #rootEl = null

  /** @type {Document | null} */
  #document = null

  /** @type {(Window & typeof globalThis) | null} */
  #view = null

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #mutations

  /** @type {() => boolean} */
  #isReadOnly

  /**
   * @param {import('./types').IEventBus} events
   * @param {string} changedEvent
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./CommandDispatcher').CommandDispatcher} commands
   * @param {() => boolean} [isReadOnly]
   */
  constructor(events, changedEvent, blocks, commands, isReadOnly = () => false) {
    this.#events = events
    this.#changedEvent = /** @type {*} */ (changedEvent)
    this.#blocks = blocks
    this.#mutations = commands
    this.#isReadOnly = isReadOnly
    for (const event of [EditorEvent.CHANGED, EditorEvent.DOCUMENT_REPLACED,
      EditorEvent.BLOCK_REMOVED, EditorEvent.BLOCK_CONVERTED]) {
      this.#unsubscribers.push(events.on(event, () => this.#closeIfStale()))
    }
  }

  get readOnly() {
    return this.#destroyed || this.#isReadOnly()
  }

  /**
   * Set the editor root element (popup inherits CSS variables from it).
   * @param {HTMLElement} rootEl
   */
  setRoot(rootEl) {
    this.#rootEl = rootEl
    this.#document = rootEl.ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)
  }

  /**
   * Show a popup near an anchor element.
   * @param {HTMLElement} anchor
   * @param {HTMLElement} content
   * @param {(() => void) | undefined} cleanup
   */
  showPopup(anchor, content, cleanup) {
    if (this.readOnly || (this.#rootEl && !this.#rootEl.contains(anchor))) {
      this.#runCleanup(cleanup)
      return
    }
    const generation = ++this.#generation
    this.#hidePopup()
    // The previous disposer is consumer code: it can close/destroy the
    // editor, detach the anchor, or open another popup. Do not overwrite that
    // newer ownership or mount into a root that has become read-only.
    if (generation !== this.#generation || this.readOnly
        || (this.#rootEl && !this.#rootEl.contains(anchor))) {
      this.#runCleanup(cleanup)
      return
    }

    const ownerDocument = this.#document ?? anchor.ownerDocument
    const ownerView = this.#view ?? ownerDocument.defaultView
    const popup = ownerDocument.createElement('div')
    popup.className = 'oe-ip-popup'
    popup.appendChild(content)

    // Append inside editor root to inherit CSS variables (theme).
    const container = this.#rootEl || ownerDocument.body
    container.appendChild(popup)

    // Measure after append so offsetHeight is available.
    // Popup uses position:fixed, so viewport coordinates are correct.
    const rect = anchor.getBoundingClientRect()
    const popupHeight = popup.offsetHeight || 260
    const viewportHeight = ownerView?.innerHeight ?? Number.POSITIVE_INFINITY
    const spaceBelow = viewportHeight - rect.bottom - 8

    popup.style.left = `${rect.left}px`
    if (spaceBelow >= popupHeight) {
      popup.style.top = `${rect.bottom + 4}px`
    } else {
      popup.style.top = `${rect.top - popupHeight - 4}px`
    }

    this.#activePopup = popup
    this.#activeCleanup = cleanup || null
    this.#anchor = anchor
    this.#anchorBlock = this.#blocks.getBlockByChildNode(anchor)
    // Native DOM edits can remove a widget without a structural block event.
    const MutationObserverCtor = ownerView?.MutationObserver
    if (this.#rootEl && MutationObserverCtor) {
      this.#anchorObserver = new MutationObserverCtor(() => this.#closeIfStale())
      this.#anchorObserver.observe(this.#rootEl, { childList: true, subtree: true })
    }

    // Arm after the opening event finishes, without depending on a rendered
    // animation frame (background tabs may suspend rAF indefinitely).
    queueMicrotask(() => {
      if (this.#activePopup !== popup) return
      this.#outsideClickHandler = (/** @type {MouseEvent} */ e) => {
        const target = e.target
        if (!target || typeof target !== 'object' || !('nodeType' in target)) return
        const node = /** @type {Node} */ (target)
        if (popup.contains(node)) return
        if (anchor.contains(node)) return
        this.hidePopup()
      }
      ownerDocument.addEventListener('mousedown', this.#outsideClickHandler, true)
    })
  }

  #closeIfStale() {
    if (!this.#anchor) return
    const detached = this.#rootEl ? !this.#rootEl.contains(this.#anchor) : !this.#anchor.isConnected
    const retired = this.#anchorBlock && this.#blocks.getBlockById(this.#anchorBlock.id) !== this.#anchorBlock
    if (detached || retired) this.hidePopup()
  }

  hidePopup() {
    this.#generation++
    this.#hidePopup()
  }

  /** Release the current owner before entering user cleanup. */
  #hidePopup() {
    this.#anchorObserver?.disconnect()
    this.#anchorObserver = null
    this.#anchor = null
    this.#anchorBlock = undefined
    if (this.#outsideClickHandler) {
      this.#document?.removeEventListener('mousedown', this.#outsideClickHandler, true)
      this.#outsideClickHandler = null
    }
    if (this.#activePopup) {
      this.#activePopup.remove()
      this.#activePopup = null
    }

    const cleanup = this.#activeCleanup
    this.#activeCleanup = null
    this.#runCleanup(cleanup)
  }

  /**
   * A plugin disposer must not interrupt a mode switch or editor teardown.
   * @param {(() => void) | null | undefined} cleanup
   */
  #runCleanup(cleanup) {
    if (!cleanup) return
    try {
      cleanup()
    } catch (error) {
      console.error('Inline popup cleanup failed', error)
    }
  }

  /**
   * Notify through the concrete editing host whenever one can be resolved.
   * This lets the editor invalidate the exact block cache rather than only
   * scheduling a document-level change callback.
   * @param {import('./types').DOMNode} [target]
   */
  notifyChanged(target) {
    if (this.readOnly) return
    const candidate = target
      ?? this.#view?.getSelection()?.anchorNode
      ?? this.#document?.activeElement
    const element = candidate?.nodeType === 1
      ? /** @type {Element} */ (candidate)
      : candidate?.parentElement
    const editable = element?.closest?.('[contenteditable="true"]')
    if (editable && (!this.#rootEl || this.#rootEl.contains(editable))) {
      const InputEventCtor = this.#view?.InputEvent
      if (InputEventCtor) editable.dispatchEvent(new InputEventCtor('input', { bubbles: true }))
      else this.#events.emit(/** @type {string} */ (this.#changedEvent))
      return
    }
    this.#events.emit(/** @type {string} */ (this.#changedEvent))
  }

  /**
   * Execute one inline-widget command against its exact owning block.
   * Detached/stale widget callbacks are ignored.
   * @template T
   * @param {import('./types').DOMNode} target
   * @param {() => T} operation
   * @returns {T | undefined}
   */
  mutate(target, operation) {
    if (this.readOnly) return undefined
    const block = this.#blocks.getBlockByChildNode(target)
    if (!block) return undefined
    return this.#mutations.runForBlock(block, operation)
  }

  destroy() {
    this.#destroyed = true
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe()
    this.hidePopup()
  }
}
