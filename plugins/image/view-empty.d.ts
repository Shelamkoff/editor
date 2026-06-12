/**
 * @typedef {Object} EmptyViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {(file: File) => void} onFileDropped
 * @property {() => void} onUploadClick
 */
/**
 * Render the empty-state dropzone view into `wrapper`.
 * Replaces the wrapper's contents and removes the `filled` class.
 *
 * Listeners are attached with the state's AbortSignal so they're
 * automatically removed on the next render or on disposal.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {EmptyViewDeps} deps
 */
export function renderEmptyView(wrapper: HTMLElement, state: import("./state.js").ImageState, deps: EmptyViewDeps): void;
export type EmptyViewDeps = {
    t: (key: string, fallback: string) => string;
    onFileDropped: (file: File) => void;
    onUploadClick: () => void;
};
