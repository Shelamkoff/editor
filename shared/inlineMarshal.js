// @ts-check
/**
 * Inline widget marshalling.
 *
 * Model:
 *   Every committed inline widget carries a stable instance id on its DOM
 *   (`data-id` attribute), generated once at creation time and preserved
 *   through save / load round-trips. That id is simultaneously:
 *     - the key under which the widget's data is stored in the block-level
 *       `inline` map on save;
 *     - the placeholder referenced inline in the block's text field, as
 *       `{{<id>}}`;
 *     - the value written back to `data-id` when the widget is rehydrated
 *       on load.
 *
 * Storage on save:
 *   Live DOM    → `<span data-inline-plugin="mention" data-id="w_3k7a"
 *                   data-value="1" class="oe-ip oe-ip--mention">@Anna</span>`
 *   Serialized  → text field becomes `... {{w_3k7a}} ...` plus
 *                   `inline["w_3k7a"] = { type: "mention", data: { id: "1", name: "Anna" } }`.
 *
 * Both directions dispatch polymorphically through the registered inline
 * plugin's own `getData` (save) / `createWidget(data, id)` (load).
 */

/**
 * @typedef {import('../renderer/types').InlineWidget} InlineWidget
 * @typedef {import('../renderer/types').InlinePluginLike} InlinePluginLike
 * @typedef {{ get(type: string): InlinePluginLike | undefined }} PluginLookup
 */

/**
 * Generate a new inline widget instance id. Not cryptographic — just
 * collision-resistant enough within a single document (a few tens of
 * widgets per block at most).
 *
 * Implementation: two independent `Math.random()` samples concatenated
 * and fixed-length padded. The two samples defend against the rare case
 * where a single `Math.random()` yields a value whose base36 text form is
 * unusually short (e.g. `(0.5).toString(36) === "0.i"`) — padding +
 * doubling guarantees ~48 bits of entropy and a stable 10-char body.
 *
 * @returns {string}
 */
export function generateInlineId() {
  const a = Math.random().toString(36).slice(2).padEnd(6, '0').slice(0, 6)
  const b = Math.random().toString(36).slice(2).padEnd(4, '0').slice(0, 4)
  return 'w_' + a + b
}

/**
 * Matches `{{<id>}}` tokens. Ids are alphanumeric + `_` + `-` (matches
 * our own `generateInlineId` output plus any reasonable external id).
 */
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_-]+)\}\}/g
const INLINE_ID_RE = /^[A-Za-z0-9_-]+$/
const RESERVED_INLINE_IDS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * @param {string | null} preferred
 * @param {Set<string>} usedIds
 */
function allocateInlineId(preferred, usedIds) {
  let id = preferred
  if (!id || !INLINE_ID_RE.test(id) || RESERVED_INLINE_IDS.has(id) || usedIds.has(id)) {
    do {
      id = generateInlineId()
    } while (usedIds.has(id) || RESERVED_INLINE_IDS.has(id))
  }
  usedIds.add(id)
  return id
}

/**
 * Walk `html` for inline-plugin widget spans, replace each with a
 * `{{<widget-id>}}` text placeholder, and collect their data into an
 * `inline` map keyed by widget id. Widgets without `data-id` get one
 * generated on the fly.
 *
 * @param {string} html
 * @param {PluginLookup | null | undefined} registry
 * @param {Set<string>} [usedIds] IDs already allocated in sibling text fields
 * @returns {{ html: string, inline: Record<string, InlineWidget> }}
 */
export function serializeInlineHtml(html, registry, usedIds = new Set()) {
  /** @type {Array<[string, InlineWidget]>} */
  const entries = []
  const source = String(html || '')
  if (!source || !registry) return { html: source, inline: {} }

  const tpl = document.createElement('template')
  tpl.innerHTML = source

  const widgets = tpl.content.querySelectorAll('[data-inline-plugin]')
  for (const widget of widgets) {
    const el = /** @type {HTMLElement} */ (widget)
    const type = el.getAttribute('data-inline-plugin')
    if (!type) continue
    const plugin = registry.get(type)
    if (!plugin) continue

    const id = allocateInlineId(el.getAttribute('data-id'), usedIds)
    const data = plugin.getData(el)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError(`Inline plugin "${type}" getData() must return a data object`)
    }
    entries.push([id, {
      type,
      data,
    }])

    // Placeholder is a plain text token. It survives sanitization as-is
    // (text content is untouched by the tag/attribute allowlist) and
    // round-trips cleanly through innerHTML serialization.
    el.replaceWith(document.createTextNode(`{{${id}}}`))
  }

  return { html: tpl.innerHTML, inline: Object.fromEntries(entries) }
}

/**
 * Expand `{{<id>}}` tokens back into widget DOM.
 *
 * For each token:
 *   - look up `inline[id]` — if missing, leave the token text in place
 *     (the user may have typed something that happens to look like one);
 *   - dispatch to `registry.get(type).createWidget(data, id)` —
 *     rebuilding the widget with its STABLE id preserved.
 *
 * Built as a DOM walk (not regex-over-string) so inserted widget
 * elements don't disturb surrounding markup / nested elements.
 *
 * @param {string} html
 * @param {Record<string, InlineWidget> | null | undefined} inline
 * @param {PluginLookup | null | undefined} registry
 * @returns {string}
 */
export function deserializeInlineHtml(html, inline, registry) {
  const source = String(html || '')
  if (!source) return ''
  if (!inline || typeof inline !== 'object' || !registry || !source.includes('{{')) return source

  const tpl = document.createElement('template')
  tpl.innerHTML = source

  /** Visit every text node and expand placeholder tokens in place. */
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT)
  /** @type {Text[]} */
  const textNodes = []
  let cur = walker.nextNode()
  while (cur) {
    textNodes.push(/** @type {Text} */ (cur))
    cur = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const text = textNode.data
    if (!text.includes('{{')) continue

    // Build a fragment: alternating plain-text runs + widget nodes.
    const frag = document.createDocumentFragment()
    let lastIndex = 0
    PLACEHOLDER_RE.lastIndex = 0
    /** @type {RegExpExecArray | null} */
    let match
    while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
      const [token, id] = match
      const ref = Object.prototype.hasOwnProperty.call(inline, id) ? inline[id] : undefined
      if (!ref || typeof ref !== 'object' || typeof ref.type !== 'string') continue
      const plugin = registry.get(ref.type)
      if (!plugin) continue   // leave untouched text — user-typed lookalike

      let widget
      try {
        const data = ref.data && typeof ref.data === 'object'
          ? /** @type {Record<string, unknown>} */ (ref.data)
          : {}
        widget = plugin.createWidget(data, id)
      } catch {
        // Preserve malformed legacy entries as their original plain token.
        continue
      }
      if (!(widget instanceof HTMLElement)) continue

      // Preserve the text before the placeholder.
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      // Instantiate the widget with its stable id preserved.
      frag.appendChild(widget)
      lastIndex = match.index + token.length
    }

    // Nothing matched → leave the text node alone.
    if (lastIndex === 0) continue

    // Trailing text after the last match.
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    textNode.replaceWith(frag)
  }

  return tpl.innerHTML
}
