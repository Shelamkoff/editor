export class Embed extends BlockPluginAbstract<Record<string, any>> {
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
        service: string;
        videoId: string;
        caption: string;
        cover: string;
        title: string;
        duration: string;
    };
    /** @param {Record<string, unknown>} data */
    render(data: Record<string, unknown>): HTMLDivElement;
    /** @param {HTMLElement} element */
    save(element: HTMLElement): any;
    /** @param {Record<string, unknown>} data */
    validate(data: Record<string, unknown>): boolean;
    /** @param {HTMLElement} element */
    isEmpty(element: HTMLElement): boolean;
    /** @param {HTMLElement} element */
    exportData(element: HTMLElement): {
        text: any;
    };
    /** @param {import('../../types').PasteEvent} event */
    onPaste(event: import("../../types").PasteEvent): {
        service: string;
        videoId: string;
        caption: string;
        cover: string;
        title: string;
        duration: string;
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
    /** @param {HTMLElement} wrapper */
    _removePlayerElements(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderPlayer(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderCaption(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _renderActions(wrapper: HTMLElement): void;
    /**
     * Show the cover drill-down sub-view: Back | Upload | Media Library | URL | Remove
     */
    /**
     * @param {HTMLElement} wrapper
     * @param {HTMLElement} actions
     * @param {HTMLElement} mainView
     * @param {AbortSignal} signal
     */
    _showCoverView(wrapper: HTMLElement, actions: HTMLElement, mainView: HTMLElement, signal: AbortSignal): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {AbortSignal} _signal
     */
    _buildSettingsPanel(wrapper: HTMLElement, _signal: AbortSignal): HTMLDivElement;
    /**
     * @param {HTMLElement} wrapper
     * @param {string} label
     * @param {string} value
     * @param {(v: string) => void} onChange
     */
    _makeInputRow(wrapper: HTMLElement, label: string, value: string, onChange: (v: string) => void): HTMLDivElement;
    /**
     * @param {HTMLElement} wrapper
     * @param {string} cls
     * @param {string} text
     */
    _updateOverlay(wrapper: HTMLElement, cls: string, text: string): void;
    /** @param {HTMLElement} wrapper */
    _rebuildPlayer(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _play(wrapper: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _triggerCoverUpload(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {File} file
     */
    _uploadCover(wrapper: HTMLElement, file: File): Promise<void>;
    /**
     * @param {HTMLElement} wrapper
     * @param {HTMLElement} _player
     * @param {HTMLElement} _placeholder
     */
    _fetchVimeoPreview(wrapper: HTMLElement, _player: HTMLElement, _placeholder: HTMLElement): Promise<void>;
    /**
     * @param {string} html
     * @param {() => void} handler
     * @param {AbortSignal} [signal]
     */
    _makeBtn(html: string, handler: () => void, signal?: AbortSignal): HTMLButtonElement;
    _makeSep(): HTMLDivElement;
    /**
     * @param {HTMLElement} anchor
     * @param {HTMLElement} panel
     */
    _positionPanel(anchor: HTMLElement, panel: HTMLElement): void;
}
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
