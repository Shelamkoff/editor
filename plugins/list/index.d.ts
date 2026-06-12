export class List extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /** @returns {{ title: string, icon: string, data: { style: string } }[]} */
    get toolbox(): {
        title: string;
        icon: string;
        data: {
            style: string;
        };
    }[];
    pasteConfig: {
        tags: string[];
    };
    /**
     * @param {{ items?: string[], style?: 'ordered' | 'unordered' }} data
     * @returns {HTMLElement}
     */
    render(data: {
        items?: string[];
        style?: "ordered" | "unordered";
    }): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {{ items: string[], style: string }}
     */
    save(element: HTMLElement): {
        items: string[];
        style: string;
    };
    /**
     * @param {{ items?: string[], style?: string }} data
     * @returns {boolean}
     */
    validate(data: {
        items?: string[];
        style?: string;
    }): boolean;
    /**
     * @param {HTMLElement} element
     * @param {{ items?: string[], text?: string }} data
     */
    merge(element: HTMLElement, data: {
        items?: string[];
        text?: string;
    }): void;
    /**
     * @param {HTMLElement} element
     * @returns {{ text: string, items: string[], style: string }}
     */
    exportData(element: HTMLElement): {
        text: string;
        items: string[];
        style: string;
    };
    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isEmpty(element: HTMLElement): boolean;
    /**
     * Render settings items for the block settings menu.
     * Returns ordered/unordered toggle buttons.
     * @param {HTMLElement} element
     * @returns {HTMLElement[]}
     */
    renderSettings(element: HTMLElement): HTMLElement[];
    /**
     * Handle settings action — switch list type in-place.
     * @param {HTMLElement} element
     * @param {string} action
     * @returns {{ items: string[], style: string } | null}
     */
    onSettingsAction(element: HTMLElement, action: string): {
        items: string[];
        style: string;
    } | null;
    /**
     * Handle pasted list elements.
     * @param {import('../../types').TagPasteEvent} event
     * @returns {{ items: string[], style: string } | null}
     */
    onPaste(event: import("../../types").TagPasteEvent): {
        items: string[];
        style: string;
    } | null;
    #private;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
