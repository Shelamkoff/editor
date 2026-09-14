import { el } from '../dom.js'
import { OFFCANVAS_ANIMATION_MS } from '../constants.js'

let offcanvasSequence = 0

/** CSS custom properties copied from the editor root onto the offcanvas wrapper. */
const INHERITED_CSS_VARS = [
  '--oe-bg', '--oe-card', '--oe-card-hover', '--oe-border', '--oe-border-hover',
  '--oe-text-1', '--oe-text-2', '--oe-text-3', '--oe-accent', '--oe-toolbar-bg',
  '--oe-toolbar-border', '--oe-toolbar-shadow', '--oe-radius', '--oe-radius-sm',
  '--oe-font', '--oe-transition', '--oe-surface', '--oe-surface-elevated',
]

/** Mobile offcanvas root + backdrop manager. */
export class OffcanvasRoot {
  /** @type {HTMLElement} */ #editorRoot
  /** @type {Document} */ #document
  /** @type {(Window & typeof globalThis) | null} */ #view
  /** Legacy synthetic tests may omit ownerDocument entirely. */
  #ambientFallback = false
  #instanceId = `oe-offcanvas-${++offcanvasSequence}`
  /** @type {HTMLElement | null} */ #backdropEl = null
  /** @type {ReturnType<typeof setTimeout> | null} */ #backdropTimer = null
  #backdropGeneration = 0
  /** @type {() => void} */ #onBackdropClick

  /** @param {HTMLElement} editorRoot @param {() => void} onBackdropClick */
  constructor(editorRoot, onBackdropClick) {
    this.#editorRoot = editorRoot
    const ownerDocument = editorRoot.ownerDocument ?? null
    this.#document = ownerDocument ?? document
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (ownerDocument?.defaultView ?? null)
    this.#ambientFallback = !ownerDocument
    this.#onBackdropClick = onBackdropClick
  }

  getRoot() {
    const selector = this.#selector()
    let root = /** @type {HTMLElement | null} */ (this.#document.querySelector(selector))
    if (root) return root

    root = el('div', 'oe-offcanvas-root oe-editor', undefined, this.#document)
    root.setAttribute('data-editor-id', this.#instanceId)

    const getStyle = this.#view?.getComputedStyle?.bind(this.#view)
      ?? (this.#ambientFallback ? globalThis.getComputedStyle : undefined)
    const styles = getStyle?.(this.#editorRoot)
    if (styles) {
      for (const prop of INHERITED_CSS_VARS) {
        const val = styles.getPropertyValue(prop)
        if (val) root.style.setProperty(prop, val)
      }
    }

    this.#document.body.appendChild(root)
    return root
  }

  showBackdrop() {
    if (this.#backdropTimer) {
      const clearTimer = this.#view?.clearTimeout?.bind(this.#view)
        ?? (this.#ambientFallback ? clearTimeout : null)
      clearTimer?.(this.#backdropTimer)
      this.#backdropTimer = null
    }

    if (!this.#backdropEl) {
      this.#backdropEl = el('div', 'oe-offcanvas-backdrop', undefined, this.#document)
      this.#backdropEl.addEventListener('click', this.#onBackdropClick)
      this.getRoot().appendChild(this.#backdropEl)
    }

    const generation = ++this.#backdropGeneration
    const reveal = () => {
      if (generation !== this.#backdropGeneration) return
      this.#backdropEl?.classList.add('oe-offcanvas-backdrop--visible')
    }
    const requestFrame = this.#view?.requestAnimationFrame?.bind(this.#view)
      ?? (this.#ambientFallback ? requestAnimationFrame : null)
    if (requestFrame) requestFrame(reveal)
    else queueMicrotask(reveal)
  }

  hideBackdrop() {
    ++this.#backdropGeneration
    if (!this.#backdropEl) return
    this.#backdropEl.classList.remove('oe-offcanvas-backdrop--visible')
    const remove = () => {
      this.#backdropEl?.remove()
      this.#backdropEl = null
      this.#backdropTimer = null
    }
    const setTimer = this.#view?.setTimeout?.bind(this.#view)
      ?? (this.#ambientFallback ? setTimeout : null)
    if (setTimer) this.#backdropTimer = setTimer(remove, OFFCANVAS_ANIMATION_MS)
    else remove()
  }

  destroy() {
    ++this.#backdropGeneration
    if (this.#backdropTimer) {
      const clearTimer = this.#view?.clearTimeout?.bind(this.#view)
        ?? (this.#ambientFallback ? clearTimeout : null)
      clearTimer?.(this.#backdropTimer)
      this.#backdropTimer = null
    }
    this.#backdropEl?.remove()
    this.#backdropEl = null
    this.#document.querySelector(this.#selector())?.remove()
  }

  #selector() {
    return `.oe-offcanvas-root[data-editor-id="${this.#instanceId}"]`
  }
}
