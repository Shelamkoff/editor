// @ts-check
import { sanitizeUrl } from '../sanitize/sanitizeUrl.js'

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value */
export function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {unknown} value @param {'link'|'external'|'media'|'download'} policy */
export function safeUrl(value, policy) {
  const input = typeof value === 'string' ? value : ''
  return sanitizeUrl(input, { policy, fallback: '' })
}

/** @param {unknown} value */
export function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

/** @param {unknown} value */
export function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

/** @param {unknown} value */
export function stringMap(value) {
  if (!isRecord(value)) return {}
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item
  }
  return result
}


/**
 * Require a canonical URL string. Empty strings are accepted for editor-valid
 * empty states unless allowEmpty is false.
 *
 * @param {unknown} value
 * @param {'link'|'external'|'media'|'download'} policy
 * @param {{ allowEmpty?: boolean }} [options]
 */
export function canonicalUrl(value, policy, options = {}) {
  const allowEmpty = options.allowEmpty !== false
  if (typeof value !== 'string') throw new TypeError('URL value must be a string')
  if (!value && allowEmpty) return ''
  const normalized = safeUrl(value, policy)
  if (!normalized || normalized !== value) {
    throw new TypeError('URL value is not canonical for policy "' + policy + '"')
  }
  return normalized
}
