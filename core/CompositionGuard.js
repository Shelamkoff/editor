/** Keep native IME key handling ahead of editor and block-plugin commands. */
export class CompositionGuard {
  /** @type {HTMLElement} */ #root
  #composing = false

  /** @param {HTMLElement} root */
  constructor(root) {
    this.#root = root
    root.addEventListener('compositionstart', this.#start)
    root.addEventListener('compositionend', this.#end)
    root.addEventListener('focusout', this.#blur)
    // Capture on the document before plugin dropdowns install key handlers.
    // Stop editor listeners only; never prevent the browser's native default.
    root.ownerDocument.addEventListener('keydown', this.#key, true)
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
    this.#root.ownerDocument.removeEventListener('keydown', this.#key, true)
    this.#composing = false
  }
}
