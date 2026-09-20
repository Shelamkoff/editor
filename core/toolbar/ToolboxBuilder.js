import { setTrustedHtml } from '../sanitize.js'
import { el } from '../dom.js'

const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>'

/**
 * @typedef {Object} ToolboxDeps
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../InlinePluginRegistry').InlinePluginRegistry | null} inlinePlugins
 * @property {import('../I18n').I18n} i18n
 * @property {number} filterThreshold
 * @property {(type: string) => void} onInsertBlock
 * @property {(type: string) => void} onInsertInlinePlugin
 * @property {() => void} onClose
 */

/** Builds and manages the toolbox popup contents. */
export class ToolboxBuilder {
  /** @type {HTMLElement} */ #toolboxEl
  /** @type {ToolboxDeps} */ #deps
  /** @type {Document} */ #document
  /** @type {(Window & typeof globalThis) | null} */ #view
  /** @type {HTMLInputElement | null} */ #filterInput = null

  /** @param {HTMLElement} toolboxEl @param {ToolboxDeps} deps */
  constructor(toolboxEl, deps) {
    this.#toolboxEl = toolboxEl
    this.#deps = deps
    this.#document = toolboxEl.ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)
    this.#toolboxEl.addEventListener('keydown', this.#onKeydown)
    this.#build()
  }

