/**
 * @typedef {Object} ImageConfig
 * @property {(file: File) => Promise<{ url: string, alt?: string }>} [uploadFile]
 * @property {Array<{ icon: string, label: string, handler: () => Promise<{url: string, alt?: string} | null> }>} [actions]
 */
/**
 * Block plugin for images. Public surface implements `BlockPlugin`.
 * Internal logic is split across:
 *  - `state.js`     — per-block state container (replaces module WeakMap)
 *  - `uploader.js`  — file upload pipeline (HTTP or data-URL fallback)
 *  - `view-empty.js`/ `view-filled.js` — DOM rendering for the two states
 *  - `settings.js`  — settings dropdown form
 *  - `styles.js`    — inline style application
 */
/**
 * @extends {BlockPluginAbstract<ImageConfig>}
 */
export class Image extends BlockPluginAbstract<ImageConfig> {
    static isTextBlock: boolean;
    static styles: string[];
    /** @param {ImageConfig} [config] */
    constructor(config?: ImageConfig);
    type: string;
    icon: string;
    inlineTools: boolean;
    pasteConfig: {
        files: string[];
        patterns: RegExp[];
    };
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
     * @returns {Record<string, unknown>}
     */
    exportData(element: HTMLElement): Record<string, unknown>;
    /**
     * @param {import('../../types').PasteEvent} event
     * @returns {Record<string, unknown> | null}
     */
    onPaste(event: import("../../types").PasteEvent): Record<string, unknown> | null;
    /**
     * @param {HTMLElement} element
     */
    destroy(element: HTMLElement): void;
    #private;
}
export type ImageConfig = {
    uploadFile?: ((file: File) => Promise<{
        url: string;
        alt?: string;
    }>) | undefined;
    actions?: {
        icon: string;
        label: string;
        handler: () => Promise<{
            url: string;
            alt?: string;
        } | null>;
    }[] | undefined;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
