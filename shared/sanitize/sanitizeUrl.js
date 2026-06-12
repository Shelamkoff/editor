import { DANGEROUS_URL_RE } from './allowlist.js'

/**
 * Sanitize a URL string — strip control chars, block dangerous schemes.
 * Returns '#' for rejected URLs so callers can safely set it on an attribute.
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  if (!url) return '#'
  // Strip control chars and normalize for scheme detection
  const stripped = url.replace(/[\x00-\x1f\x7f]/g, '').trim()
  if (DANGEROUS_URL_RE.test(stripped)) return '#'
  return stripped
}
