/**
 * Inject CSS stylesheet URLs via <link> tags with reference counting.
 * @param {string[]} urls
 * @returns {{ destroy(): void }}
 */
export function injectStyleUrls(urls: string[]): {
    destroy(): void;
};
