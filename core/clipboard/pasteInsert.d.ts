/**
 * @typedef {Object} InsertContext
 * @property {import('../types').IBlockManager} blocks
 * @property {import('../types').ISelectionManager} selection
 * @property {import('../BlockOperations').BlockOperations} blockOps
 * @property {string} defaultBlockType
 * @property {import('./PasteRouter.js').PasteRouter} router
 * @property {() => void} notifyChanged
 */
/**
 * Insert plain text into the editor at the current caret.
 * Multi-line text becomes one block per non-empty line.
 *
 * @param {string} text
 * @param {InsertContext} ctx
 */
export function pastePlainText(text: string, ctx: InsertContext): void;
/**
 * Insert HTML into the editor at the current caret.
 * Splits multi-element HTML into multiple blocks via `extractBlockElements`,
 * routes known tags to plugins via `pasteConfig.tags`, and falls back to
 * the default block type for unknown tags.
 *
 * @param {string} html
 * @param {InsertContext} ctx
 */
export function pasteHtml(html: string, ctx: InsertContext): void;
export type InsertContext = {
    blocks: import("../types").IBlockManager;
    selection: import("../types").ISelectionManager;
    blockOps: import("../BlockOperations").BlockOperations;
    defaultBlockType: string;
    router: import("./PasteRouter.js").PasteRouter;
    notifyChanged: () => void;
};
