/**
 * @param {string} layout
 * @returns {number} number of slots, or `Infinity` for layouts that flow all images
 */
export function getSlotsCount(layout: string): number;
/**
 * Pick a template based on image count + per-image orientations.
 * Used after images load and we know each image's aspect ratio.
 *
 * @param {number} count
 * @param {string[]} orientations  array of 'L' (landscape) | 'P' (portrait) | 'S' (square)
 * @returns {string}
 */
export function selectAutoTemplate(count: number, orientations: string[]): string;
/**
 * Initial template guess for `auto` layout, before images are loaded
 * (no orientation info available).
 *
 * @param {number} count
 * @returns {string}
 */
export function pickInitialAutoTemplate(count: number): string;
/**
 * Classify an image's orientation from its loaded dimensions.
 * @param {number} width
 * @param {number} height
 * @returns {'L' | 'P' | 'S'}
 */
export function classifyOrientation(width: number, height: number): "L" | "P" | "S";
/** All known layout names (auto, '1'..'6c', triptych, masonry, poly-*). */
export const ALL_LAYOUTS: string[];
/** Maximum number of images visible in template-based layouts. */
export const MAX_VISIBLE: 6;
