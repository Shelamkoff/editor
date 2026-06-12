/**
 * Sanitize a URL string — strip control chars, block dangerous schemes.
 * Returns '#' for rejected URLs so callers can safely set it on an attribute.
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url: string): string;
