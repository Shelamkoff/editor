/**
 * Backward-compat facade. Real implementation lives in `../shared/sanitize`,
 * shared between core (plugin render / paste) and renderer (read-only output).
 */
export { sanitizeHtml, setSanitizedHtml, insertSanitizedHtml } from '../shared/sanitize/sanitizeHtml.js'
export { escapeHtml } from '../shared/sanitize/escapeHtml.js'
