export class Raw extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @param {{ html?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        html?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ html: string }}
     */
    save(element: HTMLElement): {
        html: string;
    };
    /**
     * @param {{ html?: string }} data
     * @returns {boolean}
     */
    validate(data: {
        html?: string;
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
     */
    destroy(element: HTMLElement): void;
    #private;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
