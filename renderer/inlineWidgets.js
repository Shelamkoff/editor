// @ts-check
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_-]+)\}\}/g

/**
 * Project canonical inline widget references into read-only widget DOM.
 * Unknown widgets remain literal tokens. Registered schemas reject invalid
 * payloads; schema and projection errors abort the render operation.
 *
 * @param {DocumentFragment} fragment
 * @param {Record<string, import('./types').InlineWidget> | null | undefined} inline
 * @param {Map<string, import('./types').InlineWidgetRenderer>} registry
 * @param {Document} ownerDocument
 * @returns {DocumentFragment}
 */
export function renderInlineWidgets(fragment, inline, registry, ownerDocument) {
  if (!inline || typeof inline !== 'object' || registry.size === 0) return fragment
  const walker = ownerDocument.createTreeWalker(fragment, 4)
  /** @type {Text[]} */
  const textNodes = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(/** @type {Text} */ (node))

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('[data-inline-plugin]')) continue
    const text = textNode.data
    if (!text.includes('{{')) continue

    const replacement = ownerDocument.createDocumentFragment()
    let lastIndex = 0
    let projected = false

    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      const [token, id] = match
      const ref = Object.hasOwn(inline, id) ? inline[id] : undefined
      if (!ref || typeof ref !== 'object' || typeof ref.type !== 'string') continue
      const renderer = registry.get(ref.type)
      if (!renderer) continue

      const decoded = renderer.schema.decode({ dataVersion: ref.dataVersion, data: ref.data })
      const element = renderer.render(id, decoded.data, { ownerDocument })
      const HTMLElementCtor = ownerDocument.defaultView?.HTMLElement ?? globalThis.HTMLElement
      if (!HTMLElementCtor || !(element instanceof HTMLElementCtor)) continue

      if (match.index > lastIndex) replacement.append(ownerDocument.createTextNode(text.slice(lastIndex, match.index)))
      element.setAttribute('data-inline-plugin', ref.type)
      element.setAttribute('data-id', id)
      element.contentEditable = 'false'
      replacement.append(element)
      lastIndex = match.index + token.length
      projected = true
    }

    if (!projected) continue
    if (lastIndex < text.length) replacement.append(ownerDocument.createTextNode(text.slice(lastIndex)))
    textNode.replaceWith(replacement)
  }

  return fragment
}
