/**
 * @typedef {{ data: string, blocksKey: string, blockId?: string, offset?: number }} Snapshot
 */
export class UndoManager {
    /**
     * @param {import('./types').IBlockReader} blocks
     * @param {import('./types').IEventBus} events
     * @param {() => Promise<import('./types').EditorDocument>} saveFn
     * @param {(data: import('./types').EditorDocument, caret?: { blockId: string, offset: number }) => void} renderFn
     * @param {() => { blockId: string, offset: number } | null} getCaretFn
     * @param {{ maxStack: number, debounceMs: number }} [tuning]
     */
    constructor(blocks: import("./types").IBlockReader, events: import("./types").IEventBus, saveFn: () => Promise<import("./types").EditorDocument>, renderFn: (data: import("./types").EditorDocument, caret?: {
        blockId: string;
        offset: number;
    }) => void, getCaretFn: () => {
        blockId: string;
        offset: number;
    } | null, tuning?: {
        maxStack: number;
        debounceMs: number;
    });
    get canUndo(): boolean;
    get canRedo(): boolean;
    /**
     * Save a snapshot immediately.
     */
    save(): void;
    /**
     * Flush any pending debounce and take a synchronous snapshot.
     * Call BEFORE structural operations (insert, remove, move, convert)
     * to ensure the pre-change state is in the undo stack.
     */
    saveSync(): void;
    /**
     * Restore the previous state.
     */
    undo(): void;
    /**
     * Restore the next state.
     */
    redo(): void;
    /**
     * Begin a batch — all changes until endBatch() are treated as one undo step.
     * Call saveSync() before batch to capture pre-change state.
     */
    beginBatch(): void;
    /**
     * End the batch and take a snapshot of the final state.
     */
    endBatch(): void;
    /**
     * Clear all history.
     */
    clear(): void;
    /**
     * Clean up.
     */
    destroy(): void;
    #private;
}
export type Snapshot = {
    data: string;
    blocksKey: string;
    blockId?: string;
    offset?: number;
};
