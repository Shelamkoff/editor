// @ts-check
/**
 * Mention inline plugin.
 *
 * A port of `@shelamkoff/mentionjs` adapted to Rector's InlinePlugin
 * contract. It preserves the customization surface (searchFunction,
 * debounceDelay, noResultsText, dropdownClass, onMentionSelect, renderItem,
 * renderNoResults, renderLoading), same dropdown behavior (debounced search,
 * keyboard navigation, pagination on scroll, loading/no-results states).
 *
 * Differences from the original package:
 *   - Trigger detection is delegated to the editor's built-in `TriggerManager`
 *     (the plugin just reacts to `onEdit` callbacks); the caret-in-span
 *     gymnastics from the original are unnecessary here.
 *   - The committed widget uses the editor's canonical inline-widget
 *     representation: `<span data-inline-plugin="mention" data-id="<widget>"
 *     data-value="<entity>" class="oe-ip oe-ip--mention">@Name</span>`.
 *     The shared sanitize allowlist preserves this through save / render.
 *
 * Styling lives in `./styles.css` and is declared through the plugin's
 * `styles` property for the editor's shared style registry.
 */

/**
 * @typedef {import('./index').MentionItem} MentionItem
 * @typedef {import('./index').MentionSearchResult} MentionSearchResult
 * @typedef {import('./index').MentionSearchFunction} MentionSearchFunction
 * @typedef {import('./index').MentionRenderItem} MentionRenderItem
 * @typedef {import('./index').MentionRenderNoResults} MentionRenderNoResults
 * @typedef {import('./index').MentionRenderLoading} MentionRenderLoading
 * @typedef {import('./index').MentionPluginOptions} MentionPluginOptions
 * @typedef {import('../../core/types').InlinePlugin} InlinePlugin
 * @typedef {import('../../core/types').InlinePluginContext} InlinePluginContext
 */

