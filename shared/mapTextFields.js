// @ts-check
import { normalizeTextValue } from './textFormat.js'

/**
 * Text-field traversal belongs to the document model, not to either the
 * editable plugin layer or the document renderer layer. Keeping the mappers
 * here makes both sides consume the same transformation contract.
 */

/**
 * @param {{ text?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapParagraphTextFields(data, transform) {
  data.text = transform(normalizeTextValue(data.text))
}

/**
 * @param {{ text?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapHeadingTextFields(data, transform) {
  data.text = transform(normalizeTextValue(data.text))
}

/**
 * @param {{ items?: unknown }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapListTextFields(data, transform) {
  if (Array.isArray(data.items)) {
    data.items = data.items.map(item => typeof item === 'string' ? transform(item) : item)
  }
}

/**
 * @param {{ text?: string, caption?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapQuoteTextFields(data, transform) {
  if (typeof data.text === 'string') data.text = transform(data.text)
  if (typeof data.caption === 'string') data.caption = transform(data.caption)
}

/**
 * @param {{ items?: unknown }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapChecklistTextFields(data, transform) {
  if (!Array.isArray(data.items)) return
  for (const item of data.items) {
    if (item && typeof item === 'object' && typeof (/** @type {{ text?: unknown }} */ (item)).text === 'string') {
      const checklistItem = /** @type {{ text: string }} */ (item)
      checklistItem.text = transform(checklistItem.text)
    }
  }
}

/**
 * @param {{ content?: unknown }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapTableTextFields(data, transform) {
  if (!Array.isArray(data.content)) return
  data.content = data.content.map(row => Array.isArray(row)
    ? row.map(cell => typeof cell === 'string' ? transform(cell) : cell)
    : row)
}

/**
 * @param {{ columns?: unknown }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapColumnsTextFields(data, transform) {
  if (!Array.isArray(data.columns)) return
  for (const column of data.columns) {
    if (column && typeof column === 'object' && typeof (/** @type {{ content?: unknown }} */ (column)).content === 'string') {
      const richTextColumn = /** @type {{ content: string }} */ (column)
      richTextColumn.content = transform(richTextColumn.content)
    }
  }
}

/**
 * @param {{ title?: string, message?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapWarningTextFields(data, transform) {
  if (typeof data.title === 'string') data.title = transform(data.title)
  if (typeof data.message === 'string') data.message = transform(data.message)
}

/**
 * @param {{ title?: string, content?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapToggleTextFields(data, transform) {
  if (typeof data.title === 'string') data.title = transform(data.title)
  if (typeof data.content === 'string') data.content = transform(data.content)
}

/**
 * @param {{ label?: string, content?: string }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapSpoilerTextFields(data, transform) {
  if (typeof data.label === 'string') data.label = transform(data.label)
  if (typeof data.content === 'string') data.content = transform(data.content)
}
