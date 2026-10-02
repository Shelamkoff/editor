import {
  canonicalizeRichText,
  escapeHtml,
  insertSanitizedHtml,
  normalizeRichText,
  sanitizeHtml,
  setSanitizedHtml,
} from '../../.package-tmp/declaration-tests/plugin-kit/index.js'

declare const element: HTMLElement
declare const ownerDocument: Document

void sanitizeHtml('<b>safe</b>', ownerDocument)
void normalizeRichText('<strong>safe</strong>', ownerDocument)
void canonicalizeRichText('<strong>safe</strong>', ownerDocument)
void escapeHtml('<safe>')
setSanitizedHtml(element, '<b>safe</b>')
insertSanitizedHtml(element, 'beforeend', '<i>safe</i>')
