/**
 * @typedef {Object} ActionsPanelDeps
 * @property {HTMLElement} rootEl
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

  /** Contexts are capabilities owned by one opening, never by the next panel. */
  #generation = 0
  #destroyed = false

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @param {ActionsPanelDeps} deps */
  constructor(deps) {
    this.#deps = deps
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (deps.rootEl.ownerDocument.defaultView)
  }

  /**
   * Try to open the tool's actions panel.
   * @param {import('../types').InlineTool} tool
   * @returns {HTMLElement | null} the rendered panel, or null if the
   *   tool wants `toggle()` semantics instead.
   */
  open(tool) {
    if (this.#destroyed) return null
    this.reset()
    const generation = this.#generation
    if (!tool.renderActions) return null

    // Save current selection range before focus moves into the panel.
    // Never reuse a range left by a previous panel invocation.
    this.#savedRange = null
    const sel = this.#view?.getSelection()
    if (sel && sel.rangeCount > 0) {
      const candidate = sel.getRangeAt(0)
      if (this.#deps.rootEl.contains(candidate.startContainer)
          && this.#deps.rootEl.contains(candidate.endContainer)) {
        this.#savedRange = candidate.cloneRange()
      }
    }
    if (!this.#savedRange) return null

    const range = this.#savedRange
    // A live Range may move up to the editor root when its original nodes are
    // removed. Keep the original editing hosts as lifetime witnesses too.
    const startHost = this.#editingHost(range.startContainer)
    const endHost = this.#editingHost(range.endContainer)
    const current = () => !this.#destroyed && generation === this.#generation
    const live = () => current() && this.#ownsRange(range)
      && (!startHost || this.#deps.rootEl.contains(startHost))
      && (!endHost || this.#deps.rootEl.contains(endHost))

    /** @type {import('../types').InlineToolActionContext} */
    const ctx = {
      range,
      mutate: (operation) => live() ? this.#deps.mutate(range, operation) : undefined,
      restoreSelection: () => { if (live()) this.#restoreSelection(range) },
      close: () => { if (current()) this.close({ restoreSelection: live() }) },
      showTooltip: (anchor, label) => { if (live()) this.#deps.tooltip.show(anchor, label) },
      hideTooltip: () => { if (current()) this.#deps.tooltip.hide() },
    }

    let panel
    try {
      panel = tool.renderActions(ctx)
    } catch (error) {
      if (current()) this.reset()
      throw error
    }
    if (!panel) {
      if (current()) this.reset()
      return null
    }
    if (!current()) {
      panel.remove()
      throw new Error('Inline actions panel was superseded during rendering')
    }

    this.#deps.hideTypeSelector()
    this.#panel = panel
    return panel
  }

  /**
   * Close the panel and restore selection.
   * No-op if no panel is open.
   */
  close({ restoreSelection = true } = {}) {
    if (!this.#panel) return
    const panel = this.#panel
    const range = this.#savedRange
    this.#generation++
    this.#panel = null
    this.#savedRange = null
    this.#deps.tooltip.hide()
    panel.remove()

    if (restoreSelection) this.#restoreSelection(range)
    this.#deps.updateActiveStates()
    this.#deps.onClosed()
  }

  /** Discard saved range and remove any live panel without restoring. */
  reset() {
    this.#generation++
    const panel = this.#panel
    this.#panel = null
    this.#savedRange = null
    panel?.remove()
  }

  destroy() {
    this.#destroyed = true
    this.reset()
  }

  /** @param {Node} node */
  #editingHost(node) {
    const element = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
    return element?.closest('[contenteditable="true"]') ?? null
  }

  /** @param {Range | null} range */
  #ownsRange(range) {
    return !!range && this.#deps.rootEl.contains(range.startContainer)
      && this.#deps.rootEl.contains(range.endContainer)
  }

  /** @param {Range | null} range */
  #restoreSelection(range) {
    if (!this.#ownsRange(range)) return
    // If cross-block selection is active, the tool already restored it via cbs.
    if (this.#deps.crossBlockSelection.range) return
    const sel = this.#view?.getSelection()
    if (!sel) return
    const start = range.startContainer
    const startElement = start.nodeType === 1
      ? /** @type {HTMLElement} */ (start)
      : start.parentElement
    const editingHost = /** @type {HTMLElement | null | undefined} */ (startElement?.closest('[contenteditable="true"]'))

    // Focus may still belong to a URL/action input after the panel closes.
    // Move it back to the editing host so the next undo/redo shortcut reaches
    // the editor history. Focus first, then restore the exact range because
    // focusing a contenteditable may collapse the native selection.
    try {
      const HTMLElementCtor = this.#view?.HTMLElement
      if (editingHost && (HTMLElementCtor ? editingHost instanceof HTMLElementCtor : typeof editingHost.focus === 'function')) {
        editingHost.focus({ preventScroll: true })
      }
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      // Range may reference detached DOM nodes (e.g. after undo/redo).
    }
  }
}
