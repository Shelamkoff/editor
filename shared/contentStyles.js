// @ts-check
/** @type {readonly string[]} */
export const EMPTY_CONTENT_STYLES = Object.freeze([])

/** Application-owned stylesheet text, captured before resource acquisition.
 * @param {unknown} input
 * @param {string} label
 * @returns {readonly string[]}
 */
export function snapshotContentStyles(input, label) {
  if (input === undefined) return EMPTY_CONTENT_STYLES
  if (!Array.isArray(input)) throw new TypeError(`${label} must be an array of CSS strings`)
  const length = input.length, result = []
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(input, index)) throw new TypeError(`${label} must be a dense array of CSS strings`)
    const source = input[index]
    if (typeof source !== 'string') throw new TypeError(`${label} must contain only CSS strings`)
    result.push(source)
  }
  return Object.freeze(result)
}
