/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
 *
 * @typedef {Object} GalleryConfig
 * @property {UploadFn} [uploadFile]
 * @property {Array<{ icon: string, label: string, handler: () => Promise<Array<{url: string, alt?: string}> | null> }>} [actions]
 */
/**
 * Block plugin for image galleries. Public surface implements `BlockPlugin`.
 * Internal logic is split across:
 *  - `state.js`     — per-block state container (replaces module WeakMap)
 *  - `uploader.js`  — multi-file upload pipeline
 *  - `layout.js`    — layout selection algorithms
 *  - `slot.js`      — slot/overflow item DOM builders + drag handling
 *  - `view-empty.js`/ `view-filled.js` — DOM rendering for the two states
 *  - `settings.js`  — settings dropdown form
 *  - `styles.js`    — gallery-level inline style application
 */
/**
 * @extends {BlockPluginAbstract<GalleryConfig>}
 */
export class Gallery extends BlockPluginAbstract<GalleryConfig> {
    static isTextBlock: boolean;
    static styles: string[];
    /** @param {GalleryConfig} [config] */
    constructor(config?: GalleryConfig);
    type: string;
    icon: string;
    inlineTools: boolean;
    pasteConfig: {
        files: string[];
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
     * @param {HTMLElement} _element
     * @returns {Record<string, unknown>}
     */
    exportData(_element: HTMLElement): Record<string, unknown>;
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
export type UploadFn = (file: File) => Promise<{
    url: string;
    alt?: string;
}>;
export type GalleryConfig = {
    uploadFile?: UploadFn | undefined;
    actions?: {
        icon: string;
        label: string;
        handler: () => Promise<Array<{
            url: string;
            alt?: string;
        }> | null>;
    }[] | undefined;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
