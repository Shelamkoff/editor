/**
 * Handles all block-level animations: insert (scale+fade in),
 * move (FLIP), and remove (collapse+fade out).
 *
 * Extracted from BlockManager to separate animation concern from
 * block state management (SRP).
 */
export class BlockAnimator {
    /**
     * @param {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} durations
     */
    constructor(durations: {
        blockInsertMs: number;
        blockMoveMs: number;
        blockRemoveMs: number;
    });
    /** Enable animations (call after initial load so initial blocks don't animate). */
    enable(): void;
    /**
     * Animate a newly inserted block element.
     * @param {HTMLElement} element
     */
    animateInsert(element: HTMLElement): void;
    /**
     * FLIP-animate blocks that shifted after a move operation.
     * @param {import('./types').IBlock[]} blocks — ordered block array
     * @param {number} lo — first affected index
     * @param {number} hi — last affected index
     * @param {Map<string, DOMRect>} firstRects — pre-move bounding rects keyed by block ID
     */
    animateMove(blocks: import("./types").IBlock[], lo: number, hi: number, firstRects: Map<string, DOMRect>): void;
    /**
     * Animate a block element's removal (collapse + fade out), then remove from DOM.
     * @param {HTMLElement} element
     * @returns {Promise<void>} resolves when the element is removed from DOM
     */
    animateRemove(element: HTMLElement): Promise<void>;
    #private;
}
