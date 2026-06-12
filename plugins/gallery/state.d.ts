/** @returns {GalleryData} */
export function emptyGalleryData(): GalleryData;
/**
 * Normalize arbitrary user input into a clean GalleryData.
 * Defensive: validates layout against the known list, coerces strings.
 *
 * @param {Record<string, unknown>} [data]
 * @returns {GalleryData}
 */
export function normalizeGalleryData(data?: Record<string, unknown>): GalleryData;
/**
 * @typedef {{ url: string, caption: string }} GalleryImage
 *
 * @typedef {Object} GalleryData
 * @property {GalleryImage[]} images
 * @property {string} layout
 * @property {Record<string, any>} styles
 * @property {Record<string, any>} options
 */
/**
 * Per-block state for a Gallery instance. Encapsulates:
 *  - resolved data (`images`, `layout`, `styles`, `options`)
 *  - an `AbortController` to tear down all signal-bound listeners on
 *    re-render or disposal
 *  - the in-flight drag index (used by slot drag/drop reorder)
 */
export class GalleryState {
    /** @param {GalleryData} data */
    constructor(data: GalleryData);
    /** @type {GalleryData} */
    data: GalleryData;
    /** @type {AbortController | null} */
    abortController: AbortController | null;
    /** @type {number} -1 when no drag in progress */
    dragIndex: number;
    /**
     * Reset the abort controller — used between view renders so that listeners
     * attached to the previous DOM are cleaned up before new ones are added.
     */
    resetTransient(): void;
    /** Final disposal — block was removed from the editor. */
    dispose(): void;
}
export type GalleryImage = {
    url: string;
    caption: string;
};
export type GalleryData = {
    images: GalleryImage[];
    layout: string;
    styles: Record<string, any>;
    options: Record<string, any>;
};
