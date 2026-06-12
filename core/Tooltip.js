export class Tooltip {
  /** @type {HTMLElement} */
  #el

  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null

  constructor() {
    this.#el = document.createElement('div')
    this.#el.className = 'oe-tooltip'
    this.#el.style.display = 'none'
    document.body.appendChild(this.#el)
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

    this.#timer = setTimeout(() => {
      this.#el.textContent = ''
      const labelSpan = document.createElement('span')
      labelSpan.className = 'oe-tooltip__label'
      labelSpan.textContent = label
      this.#el.appendChild(labelSpan)
      if (shortcut) {
        const shortcutSpan = document.createElement('span')
        shortcutSpan.className = 'oe-tooltip__shortcut'
        shortcutSpan.textContent = shortcut
        this.#el.appendChild(shortcutSpan)
      }
      this.#el.style.display = ''

      const rect = anchor.getBoundingClientRect()
      this.#el.style.left = `${rect.left + rect.width / 2}px`
      this.#el.style.top = `${rect.bottom + 6}px`
    }, delay)
  }

  /** Hide the tooltip immediately. */
  hide() {
    if (this.#timer) {
      clearTimeout(this.#timer)
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
