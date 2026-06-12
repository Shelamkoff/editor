export class SelectionManager {
    /**
     * @param {HTMLElement} editorEl
     * @param {import('./types').IBlockReader} blocks
     */
    constructor(editorEl: HTMLElement, blocks: import("./types").IBlockReader);
    /**
     * Get the current caret position info.
     * @returns {import('./types').CaretPosition | null}
     */
    getCaret(): import("./types").CaretPosition | null;
    /**
     * Set the caret to the start or end of a block's content.
     * @param {string} blockId
     * @param {'start' | 'end'} position
     */
    setCaretToBlock(blockId: string, position: "start" | "end"): void;
    /**
     * Set the caret to a specific text offset within a block's content.
     * Walks text nodes to find the correct position.
     * @param {string} blockId
     * @param {number} textOffset — character offset from start of block text
     */
    setCaretToOffset(blockId: string, textOffset: number): void;
    /**
     * Get the current text selection info (if any text is selected).
     * @returns {import('./types').InlineSelection | null}
     */
    getSelection(): import("./types").InlineSelection | null;
    /**
     * Check if the caret is at the very start of the current block's content.
     * @returns {boolean}
     */
    isAtStart(): boolean;
    /**
     * Check if the caret is at the very end of the current block's content.
     * @returns {boolean}
     */
    isAtEnd(): boolean;
    /**
     * Extract the HTML content after the caret in the current block.
     * Used for splitting blocks (Enter key) — intentionally mutates DOM.
     * @returns {string | null}
     */
    extractFragmentAfterCaret(): string | null;
    #private;
}
