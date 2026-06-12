export class Columns extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    _defaultData(): {
        columns: {
            content: string;
        }[];
        layout: string;
    };
    /**
     * @param {Record<string, unknown>} data
     * @returns {HTMLElement}
     */
    render(data: Record<string, unknown>): HTMLElement;
    /** @param {HTMLElement} element */
    save(element: HTMLElement): {
        columns: {
            content: string;
        }[];
        layout: string;
    };
    /** @param {Record<string, unknown>} data */
    validate(data: Record<string, unknown>): boolean;
    /** @param {HTMLElement} element */
    isEmpty(element: HTMLElement): boolean;
    /** @param {HTMLElement} element */
    exportData(element: HTMLElement): {
        text: string;
    };
    /** @param {HTMLElement} element */
    destroy(element: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _syncFromDom(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _build(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {string} newLayout
     */
    _changeLayout(wrapper: HTMLElement, newLayout: string): void;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
