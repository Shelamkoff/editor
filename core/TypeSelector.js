import { resolveBlockRange } from './selectionRange.js'
import { el, positionPopup } from './dom.js'
import { convertCrossBlockRange, isTextType } from './crossBlockConvert.js'
import { CrossBlockSelection } from './CrossBlockSelection.js'
import { handleMenuKeydown } from './menuKeyboardNav.js'
import { splitAndConvert, isFullBlockSelected, restoreSelection } from './splitConvert.js'
import { EditorEvent } from './editorEvents.js'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'
const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg>'

export class TypeSelector {
  /** @type {import('./CommandDispatcher').CommandDispatcher} */ #commands
  /** @type {number} */ #filterThreshold
  /** @type {import('./types').IBlockManager} */ #blocks
  /** @type {import('./types').ISelectionManager} */ #selection
  /** @type {Map<string, import('./types').BlockPlugin>} */ #plugins
  /** @type {Document} */ #document
  /** @type {(Window & typeof globalThis) | null} */ #view
  /** @type {HTMLElement} */ #selectBtn
  /** @type {HTMLElement} */ #typeName
  /** @type {HTMLElement} */ #dropdown
  /** @type {boolean} */ #dropdownOpen = false
  /** @type {Range | null} */ #savedRange = null
  /** @type {(() => void) | null} */ #onConvert = null
  /** @type {import('./I18n').I18n | null} */ #i18n = null
  /** @type {HTMLInputElement | null} */ #filterInput = null
  /** @type {import('./types').ICrossBlockSelection | undefined} */ #crossBlockSelection
  /** @type {import('./types').IEventBus | undefined} */ #events

  /**
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./types').ISelectionManager} selection
   * @param {Map<string, import('./types').BlockPlugin>} plugins
   * @param {import('./CommandDispatcher').CommandDispatcher} commands
   * @param {import('./I18n').I18n} [i18n]
   * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
   * @param {import('./types').IEventBus} [events]
   * @param {{ filterThreshold: number }} [tuning]
   */
  constructor(blocks, selection, plugins, commands, i18n, crossBlockSelection, events, tuning) {
    this.#commands = commands
    this.#blocks = blocks
    this.#selection = selection
    this.#plugins = plugins
    this.#i18n = i18n ?? null
    this.#crossBlockSelection = crossBlockSelection
    this.#events = events
    this.#filterThreshold = tuning?.filterThreshold ?? 7

    const currentDocument = blocks.getCurrentBlock()?.contentElement?.ownerDocument
    this.#document = currentDocument ?? document
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)

    this.#selectBtn = el('button', 'oe-inline-toolbar__type-select', {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    }, this.#document)

    this.#typeName = el('span', 'oe-inline-toolbar__type-name', undefined, this.#document)
    this.#selectBtn.appendChild(this.#typeName)

