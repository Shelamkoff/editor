export class Tooltip {
  /** @type {HTMLElement} */
  #el

  /** @type {number | ReturnType<typeof setTimeout> | null} */
  #timer = null

  /** @type {Document} */
  #document

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @param {Document} [ownerDocument] */
  constructor(ownerDocument = document) {
    this.#document = ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (ownerDocument.defaultView)
    this.#el = ownerDocument.createElement('div')
    this.#el.className = 'oe-tooltip'
    this.#el.style.display = 'none'
    ownerDocument.body.appendChild(this.#el)
  }

  /**
   * Show tooltip near an anchor element.
   * @param {HTMLElement} anchor
   * @param {string} label
   * @param {string} [shortcut]
   * @param {{ delay?: number }} [opts]
   */
  show(anchor, label, shortcut, opts = {}) {
    this.hide()
    const delay = opts.delay ?? 500
    const callback = () => {
      this.#timer = null
      this.#el.textContent = ''
      const labelSpan = this.#document.createElement('span')
      labelSpan.className = 'oe-tooltip__label'
      labelSpan.textContent = label
      this.#el.appendChild(labelSpan)
      if (shortcut) {
        const shortcutSpan = this.#document.createElement('span')
        shortcutSpan.className = 'oe-tooltip__shortcut'
        shortcutSpan.textContent = shortcut
        this.#el.appendChild(shortcutSpan)
      }
      this.#el.style.display = ''

      const rect = anchor.getBoundingClientRect()
      this.#el.style.left = `${rect.left + rect.width / 2}px`
      this.#el.style.top = `${rect.bottom + 6}px`
    }

    this.#timer = this.#view
      ? this.#view.setTimeout(callback, delay)
      : setTimeout(callback, delay)
  }

  /** Hide the tooltip immediately. */
  hide() {
    if (this.#timer !== null) {
      if (this.#view) this.#view.clearTimeout(/** @type {number} */ (this.#timer))
      else clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (this.#timer))
      this.#timer = null
    }
    this.#el.style.display = 'none'
  }

  /** Clean up. */
  destroy() {
    this.hide()
    this.#el.remove()
  }
}
