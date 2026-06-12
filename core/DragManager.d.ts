export class DragManager {
    /**
     * @param {HTMLElement} rootEl
     * @param {HTMLElement} blocksContainer
     * @param {import('./types').IBlockManager} blocks
     * @param {HTMLElement} dragHandle
     * @param {import('./types').IEventBus} events
     * @param {{ threshold: number }} [tuning]
     */
    constructor(rootEl: HTMLElement, blocksContainer: HTMLElement, blocks: import("./types").IBlockManager, dragHandle: HTMLElement, events: import("./types").IEventBus, tuning?: {
        threshold: number;
    });
    /**
     * Clean up.
     */
    destroy(): void;
    #private;
}
