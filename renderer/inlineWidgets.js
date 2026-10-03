// @ts-check
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'

const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_-]+)\}\}/g

/**
 * Project canonical inline widget references into read-only widget DOM.
 * Unknown, malformed, unsupported or failed widgets remain literal tokens.
 *
 * @param {string} html
 * @param {Record<string, import('./types').InlineWidget> | null | undefined} inline
 * @param {Map<string, import('./types').InlineWidgetRenderer>} registry
 * @param {Document} ownerDocument
 * @returns {string}
 */
export function renderInlineWidgets(html, inline, registry, ownerDocument) {
  const source = String(html || '')
  if (!source || !inline || typeof inline !== 'object' || registry.size === 0 || !source.includes('{{')) return source

  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(source, ownerDocument))
  const walker = ownerDocument.createTreeWalker(template.content, 4)
  /** @type {Text[]} */
  const textNodes = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(/** @type {Text} */ (node))

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('[data-inline-plugin]')) continue
    const text = textNode.data
    if (!text.includes('{{')) continue

    const fragment = ownerDocument.createDocumentFragment()
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

      if (match.index > lastIndex) fragment.append(ownerDocument.createTextNode(text.slice(lastIndex, match.index)))
      element.setAttribute('data-inline-plugin', ref.type)
      element.setAttribute('data-id', id)
      element.contentEditable = 'false'
      fragment.append(element)
      lastIndex = match.index + token.length
      projected = true
    }

    if (!projected) continue
    if (lastIndex < text.length) fragment.append(ownerDocument.createTextNode(text.slice(lastIndex)))
    textNode.replaceWith(fragment)
  }

  return template.innerHTML
}
