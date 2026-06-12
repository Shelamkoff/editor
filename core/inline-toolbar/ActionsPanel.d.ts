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
    /** @param {ActionsPanelDeps} deps */
    constructor(deps: ActionsPanelDeps);
    /** @returns {boolean} */
    get isOpen(): boolean;
    /**
     * Try to open the tool's actions panel.
     * @param {import('../types').InlineTool} tool
     * @returns {HTMLElement | null} the rendered panel, or null if the
     *   tool wants `toggle()` semantics instead.
     */
    open(tool: import("../types").InlineTool): HTMLElement | null;
    /**
     * Close the panel and restore selection.
     * No-op if no panel is open.
     */
    close(): void;
    /** Discard saved range and remove any live panel without restoring. */
    reset(): void;
    #private;
}
export type ActionsPanelDeps = {
    events: import("../types").IEventBus;
    crossBlockSelection: import("../types").ICrossBlockSelection;
    tooltip: import("../Tooltip").Tooltip;
    updateActiveStates: () => void;
    hideTypeSelector: () => void;
    /**
     *   Called after the panel is removed and the saved selection has been
     *   restored. InlineToolbar uses this to flip its view back to "buttons"
     *   and re-show the buttons panel.
     */
    onClosed: () => void;
};
