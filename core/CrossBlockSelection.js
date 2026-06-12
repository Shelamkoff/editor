/**
 * Stores the cross-block Range that native Selection cannot represent.
 * Browsers clip Selection to the focused contentEditable, so this service
 * preserves the full range across editing hosts for copy/cut/format/convert.
 *
 * Also manages the visual side-effects: CSS Highlight API painting and
 * the `.oe-editor--cross-selecting` class that suppresses `::selection`.
 */
/** Highlight key used across the editor for cross-block visual highlight. */
const HIGHLIGHT_KEY = 'oe-cross-select'

export class CrossBlockSelection {
  /** @type {Range | null} */
  #range = null

  /** @returns {Range | null} */
  get range() {
    return this.#range
  }

  /** @param {Range} range */
  set(range) {
    this.#range = range
  }

  clear() {
    this.#range = null
  }

  /** @returns {Range | null} */
  clone() {
    return this.#range?.cloneRange() ?? null
  }

  /**
   * Show a visual-only CSS Highlight for a range (no state change).
   * @param {Range} range
   */
  static showHighlight(range) {
    if (typeof Highlight !== 'undefined' && CSS.highlights) {
      CSS.highlights.set(HIGHLIGHT_KEY, new Highlight(range))
    }
  }

  /**
   * Remove the visual-only CSS Highlight (no state change).
   */
  static hideHighlight() {
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      CSS.highlights.delete(HIGHLIGHT_KEY)
    }
  }

  /**
   * Store the range and activate visual highlight.
   * @param {Range} range
   * @param {HTMLElement} rootEl - `.oe-editor` element
   */
  activate(range, rootEl) {
    this.#range = range
    rootEl.classList.add('oe-editor--cross-selecting')
    CrossBlockSelection.showHighlight(range)
  }

  /**
   * Clear the stored range and remove visual highlight.
   * @param {HTMLElement} [rootEl] - `.oe-editor` element
   */
  deactivate(rootEl) {
    this.#range = null
    if (rootEl) rootEl.classList.remove('oe-editor--cross-selecting')
    CrossBlockSelection.hideHighlight()
  }
}
