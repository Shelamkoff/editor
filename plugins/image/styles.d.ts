/**
 * Apply per-block style overrides from `state.data.styles` onto the live
 * `<img>` and its container. Skips width-related styles when the block is
 * in expanded mode (full-width takes precedence over user width).
 *
 * @param {import('./state.js').ImageState} state
 * @param {HTMLImageElement} img
 * @param {HTMLElement} container
 */
export function applyInlineStyles(state: import("./state.js").ImageState, img: HTMLImageElement, container: HTMLElement): void;
/**
 * Re-apply inline styles to an already-mounted image. Used when the
 * settings form mutates `state.data.styles` and needs the live preview
 * to reflect the change.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 */
export function refreshInlineStyles(wrapper: HTMLElement, state: import("./state.js").ImageState): void;
