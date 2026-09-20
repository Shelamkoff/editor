// @ts-check
import { toTrustedHtml } from './sanitize/trustedHtml.js'

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
 * @typedef {import('../renderer/types').InlinePluginLike & { isCommitted?(element: HTMLElement): boolean }} MarshalInlinePlugin
 * @typedef {{ get(type: string): MarshalInlinePlugin | undefined }} PluginLookup
 * @typedef {{ previous: Map<string, string[]>, current: Map<string, string[]> }} InlineIdState
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
 * @param {Set<string>} reservedIds
 */
function allocateInlineId(preferred, usedIds, reservedIds) {
  let id = preferred
  if (!id || !INLINE_ID_RE.test(id) || RESERVED_INLINE_IDS.has(id) || usedIds.has(id)) {
    do {
      id = generateInlineId()
    } while (usedIds.has(id) || reservedIds.has(id) || RESERVED_INLINE_IDS.has(id))
  }
  usedIds.add(id)
  return id
}

/**
 * Reserve author-written tokens across ALL text fields before assigning any
 * widget IDs. Live-widget IDs identify stale hydrated metadata, not opaque
 * text references. Transient widget labels will be saved as ordinary text.
 * @param {ParentNode} root
 * @param {PluginLookup} registry
 * @param {Set<string>} usedIds
 * @param {Set<string>} liveIds
 * @param {Document} ownerDocument
 */
function scanInlineIds(root, registry, usedIds, liveIds, ownerDocument) {
  for (const widget of root.querySelectorAll('[data-inline-plugin]')) {
    const plugin = registry.get(widget.getAttribute('data-inline-plugin') || '')
    if (!plugin) continue
    if (plugin.isCommitted?.(/** @type {HTMLElement} */ (widget)) === false) {
      for (const [, id] of (widget.textContent || '').matchAll(PLACEHOLDER_RE)) usedIds.add(id)
      continue
    }
    const id = widget.getAttribute('data-id')
    if (id) liveIds.add(id)
  }
  const walker = ownerDocument.createTreeWalker(/** @type {Node} */ (root), 4)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const widget = node.parentElement?.closest('[data-inline-plugin]')
    if (widget) {
      const plugin = registry.get(widget.getAttribute('data-inline-plugin') || '')
      if (!plugin || plugin.isCommitted?.(/** @type {HTMLElement} */ (widget)) !== false) continue
    }
    for (const [, id] of (node.textContent || '').matchAll(PLACEHOLDER_RE)) usedIds.add(id)
  }
}

/**
 * Block-level preflight for serializers whose fields share an inline map.
 * @param {string} html
 * @param {PluginLookup} registry
 * @param {Set<string>} usedIds
 * @param {Set<string>} liveIds
 * @param {Document} [ownerDocument]
 * @returns {void}
 */
