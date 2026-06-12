/**
 * @typedef {Object} FilledViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} onTriggerFileInput
 * @property {() => void} onPromptUrl
 * @property {() => void} onDelete
 * @property {() => void} notifyChanged
 * @property {Array<{ icon: string, label: string, handler: () => Promise<{url: string, alt?: string} | null> }>} customActions
 * @property {(handler: () => Promise<{url: string, alt?: string} | null>) => Promise<void>} runCustomAction
 */
/**
 * Render the filled-state image view: image + container + editable caption +
 * action bar (settings, replace, delete). Replaces wrapper contents and
 * adds the `filled` CSS class.
 *
 * Listeners use the state's AbortSignal — automatically removed on the next
 * render or on disposal.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {FilledViewDeps} deps
 */
export function renderFilledView(wrapper: HTMLElement, state: import("./state.js").ImageState, deps: FilledViewDeps): void;
export type FilledViewDeps = {
    t: (key: string, fallback: string) => string;
    onTriggerFileInput: () => void;
    onPromptUrl: () => void;
    onDelete: () => void;
    notifyChanged: () => void;
    customActions: Array<{
        icon: string;
        label: string;
        handler: () => Promise<{
            url: string;
            alt?: string;
        } | null>;
    }>;
    runCustomAction: (handler: () => Promise<{
        url: string;
        alt?: string;
    } | null>) => Promise<void>;
};
