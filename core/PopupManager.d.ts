/**
 * Manages floating popups for inline plugins (color picker, etc.).
 * Positions popup near an anchor element, handles outside-click dismissal.
 *
 * Implements InlinePluginContext (showPopup, hidePopup, notifyChanged).
 */
export class PopupManager {
    /**
     * @param {import('./types').IEventBus} events
     * @param {string} changedEvent
     */
    constructor(events: import("./types").IEventBus, changedEvent: string);
    /**
     * Set the editor root element (popup inherits CSS variables from it).
     * @param {HTMLElement} rootEl
     */
    setRoot(rootEl: HTMLElement): void;
    /**
     * Show a popup near an anchor element.
     * @param {HTMLElement} anchor
     * @param {HTMLElement} content
     */
    showPopup(anchor: HTMLElement, content: HTMLElement): void;
    hidePopup(): void;
    notifyChanged(): void;
    destroy(): void;
    #private;
}
