/**
 * Parse an HTML string into a sanitized DocumentFragment.
 * Used by the renderer for read-only output of inline content.
 *
 * Behaves identically to sanitizeHtml(), but returns a live DocumentFragment
 * instead of a string — avoids an extra serialize/parse round-trip.
 *
 * @param {string} html
 * @returns {DocumentFragment}
 */
export function parseInline(html: string): DocumentFragment;
