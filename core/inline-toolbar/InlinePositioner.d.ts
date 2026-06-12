/**
 * Position the inline toolbar relative to the current native selection.
 *
 * Tries to render above the selection; flips below when there's not enough
 * space at the top of the viewport. Horizontally centered on the selection
 * but clamped to stay within the editor's bounds.
 */
export class InlinePositioner {
    /**
     * @param {HTMLElement} toolbarEl
     * @param {HTMLElement} rootEl
     */
    constructor(toolbarEl: HTMLElement, rootEl: HTMLElement);
    /**
     * Reposition the toolbar based on the current native selection.
     * No-op if there's no live selection.
     */
    position(): void;
    #private;
}
