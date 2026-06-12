export class Block {
    /**
     * @param {import('./types').BlockPlugin} plugin
     * @param {Record<string, unknown>} [data]
     * @param {string} [id]
     */
    constructor(plugin: import("./types").BlockPlugin, data?: Record<string, unknown>, id?: string);
    get id(): string;
    get type(): string;
    get plugin(): import("./types").BlockPlugin<Record<string, unknown>>;
    get element(): HTMLElement;
    get contentElement(): HTMLElement;
    set focused(value: boolean);
    get focused(): boolean;
    set selected(value: boolean);
    get selected(): boolean;
    /**
     * Extract block data from DOM.
     * @returns {import('./types').BlockData}
     */
    save(): import("./types").BlockData;
    /**
     * Merge another block's data into this one.
     * @param {Record<string, unknown>} data
     */
    merge(data: Record<string, unknown>): void;
    /**
     * Whether this block's plugin supports merge.
     * @returns {boolean}
     */
    get canMerge(): boolean;
    /**
     * Check if the block content is empty.
     * Delegates to plugin.isEmpty() if defined, else checks textContent.
     * @returns {boolean}
     */
    isEmpty(): boolean;
    /**
     * Check if the plugin supports inline tools.
     * @returns {boolean}
     */
    get hasInlineTools(): boolean;
    /**
     * Get the block's settings UI (if plugin provides one).
     * @returns {HTMLElement | HTMLElement[] | null}
     */
    renderSettings(): HTMLElement | HTMLElement[] | null;
    /**
     * Adopt a new content element as this block's content.
     *
     * Two paths, automatically chosen:
     *  1. The plugin already swapped the DOM itself (`oldEl.replaceWith(newEl)`),
     *     so `newEl` is already a child of `#element` — we only need to update
     *     the internal reference. This is the case for Heading.changeLevel.
     *  2. The plugin returned a fresh detached element — we swap it in via
     *     `replaceChild`.
     *
     * Without the first branch, calling this after an in-place plugin swap
     * throws `NotFoundError: replaceChild — node is not a child of this node`,
     * because the old contentElement is already detached.
     *
     * @param {HTMLElement} newEl
     */
    replaceContentElement(newEl: HTMLElement): void;
    /**
     * Clean up the plugin without removing the block element from DOM.
     * Used by BlockManager.convert() which handles element removal separately.
     */
    disposePlugin(): void;
    /**
     * Focus the first editable or focusable element within the block.
     */
    focus(): void;
    /**
     * Clean up plugin resources. Does NOT remove the element from DOM —
     * BlockAnimator handles animated removal separately.
     */
    destroy(): void;
    #private;
}
