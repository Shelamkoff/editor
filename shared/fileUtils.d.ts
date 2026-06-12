/**
 * Get the SVG icon for a file extension.
 * @param {string} ext  lowercase extension without dot
 * @returns {{ svg: string, key: string }}
 */
export function getFileIcon(ext: string): {
    svg: string;
    key: string;
};
/**
 * Format bytes into a human-readable size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes: number): string;
/**
 * Extract the extension from a filename.
 * @param {string} filename
 * @returns {string}
 */
export function getExtension(filename: string): string;
/**
 * Format an ISO date string as DD.MM.YYYY.
 * @param {string} [isoString]
 * @returns {string}
 */
export function formatDate(isoString?: string): string;
/** @type {Record<string, string>} */
export const FILE_ICONS: Record<string, string>;
/** Extension → icon key mapping. @type {Record<string, string>} */
export const EXT_MAP: Record<string, string>;
/** Extension → badge accent color (only for known doc types). @type {Record<string, string>} */
export const EXT_COLORS: Record<string, string>;
