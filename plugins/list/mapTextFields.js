// @ts-check
/**
 * @param {{ items?: unknown, [k: string]: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapTextFields(data, transform) {
  if (Array.isArray(data.items)) {
    data.items = data.items.map(item => typeof item === 'string' ? transform(item) : item)
  }
}