    const chevron = el('span', 'oe-inline-toolbar__type-chevron', undefined, this.#document)
    chevron.innerHTML = ICON_CHEVRON
    this.#selectBtn.appendChild(chevron)

    this.#selectBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    this.#selectBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.#toggleDropdown()
    })

    this.#dropdown = el('ul', 'oe-inline-toolbar__type-dropdown', { role: 'menu' }, this.#document)
    this.#dropdown.style.display = 'none'
    this.#dropdown.addEventListener('keydown', this.#onDropdownKeydown)
  }

  get selectButton() { return this.#selectBtn }
  get dropdownElement() { return this.#dropdown }
  set onConvert(fn) { this.#onConvert = fn }

  update() {
    const currentBlock = this.#blocks.getCurrentBlock()
    if (!currentBlock) return
    const plugin = this.#plugins.get(currentBlock.type)
    if (plugin) this.#typeName.textContent = plugin.title
  }

  close() {
    if (!this.#dropdownOpen) return
    this.#dropdownOpen = false
    this.#dropdown.style.display = 'none'
    this.#selectBtn.setAttribute('aria-expanded', 'false')
    CrossBlockSelection.hideHighlight()
    this.#restoreSelection()
    this.#savedRange = null
  }

  get isOpen() { return this.#dropdownOpen }

  destroy() {
    this.#dropdown.removeEventListener('keydown', this.#onDropdownKeydown)
    this.#dropdown.remove()
    this.#selectBtn.remove()
  }

  #onDropdownKeydown = (e) => {
    handleMenuKeydown(e, this.#dropdown, {
      onEscape: () => {
        this.close()
        this.#selectBtn.focus()
      },
      itemSelector: '[role="menuitem"]:not([style*="display: none"])',
    })
  }

  #toggleDropdown() {
    if (this.#dropdownOpen) this.close()
    else this.#openDropdown()
  }

  #openDropdown() {
    this.#dropdownOpen = true
    this.#selectBtn.setAttribute('aria-expanded', 'true')

    const sel = this.#view?.getSelection()
    if (sel && sel.rangeCount > 0) this.#savedRange = sel.getRangeAt(0).cloneRange()
    if (this.#crossBlockSelection?.range) this.#savedRange = this.#crossBlockSelection.clone()

    if (this.#savedRange && !this.#savedRange.collapsed) {
      CrossBlockSelection.showHighlight(this.#savedRange)
    }

    this.#buildDropdownItems()
    this.#dropdown.style.display = ''
    this.#positionDropdown()

    const schedule = this.#view?.requestAnimationFrame?.bind(this.#view) ?? queueMicrotask
    if (this.#filterInput) {
      schedule(() => this.#filterInput?.focus())
    } else {
      schedule(() => {
        const first = /** @type {HTMLElement | null} */ (this.#dropdown.querySelector('[role="menuitem"]'))
        first?.focus()
      })
    }
  }

  #positionDropdown() {
    this.#dropdown.style.top = ''
    this.#dropdown.style.bottom = ''
    const btnRect = this.#selectBtn.getBoundingClientRect()
    positionPopup(this.#dropdown, btnRect, null, { relative: true, defaultHeight: 224 })
  }

  #buildDropdownItems() {
    this.#dropdown.innerHTML = ''
    this.#filterInput = null
    const currentBlock = this.#blocks.getCurrentBlock()
    const plugins = [...this.#plugins.values()]

    if (plugins.length > this.#filterThreshold) {
      const filterWrap = el('li', 'oe-inline-toolbar__type-filter', { role: 'none' }, this.#document)
      filterWrap.style.position = 'relative'

      const icon = el('span', 'oe-inline-toolbar__type-filter-icon', undefined, this.#document)
      icon.innerHTML = ICON_SEARCH

      const input = el('input', 'oe-inline-toolbar__type-filter-input', {
        type: 'text',
        placeholder: this.#i18n?.t('toolbox.search') ?? 'Search...',
      }, this.#document)
      const typedInput = /** @type {HTMLInputElement} */ (input)
      typedInput.addEventListener('input', () => this.#applyFilter(typedInput.value))
      typedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          typedInput.value = ''
          this.#applyFilter('')
          this.close()
        }
        e.stopPropagation()
      })

      filterWrap.append(icon, typedInput)
      this.#dropdown.appendChild(filterWrap)
      this.#filterInput = typedInput
    }

    for (const plugin of plugins) {
      const isActive = plugin.type === currentBlock?.type
      let cls = 'oe-inline-toolbar__type-item'
      if (isActive) cls += ' oe-inline-toolbar__type-item--active'

      const item = el('li', cls, { role: 'menuitem', tabindex: '-1' }, this.#document)
      item.dataset.pluginType = plugin.type

      const iconEl = el('span', 'oe-inline-toolbar__type-item-icon', undefined, this.#document)
      iconEl.innerHTML = plugin.icon
      item.appendChild(iconEl)

      const label = el('span', 'oe-inline-toolbar__type-item-label', undefined, this.#document)
      label.textContent = plugin.title
      item.appendChild(label)

      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.#convertSelection(plugin.type)
      })

      this.#dropdown.appendChild(item)
    }
  }

  #applyFilter(query) {
    const q = query.toLowerCase().trim()
    const items = /** @type {NodeListOf<HTMLElement>} */ (this.#dropdown.querySelectorAll('.oe-inline-toolbar__type-item'))
    let visible = 0

    for (const item of items) {
      const label = item.querySelector('.oe-inline-toolbar__type-item-label')
      const text = label?.textContent?.toLowerCase?.() ?? ''
      const match = !q || text.includes(q)
      item.style.display = match ? '' : 'none'
      if (match) visible++
    }

    let emptyEl = /** @type {HTMLElement | null} */ (this.#dropdown.querySelector('.oe-inline-toolbar__type-empty'))
    if (visible === 0) {
      if (!emptyEl) {
        emptyEl = el('div', 'oe-inline-toolbar__type-empty', undefined, this.#document)
        emptyEl.textContent = this.#i18n?.t('slash.noResults') ?? 'No results'
        this.#dropdown.appendChild(emptyEl)
      }
      emptyEl.style.display = ''
    } else if (emptyEl) {
      emptyEl.style.display = 'none'
    }
  }

  #convertSelection(targetType, targetData) {
    return this.#commands.execute({
      name: 'selection.convert',
      markDirty: false,
      apply: () => this.#applyConversion(targetType, targetData),
    })
  }

  #applyConversion(targetType, targetData) {
    const blocks = this.#blocks
    const selectedBlocks = blocks.getSelectedBlocks()
    const candidate = this.#crossBlockSelection?.range
      ?? (selectedBlocks.length > 1 ? null : this.#savedRange)

    if (candidate) {
      const endpoints = resolveBlockRange(blocks, candidate)
      if (!endpoints) {
        this.#savedRange = null
        this.close()
        return
      }
      if (endpoints.first !== endpoints.last) {
        this.#convertCrossBlock(candidate, targetType, targetData)
        return
      }
    }

    if (selectedBlocks.length > 1) {
      this.#convertMultipleBlocks(selectedBlocks, targetType, targetData)
      return
    }

    const currentBlock = blocks.getCurrentBlock()
    if (!currentBlock) return

    const currentIndex = blocks.getCurrentIndex()
    const currentType = currentBlock.type
    const contentEl = currentBlock.contentElement

    if (targetType === currentType && !targetData) {
      this.close()
      return
    }

    this.#restoreSelection()

    const sel = this.#view?.getSelection()
    if (!sel || sel.rangeCount === 0) {
      this.close()
      return
    }

    const range = sel.getRangeAt(0)
    const isFullBlock = sel.isCollapsed || isFullBlockSelected(contentEl, range)
    let didConvert = false

    this.#events?.emit(EditorEvent.UNDO_BATCH_START)
    try {
      if (isFullBlock) {
        const converted = blocks.convert(currentIndex, targetType, targetData)
        if (converted) {
          blocks.setCurrentIndex(currentIndex)
          this.#selection.setCaretToBlock(converted.id, 'start')
          converted.focus()
          didConvert = true
        }
      } else {
        didConvert = splitAndConvert(
          blocks,
          this.#selection,
          currentIndex,
          currentType,
          contentEl,
          range,
          targetType,
          targetData,
          isTextType(this.#plugins, targetType),
        )
      }
    } finally {
      this.#events?.emit(EditorEvent.UNDO_BATCH_END)
    }

    if (didConvert && this.#onConvert) this.#onConvert()
  }

  #convertCrossBlock(crossRange, targetType, targetData) {
    this.#savedRange = null
    this.close()
    convertCrossBlockRange(
      { blocks: this.#blocks, selection: this.#selection, plugins: this.#plugins, crossBlockSelection: /** @type {import('./types').ICrossBlockSelection} */ (this.#crossBlockSelection), events: this.#events },
      crossRange, targetType, /** @type {Record<string, unknown> | undefined} */ (targetData),
      this.#onConvert,
    )
  }

  #convertMultipleBlocks(selectedBlocks, targetType, targetData) {
    const blocks = this.#blocks
    this.#events?.emit(EditorEvent.UNDO_BATCH_START)
    let focusBlock = null
    try {
      const targetIsText = isTextType(this.#plugins, targetType)

      if (targetIsText) {
        for (let i = selectedBlocks.length - 1; i >= 0; i--) {
          const block = selectedBlocks[i]
          if (!block) continue
          const idx = blocks.getBlockIndex(block.id)
          if (idx >= 0 && block.type !== targetType) {
            const converted = blocks.convert(idx, targetType, /** @type {Record<string, unknown> | undefined} */ (targetData))
            if (converted) focusBlock = converted
          }
        }
      } else {
        const firstIdx = blocks.getBlockIndex(/** @type {string} */ (selectedBlocks[0]?.id))
        for (let i = selectedBlocks.length - 1; i >= 0; i--) {
          const idx = blocks.getBlockIndex(/** @type {string} */ (selectedBlocks[i]?.id))
          if (idx >= 0) blocks.remove(idx)
        }
        focusBlock = blocks.insert(targetType, /** @type {Record<string, unknown>} */ (targetData || {}), firstIdx)
      }

      blocks.clearSelection()
      if (focusBlock) {
        const focusIdx = blocks.getBlockIndex(focusBlock.id)
        if (focusIdx >= 0) blocks.setCurrentIndex(focusIdx)
        this.#selection.setCaretToBlock(focusBlock.id, 'start')
        focusBlock.focus()
      }
    } finally {
      this.#events?.emit(EditorEvent.UNDO_BATCH_END)
    }

    if (this.#onConvert) this.#onConvert()
  }

  #restoreSelection() {
    restoreSelection(this.#savedRange, this.#crossBlockSelection)
  }
}
