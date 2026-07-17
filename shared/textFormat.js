/** Supported CSS text-align values in serialized block data. */
export const TEXT_ALIGNS = Object.freeze(['left', 'center', 'right', 'justify'])

const TEXT_ALIGN_SET = new Set(TEXT_ALIGNS)

/**
 * Return a serialized text field only when it is a string.
 *
 * Renderers run before document validation so invalid external documents can
 * still be inspected and reported. Normalizing at the rendering boundary
 * prevents objects and arrays from leaking into the DOM as "[object Object]".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTextValue(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Check whether a value is a supported serialized text alignment.
 * @param {unknown} value
 * @returns {value is 'left' | 'center' | 'right' | 'justify'}
 */
export function isTextAlign(value) {
  return typeof value === 'string' && TEXT_ALIGN_SET.has(value)
}

/**
 * Return a supported text alignment or an empty string for invalid input.
 * @param {unknown} value
 * @returns {'' | 'left' | 'center' | 'right' | 'justify'}
 */
export function normalizeTextAlign(value) {
  return isTextAlign(value) ? value : ''
}

/**
 * Normalize a heading level to the supported H2-H6 range.
 * Non-integer and non-finite values fall back to H2.
 * @param {unknown} value
 * @returns {2 | 3 | 4 | 5 | 6}
 */
export function normalizeHeadingLevel(value) {
  const number = Number(value)
  if (!Number.isInteger(number)) return 2
  return /** @type {2 | 3 | 4 | 5 | 6} */ (Math.min(Math.max(number, 2), 6))
}
