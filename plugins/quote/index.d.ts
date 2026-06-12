export class Quote extends BlockPluginAbstract<Record<string, any>> {
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
     * @param {{ text?: string, caption?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        text?: string;
        caption?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string, caption: string }}
     */
    save(element: HTMLElement): {
        text: string;
        caption: string;
    };
    /**
     * @param {{ text?: string, caption?: string }} data
     * @returns {boolean}
     */
    validate(data: {
        text?: string;
        caption?: string;
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
     * @returns {{ text: string, caption: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
        caption: string;
    };
    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
    /**
     * Handle pasted blockquote elements.
     * @param {import('../../types').TagPasteEvent} event
     * @returns {{ text: string, caption: string } | null}
     */
    onPaste(event: import("../../types").TagPasteEvent): {
        text: string;
        caption: string;
    } | null;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