import { createMentionWidget } from './widget.js'
import { setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'

/** Absolute URL to the plugin's stylesheet. */
const STYLES_URL = new URL('./styles.css', import.meta.url).href

const DEFAULTS = Object.freeze({
  trigger: '@',
  debounceDelay: 300,
  dropdownClass: '',
  searchFunction: null,
  onMentionSelect: null,
  renderItem: null,
  renderNoResults: null,
  renderLoading: null,
})

let dropdownSequence = 0
const COMBOBOX_ARIA_ATTRIBUTES = Object.freeze([
  'aria-controls',
  'aria-expanded',
  'aria-haspopup',
  'aria-autocomplete',
  'aria-activedescendant',
])

function createElement(tag, className) {
  const el = document.createElement(tag)
  if (className) el.className = className
  return el
}

function escapeHtml(str) {
  const entities = /** @type {Record<string, string>} */ ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })
  return String(str).replace(/[&<>"']/g, s => entities[s] ?? s)
}

/**
 * Keep only search entries that satisfy the public mention-item contract.
 * Application-specific fields remain available to custom renderers.
 * @param {unknown} raw
 * @returns {{ items: MentionItem[], nextPageUrl: string | null }}
 */
function normalizeSearchResult(raw) {
  const source = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray(/** @type {any} */ (raw).items)
        ? /** @type {any} */ (raw).items
        : [])
  const items = source.filter(item => (
    item
    && typeof item === 'object'
    && (typeof item.id === 'string' || (typeof item.id === 'number' && Number.isFinite(item.id)))
    && typeof item.name === 'string'
  ))
  const cursor = !Array.isArray(raw) && raw && typeof raw === 'object'
    ? /** @type {any} */ (raw).nextPageUrl
    : null
  return {
    items,
    nextPageUrl: typeof cursor === 'string' && cursor ? cursor : null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DropdownUI — pure DOM layer. No editor knowledge.
// Ported from @shelamkoff/mentionjs DropdownUI (1:1 behavior, new class names).
// ═══════════════════════════════════════════════════════════════════════════

class DropdownUI {
  /** @param {{ dropdownClass?: string, renderItem?: MentionRenderItem | null, renderNoResults?: MentionRenderNoResults | null, renderLoading?: MentionRenderLoading | null, noResultsText: string, loadingText: string }} options */
  constructor(options) {
    this._options = options
    /** @type {HTMLElement | null} */
    this._el = null
  }

  get el() { return this._el }

  /**
   * Mount inside the owning editor so the floating surface inherits the
   * editor's theme tokens, including consumer-defined themes and runtime
   * class changes.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (this._el) this.destroy()

    const cls = ['oe-mention-dropdown', this._options.dropdownClass]
      .filter(Boolean)
      .join(' ')

    this._el = createElement('div', cls)
    this._el.id = `oe-mention-listbox-${++dropdownSequence}`
    this._el.setAttribute('role', 'listbox')
    container.appendChild(this._el)
    return this._el
  }

  /**
   * @param {MentionItem[]} items
   * @param {number} selectedIndex
   */
  render(items, selectedIndex) {
    if (!this._el) return
    this._el.innerHTML = ''

    if (items.length === 0) {
      this._el.appendChild(this._buildNoResults())
      return
    }

    items.forEach((item, index) => {
      this._el.appendChild(this._buildItem(item, index, selectedIndex))
    })
  }

  /**
   * @param {MentionItem[]} newItems
   * @param {number} startIndex
   * @param {number} selectedIndex
   */
  appendItems(newItems, startIndex, selectedIndex) {
    if (!this._el) return
    newItems.forEach((item, i) => {
      this._el?.appendChild(this._buildItem(item, startIndex + i, selectedIndex))
    })
  }

  /**
   * @param {MentionItem} data
   * @param {number} index
   * @param {number} selectedIndex
   * @returns {HTMLElement}
   */
  _buildItem(data, index, selectedIndex) {
    if (this._options.renderItem) {
      const custom = this._options.renderItem(data, index, index === selectedIndex)
      if (custom instanceof HTMLElement) {
        if (!custom.classList.contains('oe-mention-item')) custom.classList.add('oe-mention-item')
        if (index === selectedIndex) custom.classList.add('oe-mention-item--active')
        custom.dataset.index = String(index)
        custom.id = `${this._el?.id || 'oe-mention-listbox'}-option-${index}`
        custom.setAttribute('role', 'option')
        custom.setAttribute('aria-selected', String(index === selectedIndex))
        return custom
      }
    }

    const el = createElement('div', 'oe-mention-item' + (index === selectedIndex ? ' oe-mention-item--active' : ''))
    el.dataset.index = String(index)
    el.id = `${this._el?.id || 'oe-mention-listbox'}-option-${index}`
    el.setAttribute('role', 'option')
    el.setAttribute('aria-selected', String(index === selectedIndex))

    if (data.avatar) {
      const img = document.createElement('img')
      setSafeUrlAttribute(img, 'src', data.avatar, 'media')
      img.alt = ''
      img.className = 'oe-mention-avatar'
      el.appendChild(img)
    } else {
      const placeholder = createElement('div', 'oe-mention-avatar-placeholder')
      placeholder.textContent = (data.name || '?').charAt(0).toUpperCase()
      el.appendChild(placeholder)
    }

    const info = createElement('div', 'oe-mention-info')
    const name = createElement('div', 'oe-mention-name')
    name.textContent = data.name || ''
    info.appendChild(name)

    if (data.details) {
      const details = createElement('div', 'oe-mention-details')
      details.textContent = data.details
      info.appendChild(details)
    }

    el.appendChild(info)
    return el
  }

  _buildNoResults() {
    if (this._options.renderNoResults) {
      const custom = this._options.renderNoResults(this._options.noResultsText)
      if (custom instanceof HTMLElement) {
        custom.classList.add('oe-mention-no-results')
        custom.setAttribute('role', 'status')
        return custom
      }
    }

    const el = createElement('div', 'oe-mention-item oe-mention-no-results')
    el.setAttribute('role', 'status')
    el.innerHTML = `
      <div class="oe-mention-avatar-placeholder">?</div>
      <div class="oe-mention-info">
        <div class="oe-mention-name">${escapeHtml(this._options.noResultsText)}</div>
      </div>
    `
    return el
  }

  /** @param {number} selectedIndex */
  updateSelection(selectedIndex) {
    if (!this._el) return
    this._el.querySelectorAll('.oe-mention-item[data-index]').forEach((item) => {
      const i = parseInt(/** @type {HTMLElement} */ (item).dataset.index || '-1', 10)
      item.classList.toggle('oe-mention-item--active', i === selectedIndex)
      item.setAttribute('aria-selected', String(i === selectedIndex))
    })
  }

  scrollToActive() {
    if (!this._el) return
    const active = this._el.querySelector('.oe-mention-item--active')
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  showLoading() {
    if (!this._el || this._el.querySelector('.oe-mention-loading')) return

    if (this._options.renderLoading) {
      const custom = this._options.renderLoading()
      if (custom instanceof HTMLElement) {
        if (!custom.classList.contains('oe-mention-loading')) custom.classList.add('oe-mention-loading')
        custom.setAttribute('role', 'status')
        this._el.appendChild(custom)
        return
      }
    }

    const loader = createElement('div', 'oe-mention-loading')
    loader.setAttribute('role', 'status')
    loader.innerHTML = `
      <div class="oe-mention-item">
        <div class="oe-mention-info"><div class="oe-mention-name">${escapeHtml(this._options.loadingText)}</div></div>
      </div>
    `
    this._el.appendChild(loader)
  }

  hideLoading() {
    if (!this._el) return
    const loader = this._el.querySelector('.oe-mention-loading')
    if (loader) loader.remove()
  }

  /** @param {{ top: number, left: number, cursorY: number, lineHeight?: number }} p */
  position(p) {
    if (!this._el) return
    requestAnimationFrame(() => this._positionRaw(p))
  }

  /** @param {{ top: number, left: number, cursorY: number, lineHeight?: number }} p */
  positionRaw(p) {
    if (!this._el) return
    this._positionRaw(p)
  }

  /** @param {{ top: number, left: number, cursorY: number, lineHeight?: number }} p */
  _positionRaw({ top, left, cursorY, lineHeight = 20 }) {
    if (!this._el) return

    this._el.style.top = top + 'px'
    this._el.style.left = left + 'px'

    const rect = this._el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let newLeft = left
    let newTop = top

    if (rect.right > vw - 10) newLeft = Math.max(10, left - (rect.right - vw + 10))
    if (rect.left < 10) newLeft = 10

    if (rect.bottom > vh - 10 && cursorY > vh / 2) {
      newTop = top - this._el.offsetHeight - lineHeight
    }

    this._el.style.top = newTop + 'px'
    this._el.style.left = newLeft + 'px'
    this._el.classList.add('oe-mention-dropdown--active')
  }

  hide() {
    if (this._el) this._el.classList.remove('oe-mention-dropdown--active')
  }

  destroy() {
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an editor-scoped mention widget plugin. The returned instance owns
 * its dropdown and listeners after `mount()` and releases them in `destroy()`.
 * @param {MentionPluginOptions} [options]
 * @returns {InlinePlugin}
 */
export function createMentionPlugin(options = {}) {
  const opts = Object.assign({}, DEFAULTS, options)

  // Editor-scoped resources are acquired later by mount(). Construction is
  // deliberately side-effect free so failed registration cannot leak them.
  /** @type {HTMLElement | null} */
  let rootElement = null

  // handleBeforeInput is attached to the owning editor root by mount().

  /** @type {import('../../core/types').IScopedI18n | null} */
  let i18n = null
  /**
   * Scoped i18n lookup — the editor passes an I18n instance pre-scoped to
   * `inlinePlugin.mention.*`, so we use short keys (`'title'`, `'noResults'`,
   * `'loading'`). Falls back to the provided English string when no i18n
   * instance has been injected yet.
   * @param {string} key
   * @param {string} fallback
   * @returns {string}
   */
  const t = (key, fallback) => {
    if (!i18n) return fallback
    if (!i18n.has(key)) return fallback
    const v = i18n.t(key)
    return (v === undefined || v === null || v === '') ? fallback : v
  }

  /**
   * Active session — either a "fresh" trigger (user just typed `@` in plain
   * text) or an "edit" session (user re-opened a committed pill by typing /
   * deleting inside it). Both modes share the dropdown UI, keyboard nav,
   * search pipeline, and outside-click handling.
   *
   * - `mode: 'fresh'` — anchor is a text node + offset in the parent block.
   *   The typed `@query` lives inline in that text node; commit replaces
   *   the range with a new widget span.
   * - `mode: 'edit'` — anchor is an EXISTING committed span that the user
   *   is mutating. The span itself carries the query (`span.textContent`
   *   without the leading trigger); commit rewrites the span in place.
   *
   * @typedef {{
   *   mode: 'fresh' | 'edit',
   *   parentEl: HTMLElement,
   *   triggerTextNode: Text | null,
   *   triggerOffset: number,
   *   span: HTMLElement | null,
   *   dropdown: DropdownUI,
   *   keydownHandler: (e: KeyboardEvent) => void,
   *   selectionChangeHandler: () => void,
   *   outsideMouseDownHandler: (e: MouseEvent) => void,
   *   dropdownClickHandler: (e: MouseEvent) => void,
   *   dropdownMouseDownHandler: (e: MouseEvent) => void,
   *   dropdownScrollHandler: () => void,
   *   scrollResizeHandler: () => void,
   *   selectedIndex: number,
   *   results: MentionItem[],
   *   nextPageUrl: string | null,
   *   isLoadingMore: boolean,
   *   currentQuery: string,
   *   debounceTimer: ReturnType<typeof setTimeout> | null,
   *   debounceReject: ((err: Error) => void) | null,
   *   searchController: AbortController | null,
   *   searchRequestId: number,
   *   ctx: InlinePluginContext,
   *   committedInThisSession: boolean,
   *   ariaState: Map<string, string | null>,
   * }} Session
   */

  /** @type {Session | null} */
  let session = null

  /** @param {HTMLElement} element @returns {Map<string, string | null>} */
  function captureComboboxAria(element) {
    return new Map(COMBOBOX_ARIA_ATTRIBUTES.map(name => [name, element.getAttribute(name)]))
  }

  /** @param {HTMLElement} element @param {Map<string, string | null>} state */
  function restoreComboboxAria(element, state) {
    for (const [name, value] of state) {
      if (value === null) element.removeAttribute(name)
      else element.setAttribute(name, value)
    }
  }

  /**
   * Last-known InlinePluginContext. `onEdit` / `hydrate` stash it here so
   * edit-mode mutations (triggered via `beforeinput` on committed pills,
   * outside of a TriggerManager-driven flow) can still call `notifyChanged`.
   * @type {InlinePluginContext | null}
   */
  let globalCtx = null

  // ─── Caret / DOM helpers (ported verbatim from mentionjs) ──────────────

  /**
   * @param {Node} node
   * @param {number} offset
   */
  function setCaretAt(node, offset) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** @param {Node} node */
  function setCaretAfterNode(node) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** @param {Node} node */
  function setCaretBeforeNode(node) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    range.setStartBefore(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** @param {string} str @param {number} offset @returns {number} */
  function codePointStartBefore(str, offset) {
    const end = Math.max(0, Math.min(offset, str.length))
    if (end >= 2) {
      const low = str.charCodeAt(end - 1)
      const high = str.charCodeAt(end - 2)
      if (low >= 0xDC00 && low <= 0xDFFF && high >= 0xD800 && high <= 0xDBFF) return end - 2
    }
    return Math.max(0, end - 1)
  }

  /** @param {string} str @param {number} offset @returns {number} */
  function codePointEndAt(str, offset) {
    const start = Math.max(0, Math.min(offset, str.length))
    if (start + 1 < str.length) {
      const high = str.charCodeAt(start)
      const low = str.charCodeAt(start + 1)
      if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) return start + 2
    }
    return Math.min(str.length, start + 1)
  }

  /**
   * Find the nearest committed/editing mention span ancestor of the current
   * selection's anchor node, or `null` if the caret is not inside one.
   * Mirrors mentionjs `_getMentionSpan`.
   * @returns {HTMLElement | null}
   */
  function findMentionSpanAtCaret() {
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return null
    const node = sel.anchorNode
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {HTMLElement} */ (node)
      if (el.matches?.('[data-inline-plugin="mention"]')) return el
      return el.closest?.('[data-inline-plugin="mention"]') ?? null
    }
    const parent = node.parentElement
    if (!parent) return null
    return parent.closest('[data-inline-plugin="mention"]')
  }

  /** @param {Node} el */
  function inDOM(el) {
    return !!el && document.contains(el)
  }

  /**
   * Backspace at offset 0 inside a span — delete one char from the PREVIOUS
   * sibling (or the previous mention, which we re-activate for further
   * editing). Mirrors mentionjs `_backspaceBeforeSpan`.
   * @param {HTMLElement} span
   */
  function backspaceBeforeSpan(span) {
    const prev = span.previousSibling
    if (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent && prev.textContent.length > 0) {
      prev.textContent = prev.textContent.slice(0, codePointStartBefore(prev.textContent, prev.textContent.length))
      if (prev.textContent.length === 0) prev.parentNode?.removeChild(prev)
      setCaretBeforeNode(span)
      return
    }
    if (prev && prev.nodeType === Node.ELEMENT_NODE) {
      const prevEl = /** @type {HTMLElement} */ (prev)
      if (prevEl.matches('[data-inline-plugin="mention"]')) {
        // Walk into the previous committed mention for further editing.
        const text = prevEl.firstChild
        if (text?.nodeType === Node.TEXT_NODE) {
          setCaretAt(text, text.textContent?.length ?? 0)
        }
        openEditSessionForSpan(prevEl)
        return
      }
      // Some other inline widget — remove it whole.
      prevEl.parentNode?.removeChild(prevEl)
      setCaretBeforeNode(span)
      return
    }
  }

  /**
   * Forward-delete at offset 0 inside a span — treat as "delete the trigger
   * character". If span text is only the trigger, remove the whole span;
   * otherwise unwrap into plain text minus the trigger. Mirrors
   * mentionjs `_deleteForwardInSpan`.
   * @param {HTMLElement} span
   * @param {string} spanText
   */
  function deleteForwardInSpan(span, spanText) {
    if (spanText === opts.trigger) {
      const next = span.nextSibling
      span.parentNode?.removeChild(span)
      if (next) setCaretBeforeNode(next)
    } else {
      const remaining = spanText.substring(opts.trigger.length)
      const tn = document.createTextNode(remaining)
      span.parentNode?.insertBefore(tn, span)
      span.parentNode?.removeChild(span)
      setCaretAt(tn, 0)
    }
  }

  /**
   * Forward-delete at end of a node — remove the first char of the next
   * sibling, or drop an empty/element sibling entirely. Mirrors mentionjs
   * `_deleteForwardAfterNode`.
   * @param {Node} node
   */
  function deleteForwardAfterNode(node) {
    const next = node.nextSibling
    if (!next) return
    if (next.nodeType === Node.TEXT_NODE && next.textContent && next.textContent.length > 0) {
      next.textContent = next.textContent.substring(codePointEndAt(next.textContent, 0))
      if (next.textContent.length === 0) next.parentNode?.removeChild(next)
    } else {
      next.parentNode?.removeChild(next)
    }
  }

  /**
   * Insert a line-break at the current caret — used when Enter is pressed
   * inside a committed span (no active search). Mirrors mentionjs
   * `_insertBr`.
   * @param {Selection} sel
   */
  function insertBr(sel) {
    if (!sel.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const br = document.createElement('br')
    range.insertNode(br)
    range.setStartAfter(br)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // ─── Search pipeline (1:1 with mentionjs) ──────────────────────────────

  /**
   * Runs `searchFunction` with debounce + request-id cancellation.
   * Returns the fresh items on success, or `null` if superseded / cancelled.
   * @param {string} query
   * @param {string | null} [nextPageUrl]
   * @returns {Promise<MentionItem[] | null>}
   */
  async function runSearch(query, nextPageUrl = null) {
    if (!session) return null

    session.searchController?.abort()
    const controller = new AbortController()
    session.searchController = controller

    if (!nextPageUrl) {
      session.currentQuery = query
      if (session.debounceReject) {
        session.debounceReject(new Error('cancelled'))
        session.debounceReject = null
      }
      if (session.debounceTimer) {
        clearTimeout(session.debounceTimer)
        session.debounceTimer = null
      }
    }

    const requestId = ++session.searchRequestId
    const capturedSession = session

    const execute = async () => {
      if (!opts.searchFunction) return /** @type {MentionSearchResult} */ ({ items: [], nextPageUrl: null })
      return await opts.searchFunction(query, nextPageUrl, { signal: controller.signal })
    }

    /** @type {MentionSearchResult | MentionItem[] | undefined} */
    let raw
    try {
      if (!nextPageUrl && query.trim() !== '') {
        raw = await new Promise((resolve, reject) => {
          capturedSession.debounceReject = reject
          capturedSession.debounceTimer = setTimeout(() => {
            capturedSession.debounceReject = null
            execute().then(resolve).catch(reject)
          }, opts.debounceDelay ?? 300)
        })
      } else {
        raw = await execute()
      }
    } catch (err) {
      if (capturedSession.searchController === controller) capturedSession.searchController = null
      if (controller.signal.aborted || /** @type {Error} */ (err)?.name === 'AbortError' || /** @type {Error} */ (err)?.message === 'cancelled') return null
      // eslint-disable-next-line no-console
      console.warn('[mention-plugin] search failed:', err)
      return null
    }

    if (capturedSession.searchController === controller) capturedSession.searchController = null
    if (!session || session !== capturedSession || controller.signal.aborted || requestId !== session.searchRequestId) return null

    const normalized = normalizeSearchResult(raw)
    const items = normalized.items
    const nextUrl = normalized.nextPageUrl

    session.nextPageUrl = nextUrl

    if (nextPageUrl) {
      session.results = [...session.results, ...items]
    } else {
      session.results = items
      session.selectedIndex = 0
    }

    return items
  }

  /** Show / refresh the dropdown with current session results. */
  function openOrUpdateDropdown(items) {
    if (!session) return null

    const wasMounted = !!session.dropdown.el
    if (!wasMounted) {
      session.dropdown.mount(rootElement || session.parentEl)
      bindDropdownEvents()
      bindScrollResize()
    }

    session.dropdown.hide()
    session.dropdown.render(items, session.selectedIndex)
    syncDropdownAria()
    repositionDropdown()
  }

  /** Keep the owning editable element synchronized with listbox selection. */
  function syncDropdownAria() {
    if (!session?.dropdown.el) return
    const parentEl = session.parentEl
    const active = session.dropdown.el.querySelector('.oe-mention-item--active[role="option"]')
    parentEl.setAttribute('aria-controls', session.dropdown.el.id)
    parentEl.setAttribute('aria-expanded', 'true')
    parentEl.setAttribute('aria-haspopup', 'listbox')
    parentEl.setAttribute('aria-autocomplete', 'list')
    if (active?.id) parentEl.setAttribute('aria-activedescendant', active.id)
    else parentEl.removeAttribute('aria-activedescendant')
  }

  // ─── Positioning ───────────────────────────────────────────────────────

  /**
   * Build a DOMRect for the dropdown anchor. For fresh sessions, that's the
   * range `[@triggerOffset .. currentCaret]` inside `triggerTextNode`. For
   * edit sessions, it's the span's own bounding rect (the pill itself).
   * @returns {DOMRect | null}
   */
  function getTriggerRect() {
    if (!session) return null

    if (session.mode === 'edit') {
      const span = session.span
      if (!span || !inDOM(span)) return null
      return span.getBoundingClientRect()
    }

    const tn = session.triggerTextNode
    if (!tn) return null

    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    const anchorNode = sel.anchorNode
    const anchorOffset = sel.anchorOffset

    const range = document.createRange()
    try {
      range.setStart(tn, session.triggerOffset)
      if (anchorNode && anchorNode === tn) {
        range.setEnd(anchorNode, anchorOffset)
      } else {
        range.setEnd(tn, Math.min(session.triggerOffset + opts.trigger.length, tn.data.length))
      }
    } catch {
      return null
    }
    return range.getBoundingClientRect()
  }

  function repositionDropdown() {
    if (!session || !session.dropdown.el) return
    const rect = getTriggerRect()
    if (!rect) {
      closeSession()
      return
    }
    session.dropdown.position({
      top: rect.bottom + 4,
      left: rect.left,
      cursorY: rect.bottom,
      lineHeight: rect.height || 20,
    })
  }

  // ─── Commit / cancel ───────────────────────────────────────────────────

  /**
   * Commit a picked item. Dispatches on `session.mode`:
   *  - 'fresh' — replace the typed `@query` text range with a new widget;
   *  - 'edit'  — rewrite the already-committed span in place.
   *
   * Both paths run inside the owning block's mutation boundary.
   *
   * @param {MentionItem} data
   */
  function commitMention(data) {
    if (!session) return

    // Cache everything off `session` up front — DOM mutations fire
    // `selectionchange`, which (in spec-compliant browsers) is async, but in
    // some engines may land synchronously and tear the session down before
    // we get to `notifyChanged()`.
    const ctx = session.ctx
    const parentEl = session.parentEl
    let committed = false

    ctx.mutate(parentEl, () => {
      if (session?.mode === 'edit') {
        committed = commitEditMention(data, ctx)
      } else if (session) {
        committed = commitFreshMention(data, ctx)
      }
    })

    if (committed && typeof opts.onMentionSelect === 'function') {
      try { opts.onMentionSelect({ id: data.id, name: data.name }) } catch { /* noop */ }
    }
    closeSession()
  }

  /**
   * Replace the `@query` range with a committed mention widget.
   *
   * Primary path: `triggerTextNode` is still in the DOM — rebuild its
   * surrounding content using `parent.replaceChild(fragment, triggerNode)`
   * with a DocumentFragment holding `[before-text?, widget, space,
   * after-text?]`. More reliable than `Range.deleteContents + insertNode`
   * when the text node ends up empty after the delete (browsers handle
   * splitting an empty Text node inconsistently).
   *
   * Fallback: `triggerTextNode` has been detached (rare — would require
   * a concurrent DOM mutation) — insert the widget at the current caret.
   *
   * @param {MentionItem} data
   * @param {InlinePluginContext} _ctx
   * @returns {boolean} Whether the widget was inserted into the document.
   */
  function commitFreshMention(data, _ctx) {
    if (!session) return false
    const triggerNode = session.triggerTextNode
    const triggerOffset = session.triggerOffset
    const currentQueryLen = session.currentQuery.length

    const widget = createWidget({ id: String(data.id), name: String(data.name) })
    const space = document.createTextNode('\u00A0')
    const sel = window.getSelection()

    // ─── Primary path: triggerNode still in DOM ────────────────────────
    if (triggerNode && inDOM(triggerNode)) {
      // End offset defaults to `@trigger + query length`; if the caret is
      // still anchored in triggerNode, prefer its live position.
      let endOffset = triggerOffset + opts.trigger.length + currentQueryLen
      if (sel && sel.rangeCount > 0 && sel.anchorNode === triggerNode
          && typeof sel.anchorOffset === 'number') {
        endOffset = sel.anchorOffset
      }
      endOffset = Math.min(Math.max(endOffset, triggerOffset), triggerNode.data.length)

      const beforeText = triggerNode.data.substring(0, triggerOffset)
      const afterText = triggerNode.data.substring(endOffset)
      const parent = triggerNode.parentNode

      if (parent) {
        const frag = document.createDocumentFragment()
        if (beforeText) frag.appendChild(document.createTextNode(beforeText))
        frag.appendChild(widget)
        frag.appendChild(space)
        if (afterText) frag.appendChild(document.createTextNode(afterText))
        parent.replaceChild(frag, triggerNode)
        setCaretAt(space, 1)
        return true
      }
    }

    // ─── Fallback: insert at current caret ─────────────────────────────
    if (!sel || !sel.rangeCount) return false
    const range = sel.getRangeAt(0)
    const rangeContainer = range.commonAncestorContainer
    if (rangeContainer !== session.parentEl && !session.parentEl.contains(rangeContainer)) return false
    try {
      range.insertNode(widget)
    } catch {
      return false
    }
    widget.after(space)
    setCaretAt(space, 1)
    return inDOM(widget)
  }

  /**
   * Rewrite an already-committed span in place with the newly picked item.
   * Mirrors mentionjs `_commitSpanMention`: updates text, removes the
   * active/editing class, and writes the fresh data-value. Caret lands in
   * the trailing space sibling (creating one if missing).
   *
   * @param {MentionItem} data
   * @param {InlinePluginContext} _ctx
   * @returns {boolean} Whether the existing widget was updated.
   */
  function commitEditMention(data, _ctx) {
    if (!session || !session.span) return false
    const span = session.span
    if (!inDOM(span)) return false

    // Mark the session as having produced a real commit. The close path
    // uses this to decide whether to leave the span intact (committed) or
    // unwrap it to plain text (user edited but bailed — `data-value` no
    // longer matches the displayed name, see README / the task brief).
    session.committedInThisSession = true

    span.textContent = opts.trigger + data.name
    span.classList.remove('oe-ip--mention--editing')
    span.setAttribute('data-value', String(data.id))

    const next = span.nextSibling
    const nextText = next && next.nodeType === Node.TEXT_NODE ? (next.textContent || '') : ''
    const hasSpace = nextText.length > 0 && /^[\s\u00A0]/.test(nextText)

    if (hasSpace && next) {
      setCaretAt(next, 1)
    } else {
      const space = document.createTextNode('\u00A0')
      span.after(space)
      setCaretAt(space, 1)
    }
    return true
  }

  /**
   * Release transient session resources without deciding how an edited
   * mention should leave the document. DOM-edit branches use the returned
   * session to remove or replace the live span themselves; ordinary cancel
   * paths pass it to `finalizeSession`.
   * @returns {Session | null}
   */
  function detachSession() {
    if (!session) return

    // Cancel in-flight debounce / search.
    if (session.debounceReject) {
      session.debounceReject(new Error('cancelled'))
      session.debounceReject = null
    }
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer)
      session.debounceTimer = null
    }
    session.searchController?.abort()
    session.searchController = null
    session.searchRequestId++

    // Tear down UI + listeners.
    restoreComboboxAria(session.parentEl, session.ariaState)
    unbindDropdownEvents()
    unbindScrollResize()
    session.dropdown.destroy()

    document.removeEventListener('keydown', session.keydownHandler, true)
    document.removeEventListener('selectionchange', session.selectionChangeHandler)
    document.removeEventListener('mousedown', session.outsideMouseDownHandler, true)
    const closingSession = session
    session = null

    return closingSession
  }

  /**
   * Apply the normal semantic result of leaving an edit session.
   * @param {Session} closingSession
   */
  function finalizeSession(closingSession) {

    // Edit-mode exit handling:
    //
    //  - If the user COMMITTED a pick (Enter / click / Tab), the span
    //    already carries a consistent `data-value` + displayed name — we
    //    just drop the editing class (commit path already did, but this
    //    is idempotent).
    //
    //  - If the user EDITED and then bailed out (Escape / outside click /
    //    caret moved elsewhere), the span's displayed text no longer
    //    matches its `data-value`. Leaving it as a pill would bake stale
    //    identity into the block-level `inline` map. We unwrap the span
    //    into a plain text node with the same textual content — the
    //    mention effectively stops being a mention, which is the
    //    semantically correct outcome ("user started editing but didn't
    //    pick anyone").
    if (closingSession.mode === 'edit' && closingSession.span && inDOM(closingSession.span)) {
      const span = closingSession.span
      if (closingSession.committedInThisSession) {
        span.classList.remove('oe-ip--mention--editing')
      } else {
        const text = span.textContent || ''
        mutateContent(closingSession.parentEl, () => {
          const tn = document.createTextNode(text)
          const parent = span.parentNode
          if (!parent) return
          parent.insertBefore(tn, span)
          parent.removeChild(span)
          // Place caret at end of the unwrapped text — this matches the
          // user's likely mental position after a bail-out backspace.
          setCaretAt(tn, text.length)
        })
      }
    }
  }

  function closeSession() {
    const closingSession = detachSession()
    if (closingSession) finalizeSession(closingSession)
  }

  /**
   * Close only the transient UI before a `beforeinput` branch removes or
   * replaces the editing span in the same synchronous mutation. Running the
   * normal finalizer here would first unwrap the span and leave the caller
   * holding a detached node.
   * @param {HTMLElement} span
   */
  function closeSessionForSpanReplacement(span) {
    const closingSession = detachSession()
    if (closingSession?.span === span) span.classList.remove('oe-ip--mention--editing')
  }

  // ─── Keyboard / mouse plumbing ─────────────────────────────────────────

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (!session) return

    // Only intercept keys that originated inside the block where the trigger
    // was typed (or inside our dropdown — click-focus never leaves the block,
    // but stay defensive). A global Escape or Arrow in a modal / sidebar must
    // not affect us.
    const target = /** @type {Node | null} */ (e.target)
    const inBlock = !!target && session.parentEl.contains(target)
    const inDropdown = !!target && !!session.dropdown.el?.contains(target)
    if (!inBlock && !inDropdown) return

    const max = session.results.length - 1

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSession()
      return
    }

    if (max < 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        session.selectedIndex = Math.min(session.selectedIndex + 1, max)
        session.dropdown.updateSelection(session.selectedIndex)
        syncDropdownAria()
        session.dropdown.scrollToActive()
        maybeLoadMore()
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        session.selectedIndex = Math.max(session.selectedIndex - 1, 0)
        session.dropdown.updateSelection(session.selectedIndex)
        syncDropdownAria()
        session.dropdown.scrollToActive()
        break
      case 'Enter':
      case 'Tab':
        if (session.results[session.selectedIndex]) {
          e.preventDefault()
          e.stopPropagation()
          commitMention(session.results[session.selectedIndex])
        }
        break
    }
  }

  function handleSelectionChange() {
    if (!session) return
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return

    if (session.mode === 'edit') {
      // Edit sessions persist as long as the caret is inside the editing
      // span. The span itself stays in the DOM across edits, so
      // `span.contains(anchor)` is the right test — accounts for the caret
      // being in the span's text child or directly on the span element.
      const span = session.span
      if (!span || !inDOM(span)) { closeSession(); return }
      if (!span.contains(sel.anchorNode) && sel.anchorNode !== span) {
        closeSession()
      }
      return
    }

    // Fresh mode: caret must stay in the trigger text node at or past the
    // end of the trigger. `trigger` is one Unicode code point, but may span
    // two UTF-16 code units (for example an emoji).
    const tn = session.triggerTextNode
    if (!tn) { closeSession(); return }
    if (sel.anchorNode !== tn) { closeSession(); return }
    if (sel.anchorOffset < session.triggerOffset + opts.trigger.length) closeSession()
  }

  /** @param {MouseEvent} e */
  function handleOutsideMouseDown(e) {
    if (!session) return
    const target = /** @type {Node} */ (e.target)
    if (session.parentEl.contains(target)) return
    if (session.dropdown.el?.contains(target)) return
    closeSession()
  }

  function bindDropdownEvents() {
    if (!session || !session.dropdown.el) return
    const el = session.dropdown.el

    session.dropdownClickHandler = (e) => {
      if (!session) return
      const target = /** @type {HTMLElement} */ (e.target)
      const item = target.closest('.oe-mention-item[data-index]')
      if (!item) return
      const idx = parseInt(/** @type {HTMLElement} */ (item).dataset.index || '-1', 10)
      const data = session.results[idx]
      if (data) commitMention(data)
    }
    session.dropdownMouseDownHandler = (e) => e.preventDefault()   // keep caret focus
    session.dropdownScrollHandler = () => onDropdownScroll()

    el.addEventListener('click', session.dropdownClickHandler)
    el.addEventListener('mousedown', session.dropdownMouseDownHandler)
    el.addEventListener('scroll', session.dropdownScrollHandler)
  }

  function unbindDropdownEvents() {
    if (!session || !session.dropdown.el) return
    const el = session.dropdown.el
    if (session.dropdownClickHandler) el.removeEventListener('click', session.dropdownClickHandler)
    if (session.dropdownMouseDownHandler) el.removeEventListener('mousedown', session.dropdownMouseDownHandler)
    if (session.dropdownScrollHandler) el.removeEventListener('scroll', session.dropdownScrollHandler)
  }

  function bindScrollResize() {
    if (!session) return
    session.scrollResizeHandler = () => repositionDropdown()
    document.addEventListener('scroll', session.scrollResizeHandler, { passive: true, capture: true })
    window.addEventListener('resize', session.scrollResizeHandler, { passive: true })
  }

  function unbindScrollResize() {
    if (!session || !session.scrollResizeHandler) return
    document.removeEventListener('scroll', session.scrollResizeHandler, true)
    window.removeEventListener('resize', session.scrollResizeHandler)
  }

  // ─── Pagination (1:1 with mentionjs _onDropdownScroll / _loadMoreResults) ─

  function onDropdownScroll() {
    if (!session || !session.dropdown.el) return
    if (session.isLoadingMore || !session.nextPageUrl) return
    const { scrollTop, scrollHeight, clientHeight } = session.dropdown.el
    if (scrollTop + clientHeight >= scrollHeight - 10) loadMoreResults()
  }

  function maybeLoadMore() {
    if (!session) return
    if (
      session.selectedIndex >= session.results.length - 2
      && session.nextPageUrl
      && !session.isLoadingMore
    ) {
      loadMoreResults()
    }
  }

  async function loadMoreResults() {
    if (!session || session.isLoadingMore || !session.nextPageUrl) return
    session.isLoadingMore = true
    session.dropdown.showLoading()
    try {
      const prevLen = session.results.length
      const newItems = await runSearch(session.currentQuery, session.nextPageUrl)
      session?.dropdown.hideLoading()
      if (!session || newItems === null) return
      session.dropdown.appendItems(newItems, prevLen, session.selectedIndex)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[mention-plugin] load more failed:', err)
      session?.dropdown.hideLoading()
    } finally {
      if (session) session.isLoadingMore = false
    }
  }

  // ─── Session lifecycle ─────────────────────────────────────────────────

  /**
   * Build a fresh dropdown configured with the current options/i18n.
   * @returns {DropdownUI}
   */
  function createDropdown() {
    return new DropdownUI({
      dropdownClass: opts.dropdownClass,
      renderItem: opts.renderItem,
      renderNoResults: opts.renderNoResults,
      renderLoading: opts.renderLoading,
      noResultsText: opts.noResultsText ?? t('noResults', 'No results found'),
      loadingText: t('loading', 'Loading...'),
    })
  }

  /**
   * Attach the three document-level listeners shared by every session mode.
   * Must only be called when `session` is freshly set.
   */
  function attachSessionListeners() {
    if (!session) return
    // keydown on document (capture) so we fire before the editor's
    // TriggerManager/KeyboardManager on the editor root.
    document.addEventListener('keydown', session.keydownHandler, true)
    document.addEventListener('selectionchange', session.selectionChangeHandler)
    document.addEventListener('mousedown', session.outsideMouseDownHandler, true)
  }

  /**
   * Create a `fresh` session — the user has just typed `@` in plain text.
   * @param {HTMLElement} parentEl
   * @param {Text} textNode
   * @param {number} triggerOffset
   * @param {InlinePluginContext} ctx
   */
  function openFreshSession(parentEl, textNode, triggerOffset, ctx) {
    session = {
      mode: 'fresh',
      parentEl,
      triggerTextNode: textNode,
      triggerOffset,
      span: null,
      dropdown: createDropdown(),
      keydownHandler: handleKeydown,
      selectionChangeHandler: handleSelectionChange,
      outsideMouseDownHandler: handleOutsideMouseDown,
      dropdownClickHandler: () => {},
      dropdownMouseDownHandler: () => {},
      dropdownScrollHandler: () => {},
      scrollResizeHandler: () => {},
      selectedIndex: 0,
      results: [],
      nextPageUrl: null,
      isLoadingMore: false,
      currentQuery: '',
      debounceTimer: null,
      debounceReject: null,
      searchController: null,
      searchRequestId: 0,
      ctx,
      committedInThisSession: false,
      ariaState: captureComboboxAria(parentEl),
    }
    attachSessionListeners()
  }

  /**
   * Create an `edit` session — the user is mutating an already-committed
   * mention span (typing inside it, deleting chars, etc). The span enters
   * "editing" styling until the session closes.
   * @param {HTMLElement} span
   * @param {HTMLElement} parentEl
   * @param {InlinePluginContext} ctx
   */
  function openEditSession(span, parentEl, ctx) {
    session = {
      mode: 'edit',
      parentEl,
      triggerTextNode: null,
      triggerOffset: 0,
      span,
      dropdown: createDropdown(),
      keydownHandler: handleKeydown,
      selectionChangeHandler: handleSelectionChange,
      outsideMouseDownHandler: handleOutsideMouseDown,
      dropdownClickHandler: () => {},
      dropdownMouseDownHandler: () => {},
      dropdownScrollHandler: () => {},
      scrollResizeHandler: () => {},
      selectedIndex: 0,
      results: [],
      nextPageUrl: null,
      isLoadingMore: false,
      currentQuery: '',
      debounceTimer: null,
      debounceReject: null,
      searchController: null,
      searchRequestId: 0,
      ctx,
      committedInThisSession: false,
      ariaState: captureComboboxAria(parentEl),
    }
    span.classList.add('oe-ip--mention--editing')
    // Drop the stale `data-value` the moment edit mode starts — the user
    // is mutating the displayed name, so the id no longer matches what
    // they see. If a `ChangeNotifier` save fires mid-edit (250 ms debounce
    // default), the plugin's `isCommitted()` hook makes the shared inline
    // serializer store the visible query as plain text instead of emitting
    // an invalid widget entry. Commit restores the attribute.
    span.removeAttribute('data-value')
    attachSessionListeners()
  }

  /**
   * If no session exists (or exists but for a different span), swap to a
   * fresh edit session anchored on `span`. Then kick off a search against
   * the current span text (minus the trigger) and refresh the dropdown.
   *
   * Called from `handleBeforeInput` whenever the user's edit inside a
   * committed pill changes the query.
   *
   * @param {HTMLElement} span
   * @param {HTMLElement} parentEl
   * @param {string} newQuery
   */
  function refreshEditSession(span, parentEl, newQuery) {
    if (!session || session.mode !== 'edit' || session.span !== span) {
      if (session) closeSession()
      const ctx = globalCtx
      if (!ctx) return                  // cannot proceed without an editor ctx
      openEditSession(span, parentEl, ctx)
    }
    runSearch(newQuery).then((items) => {
      if (items === null) return
      if (!session) return
      if (!inDOM(span)) { closeSession(); return }
      openOrUpdateDropdown(items)
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[mention-plugin] edit search failed:', err)
    })
  }

  /**
   * Walk upwards from a node to find the containing block content element —
   * the nearest `contenteditable="true"` ancestor. Used by edit sessions
   * to locate the block the mention belongs to without relying on the
   * caller to pass it.
   * @param {Node} node
   * @returns {HTMLElement | null}
   */
  function findContenteditableBlock(node) {
    let cur = node.parentElement
    while (cur) {
      if (cur.isContentEditable || cur.getAttribute?.('contenteditable') === 'true') return cur
      cur = cur.parentElement
    }
    return null
  }

  /**
   * Signal a content change to the editor.
   *
   * We dispatch a synthetic bubbling `input` event on the block — the
   * editor's `wireInputTracking` listens for this on its root element and
   * emits `EditorEvent.CHANGED`, which triggers `ChangeNotifier` → save.
   *
   * This is preferred over `globalCtx.notifyChanged()` because it doesn't
   * depend on having captured a ctx yet (safer when edit-mode mutations
   * fire from a pre-hydrated mention before any onEdit/hydrate call has
   * stashed the ctx).
   *
   * @param {HTMLElement | null} parentEl
   */
  function notifyChange(parentEl) {
    if (parentEl) {
      parentEl.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      globalCtx?.notifyChanged()
    }
  }

  /**
   * Execute one mention edit as one editor history step.
   * Falls back to a synthetic input notification before the editor supplies
   * the mutation context.
   *
   * @param {HTMLElement} parentEl editable element that owns the mention
   * @param {() => void} operation synchronous DOM mutation
   * @returns {void}
   */
  function mutateContent(parentEl, operation) {
    if (globalCtx) {
      globalCtx.mutate(parentEl, operation)
    } else {
      operation()
      notifyChange(parentEl)
    }
  }

  /**
   * Programmatically entering edit mode on a span we've stumbled into —
   * e.g. after `backspaceBeforeSpan` walks into a previous mention.
   * @param {HTMLElement} span
   */
  function openEditSessionForSpan(span) {
    const parentEl = findContenteditableBlock(span) || span.parentElement
    if (!parentEl) return
    const text = span.textContent || ''
    const query = text.startsWith(opts.trigger) ? text.slice(opts.trigger.length) : text
    refreshEditSession(span, parentEl, query)
  }

  // ─── Before-input handling (port of mentionjs _handleInputInsideSpan) ──

  /**
   * Intercepts `beforeinput` events when the caret is inside (or at the
   * edge of) a committed mention span. Drives all the char-by-char delete /
   * unwrap / re-search behavior — see the inline comments for per-case
   * logic. Mirrors mentionjs `_onBeforeInput` + `_handleInputInsideSpan`.
   *
   * @param {InputEvent} e
   */
  function handleBeforeInput(e) {
    const span = findMentionSpanAtCaret()

    // Caret NOT in a mention span → defer to the editor's normal handling
    // for typing, deletes, etc. Fresh-trigger `@` detection is done by
    // TriggerManager (separate listener), not here.
    if (!span || !rootElement?.contains(span)) return

    const sel = window.getSelection()
    if (!sel) return

    // Guard: span detached (edge case during heavy editing).
    if (!inDOM(span)) {
      if (session?.mode === 'edit' && session.span === span) closeSession()
      return
    }

    const parentEl = findContenteditableBlock(span) || span.parentElement
    if (!parentEl) return

    const anchorNode = sel.anchorNode
    const anchorOffset = sel.anchorOffset
    const isEditing = session?.mode === 'edit' && session.span === span

    const spanText = span.textContent || ''
    /** @type {number | null} */
    let cursorInText
    if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE && anchorNode.parentElement === span) {
      cursorInText = anchorOffset
    } else if (anchorNode === span) {
      // Anchor is span element itself → treat offset 0 as start, 1 as end.
      cursorInText = anchorOffset === 0 ? 0 : spanText.length
    } else {
      cursorInText = null
    }

    const isAtStart = cursorInText === 0
    const isAtEnd = cursorInText === spanText.length

    // Case A — caret at start of span. Insert / delete happens OUTSIDE
    // the span (before it), treating the span as an opaque boundary.
    if (isAtStart) {
      e.preventDefault()
      if (isEditing) closeSession()

      if (e.inputType === 'insertText' && typeof e.data === 'string') {
        mutateContent(parentEl, () => {
          const tn = document.createTextNode(e.data)
          span.parentNode?.insertBefore(tn, span)
          setCaretAt(tn, e.data.length)
        })
      } else if (e.inputType === 'deleteContentBackward') {
        mutateContent(parentEl, () => backspaceBeforeSpan(span))
      } else if (e.inputType === 'deleteContentForward') {
        mutateContent(parentEl, () => deleteForwardInSpan(span, spanText))
      }
      return
    }

    // Case B — caret at end of a committed (non-editing) span. Typing
    // goes to a sibling text node AFTER the span (prevents growing the
    // pill with arbitrary user input).
    if (isAtEnd && !isEditing) {
      if ((e.inputType === 'insertText' || e.inputType === 'insertCompositionText') && typeof e.data === 'string') {
        e.preventDefault()
        mutateContent(parentEl, () => {
          const next = span.nextSibling
          if (next && next.nodeType === Node.TEXT_NODE) {
            next.textContent = e.data + (next.textContent || '')
            setCaretAt(next, e.data.length)
          } else {
            const char = e.data === ' ' ? '\u00A0' : e.data
            const tn = document.createTextNode(char)
            span.after(tn)
            setCaretAt(tn, 1)
          }
        })
        return
      }
      if (e.inputType === 'deleteContentForward') {
        e.preventDefault()
        mutateContent(parentEl, () => deleteForwardAfterNode(span))
        return
      }
    }

    // Case C — Enter / line-break inside a span.
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      // If actively editing with results → Enter commits via handleKeydown
      // (already bound); let the key handler run, just swallow the default.
      e.preventDefault()
      if (isEditing && session && session.results.length > 0) return
      // Otherwise: drop edit state (if any), place caret after span, insert <br>.
      // This matches mentionjs fallthrough; the editor's own Enter handling
      // (splitBlock) is intentionally bypassed inside a pill, because the
      // user was semantically editing the mention, not splitting the block.
      if (isEditing) closeSession()
      mutateContent(parentEl, () => {
        setCaretAfterNode(span)
        insertBr(window.getSelection() || sel)
      })
      return
    }

    // Case D — Backspace inside the span (not at start).
    if (e.inputType === 'deleteContentBackward') {
      const offset = cursorInText ?? spanText.length

      // Span contains ONLY the trigger → remove it entirely.
      if (spanText === opts.trigger) {
        e.preventDefault()
        if (isEditing) closeSessionForSpanReplacement(span)
        mutateContent(parentEl, () => {
          const prev = span.previousSibling
          const next = span.nextSibling
          span.parentNode?.removeChild(span)
          const range = document.createRange()
          if (prev && prev.nodeType === Node.TEXT_NODE) range.setStart(prev, (prev.textContent || '').length)
          else if (next) range.setStartBefore(next)
          else range.setStart(parentEl, 0)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        })
        return
      }

      // Backspace immediately after the trigger deletes the trigger itself →
      // unwrap the span into plain text (minus the trigger).
      if (offset === opts.trigger.length && spanText.startsWith(opts.trigger)) {
        e.preventDefault()
        if (isEditing) closeSessionForSpanReplacement(span)
        mutateContent(parentEl, () => {
          const tn = document.createTextNode(spanText.substring(opts.trigger.length))
          span.parentNode?.insertBefore(tn, span)
          span.parentNode?.removeChild(span)
          setCaretAt(tn, 0)
        })
        return
      }

      // Normal char deletion INSIDE the span. Shrink text, re-enter edit
      // mode, fire a fresh search.
      e.preventDefault()
      const newOffset = codePointStartBefore(spanText, offset)
      const newText = spanText.substring(0, newOffset) + spanText.substring(offset)

      mutateContent(parentEl, () => {
        const tn = span.firstChild
        if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = newText
        else span.textContent = newText
        setCaretAt(span.firstChild || span, newOffset)
      })

      refreshEditSession(span, parentEl, newText.substring(opts.trigger.length))
      return
    }

    // Case E — Forward-delete inside the span.
    if (e.inputType === 'deleteContentForward') {
      const offset = cursorInText ?? spanText.length

      // At end → remove a char from the following sibling.
      if (offset >= spanText.length) {
        e.preventDefault()
        mutateContent(parentEl, () => deleteForwardAfterNode(span))
        return
      }

      e.preventDefault()
      const newText = spanText.substring(0, offset) + spanText.substring(codePointEndAt(spanText, offset))

      if (newText.length === 0) {
        if (isEditing) closeSessionForSpanReplacement(span)
        mutateContent(parentEl, () => {
          const prev = span.previousSibling
          const next = span.nextSibling
          span.parentNode?.removeChild(span)
          const range = document.createRange()
          if (next) range.setStartBefore(next)
          else if (prev && prev.nodeType === Node.TEXT_NODE) range.setStart(prev, (prev.textContent || '').length)
          else range.setStart(parentEl, 0)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        })
        return
      }

      // If forward-delete ate the trigger → unwrap to plain text.
      if (offset === 0 && !newText.startsWith(opts.trigger)) {
        if (isEditing) closeSessionForSpanReplacement(span)
        mutateContent(parentEl, () => {
          const tn = document.createTextNode(newText)
          span.parentNode?.insertBefore(tn, span)
          span.parentNode?.removeChild(span)
          setCaretAt(tn, 0)
        })
        return
      }

      mutateContent(parentEl, () => {
        const tn = span.firstChild
        if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = newText
        else span.textContent = newText
        setCaretAt(span.firstChild || span, offset)
      })

      refreshEditSession(span, parentEl, newText.substring(opts.trigger.length))
      return
    }

    // Case F — Typing inside the span (not at start, not at end-with-committed).
    // Browser default inserts the char inside the span; we just re-run
    // the search afterwards.
    if ((e.inputType === 'insertText' || e.inputType === 'insertCompositionText') && typeof e.data === 'string') {
      const insertAt = cursorInText ?? spanText.length
      const newText = spanText.substring(0, insertAt) + e.data + spanText.substring(insertAt)
      refreshEditSession(span, parentEl, newText.substring(opts.trigger.length))
      // Don't preventDefault — let the browser do the actual DOM insertion.
    }
  }

  // ─── Widget DOM (committed mention) ────────────────────────────────────

  /**
   * Delegate widget DOM construction to the shared widget module so the
   * editor and document renderer use identical markup. The mention
   * widget is intentionally NOT `contentEditable="false"` — the caret can
   * enter it and Backspace / Delete / typing inside it work character-by-
   * character (matching the original `@shelamkoff/mentionjs` behavior).
   * `handleBeforeInput` keeps the span well-formed and re-opens the
   * suggestion dropdown when edits change the query.
   */
  const sharedWidget = createMentionWidget(opts.trigger)
  const createWidget = sharedWidget.createWidget

  // ─── Plugin surface ─────────────────────────────────────────────────────

  /** @type {InlinePlugin} */
  const plugin = {
    type: 'mention',
    styles: [STYLES_URL],
    trigger: opts.trigger,
    get title() { return t('title', 'Mention') },

    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>',

    /** @param {import('../../core/types').IScopedI18n} _i18n */
    setI18n(_i18n) { i18n = _i18n },

    /**
     * Acquire resources only after the plugin belongs to a successfully
     * constructed editor. The listener is scoped to that editor root.
     * @param {HTMLElement} editorRoot
     * @param {InlinePluginContext} ctx
     */
    mount(editorRoot, ctx) {
      if (rootElement) throw new Error('Mention plugin is already mounted')
      rootElement = editorRoot
      globalCtx = ctx
      rootElement.addEventListener('beforeinput', /** @type {EventListener} */ (handleBeforeInput), true)
    },

    /**
     * Called by TriggerManager when `trigger` is typed at a word boundary
     * and again on every input while the session is active. `query` is the
     * text between the trigger character and the caret.
     *
     * @param {HTMLElement} parentEl
     * @param {string} query
     * @param {InlinePluginContext} ctx
     */
    onEdit(parentEl, query, ctx) {
      // Stash ctx for edit-mode mutations (fired via beforeinput outside of
      // a TriggerManager-driven flow — see `handleBeforeInput`).
      globalCtx = ctx

      // Fresh trigger — close any stale session from a different block
      // before opening a new one. (Guards against TriggerManager edge cases
      // where onEdit fires with query='' while our session is still alive.)
      if (session && (query === '' || session.parentEl !== parentEl)) {
        closeSession()
      }

      // Open a fresh session on first invocation.
      if (!session) {
        const sel = window.getSelection()
        if (!sel || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return

        const textNode = /** @type {Text} */ (sel.anchorNode)
        const triggerOffset = sel.anchorOffset - opts.trigger.length
        if (triggerOffset < 0 || !textNode.data.startsWith(opts.trigger, triggerOffset)) return

        openFreshSession(parentEl, textNode, triggerOffset, ctx)
      }

      // Kick off / refresh search for the new query.
      // `onEdit` is invoked synchronously from the editor's TriggerManager;
      // we fire-and-forget here and update the dropdown when results arrive.
      runSearch(query).then((items) => {
        if (items === null) return            // superseded / cancelled
        if (!session) return                   // session closed mid-request
        openOrUpdateDropdown(items)
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[mention-plugin] onEdit search failed:', err)
      })
    },

    /** Close plugin-owned UI when the editor cancels the active trigger. */
    onCancel() { closeSession() },

    /**
     * Build a committed widget. Called by `insertInlinePluginAtCaret` for
     * programmatic inserts and by the marshal pipeline for load-time
     * rehydration. Delegates to the shared widget factory; if `id` is
     * provided it's preserved as the span's `data-id` (marshal load path),
     * otherwise a fresh one is generated (programmatic fresh insert).
     *
     * @param {Record<string, string>} data
     * @param {string} [id]
     * @returns {HTMLElement}
     */
    createWidget(data, id) {
      return createWidget({ id: data.id || '', name: data.name || '' }, id)
    },

    /**
     * Called by `hydrateInlinePlugins` for each committed widget in the DOM
     * when the editor loads saved content.
     *
     * The mention pill has no interactive controls (per spec — clickability
     * is a consumer concern) so there's nothing to wire up per widget. We
     * DO, however, capture the `InlinePluginContext` here so that the very
     * first edit action (e.g. user backspacing into a committed pill that
     * came from loaded content, before they ever typed `@` to trigger a
     * fresh session) can still call `notifyChanged()`.
     *
     * @param {HTMLElement} _element
     * @param {InlinePluginContext} ctx
     */
    hydrate(_element, ctx) { globalCtx = ctx },

    /**
     * Delegate to the shared widget primitive — one source of truth for
     * how a mention span reads back into data, used by both the editor
     * marshal pipeline and document renderer.
     * @param {HTMLElement} element
     * @returns {Record<string, string>}
     */
    getData(element) {
      return /** @type {Record<string, string>} */ (sharedWidget.getData(element))
    },

    /**
     * Exclude an in-progress edited pill from persistent widget data. Its
     * visible `@query` is retained as ordinary text by the shared serializer.
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isCommitted(element) {
      return !!element.dataset.value && !element.classList.contains('oe-ip--mention--editing')
    },

    /**
     * Programmatic insertion via the toolbox `+` button.
     *
     * Per spec: behaves IDENTICALLY to the user typing the trigger
     * character manually — inserts just the trigger (`@`) at the caret,
     * positions the caret right after it, and opens a fresh session
     * (matching what `TriggerManager` would do if the `@` were typed).
     *
     * We can't rely on `TriggerManager` observing a programmatic DOM
     * mutation, so we dispatch a synthetic `input` event on the block —
     * `TriggerManager`'s `#onInput` listener then activates itself, sees
     * the freshly-inserted `@` at caret offset - 1, and calls our plugin's
     * `onEdit(parentEl, '', ctx)` naturally. From there everything flows
     * through the normal fresh-session code path.
     *
     * @param {InlinePluginContext} ctx
     */
    insertFresh(ctx) {
      globalCtx = ctx

      // Resolve the caret's current block. Fall back to walking up from
      // `sel.anchorNode` — `setCaretToBlock` for an EMPTY paragraph only
      // calls `element.focus()` and doesn't set a selection range, so
      // `sel.rangeCount` may be 0. In that case we insert at the end of
      // whatever contenteditable is currently focused.
      const sel = window.getSelection()
      let parentEl = null
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode
        parentEl = node
          ? (node.nodeType === Node.ELEMENT_NODE
              ? (/** @type {HTMLElement} */ (node).isContentEditable
                  ? /** @type {HTMLElement} */ (node)
                  : findContenteditableBlock(node))
              : findContenteditableBlock(node))
          : null
      }
      if (!parentEl && document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) {
        parentEl = document.activeElement
      }
      if (!parentEl) return

      // Chrome auto-inserts a `<br>` as the sole child of an otherwise
      // empty contenteditable element when it gains focus. That `<br>`
      // plays havoc with ranges (some specs want the range anchored INSIDE
      // it, which is invalid — it's a void element). Strip it so we have
      // a clean insertion point.
      if (
        parentEl.childNodes.length === 1
        && parentEl.firstChild instanceof HTMLElement
        && parentEl.firstChild.tagName === 'BR'
      ) {
        parentEl.removeChild(parentEl.firstChild)
      }

      // Create the trigger text node and insert it at the current caret.
      // If we have a usable range inside parentEl, honor it; otherwise
      // fall back to appending at the end — matches "+" → type `@`
      // intent from an empty block.
      const tn = document.createTextNode(opts.trigger)
      let inserted = false
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        if (parentEl.contains(range.startContainer) || range.startContainer === parentEl) {
          try {
            range.deleteContents()
            range.insertNode(tn)
            inserted = true
          } catch {
            inserted = false
          }
        }
      }
      if (!inserted) {
        parentEl.appendChild(tn)
      }

      // Caret directly after the inserted trigger.
      setCaretAt(tn, opts.trigger.length)

      // Fire a synthetic `input` event so the editor's `TriggerManager`
      // (listening on `rootEl`) activates as if the user had typed `@`.
      // That listener reads the live DOM/selection — no dependency on
      // `event.isTrusted`. `wireInputTracking` also sees the input and
      // emits `CHANGED`, so there's no need to call `notifyChange` here.
      parentEl.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        inputType: 'insertText',
        data: opts.trigger,
      }))
    },

    /**
     * Plugin-level cleanup hook. InlinePluginRegistry calls this once for the
     * owning editor and uses it to:
     *  - close any open session;
     *  - detach the editor-scoped `beforeinput` listener;
     *  - release editor-scoped listeners and active UI.
     *
     */
    destroy() {
      closeSession()
      rootElement?.removeEventListener('beforeinput', /** @type {EventListener} */ (handleBeforeInput), true)
      rootElement = null
      globalCtx = null
    },
  }

  return plugin
}

// Re-export the renderer widget factory so consumers can pick the
// minimum surface they need (renderer-only uses `createMentionWidget`,
// editor uses `createMentionPlugin`).
export { createMentionWidget } from './widget.js'
