// @ts-check

/**
 * Text-field traversal belongs to the document model, not to either the
 * editable plugin layer or the document renderer layer. Keeping the mappers
 * here makes both sides consume the same transformation contract.
 */

/**
 * @param {{ text?: string }} data
 * @param {(html: string) => string} transform
 */
export function mapParagraphTextFields(data, transform) {
  data.text = transform(data.text || '')
}

/**
 * @param {{ text?: string }} data
 * @param {(html: string) => string} transform
 */
export function mapHeadingTextFields(data, transform) {
  data.text = transform(data.text || '')
}

/**
 * @param {{ items?: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapListTextFields(data, transform) {
  if (Array.isArray(data.items)) {
    data.items = data.items.map(item => typeof item === 'string' ? transform(item) : item)
  }
}

/**
 * @param {{ text?: string, caption?: string }} data
 * @param {(html: string) => string} transform
 */
export function mapQuoteTextFields(data, transform) {
  if (typeof data.text === 'string') data.text = transform(data.text)
  if (typeof data.caption === 'string') data.caption = transform(data.caption)
}

/**
 * @param {{ items?: unknown }} data
 * @param {(html: string) => string} transform
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
