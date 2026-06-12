/**
 * @typedef {Object} ToolboxDeps
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../InlinePluginRegistry').InlinePluginRegistry | null} inlinePlugins
 * @property {import('../I18n').I18n} i18n
 * @property {number} filterThreshold
 * @property {(type: string) => void} onInsertBlock
 * @property {(type: string) => void} onInsertInlinePlugin
 * @property {() => void} onClose
 */
/**
 * Builds and manages the toolbox popup contents:
 *  - filter input (when plugin count exceeds threshold)
 *  - menu items for each block plugin
 *  - menu items for each inline plugin
 *  - keyboard navigation (Arrow/Home/End/Escape)
 *  - text filter that hides non-matching items
 *
 * Owns no positioning or open/close state — that lives on Toolbar.
 */
export class ToolboxBuilder {
    /**
     * @param {HTMLElement} toolboxEl
     * @param {ToolboxDeps} deps
     */
    constructor(toolboxEl: HTMLElement, deps: ToolboxDeps);
    /** @returns {HTMLInputElement | null} */
    get filterInput(): HTMLInputElement | null;
    /**
     * Reset the filter to empty (called when reopening the toolbox).
     */
    resetFilter(): void;
    destroy(): void;
    #private;
}
export type ToolboxDeps = {
    plugins: Map<string, import("../types").BlockPlugin>;
    inlinePlugins: import("../InlinePluginRegistry").InlinePluginRegistry | null;
    i18n: import("../I18n").I18n;
    filterThreshold: number;
    onInsertBlock: (type: string) => void;
    onInsertInlinePlugin: (type: string) => void;
    onClose: () => void;
};
