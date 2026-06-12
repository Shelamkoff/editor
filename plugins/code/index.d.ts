export class Code extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    /**
     * @param {{ hljs?: object }} [config]
     */
    constructor(config?: {
        hljs?: object;
    });
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    pasteConfig: {
        tags: string[];
        patterns: RegExp[];
    };
    /**
     * @param {{ code?: string, language?: string }} data
     * @returns {HTMLElement}
     */
    render(data: {
        code?: string;
        language?: string;
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ code: string, language: string }}
     */
    save(element: HTMLElement): {
        code: string;
        language: string;
    };
    /**
     * @param {{ code?: string }} data
     * @returns {boolean}
     */
    validate(data: {
        code?: string;
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
     * @param {{ type: string, element?: HTMLElement, tag?: string, data?: string }} event
     * @returns {{ code: string, language: string } | null}
     */
    onPaste(event: {
        type: string;
        element?: HTMLElement;
        tag?: string;
        data?: string;
    }): {
        code: string;
        language: string;
    } | null;
    /**
     * @param {HTMLElement} element
     */
    destroy(element: HTMLElement): void;
    #private;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
