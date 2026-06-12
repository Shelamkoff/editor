export class LinkPreview extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    pasteConfig: {
        patterns: RegExp[];
    };
    get title(): string;
    _defaultData(): {
        url: string;
        title: string;
        description: string;
        image: string;
        favicon: string;
        domain: string;
        template: string;
    };
    /** @param {Record<string, unknown>} data */
    render(data: Record<string, unknown>): HTMLDivElement;
    /** @param {HTMLElement} element */
    save(element: HTMLElement): {
        url: string;
        title: string;
        description: string;
        image: string;
        favicon: string;
        domain: string;
        template: string;
    };
    /** @param {Record<string, unknown>} d */
    validate(d: Record<string, unknown>): boolean;
    /** @param {HTMLElement} element */
    isEmpty(element: HTMLElement): boolean;
    /** @param {HTMLElement} element */
    exportData(element: HTMLElement): {
        text: string;
    };
    /** @param {import('../../types').PasteEvent} event */
    onPaste(event: import("../../types").PasteEvent): {
        url: string;
        title: string;
        description: string;
        image: string;
        favicon: string;
        domain: string;
        template: string;
    } | null;
    /** @param {HTMLElement} element */
    destroy(element: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _cleanup(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderUrlBar(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {string} url
     */
    _processUrl(wrapper: HTMLElement, url: string): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {string} url
     */
    _loadMeta(wrapper: HTMLElement, url: string): Promise<void>;
    /** @param {HTMLElement} wrapper */
    _removeCardElements(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderCard(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderActions(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {AbortSignal} [signal]
     */
    _buildTemplatePanel(wrapper: HTMLElement, signal?: AbortSignal): HTMLDivElement;
}
export type LinkPreviewState = {
    data: {
        url: string;
        title: string;
        description: string;
        image: string;
        favicon: string;
        domain: string;
        template: string;
    };
    wrapper: HTMLDivElement;
    abortController: AbortController | null;
    urlIconEl: HTMLElement | null;
    inputTimer: ReturnType<typeof setTimeout> | null;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
