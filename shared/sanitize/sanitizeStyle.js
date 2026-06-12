import { ALLOWED_STYLE_PROPS } from './allowlist.js'

/**
 * Sanitize an inline `style` attribute value.
 * Keeps only whitelisted CSS properties and blocks values containing
 * `expression(` or `url(` (defense against legacy IE expression and CSS fetching).
 *
 * @param {string} style
 * @returns {string} Sanitized `prop: value; prop: value` string, or '' if nothing left.
 */
export function sanitizeStyle(style) {
  if (!style) return ''

  /** @type {string[]} */
  const safe = []

  for (const part of style.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const property = trimmed.slice(0, colonIndex).trim().toLowerCase()
    const value = trimmed.slice(colonIndex + 1).trim()

    if (!ALLOWED_STYLE_PROPS.has(property)) continue
    if (!value) continue
    // Block known CSS attack vectors
    if (value.includes('expression')) continue
    if (value.includes('url(')) continue

    safe.push(`${property}: ${value}`)
  }

  return safe.join('; ')
}
