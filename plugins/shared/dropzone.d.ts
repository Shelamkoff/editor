/**
 * Shared dropzone (empty-state) view for media block plugins (image, gallery).
 * Eliminates duplicate DOM construction and drag-and-drop wiring.
 */
/**
 * @typedef {Object} DropzoneCssMap
 * @property {string} select — wrapper class
 * @property {string} selectIcon — icon container class
 * @property {string} selectText — text container class
 * @property {string} selectLink — upload link class
 * @property {string} dropzoneActive — class added on dragover
 * @property {string} filled — class removed from wrapper on render
 */
/**
 * @typedef {Object} DropzoneConfig
 * @property {string} iconHtml — SVG icon markup
 * @property {string} uploadText — localized "Upload" link text
 * @property {string} afterText — localized text after the upload link
 * @property {() => void} onUploadClick — trigger file input
 * @property {(dataTransfer: DataTransfer) => void} onDrop — handle dropped files
 */
/**
 * Render a dropzone (empty-state) view into a wrapper element.
 * Clears the wrapper, removes the `filled` class, and wires drag-and-drop.
 *
 * @param {HTMLElement} wrapper — block wrapper element
 * @param {AbortSignal} signal — for automatic listener cleanup
 * @param {DropzoneCssMap} css — plugin-specific CSS class names
 * @param {DropzoneConfig} config — icon, text, and callbacks
 */
export function renderDropzone(wrapper: HTMLElement, signal: AbortSignal, css: DropzoneCssMap, config: DropzoneConfig): void;
export type DropzoneCssMap = {
    /**
     * — wrapper class
     */
    select: string;
    /**
     * — icon container class
     */
    selectIcon: string;
    /**
     * — text container class
     */
    selectText: string;
    /**
     * — upload link class
     */
    selectLink: string;
    /**
     * — class added on dragover
     */
    dropzoneActive: string;
    /**
     * — class removed from wrapper on render
     */
    filled: string;
};
export type DropzoneConfig = {
    /**
     * — SVG icon markup
     */
    iconHtml: string;
    /**
     * — localized "Upload" link text
     */
    uploadText: string;
    /**
     * — localized text after the upload link
     */
    afterText: string;
    /**
     * — trigger file input
     */
    onUploadClick: () => void;
    /**
     * — handle dropped files
     */
    onDrop: (dataTransfer: DataTransfer) => void;
};
