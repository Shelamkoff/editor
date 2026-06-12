/**
 * Construct a fresh `ImageData` from arbitrary user input.
 * Defensive: every field is normalized to its expected type.
 *
 * @param {Record<string, unknown>} [data]
 * @returns {ImageData}
 */
export function normalizeImageData(data?: Record<string, unknown>): ImageData;
/** @returns {ImageData} */
export function emptyImageData(): ImageData;
/**
 * @typedef {Object} ImageData
 * @property {{ url: string }} file
 * @property {string} caption
 * @property {boolean} withBorder
 * @property {boolean} expanded
 * @property {boolean} withBackground
 * @property {Record<string, string>} styles
 */
/**
 * Per-block state for an Image instance.
 *
 * Replaces the previous module-level `WeakMap` keyed by wrapper element.
 * Encapsulates lifecycle: an `AbortController` so all DOM listeners attached
 * with `{ signal }` are torn down on `dispose()`, plus a `MutationObserver`
 * for the border-style row in the settings form, plus an object URL for
 * data-URL fallback uploads (revoked on dispose).
 */
export class ImageState {
    /**
     * @param {ImageData} data
     * @param {File | null} [pendingFile]
     */
    constructor(data: ImageData, pendingFile?: File | null);
    /** @type {ImageData} */
    data: ImageData;
    /** @type {AbortController | null} */
    abortController: AbortController | null;
    /** @type {MutationObserver | null} */
    borderObserver: MutationObserver | null;
    /** @type {string | null} */
    objectUrl: string | null;
    /** @type {File | null} */
    pendingFile: File | null;
    /**
     * Reset listener controller, observer, and any held object URL.
     * Called between view renders (empty → filled, filled → empty)
     * and from full disposal.
     */
    resetTransient(): void;
    /**
     * Final disposal — block was removed from the editor.
     * After this the state is no longer usable.
     */
    dispose(): void;
}
export type ImageData = {
    file: {
        url: string;
    };
    caption: string;
    withBorder: boolean;
    expanded: boolean;
    withBackground: boolean;
    styles: Record<string, string>;
};
