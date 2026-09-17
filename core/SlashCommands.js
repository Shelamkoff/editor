import { setTrustedHtml } from './sanitize.js'
import { el, positionPopup } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { createRangeFromLastTextMatch } from './textOffset.js'

export class SlashCommands {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {Document} */
  #document

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #commands

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

  /** @type {number} */
  #positionFrame = 0

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
   * @property {import('./CommandDispatcher').CommandDispatcher} commands
   * @property {import('./I18n').I18n} i18n
   * @property {import('./InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
   * @property {import('./types').InlinePluginContext} [inlinePluginCtx]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {SlashCommandsConfig} config
   */
  constructor(rootEl, config) {
    const { plugins, blocks, selection, events, commands, i18n, inlinePluginRegistry, inlinePluginCtx } = config
    this.#rootEl = rootEl
    this.#document = rootEl.ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)
    this.#blocks = blocks
    this.#selection = selection
    this.#events = events
    this.#commands = commands
    this.#i18n = i18n
    this.#inlinePluginRegistry = inlinePluginRegistry ?? null
    this.#inlinePluginCtx = inlinePluginCtx ?? null

    for (const plugin of plugins.values()) {
      const title = plugin.title
      const enFallback = plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1)
      this.#allItems.push({
        type: plugin.type,
        title,
        searchText: `${enFallback}\0${title}`.toLowerCase(),
        icon: plugin.icon,
      })
    }

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

    this.#menuEl = el('ul', 'oe-slash-menu', { role: 'menu' }, this.#document)
    this.#menuEl.style.display = 'none'
    rootEl.appendChild(this.#menuEl)

    rootEl.addEventListener('keydown', this.#onKeyDown, true)
    rootEl.addEventListener('input', this.#onInput)
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#open
  }

  close() {
    if (!this.#open) return
    this.#open = false
    this.#filter = ''
    this.#menuEl.style.display = 'none'
    this.#removeScrollListener()
    this.#cancelScheduledPosition()
  }

  destroy() {
    this.#removeScrollListener()
    this.#cancelScheduledPosition()
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
    this.#rootEl.removeEventListener('input', this.#onInput)
    this.#menuEl.remove()
  }

  #onInput = (/** @type {InputEvent} */ e) => {
    const block = this.#editingBlockForTarget(e.target)
    if (!block) {
      this.close()
      return
    }

    const text = block.contentElement.textContent || ''

    if (this.#open) {
      const slashIdx = text.lastIndexOf('/')
      if (slashIdx >= 0) {
        this.#filter = text.slice(slashIdx + 1)
        this.#updateItems()
        this.#position()
        this.#schedulePosition()
      } else {
        this.close()
      }
      return
    }

    if (text === '/') {
      this.#openMenu()
    } else if (this.#inlinePluginRegistry && this.#inlinePluginRegistry.size > 0 && text.endsWith('/')) {
      this.#openMenu()
    }
  }

  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (!this.#open) return
    if (!this.#editingBlockForTarget(e.target)) return

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
        this.#runBatch(() => {
          const block = this.#blocks.getCurrentBlock()
          if (block) this.#commands.runForBlock(block, () => this.#clearSlashText())
        })
        this.close()
        break

      case 'Backspace': {
        const block = this.#blocks.getCurrentBlock()
        const text = block?.contentElement.textContent || ''
        if (text === '/') {
          this.close()
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

  #editingBlockForTarget(target) {
    const element = /** @type {Element | null} */ (target)
    const editingHost = element?.closest?.('[contenteditable="true"]') ?? null
    if (!editingHost || !this.#rootEl.contains(editingHost)) return null
    return this.#blocks.getBlockByChildNode(editingHost) ?? null
  }

  #openMenu() {
    this.#open = true
    this.#filter = ''
    this.#activeIndex = 0
    this.#updateItems()
    this.#menuEl.style.display = ''
    this.#position()
    this.#schedulePosition()
    this.#addScrollListener()
  }

  #schedulePosition() {
    this.#cancelScheduledPosition()
    const requestFrame = this.#view?.requestAnimationFrame?.bind(this.#view)
    if (!requestFrame) return
    this.#positionFrame = requestFrame(() => {
      this.#positionFrame = 0
      if (this.#open) this.#position()
    })
  }

  #cancelScheduledPosition() {
    if (!this.#positionFrame) return
    this.#view?.cancelAnimationFrame?.(this.#positionFrame)
    this.#positionFrame = 0
  }

  #addScrollListener() {
    this.#removeScrollListener()
    const onScroll = () => { if (this.#open) this.#position() }
    let scrollParent = this.#rootEl.parentElement
    while (scrollParent && scrollParent !== this.#document.documentElement) {
      if (scrollParent.scrollHeight > scrollParent.clientHeight) break
      scrollParent = scrollParent.parentElement
    }
    const target = scrollParent || this.#view
    if (!target) return
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
    this.#menuEl.textContent = ''

    if (this.#filteredItems.length === 0) {
      const empty = el('li', 'oe-slash-menu__empty', { role: 'none' }, this.#document)
      empty.textContent = this.#i18n.t('slash.noResults')
      this.#menuEl.appendChild(empty)
      return
    }

    this.#filteredItems.forEach((item, i) => {
      const btn = el('li', 'oe-slash-menu__item', { role: 'menuitem', tabindex: '-1' }, this.#document)
      if (i === this.#activeIndex) btn.classList.add('oe-slash-menu__item--active')

      const icon = el('span', 'oe-slash-menu__icon', undefined, this.#document)
      setTrustedHtml(icon, item.icon)
      btn.appendChild(icon)

      const label = el('span', 'oe-slash-menu__label', undefined, this.#document)
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

    const activeEl = this.#menuEl.children[this.#activeIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }

  /** @param {number} index */
  #selectItem(index) {
    const item = this.#filteredItems[index]
    if (!item) return

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    const current = blocks.getCurrentBlock()
    if (!current) return

    this.close()

    if (item.inlineInsert && this.#inlinePluginRegistry && this.#inlinePluginCtx) {
      this.#runBatch(() => this.#commands.runForBlock(
        current,
        () => this.#insertInlineWidget(current, item.type),
      ))
      return
    }

    this.#runBatch(() => this.#commands.runForBlock(current, () => {
      const slashIndex = (current.contentElement.textContent || '').lastIndexOf('/')

      if (slashIndex > 0) {
        this.#clearSlashText()
        current.markDirty()

        const inserted = blocks.insert(item.type, item.data, currentIndex + 1)
        if (inserted) {
          blocks.setCurrentIndex(currentIndex + 1)
          this.#selection.setCaretToBlock(inserted.id, 'start')
          inserted.focus()
        }
        return
      }

      current.contentElement.textContent = ''
      current.markDirty()

      const converted = blocks.convert(currentIndex, item.type, item.data)
      if (converted) {
        blocks.setCurrentIndex(currentIndex)
        this.#selection.setCaretToBlock(converted.id, 'start')
        converted.focus()
      }
    }))
  }

  #insertInlineWidget(block, pluginType) {
    this.#removeQueryText(block)
    this.#events.emit(EditorEvent.INLINE_PLUGIN_INSERT, { type: pluginType })
  }

  #clearSlashText() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return false

    return this.#removeQueryText(block)
  }

