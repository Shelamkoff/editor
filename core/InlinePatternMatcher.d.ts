/**
 * @typedef {{ plugin: import('./types').InlinePlugin, pattern: RegExp }} PatternEntry
 */
/**
 * Matches text patterns in contenteditable blocks and replaces them with inline plugin widgets.
 * Handles:
 * - Paste: scan all text nodes after paste for pattern matches
 * - Input: when space/Enter is typed, check previous word for pattern match
 */
export class InlinePatternMatcher {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
     * @param {import('./types').InlinePluginContext} ctx
     * @param {import('./types').IEventBus} events
     * @param {import('./types').IBlockManager} blocks
     */
    constructor(rootEl: HTMLElement, registry: import("./InlinePluginRegistry").InlinePluginRegistry, ctx: import("./types").InlinePluginContext, events: import("./types").IEventBus, blocks: import("./types").IBlockManager);
    destroy(): void;
    #private;
}
export type PatternEntry = {
    plugin: import("./types").InlinePlugin;
    pattern: RegExp;
};
