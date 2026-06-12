/**
 * @typedef {Object} ExtractedBlock
 * @property {string} tag — lowercase tag name (e.g. 'p', 'pre', 'h2')
 * @property {HTMLElement} element — the DOM element
 */
/**
 * Extract block-level elements from parsed HTML.
 * Returns an array of {tag, element} objects for each block-level element found.
 * Inline-only content is returned as a synthetic 'p' wrapper.
 *
 * @param {HTMLElement} container — parsed HTML container
 * @returns {ExtractedBlock[]}
 */
export function extractBlockElements(container: HTMLElement): ExtractedBlock[];
export type ExtractedBlock = {
    /**
     * — lowercase tag name (e.g. 'p', 'pre', 'h2')
     */
    tag: string;
    /**
     * — the DOM element
     */
    element: HTMLElement;
};
