import { setTrustedHtml } from './sanitize.js'
import { generateInlineId } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'

/** Transfer referenced metadata alongside an HTML fragment, remapping collisions.
 * Parsing in an inert template keeps token-like attributes and widget labels out
 * of the reference scan. The incoming object is never mutated.
 * @param {string} html
 * @param {Record<string, import('../renderer/types').InlineWidget>} references
 * @param {Set<string>} occupied
 * @param {Document} [ownerDocument]
 * @returns {{ html: string, inline: Record<string, import('../renderer/types').InlineWidget> }}
 */
export function transferInlineContent(html, references, occupied, ownerDocument = document) {
  if (!references || !Object.keys(references).length) return { html, inline: {} }
  const template = ownerDocument.createElement('template')
  setTrustedHtml(template, html)
  const mapping = new Map()
  const entries = []
  const allocate = id => {
    if (!Object.hasOwn(references, id)) return id
    if (mapping.has(id)) return mapping.get(id)
    let next = id
    while (occupied.has(next) || ['__proto__', 'constructor', 'prototype'].includes(next)) next = generateInlineId()
    occupied.add(next)
    mapping.set(id, next)
    entries.push([next, cloneEditorData(references[id])])
    return next
  }
  const walker = ownerDocument.createTreeWalker(template.content, 4)
  while (walker.nextNode()) {
    const text = /** @type {Text} */ (walker.currentNode)
    if (text.parentElement?.closest('[data-inline-plugin]')) continue
    text.data = text.data.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (_, id) => `{{${allocate(id)}}}`)
  }
  for (const widget of template.content.querySelectorAll('[data-inline-plugin][data-id]')) {
    const id = widget.getAttribute('data-id')
    widget.setAttribute('data-id', allocate(id))
  }
  return { html: template.innerHTML, inline: Object.fromEntries(entries) }
}
