export class MouseSelectionManager {
    /**
     * @typedef {Object} MouseSelectionConfig
     * @property {HTMLElement} blocksEl
     * @property {HTMLElement} clickArea
     * @property {import('./types').IBlockManager} blocks
     * @property {import('./types').ISelectionManager} selection
     * @property {import('./types').IEventBus} events
     * @property {import('./types').ICrossBlockSelection} crossBlockSelection
     * @property {string} defaultBlockType
     */
    /**
     * @param {HTMLElement} rootEl
     * @param {MouseSelectionConfig} config
     */
    constructor(rootEl: HTMLElement, config: {
        blocksEl: HTMLElement;
        clickArea: HTMLElement;
        blocks: import("./types").IBlockManager;
        selection: import("./types").ISelectionManager;
        events: import("./types").IEventBus;
        crossBlockSelection: import("./types").ICrossBlockSelection;
        defaultBlockType: string;
    });
    /**
     * Clean up all event listeners.
     */
    destroy(): void;
    #private;
}
