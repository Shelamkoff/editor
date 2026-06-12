/**
 * Shared utility for splitting a block at a selection range and converting
 * the selected portion to a different block type.
 *
 * Used by both TypeSelector (inline toolbar) and BlockSettingsMenu (tune menu).
 *
 * @param {import('./types').IBlockManager} blocks
 * @param {import('./types').ISelectionManager} selection
 * @param {number} currentIndex
 * @param {string} currentType
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @param {string} targetType
 * @param {Record<string, unknown>} [targetData]
 * @returns {boolean} whether conversion actually happened
 */
export function splitAndConvert(blocks: import("./types").IBlockManager, selection: import("./types").ISelectionManager, currentIndex: number, currentType: string, contentEl: HTMLElement, range: Range, targetType: string, targetData?: Record<string, unknown>): boolean;
/**
 * Check if range starts at the beginning of contentEl.
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function rangeStartsAtBeginning(contentEl: HTMLElement, range: Range): boolean;
/**
 * Check if range ends at the end of contentEl.
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function rangeEndsAtEnd(contentEl: HTMLElement, range: Range): boolean;
/**
 * Check if entire block content is selected.
 * Returns false on error (conservative — assume nothing is selected).
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function isFullBlockSelected(contentEl: HTMLElement, range: Range): boolean;
/**
 * Restore a saved selection range, including cross-block range and CSS Highlight.
 * @param {Range | null} savedRange
 * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
 */
export function restoreSelection(savedRange: Range | null, crossBlockSelection?: import("./types").ICrossBlockSelection): void;
