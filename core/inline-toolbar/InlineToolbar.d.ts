/**
 * Floating toolbar that appears above non-collapsed text selections.
 *
 * Coordinates four collaborators:
 *  - `SelectionTracker`     — when to show/hide based on the user's selection
 *  - `InlinePositioner`     — where to render relative to the selection rect
 *  - `PluginControlsSlot`   — plugin-provided buttons (e.g. heading level)
 *  - `ActionsPanel`         — drill-down panels for tools that need a UI
 *                             (link editor, font size, etc.)
 *
 * The Toolbar itself owns the lifecycle, the buttons panel build, and the
 * public API (`show`, `hide`, `openTool`, `destroy`).
 */
export class InlineToolbar {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('../types').ISelectionManager} selection
     * @param {import('../types').IBlockManager} blocks
     * @param {import('../types').IEventBus} events
     * @param {import('../types').InlineTool[]} tools
     * @param {(type: string) => import('../types').BlockPlugin['renderInlineControls'] | undefined} getInlineControls
     * @param {import('../TypeSelector').TypeSelector} typeSelector
     * @param {import('../types').ICrossBlockSelection} crossBlockSelection
     */
    constructor(rootEl: HTMLElement, selection: import("../types").ISelectionManager, blocks: import("../types").IBlockManager, events: import("../types").IEventBus, tools: import("../types").InlineTool[], getInlineControls: (type: string) => import("../types").BlockPlugin["renderInlineControls"] | undefined, typeSelector: import("../TypeSelector").TypeSelector, crossBlockSelection: import("../types").ICrossBlockSelection);
    /** @returns {boolean} */
    get isVisible(): boolean;
    show(): void;
    hide(): void;
    /**
     * Programmatically open a tool by name (e.g. from a keyboard shortcut).
     * @param {string} toolName
     */
    openTool(toolName: string): void;
    /**
     * Returns true when the inline toolbar has an interactive UI open
     * (actions panel or a tool dropdown like font-size).
     * Used by KeyboardManager to yield control to the overlay.
     * @returns {boolean}
     */
    hasActiveUI(): boolean;
    destroy(): void;
    #private;
}
