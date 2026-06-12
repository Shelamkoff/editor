export class BlockManager {
    /**
     * @param {HTMLElement} container - .oe-blocks element
     * @param {Map<string, import('./types').BlockPlugin>} plugins
     * @param {import('./types').IEventBus} events
     * @param {{ blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }} [animations]
     */
    constructor(container: HTMLElement, plugins: Map<string, import("./types").BlockPlugin>, events: import("./types").IEventBus, animations?: {
        blockInsertMs: number;
        blockMoveMs: number;
        blockRemoveMs: number;
    });
    /** Enable insert/remove animations (call after initial load). */
    enableAnimations(): void;
    /**
     * Insert a new block.
     * @param {string} type
     * @param {Record<string, unknown>} [data]
     * @param {number} [index] - insert position, defaults to after current or end
     * @param {string} [id] - optional block ID (for restoring saved data)
     * @returns {Block}
     */
    insert(type: string, data?: Record<string, unknown>, index?: number, id?: string): Block;
    /**
     * Remove a block by index.
     * @param {number} index
     */
    remove(index: number): void;
    /**
     * Move a block from one position to another.
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    move(fromIndex: number, toIndex: number): void;
    /**
     * Convert a block to a different type, preserving transferable data.
     * @param {number} index
     * @param {string} newType
     * @param {Record<string, unknown>} [extraData] - e.g. { level: 2 } from toolbox entry
     * @returns {Block | undefined}
     */
    convert(index: number, newType: string, extraData?: Record<string, unknown>): Block | undefined;
    /**
     * Set focus to a block by index.
     * @param {number} index
     */
    setCurrentIndex(index: number): void;
    /**
     * @param {number} index
     * @returns {Block | undefined}
     */
    getBlockByIndex(index: number): Block | undefined;
    /**
     * @param {string} id
     * @returns {Block | undefined}
     */
    getBlockById(id: string): Block | undefined;
    /**
     * @returns {Block | undefined}
     */
    getCurrentBlock(): Block | undefined;
    /**
     * @returns {number}
     */
    getCurrentIndex(): number;
    /**
     * @returns {number}
     */
    getBlockCount(): number;
    /**
     * Get the index of a block by its ID. O(1) via reverse index map.
     * @param {string} id
     * @returns {number}
     */
    getBlockIndex(id: string): number;
    /**
     * Find the block that contains a given DOM node.
     * @param {Node} node
     * @returns {Block | undefined}
     */
    getBlockByChildNode(node: Node): Block | undefined;
    /**
     * Find the closest block by Y coordinate.
     * Used for cross-block mouse selection when the cursor may be
     * in gaps between blocks or outside block elements.
     * @param {number} y - clientY from mouse event
     * @returns {Block | undefined}
     */
    getBlockByY(y: number): Block | undefined;
    /**
     * Get all blocks in selected state.
     * @returns {Block[]}
     */
    getSelectedBlocks(): Block[];
    /**
     * Check if any blocks are in selected state.
     * @returns {boolean}
     */
    hasSelectedBlocks(): boolean;
    /**
     * Clear selection state from all blocks.
     */
    clearSelection(): void;
    /**
     * Remove all selected blocks and ensure at least one block remains.
     * @param {string} defaultBlockType — block type to insert if all blocks are removed
     * @returns {{ focusIndex: number } | null} — index to focus after removal, or null if nothing was selected
     */
    removeSelected(defaultBlockType: string): {
        focusIndex: number;
    } | null;
    /**
     * Remove all blocks.
     */
    clear(): void;
    /**
     * Save all blocks.
     * @returns {import('./types').BlockData[]}
     */
    save(): import("./types").BlockData[];
    /**
     * Iterator support.
     * @returns {Iterator<Block>}
     */
    [Symbol.iterator](): Iterator<Block>;
    #private;
}
import { Block } from './Block.js';
