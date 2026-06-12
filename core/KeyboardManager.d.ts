export class KeyboardManager {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('./types').IBlockOperations} blockOps
     * @param {import('./ShortcutRegistry').ShortcutRegistry} shortcuts
     * @param {import('./types').IBlockManager} blocks
     * @param {import('./types').IEventBus} events
     * @param {string} defaultBlockType
     * @param {(() => boolean)} [uiActivePredicate]
     */
    constructor(rootEl: HTMLElement, blockOps: import("./types").IBlockOperations, shortcuts: import("./ShortcutRegistry").ShortcutRegistry, blocks: import("./types").IBlockManager, events: import("./types").IEventBus, defaultBlockType: string, uiActivePredicate?: (() => boolean));
    /**
     * Clean up.
     */
    destroy(): void;
    #private;
}
