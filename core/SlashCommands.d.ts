export class SlashCommands {
    /**
     * @typedef {Object} SlashCommandsConfig
     * @property {Map<string, import('./types').BlockPlugin>} plugins
     * @property {import('./types').IBlockManager} blocks
     * @property {import('./types').ISelectionManager} selection
     * @property {import('./types').IEventBus} events
     * @property {import('./I18n').I18n} i18n
     * @property {import('./InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
     * @property {import('./types').InlinePluginContext} [inlinePluginCtx]
     */
    /**
     * @param {HTMLElement} rootEl
     * @param {SlashCommandsConfig} config
     */
    constructor(rootEl: HTMLElement, config: {
        plugins: Map<string, import("./types").BlockPlugin>;
        blocks: import("./types").IBlockManager;
        selection: import("./types").ISelectionManager;
        events: import("./types").IEventBus;
        i18n: import("./I18n").I18n;
        inlinePluginRegistry?: import("./InlinePluginRegistry").InlinePluginRegistry | undefined;
        inlinePluginCtx?: import("./types").InlinePluginContext | undefined;
    });
    /** @returns {boolean} */
    get isOpen(): boolean;
    /** Close the slash menu. */
    close(): void;
    /** Clean up. */
    destroy(): void;
    #private;
}
