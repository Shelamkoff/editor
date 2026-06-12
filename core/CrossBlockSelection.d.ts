export class CrossBlockSelection {
    /**
     * Show a visual-only CSS Highlight for a range (no state change).
     * @param {Range} range
     */
    static showHighlight(range: Range): void;
    /**
     * Remove the visual-only CSS Highlight (no state change).
     */
    static hideHighlight(): void;
    /** @returns {Range | null} */
    get range(): Range | null;
    /** @param {Range} range */
    set(range: Range): void;
    clear(): void;
    /** @returns {Range | null} */
    clone(): Range | null;
    /**
     * Store the range and activate visual highlight.
     * @param {Range} range
     * @param {HTMLElement} rootEl - `.oe-editor` element
     */
    activate(range: Range, rootEl: HTMLElement): void;
    /**
     * Clear the stored range and remove visual highlight.
     * @param {HTMLElement} [rootEl] - `.oe-editor` element
     */
    deactivate(rootEl?: HTMLElement): void;
    #private;
}
