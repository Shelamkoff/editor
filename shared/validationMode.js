/**
 * Normalize the validation policy at runtime. Type declarations protect TS
 * consumers, but JavaScript callers must not silently fall back on typos.
 * @param {unknown} value
 * @returns {'preserve' | 'strict'}
 */
export function resolveValidationMode(value) {
  if (value === undefined) return 'preserve'
  if (value === 'preserve' || value === 'strict') return value
  throw new TypeError('validationMode must be "preserve" or "strict"')
}
