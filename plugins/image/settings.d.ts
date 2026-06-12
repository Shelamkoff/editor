/**
 * @typedef {Object} SettingsDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} notifyChanged
 */
/**
 * Build the settings dropdown panel: a styled form with width/height,
 * object fit/position, expand toggle, background toggle/color, and border.
 *
 * Mutations write directly into `state.data.styles` (or `state.data.expanded`
 * etc.) and call `refreshInlineStyles` + `deps.notifyChanged` so undo/save
 * see the change immediately.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
export function buildSettingsPanel(wrapper: HTMLElement, state: import("./state.js").ImageState, deps: SettingsDeps): HTMLElement;
export type SettingsDeps = {
    t: (key: string, fallback: string) => string;
    notifyChanged: () => void;
};
