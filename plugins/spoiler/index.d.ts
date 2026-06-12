export class Spoiler extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @param {{ label?: string, content?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        label?: string;
        content?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ label: string, content: string }}
     */
    save(element: HTMLElement): {
        label: string;
        content: string;
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