  /**
   * @param {import('./types').IBlock} block
   * @returns {boolean}
   */
  #removeQueryText(block) {
    const ce = block.contentElement
    const text = ce.textContent || ''
    const slashIdx = text.lastIndexOf('/')
    if (slashIdx < 0) return false

    if (slashIdx === 0) {
      ce.textContent = ''
      return true
    }

    const walker = this.#document.createTreeWalker(ce, this.#view?.NodeFilter?.SHOW_TEXT ?? 4)
    let charCount = 0
    while (walker.nextNode()) {
      const node = /** @type {import('./types').DOMText} */ (walker.currentNode)
      const nodeLen = node.length
      if (charCount + nodeLen > slashIdx) {
        const offsetInNode = slashIdx - charCount
        const range = this.#document.createRange()
        range.setStart(node, offsetInNode)
        range.setEnd(node, nodeLen)
        range.deleteContents()

        const sel = this.#view?.getSelection()
        if (sel) {
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        return true
      }
      charCount += nodeLen
    }
    return false
  }

  #runBatch(operation) {
    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      return operation()
    } finally {
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
  }

  #position() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    const blockRect = block.element.getBoundingClientRect()
    const editorRect = this.#rootEl.getBoundingClientRect()
    const text = block.contentElement.textContent || ''
    const commandRange = text.includes('/')
      ? createRangeFromLastTextMatch(block.contentElement, '/')
      : null
    const commandRect = commandRange
      ? (commandRange.getClientRects()[0] ?? commandRange.getBoundingClientRect())
      : null
    const anchorRect = commandRect && commandRect.height > 0 ? commandRect : blockRect
    const menuWidth = this.#menuEl.offsetWidth || 240
    const minimumLeft = -editorRect.left
    const viewportRight = this.#view?.innerWidth ?? editorRect.right
    const maximumLeft = Math.max(minimumLeft, viewportRight - editorRect.left - menuWidth)
    const desiredLeft = anchorRect.left - editorRect.left

    this.#menuEl.style.left = `${Math.min(maximumLeft, Math.max(minimumLeft, desiredLeft))}px`
    positionPopup(this.#menuEl, anchorRect, editorRect)
  }
}
