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
    /**
     * @param {HTMLElement} editorRoot
     * @param {() => void} onBackdropClick
     */
    constructor(editorRoot: HTMLElement, onBackdropClick: () => void);
    /**
     * Get (or lazily create) the offcanvas root element for this editor instance.
     * @returns {HTMLElement}
     */
    getRoot(): HTMLElement;
    /**
     * Show the backdrop (creates it if needed). Cancels any pending hide.
     */
    showBackdrop(): void;
    /**
     * Animate the backdrop out, then remove it.
     */
    hideBackdrop(): void;
    /**
     * Final cleanup — remove the backdrop and the offcanvas root.
     */
    destroy(): void;
    #private;
}
