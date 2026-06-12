/**
 * Listens for trigger characters (e.g. '@' for mentions) in contenteditable blocks
 * and activates the corresponding inline plugin.
 */
export class TriggerManager {
    /**
     * @param {HTMLElement} rootEl
     * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
     * @param {import('./types').InlinePluginContext} ctx
     * @param {import('./types').IEventBus} events
     */
    constructor(rootEl: HTMLElement, registry: import("./InlinePluginRegistry").InlinePluginRegistry, ctx: import("./types").InlinePluginContext, events: import("./types").IEventBus);
    destroy(): void;
    /** @returns {boolean} */
    get isActive(): boolean;
    #private;
}
