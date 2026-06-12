/**
 * Backward-compat facade. Real implementation lives in `../shared/sanitize`,
 * shared between core (plugin render / paste) and renderer (read-only output).
 */
export { sanitizeHtml, escapeHtml } from '../shared/sanitize/index.js'
