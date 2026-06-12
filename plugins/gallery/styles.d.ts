/**
 * Apply gallery-level inline styles (gap, height, slot border-radius)
 * to the live grid + slot DOM. Idempotent — safe to call after every
 * style edit in the settings form.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 */
export function applyGalleryStyles(wrapper: HTMLElement, state: import("./state.js").GalleryState): void;
