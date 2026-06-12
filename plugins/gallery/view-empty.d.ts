/**
 * @typedef {Object} EmptyViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} onUploadClick
 * @property {(files: File[]) => void} onFilesDropped
 */
/**
 * Render the empty-state dropzone for the Gallery plugin.
 * Replaces wrapper contents and removes the `filled` class.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {EmptyViewDeps} deps
 */
export function renderEmptyView(wrapper: HTMLElement, state: import("./state.js").GalleryState, deps: EmptyViewDeps): void;
export type EmptyViewDeps = {
    t: (key: string, fallback: string) => string;
    onUploadClick: () => void;
    onFilesDropped: (files: File[]) => void;
};
