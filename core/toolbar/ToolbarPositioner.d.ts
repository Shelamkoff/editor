/**
 * Positioning logic for the floating block toolbar.
 *
 * Two positioning modes:
 *  - Desktop: absolute, anchored to the current block's top inside the
 *    editor root.
 *  - Mobile: appended *into* the block element so it sits in normal flow
 *    below content.
 *
 * Plus a FLIP-style animator for `block:moved`: snapshot old top, set new
 * top via `offsetTop` walk, animate the delta. The walk is needed because
 * the live `getBoundingClientRect()` is unreliable mid-animation (the
 * block we're tracking may itself be in a CSS transform).
 */
export class ToolbarPositioner {
    /**
     * @param {HTMLElement} toolbarEl
     * @param {HTMLElement} rootEl
     * @param {import('../types').IBlockReader} blocks
     * @param {{ mobileBreakpoint: number, moveAnimationMs: number }} options
     */
    constructor(toolbarEl: HTMLElement, rootEl: HTMLElement, blocks: import("../types").IBlockReader, options: {
        mobileBreakpoint: number;
        moveAnimationMs: number;
    });
    /** @type {boolean} */
    moveAnimating: boolean;
    /**
     * Move the toolbar to the current block. Called on focus/insert/remove.
     * Returns false if there is no current block (caller should hide).
     *
     * @returns {boolean}
     */
    updatePosition(): boolean;
    /**
     * FLIP-animate the toolbar to the new block position (called on `block:moved`).
     * Optionally also animates the settings menu element if it's open.
     *
     * @param {HTMLElement | null} settingsMenuEl
     */
    animatePosition(settingsMenuEl: HTMLElement | null): void;
    /**
     * After a block-removed animation completes, FLIP the toolbar to its
     * new spot. Returns the dy offset for callers that want to animate
     * additional siblings (or zero if no animation is needed).
     *
     * @returns {number}
     */
    animateAfterRemoval(): number;
    /**
     * Position the toolbox popup relative to the toolbar (desktop only —
     * mobile uses CSS bottom-sheet positioning).
     *
     * @param {HTMLElement} toolboxEl
     */
    positionToolbox(toolboxEl: HTMLElement): void;
    /** @returns {boolean} */
    isMobile(): boolean;
    #private;
}
