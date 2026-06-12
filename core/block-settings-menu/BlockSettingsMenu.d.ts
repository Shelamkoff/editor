/**
 * The drill-down menu shown next to a block: move/duplicate/convert/delete
 * plus any plugin-specific settings (heading levels, table operations, etc.).
 *
 * Coordinates three collaborators:
 *  - `MenuBuilder`     — DOM construction (main view + convert view + items)
 *  - `BlockActions`    — block-mutating operations
 *  - `MenuPositioner`  — desktop/mobile placement
 *
 * The menu itself owns lifecycle (open/close/destroy), the saved selection
 * range, and the keyboard navigation handler. The native selection range
 * gets snapshotted on open and restored on close so the user's caret
 * survives the menu's focus shift.
 */
export class BlockSettingsMenu {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('../types').IBlockManager} blocks
     * @param {import('../types').ISelectionManager} selection
     * @param {Map<string, import('../types').BlockPlugin>} plugins
     * @param {import('../I18n').I18n} i18n
     * @param {import('../types').IEventBus} events
     * @param {import('../types').ICrossBlockSelection} crossBlockSelection
     * @param {import('../BlockOperations').BlockOperations} blockOps
     * @param {string} defaultBlockType
     * @param {{ mobileBreakpoint?: number }} [tuning]
     */
    constructor(rootEl: HTMLElement, blocks: import("../types").IBlockManager, selection: import("../types").ISelectionManager, plugins: Map<string, import("../types").BlockPlugin>, i18n: import("../I18n").I18n, events: import("../types").IEventBus, crossBlockSelection: import("../types").ICrossBlockSelection, blockOps: import("../BlockOperations").BlockOperations, defaultBlockType: string, tuning?: {
        mobileBreakpoint?: number;
    });
    /** @returns {boolean} */
    get isOpen(): boolean;
    /** @returns {HTMLElement} */
    get menuEl(): HTMLElement;
    /** @param {() => void} cb */
    set onClose(cb: () => void);
    toggle(): void;
    close(): void;
    destroy(): void;
    #private;
}
