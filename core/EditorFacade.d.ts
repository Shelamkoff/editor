export class EditorFacade {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('./types').IBlockManager} blocks
     * @param {import('./types').ISelectionManager} selection
     * @param {import('./types').IEventBus} events
     * @param {import('./types').EditorConfig} config
     * @param {import('./InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
     * @param {import('./types').InlinePluginContext} [inlinePluginCtx]
     * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
     */
    constructor(rootEl: HTMLElement, blocks: import("./types").IBlockManager, selection: import("./types").ISelectionManager, events: import("./types").IEventBus, config: import("./types").EditorConfig, inlinePluginRegistry?: import("./InlinePluginRegistry").InlinePluginRegistry, inlinePluginCtx?: import("./types").InlinePluginContext, crossBlockSelection?: import("./types").ICrossBlockSelection);
    /**
     * Register a module for cleanup on destroy.
     * @param {{ destroy(): void }} module
     */
    registerDestroyable(module: {
        destroy(): void;
    }): void;
    /**
     * Mark the editor as ready.
     */
    markReady(): void;
    get isReady(): boolean;
    get blocks(): import("./types").IBlockReader;
    get events(): import("./types").IEventBus;
    get rootElement(): HTMLElement;
    /**
     * Save editor content.
     * @returns {Promise<import('./types').EditorDocument>}
     */
    save(): Promise<import("./types").EditorDocument>;
    /**
     * Render data into the editor, replacing existing content.
     * @param {import('./types').EditorDocument} data
     * @param {{ blockId: string, offset: number }} [caret] - optional caret position to restore
     */
    render(data: import("./types").EditorDocument, caret?: {
        blockId: string;
        offset: number;
    }): void;
    /**
     * Clear all blocks and insert an empty default block.
     */
    clear(): void;
    /**
     * Focus the editor (first block or current block).
     */
    focus(): void;
    /**
     * Insert an inline plugin widget at the current caret position.
     * @param {string} type
     * @param {Record<string, string>} [data]
     */
    insertInlinePlugin(type: string, data?: Record<string, string>): void;
    /**
     * Destroy the editor and clean up all modules.
     */
    destroy(): void;
    #private;
}
