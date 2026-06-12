export class TypeSelector {
    /**
     * @param {import('./types').IBlockManager} blocks
     * @param {import('./types').ISelectionManager} selection
     * @param {Map<string, import('./types').BlockPlugin>} plugins
     * @param {import('./I18n').I18n} [i18n]
     * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
     * @param {import('./types').IEventBus} [events]
     * @param {{ filterThreshold: number }} [tuning]
     */
    constructor(blocks: import("./types").IBlockManager, selection: import("./types").ISelectionManager, plugins: Map<string, import("./types").BlockPlugin>, i18n?: import("./I18n").I18n, crossBlockSelection?: import("./types").ICrossBlockSelection, events?: import("./types").IEventBus, tuning?: {
        filterThreshold: number;
    });
    /** The select button element (mount into panel). */
    get selectButton(): HTMLElement;
    /** The dropdown element (mount into toolbar root). */
    get dropdownElement(): HTMLElement;
    /**
     * Set callback fired after a conversion happens.
     * @param {() => void} fn
     */
    set onConvert(fn: () => void);
    /** Update displayed type name from current block. */
    update(): void;
    /** Close the dropdown if open. */
    close(): void;
    /** @returns {boolean} */
    get isOpen(): boolean;
    destroy(): void;
    #private;
}
