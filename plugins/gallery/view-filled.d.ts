/**
 * @typedef {Object} FilledViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} syncCaptions
 * @property {() => import('./state.js').GalleryState | undefined} getState
 * @property {() => void} reRender
 * @property {() => void} renderEmpty
 * @property {() => void} notifyChanged
 * @property {(files: File[]) => void} onFilesDropped
 * @property {() => void} onTriggerFileInput
 * @property {() => void} onPromptUrl
 * @property {() => void} onDeleteAll
 * @property {Array<{ icon: string, label: string, handler: () => Promise<Array<{url: string, alt?: string}> | null> }>} customActions
 * @property {(handler: () => Promise<Array<{url: string, alt?: string}> | null>) => Promise<void>} runCustomAction
 */
/**
 * Render the filled-state Gallery view: template grid (or masonry) +
 * optional overflow row + action bar.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {FilledViewDeps} deps
 */
export function renderFilledView(wrapper: HTMLElement, state: import("./state.js").GalleryState, deps: FilledViewDeps): void;
export type FilledViewDeps = {
    t: (key: string, fallback: string) => string;
    syncCaptions: () => void;
    getState: () => import("./state.js").GalleryState | undefined;
    reRender: () => void;
    renderEmpty: () => void;
    notifyChanged: () => void;
    onFilesDropped: (files: File[]) => void;
    onTriggerFileInput: () => void;
    onPromptUrl: () => void;
    onDeleteAll: () => void;
    customActions: Array<{
        icon: string;
        label: string;
        handler: () => Promise<Array<{
            url: string;
            alt?: string;
        }> | null>;
    }>;
    runCustomAction: (handler: () => Promise<Array<{
        url: string;
        alt?: string;
    }> | null>) => Promise<void>;
};
