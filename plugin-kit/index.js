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
} from '../shared/sanitize/sanitizeHtml.js'

export { escapeHtml } from '../shared/sanitize/escapeHtml.js'

export {
  canonicalizeRichText,
  normalizeRichText,
} from '../shared/richTextCodec.js'


export {
  getTextOffset,
  getTextLength,
  findNodeAtOffset,
  restoreSelectionByOffsets,
  editableTextWalker,
} from '../shared/textOffset.js'

export { handleMenuKeydown } from '../shared/menuKeyboardNav.js'


export { uid } from '../shared/uid.js'
export { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../shared/extensionConstants.js'

export { setSafeUrlAttribute } from '../shared/sanitize/sanitizeUrl.js'
