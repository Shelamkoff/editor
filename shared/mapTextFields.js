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
  if (!Array.isArray(data.items)) return
  data.items = data.items.map(item => (
    item && typeof item === 'object' && typeof item.text === 'string'
      ? { ...item, text: transform(item.text) }
      : item
  ))
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
 * @param {{ rows?: unknown }} data
 * @param {(html: string) => string} transform
 * @returns {void}
 */
export function mapTableTextFields(data, transform) {
  if (!Array.isArray(data.rows)) return
  data.rows = data.rows.map(row => {
    if (!row || typeof row !== 'object' || !Array.isArray(row.cells)) return row
    return {
      ...row,
      cells: row.cells.map(cell => (
        cell && typeof cell === 'object' && typeof cell.text === 'string'
          ? { ...cell, text: transform(cell.text) }
          : cell
      )),
    }
  })
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
