/**
 * Sanitize an inline `style` attribute value.
 * Keeps only whitelisted CSS properties and blocks values containing
 * `expression(` or `url(` (defense against legacy IE expression and CSS fetching).
 *
 * @param {string} style
 * @returns {string} Sanitized `prop: value; prop: value` string, or '' if nothing left.
 */
export function sanitizeStyle(style: string): string;
