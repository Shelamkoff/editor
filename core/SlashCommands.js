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

  /** Slash UI belongs to one live block instance and authored field. */
  /** @type {{ block: import('./types').IBlock, content: HTMLElement, field: HTMLElement } | null} */
  #session = null

  /** @type {string} */
  #filter = ''

  /** @type {{ type: string, title: string, searchText: string, icon: string, data?: Record<string, unknown>, inlineInsert?: boolean }[]} */
  #allItems = []

  /** @type {{ type: string, title: string, searchText: string, icon: string, data?: Record<string, unknown>, inlineInsert?: boolean }[]} */
  #filteredItems = []

  /** @type {number} */
  #activeIndex = 0

  /** Monotonic ownership token for one rendered menu item list. */
  #itemsVersion = 0

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
    rootEl.addEventListener('focusout', this.#onFocusOut)
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#open
  }

  close() {
    if (!this.#open) return
    this.#open = false
    this.#session = null
    this.#filter = ''
    this.#menuEl.style.display = 'none'
    this.#removeScrollListener()
    this.#cancelScheduledPosition()
  }

  destroy() {
    this.close()
    this.#removeScrollListener()
    this.#cancelScheduledPosition()
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
    this.#rootEl.removeEventListener('input', this.#onInput)
    this.#rootEl.removeEventListener('focusout', this.#onFocusOut)
    this.#menuEl.remove()
  }

  #onInput = (/** @type {InputEvent} */ e) => {
    const block = this.#editingBlockForTarget(e.target)
    if (!block) {
      this.close()
      return
    }

    const field = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('[contenteditable="true"]'))
    if (this.#open && (!this.#sessionIsCurrent() || this.#session?.block !== block || this.#session.field !== field)) {
      this.close()
    }
    const text = field.textContent || ''

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
      this.#openMenu(block, field)
    } else if (this.#inlinePluginRegistry && this.#inlinePluginRegistry.size > 0 && text.endsWith('/')) {
      this.#openMenu(block, field)
    }
  }

  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (!this.#open) return
    const block = this.#editingBlockForTarget(e.target)
    const field = /** @type {Element | null} */ (e.target)?.closest?.('[contenteditable="true"]')
    if (!this.#sessionIsCurrent() || block !== this.#session?.block || field !== this.#session.field) {
      this.close()
      return
    }

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
        const text = this.#session.field.textContent || ''
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

  #onFocusOut = (/** @type {FocusEvent} */ event) => {
    if (this.#open && !this.#session?.field.contains(/** @type {Node | null} */ (event.relatedTarget))) this.close()
  }

  #sessionIsCurrent() {
    const session = this.#session
    return !!session
      && this.#blocks.getBlockById(session.block.id) === session.block
      && this.#blocks.getCurrentBlock() === session.block
      && session.block.contentElement === session.content
      && session.content.contains(session.field)
      && this.#rootEl.contains(session.field)
  }

  /** @param {import('./types').IBlock} block @param {HTMLElement} field */
  #openMenu(block, field) {
    this.#session = { block, content: block.contentElement, field }
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
    const version = ++this.#itemsVersion
    const session = this.#session
    const ownsItems = () => this.#open && this.#session === session && this.#itemsVersion === version
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
        if (ownsItems()) this.#selectItem(i)
      })

      btn.addEventListener('mouseenter', () => {
        if (!ownsItems() || !this.#sessionIsCurrent() || this.#activeIndex === i) return
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
    if (!this.#sessionIsCurrent()) { this.close(); return }
    const item = this.#filteredItems[index]
    if (!item) return
    const field = this.#session.field

    const blocks = this.#blocks
    const currentIndex = blocks.getCurrentIndex()
    const current = blocks.getCurrentBlock()
    if (!current) return

    this.close()

    if (item.inlineInsert && this.#inlinePluginRegistry && this.#inlinePluginCtx) {
      this.#runBatch(() => this.#commands.runForBlock(
        current,
        () => this.#insertInlineWidget(field, item.type),
      ))
      return
    }

    this.#runBatch(() => this.#commands.runForBlock(current, () => {
      const slashIndex = (field.textContent || '').lastIndexOf('/')

      // A slash command in one field must never discard the other fields or
      // structural DOM of a composite block (Quote, Table, Columns, etc.).
      if (slashIndex > 0 || field !== current.contentElement) {
        this.#removeQueryText(field)
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

  #insertInlineWidget(field, pluginType) {
    this.#removeQueryText(field)
    this.#events.emit(EditorEvent.INLINE_PLUGIN_INSERT, { type: pluginType })
  }

  #clearSlashText() {
    const field = this.#session?.field
    return field ? this.#removeQueryText(field) : false
  }

  /** Remove the complete query, even when formatting split it into text nodes.
   * @param {HTMLElement} field
   * @returns {boolean}
   */
  #removeQueryText(field) {
    const range = createRangeFromLastTextMatch(field, '/')
    if (!range) return false
    range.setEnd(field, field.childNodes.length)
    range.deleteContents()
    range.collapse(true)
    const selection = this.#view?.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    return true
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
    if (!this.#sessionIsCurrent()) { this.close(); return }
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    const blockRect = block.element.getBoundingClientRect()
    const editorRect = this.#rootEl.getBoundingClientRect()
    const field = this.#session.field
    const text = field.textContent || ''
    const commandRange = text.includes('/')
      ? createRangeFromLastTextMatch(field, '/')
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
