/**
 * @typedef {Object} PluginControlsSlotDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {(type: string) => import('../types').BlockPlugin['renderInlineControls'] | undefined} getInlineControls
 * @property {import('../types').IEventBus} events
 * @property {import('../TypeSelector').TypeSelector} typeSelector
 * @property {(suppress: boolean) => void} setSuppressSelectionChange
 *   Hint to the SelectionTracker to skip the next few selectionchange events
 *   (used while a plugin control swaps the contenteditable element).
 */
/**
 * The "plugin controls" zone in the inline toolbar — the area where each
 * block plugin can render its own buttons (e.g. heading level switcher,
 * paragraph alignment).
 *
 * Owns mounting/unmounting of the current plugin's control group:
 * builds an `InlineControlContext`, calls `plugin.renderInlineControls`,
 * appends returned elements into `pluginZone`, and tears them down
 * (calling the group's optional `destroy()`) when the focus moves to
 * a block whose plugin doesn't provide controls.
 */
export class PluginControlsSlot {
    /**
     * @param {HTMLElement} zoneEl  container that holds the rendered controls
     * @param {HTMLElement} dividerEl  divider element shown only when controls are present
     * @param {PluginControlsSlotDeps} deps
     */
    constructor(zoneEl: HTMLElement, dividerEl: HTMLElement, deps: PluginControlsSlotDeps);
    /**
     * Re-query the current block's plugin and render its inline controls.
     * Idempotent — clears any existing controls before rendering new ones.
     */
    update(): void;
    /**
     * Tear down the active control group (if any) and hide the divider.
     */
    clear(): void;
    #private;
}
export type PluginControlsSlotDeps = {
    blocks: import("../types").IBlockManager;
    getInlineControls: (type: string) => import("../types").BlockPlugin["renderInlineControls"] | undefined;
    events: import("../types").IEventBus;
    typeSelector: import("../TypeSelector").TypeSelector;
    /**
     *   Hint to the SelectionTracker to skip the next few selectionchange events
     *   (used while a plugin control swaps the contenteditable element).
     */
    setSuppressSelectionChange: (suppress: boolean) => void;
};
