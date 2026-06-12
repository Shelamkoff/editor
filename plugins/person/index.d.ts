export class Person extends BlockPluginAbstract<Record<string, any>> {
    static isTextBlock: boolean;
    static styles: string[];
    constructor(config?: Record<string, any> | undefined);
    type: string;
    icon: string;
    inlineTools: boolean;
    /** @returns {string} */
    get title(): string;
    /** @returns {PersonData} */
    _defaultPerson(): PersonData;
    _defaultData(): {
        persons: PersonData[];
    };
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
    /** @param {HTMLElement} wrapper */
    _rebuild(wrapper: HTMLElement): void;
    /**
     * Build a single tab element for a person.
     * @param {HTMLElement} wrapper
     * @param {PersonState} s
     * @param {number} i
     * @returns {HTMLElement}
     */
    _buildTab(wrapper: HTMLElement, s: PersonState, i: number): HTMLElement;
    /** @param {HTMLElement} wrapper */
    _buildTabs(wrapper: HTMLElement): HTMLDivElement;
    /**
     * @param {HTMLElement} wrapper
     * @param {HTMLElement} parent
     */
    _buildCard(wrapper: HTMLElement, parent: HTMLElement): void;
    /**
     * @param {HTMLElement} el
     * @param {string} _field
     * @param {boolean} allowMultiline
     */
    _setupEditable(el: HTMLElement, _field: string, allowMultiline: boolean): void;
    /** @param {HTMLElement} wrapper */
    _syncActiveFromDom(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {{ type: string, url: string }} link
     * @param {number} index
     * @param {number} totalCount
     * @returns {HTMLDivElement}
     */
    _createLinkRow(wrapper: HTMLElement, link: {
        type: string;
        url: string;
    }, index: number, totalCount: number): HTMLDivElement;
    /**
     * @param {HTMLElement} wrapper
     * @param {number} index
     * @param {string} url
     * @param {HTMLElement} iconEl
     */
    _debouncedResolve(wrapper: HTMLElement, index: number, url: string, iconEl: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {number} index
     * @param {string} url
     * @param {HTMLElement} iconEl
     */
    _resolveIcon(wrapper: HTMLElement, index: number, url: string, iconEl: HTMLElement): void;
    /** @param {HTMLElement} wrapper */
    _triggerAvatarUpload(wrapper: HTMLElement): void;
    /**
     * @param {HTMLElement} wrapper
     * @param {Blob} blob
     */
    _uploadAvatar(wrapper: HTMLElement, blob: Blob): Promise<void>;
}
export type PersonData = {
    avatar: string;
    name: string;
    role: string;
    bio: string;
    links: Array<{
        type: string;
        url: string;
    }>;
};
export type PersonState = {
    data: {
        persons: PersonData[];
    };
    wrapper: HTMLDivElement | null;
    activeIdx: number;
    debounceTimers: Map<string, number>;
    dragFromIdx: number | null;
};
import { BlockPluginAbstract } from '../BlockPluginAbstract.js';
