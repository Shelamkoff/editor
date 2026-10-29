// @ts-check
import { synchronousResult } from '../shared/synchronousResult.js'

const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_-]+)\}\}/g

/**
 * Project canonical inline widget references into read-only widget DOM.
 * Unknown widgets remain literal tokens. Registered schemas reject invalid
 * payloads; schema and projection errors abort the render operation.
 *
 * @param {DocumentFragment} fragment
 * @param {Record<string, import('../shared/documentTypes.js').EditorInlineWidget> | null | undefined} inline
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
    if (textNode.parentElement?.closest('[data-inline-plugin], span.oe-inline-literal')) continue
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
      const element = synchronousResult(renderer.render(id, decoded.data, { ownerDocument }))
      const HTMLElementCtor = ownerDocument.defaultView?.HTMLElement ?? globalThis.HTMLElement
      if (!HTMLElementCtor || !(element instanceof HTMLElementCtor)) {
        throw new TypeError(`Inline renderer "${ref.type}" render() must return an HTMLElement`)
      }
      if (element.ownerDocument && element.ownerDocument !== ownerDocument) {
        throw new TypeError(`Inline renderer "${ref.type}" must return an HTMLElement in the owning document`)
      }
      // The returned root must not already belong to another UI or a
      // previously projected occurrence, even in a detached fragment.
      if (element.isConnected || element.parentNode) {
        throw new TypeError(`Inline renderer "${ref.type}" must return a fresh detached HTMLElement`)
      }

      if (match.index > lastIndex) replacement.append(ownerDocument.createTextNode(text.slice(lastIndex, match.index)))
      element.setAttribute('data-inline-plugin', ref.type)
      element.setAttribute('data-id', id)
      element.contentEditable = 'false'
      // Custom-element attribute callbacks can synchronously adopt the node
      // after the initial detached-owner check. Never move an element that a
      // newer host or DOM owner claimed while we decorated its attributes.
      if (element.isConnected || element.parentNode) {
        throw new TypeError(`Inline renderer "${ref.type}" must return a fresh detached HTMLElement`)
      }
      if (element.ownerDocument && element.ownerDocument !== ownerDocument) {
        throw new TypeError(`Inline renderer "${ref.type}" must return an HTMLElement in the owning document`)
      }
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
