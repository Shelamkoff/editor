/**
 * Unified allowlists for inline HTML sanitization.
 * Shared between core (plugin render / paste path) and document output.
 */

/** Inline tags permitted inside editable text blocks. */
export const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'a', 'code', 'mark', 'br', 'span', 's', 'strike', 'sup', 'sub',
])

/**
 * Allowed HTML attributes per tag.
 * @type {Record<string, Set<string>>}
 */
export const ALLOWED_ATTRS = {
  a: new Set(['href', 'target', 'rel']),
  span: new Set(['class', 'style']),
  code: new Set(['class', 'lang']),
}
/** CSS properties allowed in inline style attributes. */
export const ALLOWED_STYLE_PROPS = new Set([
  'background-color', 'color', 'font-size',
])

/** URL schemes that must always be blocked, irrespective of a field policy. */
export const DANGEROUS_URL_RE = /^(javascript|vbscript|file|filesystem)\s*:/i
