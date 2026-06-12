export class Toggle extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @param {{ title?: string, content?: string, open?: boolean }} data
     * @returns {HTMLElement}
     */
    render(data: {
        title?: string;
        content?: string;
        open?: boolean;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ title: string, content: string, open: boolean }}
     */
    save(element: HTMLElement): {
        title: string;
        content: string;
        open: boolean;
    };
    /** @param {Record<string, unknown>} data */
    validate(data: Record<string, unknown>): boolean;
    /** @param {HTMLElement} element */
    isEmpty(element: HTMLElement): boolean;
    /** @param {HTMLElement} element */
    exportData(element: HTMLElement): {
        text: string;
    };
    /**
     * @param {HTMLElement} element
     * @param {Record<string, unknown>} data
     */
    merge(element: HTMLElement, data: Record<string, unknown>): void;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
