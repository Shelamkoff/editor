/**
 * @typedef {Object} SettingsDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} syncCaptions
 * @property {() => void} reRender   re-render the filled view (after layout change)
 * @property {() => void} notifyChanged
 */
/**
 * Build the settings dropdown panel: layout grid + lightbox options + styles.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
export function buildSettingsPanel(wrapper: HTMLElement, state: import("./state.js").GalleryState, deps: SettingsDeps): HTMLElement;
export type SettingsDeps = {
    t: (key: string, fallback: string) => string;
    syncCaptions: () => void;
    /**
     * re-render the filled view (after layout change)
     */
    reRender: () => void;
    notifyChanged: () => void;
};
