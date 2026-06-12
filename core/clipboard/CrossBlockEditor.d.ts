/**
 * Operations on cross-block selections (text spanning multiple blocks).
 *
 * Cross-block selection is held in `ICrossBlockSelection` (a custom range
 * since the native browser API can't span editing hosts). This class
 * encapsulates the multi-step delete sequence:
 *
 *  1. Delete tail of last block (from rangeEnd → end of CE).
 *  2. Remove all middle blocks.
 *  3. Delete head of first block (from start of CE → rangeStart).
 *  4. Merge first + last (first block keeps the merged content).
 *  5. Restore caret at the merge boundary.
 *
 * Wrapped in an UNDO_BATCH so the whole operation is one undo step.
 */
export class CrossBlockEditor {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('../types').IBlockManager} blocks
     * @param {import('../types').ISelectionManager} selection
     * @param {import('../types').ICrossBlockSelection} crossBlockSelection
     * @param {import('../types').IEventBus} events
     * @param {string} defaultBlockType
     */
    constructor(rootEl: HTMLElement, blocks: import("../types").IBlockManager, selection: import("../types").ISelectionManager, crossBlockSelection: import("../types").ICrossBlockSelection, events: import("../types").IEventBus, defaultBlockType: string);
    /**
     * Place the native caret at the end of a cross-block range.
     * Required so UndoManager captures the correct caret position when
     * the next snapshot is taken.
     *
     * @param {Range} range
     */
    setCaretToRangeEnd(range: Range): void;
    /**
     * Delete the content covered by a cross-block range and merge the
     * surviving head + tail into the first block.
     *
     * @param {Range} crossRange
     * @param {() => void} notifyChanged
     */
    deleteContent(crossRange: Range, notifyChanged: () => void): void;
    #private;
}
