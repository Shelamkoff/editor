// @ts-check

/**
 * Public extension-safe HTML and rich-text utilities.
 *
 * This entry intentionally depends only on neutral shared modules. Plugins may
 * import this source entry inside the repository; third-party consumers import
 * `@shelamkoff/rector/plugin-kit`.
 */

export {
  sanitizeHtml,
  setSanitizedHtml,
  insertSanitizedHtml,
  setTrustedHtml,
} from '../shared/sanitize/sanitizeHtml.js'

export { escapeHtml } from '../shared/sanitize/escapeHtml.js'

export {
  canonicalizeRichText,
  normalizeRichText,
} from '../shared/richTextCodec.js'
