import {el, positionPopup} from './dom.js'
import {convertCrossBlockRange, isTextType} from './crossBlockConvert.js'
import {CrossBlockSelection} from './CrossBlockSelection.js'
import {handleMenuKeydown} from './menuKeyboardNav.js'
import {splitAndConvert, isFullBlockSelected, restoreSelection} from './splitConvert.js'
import { EditorEvent } from './editorEvents.js'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'
const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg>'

export class TypeSelector {
  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #commands
  /** @type {number} */
  #filterThreshold
  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./types').ISelectionManager} */
  #selection

  /** @type {Map<string, import('./types').BlockPlugin>} */
  #plugins

  /** @type {HTMLElement} */
  #selectBtn

  /** @type {HTMLElement} */
  #typeName

  /** @type {HTMLElement} */
  #dropdown

  /** @type {boolean} */
  #dropdownOpen = false

  /** @type {Range | null} saved range before dropdown open */
  #savedRange = null

  /** @type {(() => void) | null} */
  #onConvert = null

  /** @type {import('./I18n').I18n | null} */
  #i18n = null

  /** @type {HTMLInputElement | null} */
  #filterInput = null

  /** @type {import('./types').ICrossBlockSelection | undefined} */
  #crossBlockSelection

  /** @type {import('./types').IEventBus | undefined} */
  #events

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

    this.#selectBtn = el('button', 'oe-inline-toolbar__type-select', {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    })

    this.#typeName = el('span', 'oe-inline-toolbar__type-name')
    this.#selectBtn.appendChild(this.#typeName)

    const chevron = el('span', 'oe-inline-toolbar__type-chevron')
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

