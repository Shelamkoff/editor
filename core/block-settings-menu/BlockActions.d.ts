/**
 * @typedef {Object} BlockActionsDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {import('../types').ISelectionManager} selection
 * @property {import('../BlockOperations').BlockOperations} blockOps
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../types').ICrossBlockSelection} crossBlockSelection
 * @property {import('../types').IEventBus} events
 * @property {string} defaultBlockType
 * @property {() => void} onClose       called after each terminal action
 * @property {() => void} onAfterMove   called after move (rebuild + reposition)
 * @property {() => Range | null} getSavedRange
 *   Returns the range that was active when the menu opened — used by `convertTo`
 *   to restore caret before slicing the block.
 */
/**
 * The actual block-mutating operations exposed by the settings menu:
 * move up/down, duplicate, delete, convert to type, plugin-specific
 * settings actions (e.g. heading level change).
 *
 * Each method is "fire-and-forget" — it performs the mutation and (in
 * most cases) closes the menu via `deps.onClose()`. Move operations
 * keep the menu open via `deps.onAfterMove()`.
 */
export class BlockActions {
    /** @param {BlockActionsDeps} deps */
    constructor(deps: BlockActionsDeps);
    moveUp(): void;
    moveDown(): void;
    duplicate(): void;
    delete(): void;
    /**
     * Convert the current block (or the cross-block range) to a different type.
     *
     * Three branches:
     *  1. Cross-block range → delegate to `convertCrossBlockRange`.
     *  2. Single block, no selection or full-block selection → swap whole block.
     *  3. Single block, partial selection → `splitAndConvert` (creates two blocks).
     *
     * @param {string} type
     * @param {Record<string, unknown>} [data]
     */
    convertTo(type: string, data?: Record<string, unknown>): void;
    /**
     * Handle a plugin-specific settings item (e.g. "Heading 2" → changeLevel(2)).
     * Falls back to `onSettingsAction` + `convert` for plugins without an
     * in-place update path.
     *
     * @param {import('../types').IBlock} current
     * @param {import('../types').BlockPlugin} plugin
     * @param {HTMLElement} item
     */
    handleSettingsAction(current: import("../types").IBlock, plugin: import("../types").BlockPlugin, item: HTMLElement): void;
    #private;
}
export type BlockActionsDeps = {
    blocks: import("../types").IBlockManager;
    selection: import("../types").ISelectionManager;
    blockOps: import("../BlockOperations").BlockOperations;
    plugins: Map<string, import("../types").BlockPlugin>;
    crossBlockSelection: import("../types").ICrossBlockSelection;
    events: import("../types").IEventBus;
    defaultBlockType: string;
    /**
     * called after each terminal action
     */
    onClose: () => void;
    /**
     * called after move (rebuild + reposition)
     */
    onAfterMove: () => void;
    /**
     *   Returns the range that was active when the menu opened — used by `convertTo`
     *   to restore caret before slicing the block.
     */
    getSavedRange: () => Range | null;
};