export function collectInlineSerializationIds(html, registry, usedIds, liveIds, ownerDocument = globalThis.document) {
  const tpl = ownerDocument.createElement('template')
  tpl.innerHTML = /** @type {any} */ (toTrustedHtml(String(html || ''), ownerDocument))
  scanInlineIds(tpl.content, registry, usedIds, liveIds, ownerDocument)
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
 * @param {Record<string, InlineWidget>} [preserved] Original metadata for unresolved tokens
 * @param {Document} [ownerDocument] Document that owns the serialized DOM.
 * @param {Set<string>} [liveIds] Live widget IDs from all sibling text fields
 * @param {boolean} [preservedIsOpaque] True when hydration already removed all resolved entries.
 * @param {InlineIdState} [idState] Snapshot-owned aliases, never written into live DOM or caller data.
 * @returns {{ html: string, inline: Record<string, InlineWidget> }}
 */
export function serializeInlineHtml(html, registry, usedIds = new Set(), preserved = {}, ownerDocument = globalThis.document, liveIds = new Set(), preservedIsOpaque = false, idState) {
  /** @type {Array<[string, InlineWidget]>} */
  const entries = []
  const source = String(html || '')
  if (!source || !registry) return { html: source, inline: {} }

  const tpl = ownerDocument.createElement('template')
  tpl.innerHTML = /** @type {any} */ (toTrustedHtml(source, ownerDocument))

  scanInlineIds(tpl.content, registry, usedIds, liveIds, ownerDocument)

  // Keep actual unresolved tokens as opaque data. A plain token beside a
  // hydrated widget is author text, not a second reference to its old payload.
  // Missing-plugin entries still own their tokens even if a new live widget
  // happens to arrive with the same ID; that widget will be remapped.
  const textWalker = ownerDocument.createTreeWalker(tpl.content, 4)
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode
    if (node.parentElement?.closest('[data-inline-plugin]')) continue
    for (const [, id] of (node.textContent || '').matchAll(PLACEHOLDER_RE)) {
      if (!Object.hasOwn(preserved, id)) continue
      if (!preservedIsOpaque && liveIds.has(id) && registry.get(preserved[id].type)) continue
      entries.push([id, preserved[id]])
      usedIds.add(id)
    }
  }

  const widgets = tpl.content.querySelectorAll('[data-inline-plugin]')
  for (const widget of widgets) {
    const el = /** @type {HTMLElement} */ (widget)
    const type = el.getAttribute('data-inline-plugin')
    if (!type) continue
    const plugin = registry.get(type)
    if (!plugin) continue

    // Trigger-driven widgets can temporarily look like a widget while the
    // user is editing a query, but they do not yet have valid persistent
    // identity. Save their visible text instead of manufacturing an invalid
    // inline-map entry. The plugin owns this decision because only it knows
    // when its transient state becomes committed.
    if (plugin.isCommitted?.(el) === false) {
      el.replaceWith(ownerDocument.createTextNode(el.textContent || ''))
      continue
    }

    const preferred = el.getAttribute('data-id')
    const key = JSON.stringify([type, preferred])
    const assigned = idState?.current.get(key) ?? []
    const previous = idState?.previous.get(key)?.[assigned.length]
    // Snapshotting is observational: do not rewrite live data-id attributes.
    // Reuse the last committed alias even after the conflicting literal is
    // removed. A newly authored token (or a new live owner) can reserve it.
    const reusable = previous && !usedIds.has(previous)
      && (previous === preferred || !liveIds.has(previous))
    const id = allocateInlineId(reusable ? previous : preferred, usedIds, liveIds)
    if (idState) {
      assigned.push(id)
      idState.current.set(key, assigned)
    }
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
    el.replaceWith(ownerDocument.createTextNode(`{{${id}}}`))
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
 * @param {Document} [ownerDocument] Document that owns the rehydrated DOM.
 * @param {Record<string, InlineWidget>} [unresolved] Collect only payloads left as opaque text, never hydrated widgets.
 * @returns {string}
 */
export function deserializeInlineHtml(html, inline, registry, ownerDocument = globalThis.document, unresolved) {
  const source = String(html || '')
  if (!source) return ''
  if (!inline || typeof inline !== 'object' || !registry || !source.includes('{{')) return source

  const tpl = ownerDocument.createElement('template')
  tpl.innerHTML = /** @type {any} */ (toTrustedHtml(source, ownerDocument))

  /** Visit every text node and expand placeholder tokens in place. */
  const walker = ownerDocument.createTreeWalker(tpl.content, 4)
  /** @type {Text[]} */
  const textNodes = []
  let cur = walker.nextNode()
  while (cur) {
    textNodes.push(/** @type {Text} */ (cur))
    cur = walker.nextNode()
  }

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('[data-inline-plugin]')) continue
    const text = textNode.data
    if (!text.includes('{{')) continue

    // Build a fragment: alternating plain-text runs + widget nodes.
    const frag = ownerDocument.createDocumentFragment()
    let lastIndex = 0
    // Each text node owns its iterator. createWidget() may render another
    // document synchronously; a module-wide RegExp.lastIndex would let that
    // nested call rewind this loop and duplicate widgets (or never terminate).
    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      const [token, id] = match
      const ref = Object.prototype.hasOwnProperty.call(inline, id) ? inline[id] : undefined
      if (!ref || typeof ref !== 'object' || typeof ref.type !== 'string') continue
      const preserve = () => {
        if (unresolved) Object.defineProperty(unresolved, id, {
          value: ref, enumerable: true, configurable: true, writable: true,
        })
      }
      const plugin = registry.get(ref.type)
      if (!plugin) { preserve(); continue }

      let widget
      try {
        const data = ref.data && typeof ref.data === 'object'
          ? /** @type {Record<string, unknown>} */ (ref.data)
          : {}
        widget = plugin.createWidget(data, id, { ownerDocument })
      } catch {
        // Preserve malformed legacy entries as their original plain token.
        preserve()
        continue
      }
      const HTMLElementCtor = widget?.ownerDocument?.defaultView?.HTMLElement
      if (!HTMLElementCtor || !(widget instanceof HTMLElementCtor)) { preserve(); continue }

      // Preserve the text before the placeholder.
      if (match.index > lastIndex) {
        frag.appendChild(ownerDocument.createTextNode(text.slice(lastIndex, match.index)))
      }
      // Instantiate the widget with its stable id preserved.
      frag.appendChild(widget)
      lastIndex = match.index + token.length
    }

    // Nothing matched → leave the text node alone.
    if (lastIndex === 0) continue

    // Trailing text after the last match.
    if (lastIndex < text.length) {
      frag.appendChild(ownerDocument.createTextNode(text.slice(lastIndex)))
    }
    textNode.replaceWith(frag)
  }

  return tpl.innerHTML
}
