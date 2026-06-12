/**
 * Editor clipboard surface — listens to copy/cut/paste/keydown on the editor
 * root and dispatches to the right helper:
 *  - selected blocks (`block.selected`): handled inline (whole-block copy/cut)
 *  - cross-block range: delegated to `CrossBlockEditor`
 *  - paste: routed by MIME type → custom-data, files, html, plain text,
 *    each via `PasteRouter` lookup or `pasteInsert.js` helpers.
 */
export class Clipboard {
    /**
     * @typedef {Object} ClipboardConfig
     * @property {import('../types').IBlockManager} blocks
     * @property {import('../types').ISelectionManager} selection
     * @property {Map<string, import('../types').BlockPlugin>} plugins
     * @property {string} defaultBlockType
     * @property {import('../types').ICrossBlockSelection} crossBlockSelection
     * @property {import('../types').IEventBus} events
     * @property {import('../BlockOperations').BlockOperations} blockOps
     * @property {(() => boolean)} [uiActivePredicate]
     */
    /**
     * @param {HTMLElement} rootEl
     * @param {ClipboardConfig} config
     */
    constructor(rootEl: HTMLElement, config: {
        blocks: import("../types").IBlockManager;
        selection: import("../types").ISelectionManager;
        plugins: Map<string, import("../types").BlockPlugin>;
        defaultBlockType: string;
        crossBlockSelection: import("../types").ICrossBlockSelection;
        events: import("../types").IEventBus;
        blockOps: import("../BlockOperations").BlockOperations;
        uiActivePredicate?: (() => boolean) | undefined;
    });
    destroy(): void;
    #private;
}
