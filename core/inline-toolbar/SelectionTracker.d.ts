/**
 * @typedef {Object} SelectionTrackerDeps
 * @property {HTMLElement} rootEl
 * @property {import('../types').IBlockReader} blocks
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => void} updateActiveStates
 * @property {() => boolean} isInActionsView
 *   Returns true while the actions panel is open — selectionchange should be ignored.
 * @property {() => boolean} isTypeSelectorOpen
 * @property {() => boolean} hasOpenToolDropdown
 */
/**
 * Tracks the user's selection and decides when the inline toolbar should
 * appear or disappear.
 *
 * Listens to:
 *  - `selectionchange` on document — fires when the caret moves or text
 *    is selected. Filtered through several "is something else interactive"
 *    checks (actions panel, type selector, tool dropdown, mouse-down).
 *  - `mousedown`/`mouseup` on document — defers checks until the user
 *    finishes their drag-select. Without this we'd flicker the toolbar
 *    while the selection is still growing.
 *  - `mousedown` on document (capture) — closes the toolbar when the
 *    user clicks outside it.
 *
 * Decision logic in `checkSelection`:
 *  - empty/no selection → hide (unless cross-block selection is active)
 *  - single text block with `hasInlineTools` → show
 *  - cross-block range covering only text-blocks → show
 *  - any non-text block in the range → hide
 */
export class SelectionTracker {
    /**
     * @param {HTMLElement} toolbarEl
     * @param {SelectionTrackerDeps} deps
     */
    constructor(toolbarEl: HTMLElement, deps: SelectionTrackerDeps);
    destroy(): void;
    /**
     * Suppress the next round of selectionchange events. Used by plugin
     * controls during DOM swaps that would otherwise trigger a hide.
     *
     * @param {boolean} value
     */
    setSuppressSelectionChange(value: boolean): void;
    #private;
}
export type SelectionTrackerDeps = {
    rootEl: HTMLElement;
    blocks: import("../types").IBlockReader;
    crossBlockSelection: import("../types").ICrossBlockSelection;
    show: () => void;
    hide: () => void;
    updateActiveStates: () => void;
    /**
     *   Returns true while the actions panel is open — selectionchange should be ignored.
     */
    isInActionsView: () => boolean;
    isTypeSelectorOpen: () => boolean;
    hasOpenToolDropdown: () => boolean;
};
