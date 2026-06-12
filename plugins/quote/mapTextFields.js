// @ts-check
/**
 * @param {{ text?: string, caption?: string, [k: string]: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapTextFields(data, transform) {
  if (typeof data.text === 'string') data.text = transform(data.text)
  if (typeof data.caption === 'string') data.caption = transform(data.caption)
}
