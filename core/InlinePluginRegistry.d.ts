/**
 * @typedef {import('./types').InlinePlugin} InlinePlugin
 * @typedef {import('./types').InlinePluginContext} InlinePluginContext
 */
/**
 * Registry for inline plugins (widgets inside text blocks).
 * Inline plugins are different from block plugins (full blocks) and inline tools (text formatting).
 */
export class InlinePluginRegistry {
    /**
     * @param {InlinePlugin[]} plugins
     */
    constructor(plugins?: InlinePlugin[]);
    /**
     * @param {InlinePlugin} plugin
     */
    register(plugin: InlinePlugin): void;
    /**
     * @param {string} type
     * @returns {InlinePlugin | undefined}
     */
    get(type: string): InlinePlugin | undefined;
    /**
     * @param {string} char
     * @returns {InlinePlugin | undefined}
     */
    getByTrigger(char: string): InlinePlugin | undefined;
    /** @returns {IterableIterator<InlinePlugin>} */
    values(): IterableIterator<InlinePlugin>;
    /** @returns {number} */
    get size(): number;
    /** @returns {boolean} */
    get hasTriggers(): boolean;
    /**
     * Get all registered trigger characters.
     * @returns {string[]}
     */
    triggerKeys(): string[];
    #private;
}
export type InlinePlugin = import("./types").InlinePlugin;
export type InlinePluginContext = import("./types").InlinePluginContext;
