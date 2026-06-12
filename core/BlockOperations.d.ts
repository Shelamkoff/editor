export class BlockOperations {
    /**
     * @param {import('./types').IBlockManager} blocks
     * @param {import('./types').ISelectionManager} selection
     * @param {string} defaultBlockType
     * @param {import('./types').IEventBus} events
     */
    constructor(blocks: import("./types").IBlockManager, selection: import("./types").ISelectionManager, defaultBlockType: string, events: import("./types").IEventBus);
    /**
     * Insert a new block, set it as current, place the caret, and focus.
     * @param {string} type
     * @param {Record<string, unknown>} [data]
     * @param {number} [index]
     * @param {'start' | 'end'} [caretPosition='start']
     * @returns {import('./types').IBlock}
     */
    insertAndFocus(type: string, data?: Record<string, unknown>, index?: number, caretPosition?: "start" | "end"): import("./types").IBlock;
    /**
     * If the current block is empty and of the default type, convert it in-place.
     * Otherwise insert a new block after it. Focuses the result.
     * @param {string} type
     * @param {Record<string, unknown>} [data]
     * @param {'start' | 'end'} [caretPosition='start']
     * @returns {import('./types').IBlock}
     */
    replaceEmptyOrInsert(type: string, data?: Record<string, unknown>, caretPosition?: "start" | "end"): import("./types").IBlock;
    /**
     * Split the current block at the caret position (Enter key).
     * Extracts content after caret into a new block of the same type.
     */
    splitBlock(): void;
    /**
     * Merge the current block with the previous one (Backspace at start).
     * If current block is empty — removes it and focuses previous.
     * If both are the same type and support merge — merges content.
     * @returns {boolean} Whether the merge was handled
     */
    mergeWithPrevious(): boolean;
    /**
     * Merge the next block into the current one (Delete at end).
     * If next block is empty - removes it.
     * If both are the same type and support merge - merges content.
     * @returns {boolean} Whether the merge was handled
     */
    mergeWithNext(): boolean;
    /**
     * Move the caret to the end of the previous block (ArrowUp at start).
     * @returns {boolean} Whether navigation happened
     */
    navigateToPrevious(): boolean;
    /**
     * Move the caret to the start of the next block (ArrowDown at end).
     * @returns {boolean} Whether navigation happened
     */
    navigateToNext(): boolean;
    #private;
}
