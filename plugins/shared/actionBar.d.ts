/**
 * Shared action bar utilities for block plugins (image, gallery, etc.).
 * Eliminates duplicate makeActionBtn/makeSep across plugin view-filled files.
 */
/**
 * Create an action button with click handler and AbortSignal cleanup.
 * @param {string} cssClass — CSS class for the button element
 * @param {string} innerHTML — SVG icon or label HTML
 * @param {() => void} handler — click callback
 * @param {AbortSignal} signal — AbortSignal for automatic listener removal
 * @returns {HTMLButtonElement}
 */
export function makeActionBtn(cssClass: string, innerHTML: string, handler: () => void, signal: AbortSignal): HTMLButtonElement;
/**
 * Create a visual separator element for action bars.
 * @param {string} cssClass — CSS class for the separator element
 * @returns {HTMLDivElement}
 */
export function makeSep(cssClass: string): HTMLDivElement;
