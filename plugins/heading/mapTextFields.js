// @ts-check
/**
 * @param {{ text?: string, [k: string]: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapTextFields(data, transform) {
  data.text = transform(data.text || '')
}
