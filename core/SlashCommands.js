import { el, positionPopup } from './dom.js'
import { EditorEvent } from './editorEvents.js'

export class SlashCommands {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./I18n').I18n} */
  #i18n

  /** @type {HTMLElement} */
  #menuEl

  /** @type {boolean} */
  #open = false

  /** @type {string} */
  #filter = ''

  /** @type {{ type: string, title: string, searchText: string, icon: string, data?: Record<string, unknown>, inlineInsert?: boolean }[]} */
  #allItems = []

  /** @type {{ type: string, title: string, searchText: string, icon: string, data?: Record<string, unknown>, inlineInsert?: boolean }[]} */
  #filteredItems = []

  /** @type {number} */
  #activeIndex = 0

  /** @type {(() => void) | null} */
  #scrollCleanup = null

  /** @type {import('./InlinePluginRegistry').InlinePluginRegistry | null} */
  #inlinePluginRegistry

  /** @type {import('./types').InlinePluginContext | null} */
  #inlinePluginCtx

  /**
   * @typedef {Object} SlashCommandsConfig
   * @property {Map<string, import('./types').BlockPlugin>} plugins
   * @property {import('./types').IBlockManager} blocks
   * @property {import('./types').ISelectionManager} selection
   * @property {import('./types').IEventBus} events
   * @property {import('./I18n').I18n} i18n
   * @property {import('./InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
   * @property {import('./types').InlinePluginContext} [inlinePluginCtx]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {SlashCommandsConfig} config
   */
  constructor(rootEl, config) {
    const { plugins, blocks, selection, events, i18n, inlinePluginRegistry, inlinePluginCtx } = config
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#events = events
    this.#i18n = i18n
    this.#inlinePluginRegistry = inlinePluginRegistry ?? null
    this.#inlinePluginCtx = inlinePluginCtx ?? null

    for (const plugin of plugins.values()) {
      // searchText includes English type name + localized title for bilingual search
      const title = plugin.title
      const enFallback = plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1)
      this.#allItems.push({
        type: plugin.type,
        title,
        searchText: `${enFallback}\0${title}`.toLowerCase(),
        icon: plugin.icon,
      })
    }

    // Add inline plugins to the menu
    if (inlinePluginRegistry) {
      for (const ip of inlinePluginRegistry.values()) {
        const title = ip.title
        const enFallback = ip.type.charAt(0).toUpperCase() + ip.type.slice(1)
        this.#allItems.push({
          type: ip.type,
          title,
          searchText: `${enFallback}\0${title}`.toLowerCase(),
          icon: ip.icon,
          inlineInsert: true,
        })
      }
    }

    this.#menuEl = el('ul', 'oe-slash-menu', { role: 'menu' })
    this.#menuEl.style.display = 'none'
    rootEl.appendChild(this.#menuEl)

    // Capture-phase keydown to intercept before KeyboardManager
    rootEl.addEventListener('keydown', this.#onKeyDown, true)
    rootEl.addEventListener('input', this.#onInput)
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#open
  }

  /** Close the slash menu. */
  close() {
    if (!this.#open) return
    this.#open = false
    this.#filter = ''
    this.#menuEl.style.display = 'none'
    this.#removeScrollListener()
  }

  /** Clean up. */
  destroy() {
    this.#removeScrollListener()
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
    this.#rootEl.removeEventListener('input', this.#onInput)
    this.#menuEl.remove()
  }

  #onInput = () => {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    const text = block.contentElement.textContent || ''

    if (this.#open) {
      // Update filter: text after last "/"
      const slashIdx = text.lastIndexOf('/')
      if (slashIdx >= 0) {
        this.#filter = text.slice(slashIdx + 1)
        this.#updateItems()
      } else {
        // Slash removed — close
        this.close()
      }
      return
    }

    // Detect "/" typed — at start of empty block or anywhere if inline plugins exist
    if (text === '/') {
      this.#openMenu()
    } else if (this.#inlinePluginRegistry && this.#inlinePluginRegistry.size > 0 && text.endsWith('/')) {
      // "/" typed in the middle of text — open menu for inline plugins
      this.#openMenu()
    }
  }

  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (!this.#open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        if (this.#filteredItems.length === 0) return
        this.#activeIndex = (this.#activeIndex + 1) % this.#filteredItems.length
        this.#renderItems()
        break

      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        if (this.#filteredItems.length === 0) return
        this.#activeIndex = (this.#activeIndex - 1 + this.#filteredItems.length) % this.#filteredItems.length
        this.#renderItems()
        break

      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        this.#selectItem(this.#activeIndex)
        break

      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        this.#clearSlashText()
        this.close()
        break

      case 'Backspace': {
        // If only "/" remains, close and let backspace remove it
        const block = this.#blocks.getCurrentBlock()
        const text = block?.contentElement.textContent || ''
        if (text === '/') {
          this.close()
          // Don't stopPropagation — let the key go through to remove "/"
        }
        break
      }

      case 'Tab':
        e.preventDefault()
        e.stopPropagation()
        this.#selectItem(this.#activeIndex)
        break
    }
  }

  #openMenu() {
    this.#open = true
    this.#filter = ''
    this.#activeIndex = 0
    this.#updateItems()
    this.#menuEl.style.display = ''
    this.#position()
    this.#addScrollListener()
  }

  #addScrollListener() {
    this.#removeScrollListener()
    const onScroll = () => { if (this.#open) this.#position() }
    // Listen on nearest scrollable ancestor and window
    let scrollParent = this.#rootEl.parentElement
    while (scrollParent && scrollParent !== document.documentElement) {
      if (scrollParent.scrollHeight > scrollParent.clientHeight) break
      scrollParent = scrollParent.parentElement
    }
    const target = scrollParent || window
    target.addEventListener('scroll', onScroll, { passive: true })
    this.#scrollCleanup = () => target.removeEventListener('scroll', onScroll)
  }

  #removeScrollListener() {
    if (this.#scrollCleanup) {
      this.#scrollCleanup()
      this.#scrollCleanup = null
    }
  }

  #updateItems() {
    const query = this.#filter.toLowerCase()
    this.#filteredItems = query
      ? this.#allItems.filter(item => item.searchText.includes(query))
      : [...this.#allItems]
    this.#activeIndex = Math.min(this.#activeIndex, Math.max(0, this.#filteredItems.length - 1))
    this.#renderItems()
  }

  #renderItems() {
    this.#menuEl.innerHTML = ''

    if (this.#filteredItems.length === 0) {
      const empty = el('li', 'oe-slash-menu__empty', { role: 'none' })
      empty.textContent = this.#i18n.t('slash.noResults')
      this.#menuEl.appendChild(empty)
      return
    }

    this.#filteredItems.forEach((item, i) => {
      const btn = el('li', 'oe-slash-menu__item', { role: 'menuitem', tabindex: '-1' })
      if (i === this.#activeIndex) btn.classList.add('oe-slash-menu__item--active')

      const icon = el('span', 'oe-slash-menu__icon')
      icon.innerHTML = item.icon
      btn.appendChild(icon)

      const label = el('span', 'oe-slash-menu__label')
      label.textContent = item.title
      btn.appendChild(label)

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.#selectItem(i)
      })

      btn.addEventListener('mouseenter', () => {
        if (this.#activeIndex === i) return
        const prev = this.#menuEl.children[this.#activeIndex]
        if (prev) prev.classList.remove('oe-slash-menu__item--active')
        this.#activeIndex = i
        btn.classList.add('oe-slash-menu__item--active')
      })

      this.#menuEl.appendChild(btn)
    })

    // Scroll active item into view
    const activeEl = this.#menuEl.children[this.#activeIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }

  /**
   * @param {number} index
   */
  #selectItem(index) {
    const item = this.#filteredItems[index]
    if (!item) return

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    const current = blocks.getCurrentBlock()
    if (!current) return

    this.close()

    if (item.inlineInsert && this.#inlinePluginRegistry && this.#inlinePluginCtx) {
      // Inline plugin: delete "/text" and insert widget at caret position
      this.#insertInlineWidget(current, item.type)
      return
    }

    // Block plugin: clear slash text and convert block
    current.contentElement.textContent = ''

    const converted = blocks.convert(currentIndex, item.type, item.data)
    if (converted) {
      blocks.setCurrentIndex(currentIndex)
      this.#selection.setCaretToBlock(converted.id, 'start')
      converted.focus()
    }
  }

  /**
   * Delete the "/command" text and insert an inline plugin widget via event bus.
   * EditorFacade handles actual widget creation/hydration.
   * @param {import('./types').IBlock} block
   * @param {string} pluginType
   */
  #insertInlineWidget(block, pluginType) {
    const ce = block.contentElement
    const text = ce.textContent || ''

    // Find and remove the "/command" text, place caret at deletion point
    const slashIdx = text.lastIndexOf('/')
    if (slashIdx >= 0) {
      const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
      let charCount = 0
      while (walker.nextNode()) {
        const node = /** @type {Text} */ (walker.currentNode)
        const nodeLen = node.length
        if (charCount + nodeLen > slashIdx) {
          const offsetInNode = slashIdx - charCount
          const range = document.createRange()
          range.setStart(node, offsetInNode)
          range.setEnd(node, nodeLen)
          range.deleteContents()

          // Place caret at deletion point so EditorFacade inserts widget here
          const sel = window.getSelection()
          if (sel) {
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
          }
          break
        }
        charCount += nodeLen
      }
    }

    // Delegate widget creation to EditorFacade via event bus
    this.#events.emit(EditorEvent.INLINE_PLUGIN_INSERT, { type: pluginType })
  }

  /**
   * Remove only the `/command` text from the current block, preserving
   * any content that preceded the slash.
   */
  #clearSlashText() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    const ce = block.contentElement
    const text = ce.textContent || ''
    const slashIdx = text.lastIndexOf('/')
    if (slashIdx < 0) return

    // If the block contains only the slash command, clear everything.
    if (slashIdx === 0) {
      ce.textContent = ''
      return
    }

    // Walk text nodes to find the slash position and delete from there to end.
    const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
    let charCount = 0
    while (walker.nextNode()) {
      const node = /** @type {Text} */ (walker.currentNode)
      const nodeLen = node.length
      if (charCount + nodeLen > slashIdx) {
        const offsetInNode = slashIdx - charCount
        const range = document.createRange()
        range.setStart(node, offsetInNode)
        range.setEnd(node, nodeLen)
        range.deleteContents()

        // Place caret at deletion point
        const sel = window.getSelection()
        if (sel) {
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        break
      }
      charCount += nodeLen
    }
  }

  #position() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    const blockRect = block.element.getBoundingClientRect()
    const editorRect = this.#rootEl.getBoundingClientRect()

    this.#menuEl.style.left = `${blockRect.left - editorRect.left}px`
    positionPopup(this.#menuEl, blockRect, editorRect)
  }
}
