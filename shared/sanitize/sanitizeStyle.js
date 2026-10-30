import { ALLOWED_STYLE_PROPS } from './allowlist.js'

/**
 * Filter an inline declaration block parsed by its owning DOM realm.
 * The browser owns CSS grammar, escaping, comments and declaration precedence;
 * this boundary owns the existing presentation-property allowlist. The walker
 * calls it while the element is still inside an inert template.
 *
 * @param {CSSStyleDeclaration} style
 * @returns {string} Canonical `prop: value; prop: value;` string, or '' if nothing left.
 */
export function sanitizeStyle(style) {
  /** @type {string[]} */
  const safe = []

  for (let index = 0; index < style.length; index++) {
    const property = style.item(index)
    if (!ALLOWED_STYLE_PROPS.has(property)) continue
    const value = style.getPropertyValue(property)
    // A shorthand containing var() can expose pending longhands without a
    // serializable value. Emitting one would create invalid, unstable CSS.
    if (!value) continue
    const priority = style.getPropertyPriority(property)
    safe.push(`${property}: ${value}${priority ? ` !${priority}` : ''}`)
  }

  // Match CSSStyleDeclaration/innerHTML serialization so save → render → save
  // remains byte-stable for formatting created through element.style.
  return safe.length > 0 ? `${safe.join('; ')};` : ''
}
