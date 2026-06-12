/**
 * Create an element with optional class name and attributes.
 * @param {string} tag
 * @param {string} [className]
 * @param {Record<string, string>} [attrs]
 * @returns {HTMLElement}
 */
export function el(tag: string, className?: string, attrs?: Record<string, string>): HTMLElement;
/**
 * Find the closest `.oe-block` ancestor of a DOM node.
 * Consolidates the repeated `node.closest('.oe-block')` pattern.
 * @param {Node} node
 * @returns {HTMLElement | null}
 */
export function closestBlock(node: Node): HTMLElement | null;
/**
 * Position a popup element below (or above if no space) an anchor rect.
 *
 * Two modes:
 *  - `relative: false` (default) — sets absolute pixel values computed
 *    against `rootRect` (the editor root's bounding rect).
 *  - `relative: true` — sets CSS `calc(100% + …)` values, useful when
 *    the popup is a direct child of its anchor.
 *
 * @param {HTMLElement} popupEl
 * @param {DOMRect} anchorRect
 * @param {DOMRect | null} rootRect  — required when `relative` is false
 * @param {{ defaultHeight?: number, gap?: number, buffer?: number, relative?: boolean }} [options]
 */
export function positionPopup(popupEl: HTMLElement, anchorRect: DOMRect, rootRect: DOMRect | null, { defaultHeight, gap, buffer, relative }?: {
    defaultHeight?: number;
    gap?: number;
    buffer?: number;
    relative?: boolean;
}): void;
