/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
 */
/**
 * Multi-file upload pipeline for the Gallery plugin.
 *
 * - With `uploadFile` configured: each file is sent sequentially to the
 *   backend; failed files are skipped silently.
 * - Without `uploadFile`: files are read as data-URLs via `FileReader`,
 *   then pushed into the gallery in arrival order.
 *
 * Both paths set/clear the `loading` class on the wrapper and call
 * `onAdded(images)` once with the full batch.
 */
export class GalleryUploader {
    /** @param {{ uploadFile?: UploadFn }} config */
    constructor(config: {
        uploadFile?: UploadFn;
    });
    /**
     * @param {HTMLElement} wrapper
     * @param {File[]} files
     * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
     */
    handle(wrapper: HTMLElement, files: File[], onAdded: (images: Array<{
        url: string;
        caption: string;
    }>) => void): Promise<void>;
    #private;
}
export type UploadFn = (file: File) => Promise<{
    url: string;
    alt?: string;
}>;
