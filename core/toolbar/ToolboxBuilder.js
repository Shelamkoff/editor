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

/**
 * Builds and manages the toolbox popup contents:
 *  - filter input (when plugin count exceeds threshold)
 *  - menu items for each block plugin
 *  - menu items for each inline plugin
 *  - keyboard navigation (Arrow/Home/End/Escape)
 *  - text filter that hides non-matching items
 *
 * Owns no positioning or open/close state — that lives on Toolbar.
 */
export class ToolboxBuilder {
  /** @type {HTMLElement} */
  #toolboxEl

  /** @type {ToolboxDeps} */
  #deps

  /** @type {HTMLInputElement | null} */
  #filterInput = null

  /**
   * @param {HTMLElement} toolboxEl
   * @param {ToolboxDeps} deps
   */
  constructor(toolboxEl, deps) {
    this.#toolboxEl = toolboxEl
    this.#deps = deps
    this.#toolboxEl.addEventListener('keydown', this.#onKeydown)
    this.#build()
  }

  /** @returns {HTMLInputElement | null} */
  get filterInput() {
    return this.#filterInput
  }

  /**
   * Reset the filter to empty (called when reopening the toolbox).
   */
  resetFilter() {
    if (this.#filterInput) {
      this.#filterInput.value = ''
      this.#applyFilter('')
    }
  }

  destroy() {
    this.#toolboxEl.removeEventListener('keydown', this.#onKeydown)
  }

  // ── building ────────────────────────────────────────────────────────────────

  #build() {
    this.#toolboxEl.innerHTML = ''
    this.#filterInput = null

    const plugins = [...this.#deps.plugins.values()]

    if (plugins.length > this.#deps.filterThreshold) {
      this.#toolboxEl.appendChild(this.#buildFilterInput())
    }

    for (const plugin of plugins) {
      this.#toolboxEl.appendChild(this.#buildBlockItem(plugin))
    }

    if (this.#deps.inlinePlugins) {
      for (const ip of this.#deps.inlinePlugins.values()) {
        this.#toolboxEl.appendChild(this.#buildInlinePluginItem(ip))
      }
    }
  }

  /** @returns {HTMLElement} */
  #buildFilterInput() {
    const wrap = el('li', 'oe-toolbox__filter', { role: 'none' })

    const icon = el('span', 'oe-toolbox__filter-icon')
    icon.innerHTML = ICON_SEARCH

    const input = /** @type {HTMLInputElement} */ (el('input', 'oe-toolbox__filter-input', {
      type: 'text',
      placeholder: this.#deps.i18n.t('toolbox.search'),
    }))

    input.addEventListener('input', () => this.#applyFilter(input.value))
    input.addEventListener('keydown', (e) => this.#onFilterKeydown(e, input))

    wrap.append(icon, input)
    this.#filterInput = input
    return wrap
  }

  /**
   * @param {import('../types').BlockPlugin} plugin
   * @returns {HTMLElement}
   */
  #buildBlockItem(plugin) {
    const item = el('li', 'oe-toolbox__item', { role: 'menuitem', tabindex: '-1' })
    item.dataset.pluginType = plugin.type

    // English type name + localized title for bilingual search.
    const enFallback = plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1)
    item.dataset.search = `${enFallback}\0${plugin.title}`.toLowerCase()

    const icon = el('span', 'oe-toolbox__icon')
    icon.innerHTML = plugin.icon
    item.appendChild(icon)

    const label = el('span', 'oe-toolbox__label')
    label.textContent = plugin.title
    item.appendChild(label)

    item.addEventListener('click', () => this.#deps.onInsertBlock(plugin.type))
    return item
  }

  /**
   * @param {import('../types').InlinePlugin} ip
   * @returns {HTMLElement}
   */
  #buildInlinePluginItem(ip) {
    const item = el('li', 'oe-toolbox__item oe-toolbox__item--inline', { role: 'menuitem', tabindex: '-1' })
    item.dataset.pluginType = ip.type
    item.dataset.inlinePlugin = '1'

    const enFallback = ip.type.charAt(0).toUpperCase() + ip.type.slice(1)
    item.dataset.search = `${enFallback}\0${ip.title}`.toLowerCase()

    const iconEl = el('span', 'oe-toolbox__icon')
    iconEl.innerHTML = ip.icon
    item.appendChild(iconEl)

    const label = el('span', 'oe-toolbox__label')
    label.textContent = ip.title
    item.appendChild(label)

    item.addEventListener('click', () => this.#deps.onInsertInlinePlugin(ip.type))
    return item
  }

  // ── filter ──────────────────────────────────────────────────────────────────

  /**
   * @param {string} query
   */
  #applyFilter(query) {
    const q = query.toLowerCase().trim()
    const items = this.#toolboxEl.querySelectorAll('.oe-toolbox__item')
    let visibleCount = 0

    for (const item of items) {
      const itemEl = /** @type {HTMLElement} */ (item)
      const searchText = itemEl.dataset.search
        || itemEl.querySelector('.oe-toolbox__label')?.textContent?.toLowerCase()
        || ''
      const match = !q || searchText.includes(q)
      itemEl.style.display = match ? '' : 'none'
      if (match) visibleCount++
    }

    let emptyEl = this.#toolboxEl.querySelector('.oe-toolbox__empty')
    if (visibleCount === 0 && q) {
      if (!emptyEl) {
        emptyEl = el('div', 'oe-toolbox__empty')
        emptyEl.textContent = this.#deps.i18n.t('slash.noResults')
        this.#toolboxEl.appendChild(emptyEl)
      }
    } else if (emptyEl) {
      emptyEl.remove()
    }
  }

  // ── keyboard ────────────────────────────────────────────────────────────────

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLInputElement} input
   */
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
      if (first) /** @type {HTMLElement} */ (first).focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const items = this.#toolboxEl.querySelectorAll('[role="menuitem"]:not([style*="display: none"])')
      if (items.length) /** @type {HTMLElement} */ (items[items.length - 1]).focus()
    } else if (e.key !== 'Enter') {
      e.stopPropagation()
    }
  }

  /** @param {KeyboardEvent} e */
  #onKeydown = (e) => {
    const items = /** @type {HTMLElement[]} */ (
      [...this.#toolboxEl.querySelectorAll('[role="menuitem"]:not([style*="display: none"])')]
    )
    if (!items.length) return

    const current = /** @type {HTMLElement} */ (document.activeElement)
    const idx = items.indexOf(current)

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        e.stopPropagation()
        const next = idx < items.length - 1 ? idx + 1 : 0
        items[next]?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        e.stopPropagation()
        if (idx <= 0 && this.#filterInput) {
          this.#filterInput.focus()
        } else {
          const prev = idx > 0 ? idx - 1 : items.length - 1
          items[prev]?.focus()
        }
        break
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        this.#deps.onClose()
        break
      case 'Home':
        e.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        items[items.length - 1]?.focus()
        break
    }
  }
}
