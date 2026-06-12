/**
 * Cross-block conversion utility.
 *
 * Extracts logic shared between TypeSelector (inline toolbar) and
 * BlockSettingsMenu (tune menu) for converting a cross-block range
 * to a different block type with partial-block split support.
 */
/**
 * Check if a block type is text-based (has contenteditable root).
 * Reads the static `isTextBlock` property from the plugin class.
 * @param {Map<string, import('./types').BlockPlugin>} plugins
 * @param {string} type
 * @returns {boolean}
 */
export function isTextType(plugins: Map<string, import("./types").BlockPlugin>, type: string): boolean;
/**
 * Convert blocks in a cross-block selection range, with partial split support.
 *
 * Text → text: split partial first/last blocks, convert selected portions.
 * Text → non-text: split partial blocks, remove all selected, insert one new block.
 *
 * @param {object} ctx
 * @param {import('./types').IBlockManager} ctx.blocks
 * @param {import('./types').ISelectionManager} ctx.selection
 * @param {Map<string, import('./types').BlockPlugin>} ctx.plugins
 * @param {import('./types').ICrossBlockSelection} [ctx.crossBlockSelection]
 * @param {import('./types').IEventBus} [ctx.events]
 * @param {Range} crossRange
 * @param {string} targetType
 * @param {Record<string, unknown>} [targetData]
 * @param {(() => void) | null} [onDone] - called after conversion (e.g. emit editor:changed)
 */
export function convertCrossBlockRange(ctx: {
    blocks: import("./types").IBlockManager;
    selection: import("./types").ISelectionManager;
    plugins: Map<string, import("./types").BlockPlugin>;
    crossBlockSelection?: import("./types").ICrossBlockSelection | undefined;
    events?: import("./types").IEventBus | undefined;
}, crossRange: Range, targetType: string, targetData?: Record<string, unknown>, onDone?: (() => void) | null): void;