    this.#dropdown = el('ul', 'oe-inline-toolbar__type-dropdown', { role: 'menu' })
    this.#dropdown.style.display = 'none'
    this.#dropdown.addEventListener('keydown', this.#onDropdownKeydown)
  }

  /** The select button element (mount into panel). */
  get selectButton() {
    return this.#selectBtn
  }

  /** The dropdown element (mount into toolbar root). */
  get dropdownElement() {
    return this.#dropdown
  }

  /**
   * Set callback fired after a conversion happens.
   * @param {() => void} fn
   */
  set onConvert(fn) {
    this.#onConvert = fn
  }

  /** Update displayed type name from current block. */
  update() {
    const currentBlock = this.#blocks.getCurrentBlock()
    if (!currentBlock) return

    const plugin = this.#plugins.get(currentBlock.type)
    if (!plugin) return

    this.#typeName.textContent = plugin.title
  }

  /** Close the dropdown if open. */
  close() {
    if (!this.#dropdownOpen) return
    this.#dropdownOpen = false
    this.#dropdown.style.display = 'none'
    this.#selectBtn.setAttribute('aria-expanded', 'false')
    CrossBlockSelection.hideHighlight()
    // Restore native selection so the highlight returns to the contenteditable
    this.#restoreSelection()
    this.#savedRange = null
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#dropdownOpen
  }

  destroy() {
    this.#dropdown.removeEventListener('keydown', this.#onDropdownKeydown)
    this.#dropdown.remove()
    this.#selectBtn.remove()
  }

  /** @param {KeyboardEvent} e */
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
    if (this.#dropdownOpen) {
      this.close()
    } else {
      this.#openDropdown()
    }
  }

  #openDropdown() {
    this.#dropdownOpen = true
    this.#selectBtn.setAttribute('aria-expanded', 'true')

    // Save selection before focus shifts to filter input
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      this.#savedRange = sel.getRangeAt(0).cloneRange()
    }
    // Also preserve cross-block range (native selection gets clipped on focus change)
    if (this.#crossBlockSelection?.range) {
      this.#savedRange = this.#crossBlockSelection.clone()
    }

    // Show CSS Highlight so the selection stays visible while focus is in the dropdown
    if (this.#savedRange && !this.#savedRange.collapsed) {
      CrossBlockSelection.showHighlight(this.#savedRange)
    }

    this.#buildDropdownItems()
    this.#dropdown.style.display = ''

    // Position: prefer below, flip above if no space
    this.#positionDropdown()

    // Focus filter input or first menu item
    if (this.#filterInput) {
      requestAnimationFrame(() => this.#filterInput?.focus())
    } else {
      requestAnimationFrame(() => {
        const first = /** @type {HTMLElement | null} */ (this.#dropdown.querySelector('[role="menuitem"]'))
        if (first) first.focus()
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

    // Add filter if too many plugins
    if (plugins.length > this.#filterThreshold) {
      const filterWrap = el('li', 'oe-inline-toolbar__type-filter', { role: 'none' })
      filterWrap.style.position = 'relative'

      const icon = el('span', 'oe-inline-toolbar__type-filter-icon')
      icon.innerHTML = ICON_SEARCH

      const input = el('input', 'oe-inline-toolbar__type-filter-input', {
        type: 'text',
        placeholder: this.#i18n?.t('toolbox.search') ?? 'Search...',
      })
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

      const item = el('li', cls, { role: 'menuitem', tabindex: '-1' })
      item.dataset.pluginType = plugin.type

      const iconEl = el('span', 'oe-inline-toolbar__type-item-icon')
      iconEl.innerHTML = plugin.icon
      item.appendChild(iconEl)

      const label = el('span', 'oe-inline-toolbar__type-item-label')
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

  /** @param {string} query */
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

    // Show empty state
    let emptyEl = /** @type {HTMLElement | null} */ (this.#dropdown.querySelector('.oe-inline-toolbar__type-empty'))
    if (visible === 0) {
      if (!emptyEl) {
        emptyEl = el('div', 'oe-inline-toolbar__type-empty')
        emptyEl.textContent = this.#i18n?.t('slash.noResults') ?? 'No results'
        this.#dropdown.appendChild(emptyEl)
      }
      emptyEl.style.display = ''
    } else if (emptyEl) {
      emptyEl.style.display = 'none'
    }
  }

  /**
   * Convert the selected text range to a different block type.
   * @param {string} targetType
   * @param {Record<string, unknown>} [targetData]
   */
  #convertSelection(targetType, targetData) {
    return this.#commands.execute({
      name: 'selection.convert',
      markDirty: false,
      apply: () => this.#applyConversion(targetType, targetData),
    })
  }

  #applyConversion(targetType, targetData) {
    const blocks = this.#blocks

    // Check for cross-block selection first
    const crossRange = this.#crossBlockSelection?.range

    if (crossRange) {
      this.#convertCrossBlock(crossRange, targetType, targetData)
      return
    }

    // Also check block-level selection (Ctrl+A)
    const selectedBlocks = this.#blocks.getSelectedBlocks()
    if (selectedBlocks.length > 1) {
      this.#convertMultipleBlocks(selectedBlocks, targetType, targetData)
      return
    }

    // Single-block conversion
    const currentBlock = blocks.getCurrentBlock()
    if (!currentBlock) return

    const currentIndex = blocks.getCurrentIndex()
    const currentType = currentBlock.type
    const contentEl = currentBlock.contentElement

    // If same type and no extra data, nothing to do
    if (targetType === currentType && !targetData) {
      this.close()
      return
    }

    // Restore selection
    this.#restoreSelection()

    const sel = window.getSelection()
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

  /**
   * Convert blocks in a cross-block selection range, with partial split support.
   * Delegates to shared utility.
   *
   * @param {Range} crossRange
   * @param {string} targetType
   * @param {object} [targetData]
   */
  #convertCrossBlock(crossRange, targetType, targetData) {
    // Clear saved range — it points to pre-conversion DOM nodes
    this.#savedRange = null
    this.close()
    convertCrossBlockRange(
      { blocks: this.#blocks, selection: this.#selection, plugins: this.#plugins, crossBlockSelection: /** @type {import('./types').ICrossBlockSelection} */ (this.#crossBlockSelection), events: this.#events },
      crossRange, targetType, /** @type {Record<string, unknown> | undefined} */ (targetData),
      this.#onConvert,
    )
  }

  /**
   * Convert multiple selected blocks (Ctrl+A style selection).
   * @param {import('./types').IBlock[]} selectedBlocks
   * @param {string} targetType
   * @param {object} [targetData]
   */
  #convertMultipleBlocks(selectedBlocks, targetType, targetData) {
    const blocks = this.#blocks

    this.#events?.emit(EditorEvent.UNDO_BATCH_START)
    let focusBlock = null
    try {
      // Check if target is text-based
      const targetIsText = isTextType(this.#plugins, targetType)

      if (targetIsText) {
        // Text target: convert each block individually (reverse order)
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
        // Non-text target: remove all selected, insert ONE new block
        const firstIdx = blocks.getBlockIndex(/** @type {string} */ (selectedBlocks[0]?.id))

        // Remove in reverse order
        for (let i = selectedBlocks.length - 1; i >= 0; i--) {
          const idx = blocks.getBlockIndex(/** @type {string} */ (selectedBlocks[i]?.id))
          if (idx >= 0) blocks.remove(idx)
        }

        focusBlock = blocks.insert(targetType, /** @type {Record<string, unknown>} */ (targetData || {}), firstIdx)
      }

      // Clear block selection
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
