/**
 * Manages floating popups for inline plugins (color picker, etc.).
 * Positions popup near an anchor element, handles outside-click dismissal.
 *
 * Implements InlinePluginContext (showPopup, hidePopup, notifyChanged).
 */
export class PopupManager {
  /** @type {HTMLElement | null} */
  #activePopup = null

  /** @type {((e: MouseEvent) => void) | null} */
  #outsideClickHandler = null

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {string} */
  #changedEvent

  /** @type {HTMLElement | null} */
  #rootEl = null

  /**
   * @param {import('./types').IEventBus} events
   * @param {string} changedEvent
   */
  constructor(events, changedEvent) {
    this.#events = events
    this.#changedEvent = /** @type {*} */ (changedEvent)
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
   */
  showPopup(anchor, content) {
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

    requestAnimationFrame(() => {
      this.#outsideClickHandler = (/** @type {MouseEvent} */ e) => {
        if (popup.contains(/** @type {Node} */ (e.target))) return
        if (anchor.contains(/** @type {Node} */ (e.target))) return
        this.hidePopup()
      }
      document.addEventListener('mousedown', this.#outsideClickHandler, true)
    })
  }

  hidePopup() {
    if (this.#activePopup) {
      this.#activePopup.remove()
      this.#activePopup = null
    }
    if (this.#outsideClickHandler) {
      document.removeEventListener('mousedown', this.#outsideClickHandler, true)
      this.#outsideClickHandler = null
    }
  }

  notifyChanged() {
    this.#events.emit(/** @type {string} */ (this.#changedEvent))
  }

  destroy() {
    this.hidePopup()
  }
}
