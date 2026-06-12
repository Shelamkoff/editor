export class Table extends BlockPluginAbstract<Record<string, any>> {
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
     * @param {{ content?: string[][], withHeadings?: boolean }} data
     * @returns {HTMLElement}
     */
    render(data: {
        content?: string[][];
        withHeadings?: boolean;
    }): HTMLElement;
    /**
     * Render block settings controls (add/remove row/col, toggle header).
     * @param {HTMLElement} element
     * @returns {HTMLElement[]}
     */
    renderSettings(element: HTMLElement): HTMLElement[];
    /**
     * Handle settings action for table operations.
     * @param {HTMLElement} element — the table wrapper
     * @param {string} action
     * @returns {null}
     */
    onSettingsAction(element: HTMLElement, action: string): null;
    /**
     * @param {HTMLElement} element
     * @returns {{ content: string[][], withHeadings: boolean }}
     */
    save(element: HTMLElement): {
        content: string[][];
        withHeadings: boolean;
    };
    /**
     * @param {{ content?: string[][] }} data
     * @returns {boolean}
     */
    validate(data: {
        content?: string[][];
    }): boolean;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
    };
    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
    /**
     * Handle pasted table elements.
     * @param {import('../../types').TagPasteEvent} event
     * @returns {{ content: string[][], withHeadings: boolean } | null}
     */
    onPaste(event: import("../../types").TagPasteEvent): {
        content: string[][];
        withHeadings: boolean;
    } | null;
    #private;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
