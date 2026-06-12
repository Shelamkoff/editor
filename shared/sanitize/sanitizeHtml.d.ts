/**
 * Sanitize an HTML string and return a safe HTML string.
 * Used by block plugins when rendering stored content into contenteditable DOM.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html: string): string;
