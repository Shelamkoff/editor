import { EditorEvent } from '../editorEvents.js'

/**
 * @typedef {Object} ActionsPanelDeps
 * @property {import('../types').IEventBus} events
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {import('../Tooltip').Tooltip} tooltip
 * @property {() => void} updateActiveStates
 * @property {() => void} hideTypeSelector
 * @property {() => void} onClosed
 *   Called after the panel is removed and the saved selection has been
 *   restored. InlineToolbar uses this to flip its view back to "buttons"
 *   and re-show the buttons panel.
 */

/**
 * Drill-down "actions" panel for inline tools that have a `renderActions`
 * implementation (e.g. link editor, font size picker).
 *
 * Lifecycle:
 *  1. `open(tool, panelHost)` — calls `tool.renderActions(ctx)`. If it
 *     returns null, the tool wants plain `toggle()` semantics — caller
 *     handles that branch.
 *  2. The panel is appended to `panelHost`. The buttons panel is hidden
 *     by the caller.
 *  3. `close()` — removes the panel and restores the saved selection.
 *
 * Manages a saved `Range` so the user's selection survives focus shifts
 * into the actions UI (input fields, buttons).
 */
export class ActionsPanel {
  /** @type {ActionsPanelDeps} */
  #deps

  /** @type {Range | null} saved range before opening the panel */
  #savedRange = null

  /** @type {HTMLElement | null} */
  #panel = null

  /** @param {ActionsPanelDeps} deps */
  constructor(deps) {
    this.#deps = deps
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#panel !== null
  }

  /**
   * Try to open the tool's actions panel.
   * @param {import('../types').InlineTool} tool
   * @returns {HTMLElement | null} the rendered panel, or null if the
   *   tool wants `toggle()` semantics instead.
   */
  open(tool) {
    if (!tool.renderActions) return null

    // Save current selection range before focus moves into the panel.
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      this.#savedRange = sel.getRangeAt(0).cloneRange()
    }
    if (!this.#savedRange) return null

    /** @type {import('../types').InlineToolActionContext} */
    const ctx = {
      range: this.#savedRange,
      restoreSelection: () => this.#restoreSelection(),
      close: () => this.close(),
      showTooltip: (anchor, label) => this.#deps.tooltip.show(anchor, label),
      hideTooltip: () => this.#deps.tooltip.hide(),
    }

    const panel = tool.renderActions(ctx)
    if (!panel) return null

    this.#deps.hideTypeSelector()
    this.#panel = panel
    return panel
  }

  /**
   * Close the panel and restore selection.
   * No-op if no panel is open.
   */
  close() {
    if (!this.#panel) return
    this.#deps.tooltip.hide()
    this.#panel.remove()
    this.#panel = null

    this.#restoreSelection()
    this.#deps.updateActiveStates()
    this.#deps.onClosed()
  }

  /** Discard saved range and remove any live panel without restoring. */
  reset() {
    if (this.#panel) {
      this.#panel.remove()
      this.#panel = null
    }
    this.#savedRange = null
  }

  #restoreSelection() {
    if (!this.#savedRange) return
    // If cross-block selection is active, the tool already restored it via cbs.
    if (this.#deps.crossBlockSelection.range) return
    const sel = window.getSelection()
    if (!sel) return
    // If selection is already non-collapsed (tool already restored it), don't overwrite.
    if (!sel.isCollapsed && sel.rangeCount > 0) return
    try {
      sel.removeAllRanges()
      sel.addRange(this.#savedRange)
    } catch {
      // Range may reference detached DOM nodes (e.g. after undo/redo).
    }
  }
}
