export class Delimiter extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @returns {HTMLElement}
     */
    render(): HTMLElement;
    /**
     * @returns {{}}
     */
    save(): {};
    /**
     * @returns {boolean}
     */
    validate(): boolean;
    /**
     * @param {HTMLElement} _element
     * @returns {boolean}
     */
    isEmpty(_element: HTMLElement): boolean;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
