import { DANGEROUS_URL_RE } from './allowlist.js'

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])
const MEDIA_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])
const DOWNLOAD_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])
const SAFE_IMAGE_DATA_RE = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i

/**
 * @typedef {'link' | 'external' | 'media' | 'download'} UrlPolicy
 * @typedef {{
 *   policy?: UrlPolicy,
 *   allowRelative?: boolean,
 *   fallback?: string,
 * }} SanitizeUrlOptions
 */

/** @param {UrlPolicy} policy */
function getAllowedProtocols(policy) {
  if (policy === 'external') return EXTERNAL_PROTOCOLS
  if (policy === 'media') return MEDIA_PROTOCOLS
  if (policy === 'download') return DOWNLOAD_PROTOCOLS
  return LINK_PROTOCOLS
}

/**
 * Sanitize a URL string — strip control chars, block dangerous schemes.
 * Returns '#' for rejected URLs so callers can safely set it on an attribute.
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url, options = {}) {
  const fallback = options.fallback ?? '#'
  if (typeof url !== 'string' || !url) return fallback

  const policy = options.policy ?? 'link'
  const allowRelative = options.allowRelative ?? true
  const stripped = url.replace(/[\x00-\x1f\x7f]/g, '').trim()
  if (!stripped) return fallback

  const normalized = stripped.replace(/[\t\n\r ]/g, '')
  if (DANGEROUS_URL_RE.test(normalized)) return fallback

  if ((policy === 'media' || policy === 'download') && SAFE_IMAGE_DATA_RE.test(stripped)) return stripped
  if (/^data\s*:/i.test(normalized)) return fallback

  if (stripped.startsWith('//')) return allowRelative ? stripped : fallback

  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!schemeMatch) return allowRelative ? stripped : fallback

  const protocol = String(schemeMatch[1]).toLowerCase() + ':'
  if (!getAllowedProtocols(policy).has(protocol)) return fallback

  return stripped
}

/** @param {string} url */
export function sanitizeExternalUrl(url) {
  return sanitizeUrl(url, { policy: 'external' })
}

/** @param {string} url */
export function sanitizeMediaUrl(url) {
  return sanitizeUrl(url, { policy: 'media', fallback: '' })
}

/** @param {string} url */
export function sanitizeDownloadUrl(url) {
  return sanitizeUrl(url, { policy: 'download', fallback: '' })
}

/**
 * Set or remove a URL-bearing DOM attribute according to a field policy.
 * @param {Element} element
 * @param {'href' | 'src' | 'poster'} attribute
 * @param {string} url
 * @param {UrlPolicy} [policy]
 * @returns {string}
 */
export function setSafeUrlAttribute(element, attribute, url, policy = 'link') {
  const safe = sanitizeUrl(url, { policy, fallback: '' })
  if (safe) element.setAttribute(attribute, safe)
  else element.removeAttribute(attribute)
  return safe
}
