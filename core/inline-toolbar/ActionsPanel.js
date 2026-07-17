/**
 * @typedef {Object} ActionsPanelDeps
 * @property {import('../types').IEventBus} events
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {import('../Tooltip').Tooltip} tooltip
 * @property {() => void} updateActiveStates
 * @property {() => void} hideTypeSelector
 * @property {<T>(range: Range, operation: () => T) => T} mutate
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

  /**
   * Try to open the tool's actions panel.
   * @param {import('../types').InlineTool} tool
   * @returns {HTMLElement | null} the rendered panel, or null if the
   *   tool wants `toggle()` semantics instead.
   */
  open(tool) {
    if (!tool.renderActions) return null

    // Save current selection range before focus moves into the panel.
    // Never reuse a range left by a previous panel invocation.
    this.#savedRange = null
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      this.#savedRange = sel.getRangeAt(0).cloneRange()
    }
    if (!this.#savedRange) return null

    /** @type {import('../types').InlineToolActionContext} */
    const ctx = {
      range: this.#savedRange,
      mutate: (operation) => this.#deps.mutate(/** @type {Range} */ (this.#savedRange), operation),
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
    this.#savedRange = null
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
    const start = this.#savedRange.startContainer
    const startElement = start.nodeType === Node.ELEMENT_NODE
      ? /** @type {HTMLElement} */ (start)
      : start.parentElement
    const editingHost = startElement?.closest('[contenteditable="true"]')

    // Focus may still belong to a URL/action input after the panel closes.
    // Move it back to the editing host so the next undo/redo shortcut reaches
    // the editor history. Focus first, then restore the exact range because
    // focusing a contenteditable may collapse the native selection.
    try {
      if (editingHost instanceof globalThis.HTMLElement) {
        editingHost.focus({ preventScroll: true })
      }
      sel.removeAllRanges()
      sel.addRange(this.#savedRange)
    } catch {
      // Range may reference detached DOM nodes (e.g. after undo/redo).
    }
  }
}
