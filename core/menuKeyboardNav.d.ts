/**
 * Reusable keyboard navigation handler for accessible menus.
 *
 * Handles ArrowDown, ArrowUp, Home, End (focus management with wraparound)
 * and Escape (delegates to onEscape callback).
 *
 * @param {KeyboardEvent} e
 * @param {HTMLElement} menuEl — container to query for menu items
 * @param {{ onEscape: () => void, itemSelector?: string }} options
 * @returns {boolean} true if the event was handled
 */
export function handleMenuKeydown(e: KeyboardEvent, menuEl: HTMLElement, { onEscape, itemSelector }: {
    onEscape: () => void;
    itemSelector?: string;
}): boolean;
