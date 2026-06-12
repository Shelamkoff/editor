import { el } from '../dom.js'
import { OFFCANVAS_ANIMATION_MS } from '../constants.js'

/** CSS custom properties copied from the editor root onto the offcanvas wrapper. */
const INHERITED_CSS_VARS = [
  '--oe-bg', '--oe-card', '--oe-card-hover', '--oe-border', '--oe-border-hover',
  '--oe-text-1', '--oe-text-2', '--oe-text-3', '--oe-accent', '--oe-toolbar-bg',
  '--oe-toolbar-border', '--oe-toolbar-shadow', '--oe-radius', '--oe-radius-sm',
  '--oe-font', '--oe-transition', '--oe-surface', '--oe-surface-elevated',
]

/**
 * Mobile offcanvas root + backdrop manager.
 *
 * On mobile the toolbox and block-settings menu are mounted into a wrapper
 * appended to `document.body` (so they can use `position: fixed` against
 * the viewport, not the editor's stacking context). This class owns:
 *  - the per-editor `.oe-offcanvas-root` element
 *  - the optional `.oe-offcanvas-backdrop` and its show/hide lifecycle
 *
 * Multiple editor instances on the same page get their own offcanvas root,
 * keyed by `data-editor-id`.
 */
export class OffcanvasRoot {
  /** @type {HTMLElement} */
  #editorRoot

  /** @type {HTMLElement | null} */
  #backdropEl = null

  /** @type {ReturnType<typeof setTimeout> | null} */
  #backdropTimer = null

  /** @type {() => void} */
  #onBackdropClick

  /**
   * @param {HTMLElement} editorRoot
   * @param {() => void} onBackdropClick
   */
  constructor(editorRoot, onBackdropClick) {
    this.#editorRoot = editorRoot
    this.#onBackdropClick = onBackdropClick
  }

  /**
   * Get (or lazily create) the offcanvas root element for this editor instance.
   * @returns {HTMLElement}
   */
  getRoot() {
    const selector = this.#selector()
    let root = /** @type {HTMLElement | null} */ (document.querySelector(selector))
    if (root) return root

    root = el('div', 'oe-offcanvas-root oe-editor')
    const editorId = this.#editorId()
    if (editorId) root.setAttribute('data-editor-id', editorId)

    // Copy computed CSS custom properties from the editor so the offcanvas
    // surface visually matches the editor theme.
    const styles = getComputedStyle(this.#editorRoot)
    for (const prop of INHERITED_CSS_VARS) {
      const val = styles.getPropertyValue(prop)
      if (val) root.style.setProperty(prop, val)
    }

    document.body.appendChild(root)
    return root
  }

  /**
   * Show the backdrop (creates it if needed). Cancels any pending hide.
   */
  showBackdrop() {
    if (this.#backdropTimer) {
      clearTimeout(this.#backdropTimer)
      this.#backdropTimer = null
    }

    if (!this.#backdropEl) {
      this.#backdropEl = el('div', 'oe-offcanvas-backdrop')
      this.#backdropEl.addEventListener('click', this.#onBackdropClick)
      this.getRoot().appendChild(this.#backdropEl)
    }

    requestAnimationFrame(() => {
      this.#backdropEl?.classList.add('oe-offcanvas-backdrop--visible')
    })
  }

  /**
   * Animate the backdrop out, then remove it.
   */
  hideBackdrop() {
    if (!this.#backdropEl) return
    this.#backdropEl.classList.remove('oe-offcanvas-backdrop--visible')
    this.#backdropTimer = setTimeout(() => {
      this.#backdropEl?.remove()
      this.#backdropEl = null
      this.#backdropTimer = null
    }, OFFCANVAS_ANIMATION_MS)
  }

  /**
   * Final cleanup — remove the backdrop and the offcanvas root.
   */
  destroy() {
    if (this.#backdropTimer) {
      clearTimeout(this.#backdropTimer)
      this.#backdropTimer = null
    }
    this.#backdropEl?.remove()
    this.#backdropEl = null
    document.querySelector(this.#selector())?.remove()
  }

  /** @returns {string} */
  #editorId() {
    return this.#editorRoot.dataset.editorId || this.#editorRoot.id || ''
  }

  /** @returns {string} */
  #selector() {
    const id = this.#editorId()
    return id ? `.oe-offcanvas-root[data-editor-id="${id}"]` : '.oe-offcanvas-root'
  }
}