  get filterInput() { return this.#filterInput }

  resetFilter() {
    if (this.#filterInput) {
      this.#filterInput.value = ''
      this.#applyFilter('')
    }
  }

  destroy() {
    this.#toolboxEl.removeEventListener('keydown', this.#onKeydown)
  }

  #build() {
    this.#toolboxEl.textContent = ''
    this.#filterInput = null
    const plugins = [...this.#deps.plugins.values()]
    if (plugins.length > this.#deps.filterThreshold) this.#toolboxEl.appendChild(this.#buildFilterInput())
    for (const plugin of plugins) this.#toolboxEl.appendChild(this.#buildBlockItem(plugin))
    if (this.#deps.inlinePlugins) {
      for (const ip of this.#deps.inlinePlugins.values()) this.#toolboxEl.appendChild(this.#buildInlinePluginItem(ip))
    }
  }

  #buildFilterInput() {
    const wrap = el('li', 'oe-toolbox__filter', { role: 'none' }, this.#document)
    const icon = el('span', 'oe-toolbox__filter-icon', undefined, this.#document)
    setTrustedHtml(icon, ICON_SEARCH)
    const input = /** @type {HTMLInputElement} */ (el('input', 'oe-toolbox__filter-input', {
      type: 'text',
      placeholder: this.#deps.i18n.t('toolbox.search'),
    }, this.#document))
    input.addEventListener('input', () => this.#applyFilter(input.value))
    input.addEventListener('keydown', (e) => this.#onFilterKeydown(e, input))
    wrap.append(icon, input)
    this.#filterInput = input
    return wrap
  }

  #buildBlockItem(plugin) {
    const item = el('li', 'oe-toolbox__item', { role: 'menuitem', tabindex: '-1' }, this.#document)
    item.dataset.pluginType = plugin.type
    const enFallback = plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1)
    item.dataset.search = `${enFallback}\0${plugin.title}`.toLowerCase()
    const icon = el('span', 'oe-toolbox__icon', undefined, this.#document)
    setTrustedHtml(icon, plugin.icon)
    item.appendChild(icon)
    const label = el('span', 'oe-toolbox__label', undefined, this.#document)
    label.textContent = plugin.title
    item.appendChild(label)
    item.addEventListener('click', () => this.#deps.onInsertBlock(plugin.type))
    return item
  }

  #buildInlinePluginItem(ip) {
    const item = el('li', 'oe-toolbox__item oe-toolbox__item--inline', { role: 'menuitem', tabindex: '-1' }, this.#document)
    item.dataset.pluginType = ip.type
    item.dataset.inlinePlugin = '1'
    const enFallback = ip.type.charAt(0).toUpperCase() + ip.type.slice(1)
    item.dataset.search = `${enFallback}\0${ip.title}`.toLowerCase()
    const iconEl = el('span', 'oe-toolbox__icon', undefined, this.#document)
    setTrustedHtml(iconEl, ip.icon)
    item.appendChild(iconEl)
    const label = el('span', 'oe-toolbox__label', undefined, this.#document)
    label.textContent = ip.title
    item.appendChild(label)
    item.addEventListener('click', () => this.#deps.onInsertInlinePlugin(ip.type))
    return item
  }

  #applyFilter(query) {
    const q = query.toLowerCase().trim()
    const items = this.#toolboxEl.querySelectorAll('.oe-toolbox__item')
    let visibleCount = 0
    for (const item of items) {
      const itemEl = /** @type {HTMLElement} */ (item)
      const labelText = itemEl.querySelector('.oe-toolbox__label')?.textContent ?? ''
      const searchText = itemEl.dataset.search || String(labelText).toLowerCase()
      const match = !q || searchText.includes(q)
      itemEl.style.display = match ? '' : 'none'
      if (match) visibleCount++
    }
    let emptyEl = this.#toolboxEl.querySelector('.oe-toolbox__empty')
    if (visibleCount === 0 && q) {
      if (!emptyEl) {
        emptyEl = el('div', 'oe-toolbox__empty', undefined, this.#document)
        emptyEl.textContent = this.#deps.i18n.t('slash.noResults')
        this.#toolboxEl.appendChild(emptyEl)
      }
    } else if (emptyEl) emptyEl.remove()
  }

  #isOwnedElement(value) {
    const HTMLElementCtor = this.#view?.HTMLElement
    return HTMLElementCtor ? value instanceof HTMLElementCtor : !!value && typeof value.focus === 'function'
  }

  #onFilterKeydown(e, input) {
    if (e.key === 'Escape') {
      input.value = ''
      this.#applyFilter('')
      this.#deps.onClose()
      e.stopPropagation()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const first = this.#toolboxEl.querySelector('[role="menuitem"]:not([style*="display: none"])')
      if (this.#isOwnedElement(first)) /** @type {HTMLElement} */ (first).focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const items = this.#toolboxEl.querySelectorAll('[role="menuitem"]:not([style*="display: none"])')
      const last = items.item(items.length - 1)
      if (this.#isOwnedElement(last)) /** @type {HTMLElement} */ (last).focus()
    } else if (e.key !== 'Enter') {
      e.stopPropagation()
    }
  }

  #onKeydown = (e) => {
    const items = /** @type {HTMLElement[]} */ ([...this.#toolboxEl.querySelectorAll('[role="menuitem"]:not([style*="display: none"])')])
    if (!items.length) return
    const current = /** @type {HTMLElement | null} */ (this.#document.activeElement)
    const idx = current ? items.indexOf(current) : -1

    switch (e.key) {
      case 'Enter':
      case ' ': {
        // Menu items are LI elements: unlike buttons they have no native key
        // activation. Enter from the search field/menu selects the first
        // visible item, while Space in the search field remains text input.
        const item = items[idx] ?? (e.key === 'Enter'
          && (current === this.#filterInput || current === this.#toolboxEl) ? items[0] : null)
        if (!item) return
        e.preventDefault(); e.stopPropagation()
        item.click()
        break
      }
      case 'ArrowDown': {
        e.preventDefault(); e.stopPropagation()
        const next = idx < items.length - 1 ? idx + 1 : 0
        items[next]?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault(); e.stopPropagation()
        if (idx <= 0 && this.#filterInput) this.#filterInput.focus()
        else items[idx > 0 ? idx - 1 : items.length - 1]?.focus()
        break
      }
      case 'Escape':
        e.preventDefault(); e.stopPropagation(); this.#deps.onClose(); break
      case 'Home':
        e.preventDefault(); items[0]?.focus(); break
      case 'End':
        e.preventDefault(); items[items.length - 1]?.focus(); break
    }
  }
}
