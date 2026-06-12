export class Checklist extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    pasteConfig: {};
    /**
     * @param {{ items?: Array<{ text: string, checked: boolean }> }} data
     * @returns {HTMLElement}
     */
    render(data: {
        items?: Array<{
            text: string;
            checked: boolean;
        }>;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ items: Array<{ text: string, checked: boolean }> }}
     */
    save(element: HTMLElement): {
        items: Array<{
            text: string;
            checked: boolean;
        }>;
    };
    /**
     * @param {{ items?: Array<{ text: string, checked: boolean }> }} data
     * @returns {boolean}
     */
    validate(data: {
        items?: Array<{
            text: string;
            checked: boolean;
        }>;
    }): boolean;
    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
    };
    /**
     * @param {HTMLElement} element
     * @param {Record<string, unknown>} data
     */
    merge(element: HTMLElement, data: Record<string, unknown>): void;
    /**
     * @param {import('../../types').PasteEvent} event
     * @returns {Record<string, unknown> | null}
     */
    onPaste(event: import("../../types").PasteEvent): Record<string, unknown> | null;
    #private;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
