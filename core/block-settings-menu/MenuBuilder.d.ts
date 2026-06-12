/**
 * @typedef {Object} MenuBuilderDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../I18n').I18n} i18n
 * @property {import('./BlockActions.js').BlockActions} actions
 * @property {(direction?: 'forward' | 'back' | 'none') => void} rebuildMain
 *   Used by the convert-view back button to redraw the main view.
 */
/**
 * Builds the contents of the block settings menu.
 *
 * Two views:
 *  - Main view: move up/down, plugin settings (e.g. heading levels),
 *    duplicate, convert-to (drill-down), delete.
 *  - Convert view: list of all block types, with the current one marked active.
 *
 * Drill-down direction is conveyed via two CSS classes
 * (`oe-settings-menu--forward`/`--back`) so the menu can animate.
 */
export class MenuBuilder {
    /**
     * @param {HTMLElement} menuEl
     * @param {MenuBuilderDeps} deps
     */
    constructor(menuEl: HTMLElement, deps: MenuBuilderDeps);
    /**
     * @param {'forward' | 'back' | 'none'} [direction]
     */
    buildMainView(direction?: "forward" | "back" | "none"): void;
    buildConvertView(): void;
    #private;
}
export type MenuBuilderDeps = {
    blocks: import("../types").IBlockManager;
    plugins: Map<string, import("../types").BlockPlugin>;
    i18n: import("../I18n").I18n;
    actions: import("./BlockActions.js").BlockActions;
    /**
     *   Used by the convert-view back button to redraw the main view.
     */
    rebuildMain: (direction?: "forward" | "back" | "none") => void;
};
