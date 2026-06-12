/**
 * @extends {BlockPluginAbstract<{ placeholder?: string }>}
 */
export class Paragraph extends BlockPluginAbstract<{
    placeholder?: string;
}> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: {
        placeholder?: string;
    } | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * Set placeholder from editor-level config (lower priority than constructor config).
     * @param {string} placeholder
     */
    setPlaceholder(placeholder: string): void;
    /**
     * @param {{ text?: string, align?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        text?: string;
        align?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string, align?: string }}
     */
    save(element: HTMLElement): {
        text: string;
        align?: string;
    };
    /**
     * Walk the paragraph's HTML-bearing fields, applying `transform` to
     * each. Used by the core to marshal inline widget placeholders.
     */
    mapTextFields(
        data: { text?: string; [k: string]: unknown },
        transform: (html: string) => string,
    ): void;
    /**
     * @param {{ text: string }} data
     * @returns {boolean}
     */
    validate(data: {
        text: string;
    }): boolean;
    /**
     * Merge another paragraph's data into this element.
     * @param {HTMLElement} element
     * @param {{ text?: string, align?: string }} data
     */
    merge(element: HTMLElement, data: {
        text?: string;
        align?: string;
    }): void;
    /**
     * Extract transferable data for block type conversion.
     * @param {HTMLElement} element
     * @returns {{ text: string, align?: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
        align?: string;
    };
    /**
     * Check if the paragraph content is empty.
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
