/**
 * Positioning logic for the block-settings menu.
 *
 * Desktop: anchored under (or above, on overflow) the floating toolbar,
 * right-aligned with the toolbar's right edge. Reads `toolbar.offsetTop`
 * walk instead of `getBoundingClientRect()` to avoid sampling FLIP-animated
 * transforms — the visual position lags one frame behind layout during
 * block-move animations.
 *
 * Mobile: bottom-sheet positioning is handled by CSS (position: fixed +
 * `oe-settings-menu--open` class), so we just clear inline coordinates.
 */
export class MenuPositioner {
    /**
     * @param {HTMLElement} menuEl
     * @param {HTMLElement} rootEl
     * @param {number} mobileBreakpoint
     */
    constructor(menuEl: HTMLElement, rootEl: HTMLElement, mobileBreakpoint?: number);
    position(): void;
    #private;
}
