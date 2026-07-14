import DOMPurify from '../runtime/dompurify.js'
import { sanitizeUrl } from './sanitizeUrl.js'

const RAW_HTML_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'meta',
    'link',
    'base',
  ],
  FORBID_ATTR: ['srcdoc'],
  ALLOW_DATA_ATTR: true,
}

const CSS_URL_RE = /url\(\s*(?:(["'])(.*?)\1|([^\s)"']+))\s*\)/gi

/** @param {string} value */
function sanitizeSrcset(value) {
  const candidates = []
  let start = 0
  let skippedDataComma = false

  for (let index = 0; index < value.length; index++) {
    if (value[index] !== ',') continue
    const current = value.slice(start, index).trimStart()
    if (/^data:/i.test(current) && !skippedDataComma) {
      skippedDataComma = true
      continue
    }
    candidates.push(value.slice(start, index))
    start = index + 1
    skippedDataComma = false
  }
  candidates.push(value.slice(start))

  return candidates.flatMap((candidate) => {
    const match = candidate.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?[wx]))?$/i)
    if (!match) return []
    const safe = sanitizeUrl(match[1], { policy: 'media', fallback: '' })
    return safe ? [safe + (match[2] ? ` ${match[2]}` : '')] : []
  }).join(', ')
}

/** @param {string} value */
function sanitizeCssValue(value) {
  if (/(?:expression\s*\(|@import|-moz-binding|behavior\s*:)/i.test(value)) return ''
  let matchedUrls = 0
  let rejected = false
  const safeValue = value.replace(CSS_URL_RE, (_match, _quote, quotedUrl, bareUrl) => {
    matchedUrls++
    const safe = sanitizeUrl(String(quotedUrl ?? bareUrl ?? ''), { policy: 'media', fallback: '' })
    if (!safe) {
      rejected = true
      return ''
    }
    return `url("${safe.replace(/["\\]/g, '\\$&')}")`
  })
  if (rejected || (/url\s*\(/i.test(value) && matchedUrls === 0)) return ''
  return safeValue
}

/** @param {string} value */
function sanitizeRawStyle(value) {
  const source = document.createElement('span')
  const result = document.createElement('span')
  source.style.cssText = value

  for (const property of Array.from(source.style)) {
    if (property === 'behavior' || property === '-moz-binding') continue
    const safeValue = sanitizeCssValue(source.style.getPropertyValue(property))
    if (safeValue) {
      result.style.setProperty(property, safeValue, source.style.getPropertyPriority(property))
    }
  }
  return result.style.cssText
}

/** @param {DocumentFragment} fragment */
function hardenRawFragment(fragment) {
  for (const element of fragment.querySelectorAll('*')) {
    const href = element.getAttribute('href')
    if (href !== null) {
      const policy = element.hasAttribute('download') ? 'download' : 'link'
      const safe = sanitizeUrl(href, { policy, fallback: '' })
      if (safe) element.setAttribute('href', safe)
      else element.removeAttribute('href')
    }

    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (value === null) continue
      const safe = sanitizeUrl(value, { policy: 'media', fallback: '' })
      if (safe) element.setAttribute(attribute, safe)
      else element.removeAttribute(attribute)
    }

    for (const attribute of ['cite', 'action', 'formaction']) {
      const value = element.getAttribute(attribute)
      if (value === null) continue
      const safe = sanitizeUrl(value, { policy: 'external', fallback: '' })
      if (safe) element.setAttribute(attribute, safe)
      else element.removeAttribute(attribute)
    }

    const srcset = element.getAttribute('srcset')
    if (srcset !== null) {
      const safe = sanitizeSrcset(srcset)
      if (safe) element.setAttribute('srcset', safe)
      else element.removeAttribute('srcset')
    }

    const style = element.getAttribute('style')
    if (style !== null) {
      const safe = sanitizeRawStyle(style)
      if (safe) element.setAttribute('style', safe)
      else element.removeAttribute('style')
    }
  }
}

/**
 * @param {string} html
 * @returns {DocumentFragment}
 */
function sanitizeRawFragment(html) {
  const fragment = /** @type {DocumentFragment} */ (DOMPurify.sanitize(String(html || ''), {
    ...RAW_HTML_CONFIG,
    RETURN_DOM_FRAGMENT: true,
    RETURN_TRUSTED_TYPE: false,
  }))
  hardenRawFragment(fragment)
  return fragment
}

/**
 * Sanitize HTML produced by the Raw block while preserving the safe subset
 * that the previous renderer supported.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRawHtml(html) {
  const template = document.createElement('template')
  template.content.appendChild(sanitizeRawFragment(html))
  return template.innerHTML
}

/**
 * Sanitize and assign Raw HTML through DOM nodes instead of an HTML string
 * sink. This stays compatible with CSP `require-trusted-types-for` while
 * preserving the string-returning sanitizeRawHtml API.
 * @param {HTMLElement} element
 * @param {string} html
 */
export function setSanitizedRawHtml(element, html) {
  element.replaceChildren(sanitizeRawFragment(html))
}
