export class Poll extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /**
     * @param {Record<string, unknown>} data
     * @returns {HTMLElement}
     */
    render(data: Record<string, unknown>): HTMLElement;
    /**
     * @param {HTMLElement} element
     * @returns {Record<string, unknown>}
     */
    save(element: HTMLElement): Record<string, unknown>;
    /**
     * @param {Record<string, unknown>} data
     * @returns {boolean}
     */
    validate(data: Record<string, unknown>): boolean;
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
export type PollData = {
    question: string;
    type: string;
    options: Array<{
        text: string;
        votes: number;
    }>;
};
export type PollState = {
    data: PollData;
    showResults: boolean;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
