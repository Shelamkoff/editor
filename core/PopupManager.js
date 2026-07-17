/** @typedef {import('./types').InlinePluginContext} InlinePluginContextContract */
/**
 * Manages floating popups for inline plugins (color picker, etc.).
 * Positions popup near an anchor element, handles outside-click dismissal.
 *
 * @implements {InlinePluginContextContract}
 */
export class PopupManager {
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
  }

  get readOnly() {
    return this.#isReadOnly()
  }

  /**
   * Set the editor root element (popup inherits CSS variables from it).
   * @param {HTMLElement} rootEl
   */
  setRoot(rootEl) {
    this.#rootEl = rootEl
  }

  /**
   * Show a popup near an anchor element.
   * @param {HTMLElement} anchor
   * @param {HTMLElement} content
   * @param {(() => void) | undefined} cleanup
   */
  showPopup(anchor, content, cleanup) {
    if (this.readOnly) {
      this.#runCleanup(cleanup)
      return
    }
    this.hidePopup()

    const popup = document.createElement('div')
    popup.className = 'oe-ip-popup'
    popup.appendChild(content)

    // Append inside editor root to inherit CSS variables (theme)
    const container = this.#rootEl || document.body
    container.appendChild(popup)

    // Measure after append so offsetHeight is available.
    // Popup uses position:fixed, so viewport coordinates are correct.
    const rect = anchor.getBoundingClientRect()
    const popupHeight = popup.offsetHeight || 260
    const spaceBelow = window.innerHeight - rect.bottom - 8

    popup.style.left = `${rect.left}px`
    if (spaceBelow >= popupHeight) {
      popup.style.top = `${rect.bottom + 4}px`
    } else {
      popup.style.top = `${rect.top - popupHeight - 4}px`
    }

    this.#activePopup = popup
    this.#activeCleanup = cleanup || null

    // Arm after the opening event finishes, without depending on a rendered
    // animation frame (background tabs may suspend rAF indefinitely).
    queueMicrotask(() => {
      if (this.#activePopup !== popup) return
      this.#outsideClickHandler = (/** @type {MouseEvent} */ e) => {
        const target = e.target
        if (!(target instanceof Node)) return
        if (popup.contains(target)) return
        if (anchor.contains(target)) return
        this.hidePopup()
      }
      document.addEventListener('mousedown', this.#outsideClickHandler, true)
    })
  }

  hidePopup() {
    if (this.#outsideClickHandler) {
      document.removeEventListener('mousedown', this.#outsideClickHandler, true)
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
      ?? window.getSelection()?.anchorNode
      ?? document.activeElement
    const element = candidate?.nodeType === Node.ELEMENT_NODE
      ? /** @type {Element} */ (candidate)
      : candidate?.parentElement
    const editable = element?.closest?.('[contenteditable="true"]')
    if (editable && (!this.#rootEl || this.#rootEl.contains(editable))) {
      editable.dispatchEvent(new InputEvent('input', { bubbles: true }))
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
    this.hidePopup()
  }
}
