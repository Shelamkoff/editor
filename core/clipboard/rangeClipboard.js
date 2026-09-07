import { serializeInlineHtml } from '../../shared/inlineMarshal.js'
import { cloneEditorData } from '../../shared/cloneEditorData.js'
import { transferInlineContent } from '../transferInlineContent.js'

/** A selected fragment is not an array of whole document blocks. */
export const FRAGMENT_MIME = 'application/x-rector-fragment'

/** Keep the ordinary text/HTML fallbacks, plus a lossless representation when
 * the selected text references payloads which are not present in widget DOM.
 * Only cloned nodes are rewritten; source IDs, selection and data stay intact.
 * @param {Range} range
 * @param {import('../types').BlockData[]} blocks Canonical document snapshot.
 * @param {import('../InlinePluginRegistry').InlinePluginRegistry} registry
 * @returns {{ text: string, html: string, fragment?: string }}
 */
export function rangeClipboardContent(range, blocks, registry) {
  const template = document.createElement('template')
  template.content.appendChild(range.cloneContents())
  const result = { text: range.toString(), html: template.innerHTML }
  const canonical = new Map(blocks.map(block => [block.id, block]))
  const copies = [...template.content.querySelectorAll('.oe-block[data-block-id]')]
    .filter(node => !node.closest('[data-inline-plugin]'))
  let needsMetadata = false
  // Reserve all literal tokens as well, so a copied reference cannot give an
  // unrelated user-typed lookalike (in another block) an unintended payload.
  const occupied = new Set()
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest('[data-inline-plugin]')) continue
    const blockId = node.parentElement?.closest('.oe-block[data-block-id]')?.getAttribute('data-block-id')
    const inline = canonical.get(blockId)?.inline
    for (const [, id] of (node.textContent || '').matchAll(/\{\{([A-Za-z0-9_-]+)\}\}/g)) {
      occupied.add(id)
      if (inline && Object.hasOwn(inline, id)) needsMetadata = true
    }
  }
  if (!needsMetadata) return result

  const entries = []
  for (const copy of copies) {
    const source = canonical.get(copy.getAttribute('data-block-id'))
    if (!source) continue
    // Known widgets become portable tokens as well: the receiving editor may
    // register a different set of plugins than the source editor.
    const serialized = serializeInlineHtml(copy.innerHTML, registry, new Set(), source.inline)
    const transferred = transferInlineContent(serialized.html, serialized.inline, occupied)
    copy.innerHTML = transferred.html
    entries.push(...Object.entries(transferred.inline))
  }
  return {
    ...result,
    fragment: JSON.stringify({ version: 1, html: template.innerHTML, inline: Object.fromEntries(entries) }),
  }
}

/** Validate untrusted clipboard data before deleting the recipient selection.
 * HTML still passes through the ordinary inert parser and sanitizer.
 * @param {string} value
 * @returns {{ html: string, inline: Record<string, import('../../renderer/types').InlineWidget> } | null}
 */
export function parseClipboardFragment(value) {
  if (!value) return null
  try {
    const fragment = JSON.parse(value)
    if (!fragment || fragment.version !== 1 || typeof fragment.html !== 'string'
        || !fragment.inline || typeof fragment.inline !== 'object' || Array.isArray(fragment.inline)) return null
    for (const [id, entry] of Object.entries(fragment.inline)) {
      if (!/^[A-Za-z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)
          || !entry || typeof entry !== 'object' || typeof entry.type !== 'string'
          || !entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) return null
    }
    return cloneEditorData({ html: fragment.html, inline: fragment.inline })
  } catch { return null }
}
