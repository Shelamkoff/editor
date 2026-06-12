export class Heading extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    pasteConfig: {
        tags: string[];
    };
    /** @returns {string} */
    get title(): string;
    /**
     * @param {{ text?: string, level?: number, align?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        text?: string;
        level?: number;
        align?: string;
    }): HTMLElement;
    /**
     * Change heading level in-place (preserves caret position).
     * Returns the new element (replaces old in DOM).
     * @param {HTMLElement} element — current heading element
     * @param {number} newLevel
     * @returns {HTMLElement}
     */
    changeLevel(element: HTMLElement, newLevel: number): HTMLElement;
    /**
     * Get current level from element.
     * @param {HTMLElement} element
     * @returns {number}
     */
    getLevel(element: HTMLElement): number;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string, level: number, align?: string }}
     */
    save(element: HTMLElement): {
        text: string;
        level: number;
        align?: string;
    };
    /**
     * @param {{ text: string, level?: number }} data
     * @returns {boolean}
     */
    validate(data: {
        text: string;
        level?: number;
    }): boolean;
    /**
     * @param {HTMLElement} element
     * @param {{ text?: string }} data
     */
    merge(element: HTMLElement, data: {
        text?: string;
    }): void;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string, level: number, align?: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
        level: number;
        align?: string;
    };
    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
    /**
     * Render settings items for the block settings menu.
     * Returns H2/H3/H4 buttons shown directly in the main settings view.
     * @param {HTMLElement} element
     * @returns {HTMLElement[]}
     */
    renderSettings(element: HTMLElement): HTMLElement[];
    /**
     * Render heading level select dropdown for the inline toolbar.
     * @param {HTMLElement} element
     * @param {import('../../types').InlineControlContext} ctx
     * @returns {import('../../types').InlineControlGroup}
     */
    renderInlineControls(element: HTMLElement, ctx: import("../../types").InlineControlContext): import("../../types").InlineControlGroup;
    /**
     * Handle pasted heading elements.
     * @param {import('../../types').TagPasteEvent} event
     * @returns {{ text: string, level: number } | null}
     */
    onPaste(event: import("../../types").TagPasteEvent): {
        text: string;
        level: number;
    } | null;
    #private;
}
/** @type {ReadonlyArray<{ level: number, key: string, icon: string }>} */
export const HEADING_LEVELS: ReadonlyArray<{
    level: number;
    key: string;
    icon: string;
}>;
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
