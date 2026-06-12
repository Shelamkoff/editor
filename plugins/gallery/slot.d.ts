/**
 * @typedef {Object} SlotDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {(index: number) => void} onRemoveImage
 * @property {(from: number, to: number) => void} onSwapImages
 * @property {() => void} syncCaptions
 *   Called before any structural mutation that re-renders — flushes
 *   in-flight contenteditable text into `state.data`.
 * @property {() => import('./state.js').GalleryState | undefined} getState
 *   Indirect access used by drag handlers, since they need the live
 *   `dragIndex` field on state.
 */
/**
 * Build a filled slot with image, caption, remove button, and drag.
 * `index` is the global image index.
 *
 * @param {{ url: string, caption: string }} img
 * @param {number} index
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createFilledSlot(img: {
    url: string;
    caption: string;
}, index: number, signal: AbortSignal, deps: SlotDeps): HTMLDivElement;
/**
 * @param {number} slotIndex
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createEmptySlot(slotIndex: number, deps: SlotDeps): HTMLDivElement;
/**
 * @param {{ url: string, caption: string }} img
 * @param {number} globalIndex
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createOverflowItem(img: {
    url: string;
    caption: string;
}, globalIndex: number, signal: AbortSignal, deps: SlotDeps): HTMLDivElement;
/**
 * Attach external (file from OS) drop to a container.
 *
 * @param {HTMLElement} el
 * @param {AbortSignal} signal
 * @param {(files: File[]) => void} onFiles
 */
export function attachExternalDrop(el: HTMLElement, signal: AbortSignal, onFiles: (files: File[]) => void): void;
export type SlotDeps = {
    t: (key: string, fallback: string) => string;
    onRemoveImage: (index: number) => void;
    onSwapImages: (from: number, to: number) => void;
    /**
     *   Called before any structural mutation that re-renders — flushes
     *   in-flight contenteditable text into `state.data`.
     */
    syncCaptions: () => void;
    /**
     *   Indirect access used by drag handlers, since they need the live
     *   `dragIndex` field on state.
     */
    getState: () => import("./state.js").GalleryState | undefined;
};
