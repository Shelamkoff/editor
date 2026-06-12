/**
 * Block toolbar — the floating "+ / drag" buttons next to the focused block.
 *
 * Coordinates four collaborators:
 *  - `BlockSettingsMenu`     — drill-down for block-specific actions
 *  - `ToolboxBuilder`        — builds + manages the "+" plugin picker popup
 *  - `ToolbarPositioner`     — desktop/mobile placement + FLIP animation
 *  - `OffcanvasRoot`         — mobile offcanvas wrapper + backdrop
 *
 * The Toolbar itself owns the lifecycle, event subscriptions, public API
 * (`dragHandle`, `toggleSettingsMenu`, `closeToolbox`, `closeSettingsMenu`,
 * `destroy`), and the show/hide state of the toolbox.
 */
export class Toolbar {
    /**
     * @typedef {Object} ToolbarConfig
     * @property {Map<string, import('../types').BlockPlugin>} plugins
     * @property {import('../types').IBlockManager} blocks
     * @property {import('../types').ISelectionManager} selection
     * @property {import('../I18n').I18n} i18n
     * @property {import('../types').IEventBus} events
     * @property {import('../types').ICrossBlockSelection} crossBlockSelection
     * @property {import('../BlockOperations').BlockOperations} blockOps
     * @property {string} [defaultBlockType]
     * @property {import('../InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
     * @property {{ filterThreshold?: number, mobileBreakpoint?: number, moveAnimationMs?: number }} [tuning]
     */
    /**
     * @param {HTMLElement} rootEl
     * @param {ToolbarConfig} config
     */
    constructor(rootEl: HTMLElement, config: {
        plugins: Map<string, import("../types").BlockPlugin>;
        blocks: import("../types").IBlockManager;
        selection: import("../types").ISelectionManager;
        i18n: import("../I18n").I18n;
        events: import("../types").IEventBus;
        crossBlockSelection: import("../types").ICrossBlockSelection;
        blockOps: import("../BlockOperations").BlockOperations;
        defaultBlockType?: string | undefined;
        inlinePluginRegistry?: import("../InlinePluginRegistry").InlinePluginRegistry | undefined;
        tuning?: {
            filterThreshold?: number;
            mobileBreakpoint?: number;
            moveAnimationMs?: number;
        } | undefined;
    });
    /** Drag button element — DragManager attaches its mousedown listener here. */
    get dragHandle(): HTMLElement;
    /** @returns {boolean} */
    get isToolboxOpen(): boolean;
    /**
     * Toggle the block settings menu (called via event from DragManager).
     */
    toggleSettingsMenu(): void;
    /** Show the toolbar next to the current block. */
    show(): void;
    /** Hide the toolbar. */
    hide(): void;
    /** Open the "+" plugin picker. */
    openToolbox(): void;
    /** Close the "+" plugin picker. */
    closeToolbox(): void;
    /** Close the block settings menu. */
    closeSettingsMenu(): void;
    destroy(): void;
    #private;
}
