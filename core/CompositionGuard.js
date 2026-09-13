/** Keep native IME key handling ahead of editor and block-plugin commands. */
export class CompositionGuard {
  /** @type {HTMLElement} */ #root
  /** @type {Window} */ #view
  #composing = false

  /** @param {HTMLElement} root */
  constructor(root) {
    this.#root = root
    this.#view = root.ownerDocument.defaultView ?? window
    root.addEventListener('compositionstart', this.#start)
    root.addEventListener('compositionend', this.#end)
    root.addEventListener('focusout', this.#blur)
    // Window capture runs before document-level plugin dropdown listeners.
    // Stop editor listeners only; never prevent the browser's native default.
    this.#view.addEventListener('keydown', this.#key, true)
  }

  #start = () => { this.#composing = true }
  #end = () => { this.#composing = false }
  #blur = (/** @type {FocusEvent} */ event) => {
    if (!this.#root.contains(/** @type {Node | null} */ (event.relatedTarget))) this.#composing = false
  }
  #key = (/** @type {KeyboardEvent} */ event) => {
    if (!this.#root.contains(/** @type {Node | null} */ (event.target))) return
    if (this.#composing || event.isComposing || event.keyCode === 229) event.stopImmediatePropagation()
  }

  destroy() {
    this.#root.removeEventListener('compositionstart', this.#start)
    this.#root.removeEventListener('compositionend', this.#end)
    this.#root.removeEventListener('focusout', this.#blur)
    this.#view.removeEventListener('keydown', this.#key, true)
    this.#composing = false
  }
}
