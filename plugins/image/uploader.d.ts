/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
 */
/**
 * File upload pipeline for the Image plugin.
 *
 * Two paths:
 *  - configured `uploadFile`: send to backend, await `{ url }`, render.
 *  - no upload endpoint: read as data-URL via `FileReader`, render in place.
 *
 * Both paths set/clear the loading class on the wrapper and call `onResolve`
 * with the resolved URL on success. Failures are swallowed silently — image
 * data is not corrupted, the user can simply retry.
 *
 * The aborting/cleanup of any in-flight reader is delegated to ImageState's
 * `AbortController`, which the caller resets between renders.
 */
export class ImageUploader {
    /** @param {{ uploadFile?: UploadFn }} config */
    constructor(config: {
        uploadFile?: UploadFn;
    });
    /**
     * @param {HTMLElement} wrapper
     * @param {File} file
     * @param {(url: string) => void} onResolve
     */
    handle(wrapper: HTMLElement, file: File, onResolve: (url: string) => void): Promise<void>;
    #private;
}
export type UploadFn = (file: File) => Promise<{
    url: string;
    alt?: string;
}>;
