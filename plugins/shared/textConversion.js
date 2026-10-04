import { escapeHtml } from '../../shared/sanitize/escapeHtml.js'

/** A text source may carry author markup or literal plain text.
 * @param {import('../../plugin-kit/types').ConversionPayload} payload Candidate conversion payload.
 * @returns {payload is import('../../plugin-kit/types').ConversionPayload & {kind: 'rich-text' | 'plain-text', data: {text: string}}} Whether it contains a supported textual payload.
 */
export function acceptsTextPayload(payload) {
  return (payload?.kind === 'rich-text' || payload?.kind === 'plain-text')
    && typeof payload.data?.text === 'string'
}

/** Convert literal text to authored HTML without interpreting its source.
 * @param {import('../../plugin-kit/types').ConversionPayload} payload Textual conversion payload.
 * @returns {string} Authored HTML or escaped literal text with line breaks.
 */
export function richTextFromPayload(payload) {
  if (!acceptsTextPayload(payload)) throw new TypeError('Conversion requires a textual payload')
  return payload.kind === 'rich-text'
    ? payload.data.text
    : escapeHtml(payload.data.text).replace(/\r\n?|\n/g, '<br>')
}
