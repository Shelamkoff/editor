// @ts-check
/**
 * Shared text-field traversal for the paragraph block. Referenced from
 * both the editor-side plugin class and the renderer-side block renderer
 * so the two stay in lock-step without either depending on the other.
 *
 * @param {{ text?: string, [k: string]: unknown }} data
 * @param {(html: string) => string} transform
 */
export function mapTextFields(data, transform) {
  data.text = transform(data.text || '')
}
