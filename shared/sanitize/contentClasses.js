// @ts-check
// Presentation-only class identity. Ordinary HTML serialization deliberately
// retains the canonical class spelling; no view metadata enters author data.
export const AUTHOR_CLASS_NAMESPACE = 'urn:rector:author-class'
export const CONTENT_STYLE_OWNER = 'data-oe-content-owner'
export const CONTENT_STYLE_FIELD = 'data-oe-content-field'

/** A mounted derived author view uses its nearest existing style owner. These
 * presentation markers grant no command/lifecycle authority and acquire no CSS.
 * Detached views are marked later by their exact owning projection.
 * @param {Element} element
 */
export function inheritContentStyleField(element) {
  const owner = element.closest?.(`[${CONTENT_STYLE_OWNER}]`)
  const id = owner?.getAttribute(CONTENT_STYLE_OWNER)
  if (id) element.setAttribute(CONTENT_STYLE_FIELD, id)
}

/** @param {Element} element */
export function namespaceContentClass(element) {
  if (!['span', 'code'].includes(element.localName)) return
  const value = element.getAttributeNS(null, 'class')
  if (value === null) return
  element.removeAttributeNS(null, 'class')
  element.setAttributeNS(AUTHOR_CLASS_NAMESPACE, 'class', value)
}

/** Restore presentation-only class identity on a detached serialization copy.
 * Its namespace move changed attribute order; restore canonical ordering without
 * normalizing styles/URLs or admitting otherwise undeclared live markup.
 * @param {Element} element
 */
export function canonicalizeContentClass(element) {
  if (!element.hasAttributeNS(AUTHOR_CLASS_NAMESPACE, 'class')) return
  const attributes = Array.from(element.attributes).sort((left, right) => left.name.localeCompare(right.name))
  for (const attribute of attributes) element.removeAttributeNS(attribute.namespaceURI, attribute.localName)
  for (const attribute of attributes) {
    const authorClass = attribute.namespaceURI === AUTHOR_CLASS_NAMESPACE && attribute.localName === 'class'
    element.setAttributeNS(authorClass ? null : attribute.namespaceURI, attribute.name, attribute.value)
  }
}
