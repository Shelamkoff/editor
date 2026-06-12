export class Warning extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @param {{ title?: string, message?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        title?: string;
        message?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ title: string, message: string }}
     */
    save(element: HTMLElement): {
        title: string;
        message: string;
    };
    /**
     * @param {{ title?: string, message?: string }} data
     * @returns {boolean}
     */
    validate(data: {
        title?: string;
        message?: string;
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
     * @param {Record<string, unknown>} data
     * @param {HTMLElement} element
     */
    merge(element: HTMLElement, data: Record<string, unknown>): void;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
