export class Attaches extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    get title(): string;
    /**
     * @param {Record<string, unknown>} data
     * @returns {HTMLElement}
     */
    render(data: Record<string, unknown>): HTMLElement;
    save(el: HTMLElement): {
        files: {
            url: string;
            name: string;
            size: number;
            extension: string;
        }[];
        variant: string;
    };
    validate(data: Record<string, unknown>): boolean;
    isEmpty(el: HTMLElement): boolean;
    exportData(el: HTMLElement): {
        text: string;
    };
    destroy(el: HTMLElement): void;
    #private;
}
export type FileEntry = {
    url: string;
    name: string;
    size: number;
    extension: string;
};
export type AttachesState = {
    data: {
        files: FileEntry[];
        variant: string;
    };
    objectUrls: string[];
    abortController: AbortController | null;
    expanded: boolean;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
