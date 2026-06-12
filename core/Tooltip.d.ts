export class Tooltip {
    /**
     * Show tooltip near an anchor element.
     * @param {HTMLElement} anchor
     * @param {string} label
     * @param {string} [shortcut]
     * @param {{ delay?: number }} [opts]
     */
    show(anchor: HTMLElement, label: string, shortcut?: string, opts?: {
        delay?: number;
    }): void;
    /** Hide the tooltip immediately. */
    hide(): void;
    /** Clean up. */
    destroy(): void;
    #private;
}
