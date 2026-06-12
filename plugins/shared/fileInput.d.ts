/**
 * Shared file input trigger for block plugins (image, gallery, attaches).
 * Eliminates duplicate #triggerFileInput methods.
 */
/**
 * @typedef {Object} FileInputConfig
 * @property {string} [accept] - accepted MIME types (e.g. 'image/*')
 * @property {boolean} [multiple] - allow multiple file selection
 * @property {(files: File[]) => void} onFiles - callback with selected files
 */
/**
 * Programmatically open a file picker dialog and call back with selected files.
 *
 * @param {FileInputConfig} config
 */
export function triggerFileInput(config: FileInputConfig): void;
export type FileInputConfig = {
    /**
     * - accepted MIME types (e.g. 'image/*')
     */
    accept?: string | undefined;
    /**
     * - allow multiple file selection
     */
    multiple?: boolean | undefined;
    /**
     * - callback with selected files
     */
    onFiles: (files: File[]) => void;
};
