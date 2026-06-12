// @ts-check
/**
 * @param {{ items?: unknown, [k: string]: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapTextFields(data, transform) {
  if (!Array.isArray(data.items)) return
  for (const item of data.items) {
    if (item && typeof item === 'object' && typeof (/** @type {{ text?: unknown }} */ (item)).text === 'string') {
      /** @type {{ text: string }} */ (item).text = transform(/** @type {{ text: string }} */ (item).text)
    }
  }
}
