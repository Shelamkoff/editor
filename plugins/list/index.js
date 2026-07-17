import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { mapTextFields } from './mapTextFields.js'
import { validateListData } from '../../shared/blockDataValidators.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = resolvePath('./list.css', import.meta.url)

// Tabler icon: list
const ICON_UL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M5 6v.01"/><path d="M5 12v.01"/><path d="M5 18v.01"/></svg>'
const ICON_OL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><path d="M4 16a2 2 0 1 1 4 0c0 .591-.5 1-1 1.5l-3 2.5h4"/><path d="M6 10v-6l-2 2"/></svg>'

/** Editable ordered or unordered rich-text list. */
export class List extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'list'
  icon = ICON_UL
  inlineTools = true
  mapTextFields = mapTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('bulletedTitle', 'Bulleted List')
  }

  /**
   * Return the toolbox variants exposed by this block plugin.
   * @returns {{ title: string, icon: string, data: { style: string } }[]}
   */
  get toolbox() {
    return [
      { title: this._t('bulletedTitle', 'Bulleted List'), icon: ICON_UL, data: { style: 'unordered' } },
      { title: this._t('numberedTitle', 'Numbered List'), icon: ICON_OL, data: { style: 'ordered' } },
    ]
  }

  pasteConfig = {
    tags: ['ul', 'ol'],
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ items?: string[], text?: string, style?: 'ordered' | 'unordered' }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const style = data?.style === 'ordered' ? 'ordered' : 'unordered'
    const tag = style === 'ordered' ? 'ol' : 'ul'
    const list = document.createElement(tag)
    list.classList.add('oe-list', `oe-list--${style}`)
    list.dataset.style = style

    const serializedItems = Array.isArray(data?.items)
      ? data.items.filter(item => typeof item === 'string')
      : []
    const transferredText = normalizeTextValue(data?.text)
    const items = serializedItems.length > 0
      ? serializedItems
      : [transferredText]

    for (const itemText of items) {
      this.#addItem(list, itemText)
    }

    list.addEventListener('keydown', (e) => {
      const ke = /** @type {KeyboardEvent} */ (e)
      if (ke.key === 'Enter' && !ke.shiftKey) {
        if (this.#handleEnter(list, context)) {
          ke.preventDefault()
          ke.stopPropagation()
        }
      }
      if (ke.key === 'Backspace') {
        this.#handleBackspace(list, ke, context)
      }
    })

    return list
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ items: string[], style: string }}
   */
  save(element) {
    const items = []
    for (const li of element.querySelectorAll(':scope > li')) {
      items.push(li.innerHTML.trim())
    }
    return {
      items,
      style: element.dataset.style || 'unordered',
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {{ items?: string[], style?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateListData(data)
  }

  /**
   * Merge incoming text into the current block.
   * @param {HTMLElement} element
   * @param {{ items?: string[], text?: string }} data
   * @returns {void}
   */
  merge(element, data) {
    if (Array.isArray(data.items)) {
      for (const itemText of data.items) {
        if (typeof itemText !== 'string') continue
        this.#addItem(element, itemText)
      }
    } else if (data.text) {
      this.#addItem(element, data.text)
    }
  }

  /**
   * Extract neutral rich text and list metadata for block conversion.
   * @param {HTMLElement} element
   * @returns {{ text: string, items: string[], style: string }}
   */
  exportData(element) {
    const items = []
    for (const li of element.querySelectorAll(':scope > li')) {
      items.push(li.innerHTML.trim())
    }
    return {
      text: items.join('<br>'),
      items,
      style: element.dataset.style || 'unordered',
    }
  }

  /**
   * Describe a partial list selection without exposing list markup to the
   * core's generic text splitter. Selected item content can be transferred
   * to another text block; all unselected content remains in one list.
   *
   * @param {HTMLElement} element
   * @param {Range} range
   * @returns {{ remainingData: { items: string[], style: string } | null, selectedData: { text: string, items: string[], style: string } } | null}
   */
  splitSelection(element, range) {
    const items = [...element.querySelectorAll(':scope > li')]
    const selectedItems = []
    const remainingItems = []

    for (const item of items) {
      if (!range.intersectsNode(item)) {
        remainingItems.push(item.innerHTML.trim())
        continue
      }

      const selectionPart = document.createRange()
      selectionPart.selectNodeContents(item)
      if (item.contains(range.startContainer)) {
        selectionPart.setStart(range.startContainer, range.startOffset)
      }
      if (item.contains(range.endContainer)) {
        selectionPart.setEnd(range.endContainer, range.endOffset)
      }

      if (selectionPart.collapsed) {
        remainingItems.push(item.innerHTML.trim())
        continue
      }

      const selectedHtml = this.#rangeHtml(selectionPart, item)
      if (selectedHtml) selectedItems.push(selectedHtml)

      const before = document.createRange()
      before.selectNodeContents(item)
      let beforeHtml = ''
      if (item.contains(range.startContainer)) {
        before.setEnd(range.startContainer, range.startOffset)
        beforeHtml = this.#rangeHtml(before, item)
      }

      const after = document.createRange()
      after.selectNodeContents(item)
      let afterHtml = ''
      if (item.contains(range.endContainer)) {
        after.setStart(range.endContainer, range.endOffset)
        afterHtml = this.#rangeHtml(after, item)
      }

      const remainingHtml = `${beforeHtml}${afterHtml}`
      if (this.#hasContent(remainingHtml)) remainingItems.push(remainingHtml)
    }

    if (selectedItems.length === 0) return null

    const style = element.dataset.style || 'unordered'
    return {
      remainingData: remainingItems.length > 0 ? { items: remainingItems, style } : null,
      selectedData: {
        text: selectedItems.join('<br>'),
        items: selectedItems,
        style,
      },
    }
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const items = element.querySelectorAll(':scope > li')
    if (items.length === 0) return true
    if (items.length === 1 && (items[0]?.textContent?.trim().length ?? 0) === 0) return true
    return false
  }

  /**
   * Render settings items for the block settings menu.
   * Returns ordered/unordered toggle buttons.
   * @param {HTMLElement} element
   * @returns {HTMLElement[]}
   */
  renderSettings(element) {
    const currentStyle = element.dataset.style || 'unordered'
    const options = [
      { style: 'unordered', label: this._t('bulletedTitle', 'Bulleted List'), icon: ICON_UL },
      { style: 'ordered', label: this._t('numberedTitle', 'Numbered List'), icon: ICON_OL },
    ]

    return options.map(({ style, label, icon }) => {
      const btn = document.createElement('li')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('tabindex', '-1')
      btn.className = 'oe-settings-menu__item'
      if (style === currentStyle) {
        btn.classList.add('oe-settings-menu__item--active')
      }
      btn.dataset.action = style

      const iconSpan = document.createElement('span')
      iconSpan.className = 'oe-settings-menu__icon'
      iconSpan.innerHTML = icon
      btn.appendChild(iconSpan)

      const labelSpan = document.createElement('span')
      labelSpan.className = 'oe-settings-menu__label'
      labelSpan.textContent = label
      btn.appendChild(labelSpan)

      return btn
    })
  }

  /**
   * Handle settings action — switch list type in-place.
   * @param {HTMLElement} element
   * @param {string} action
   * @returns {{ items: string[], style: string } | null}
   */
  onSettingsAction(element, action) {
    if (action === 'ordered' || action === 'unordered') {
      const saved = this.save(element)
      saved.style = action
      return saved
    }
    return null
  }

  /**
   * Handle pasted list elements.
   * @param {import('../../types').TagPasteEvent} event
   * @returns {{ items: string[], style: string } | null}
   */
  onPaste(event) {
    if (event.type !== 'tag') return null
    const tag = event.tag.toLowerCase()
    const style = tag === 'ol' ? 'ordered' : 'unordered'
    const items = []
    for (const li of event.element.querySelectorAll(':scope > li')) {
      items.push(li.innerHTML)
    }
    if (items.length === 0) return null
    return { items, style }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} list
   * @param {string} html
   * @returns {HTMLLIElement}
   */
  #addItem(list, html) {
    const li = document.createElement('li')
    li.classList.add('oe-list__item')
    li.contentEditable = 'true'
    if (html) {
      li.innerHTML = sanitizeHtml(html)
    }
    list.appendChild(li)
    return li
  }

  /** @param {Range} range @param {Element} root @returns {string} */
  #rangeHtml(range, root) {
    const container = document.createElement('div')
    container.appendChild(range.cloneContents())
    let ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? /** @type {Element} */ (range.commonAncestorContainer)
      : range.commonAncestorContainer.parentElement

    while (ancestor && ancestor !== root && root.contains(ancestor)) {
      const wrapper = ancestor.cloneNode(false)
      while (container.firstChild) wrapper.appendChild(container.firstChild)
      container.appendChild(wrapper)
      ancestor = ancestor.parentElement
    }
    return container.innerHTML.trim()
  }

  /** @param {string} html @returns {boolean} */
  #hasContent(html) {
    const container = document.createElement('div')
    container.innerHTML = html
    if (container.textContent?.replace(/\u00a0/g, ' ').trim()) return true
    return !!container.querySelector('img, video, audio, iframe, [data-inline-plugin]')
  }

  /**
   * Handle Enter key — create new list item, or remove empty item at end.
   * @param {HTMLElement} list
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {boolean} Whether the key press was handled by this list.
   */
  #handleEnter(list, context) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false

    const range = sel.getRangeAt(0)
    const currentLi = /** @type {HTMLElement | null} */ (
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.startContainer).closest('li')
        : range.startContainer.parentElement?.closest('li')
    )

    const endLi = /** @type {HTMLElement | null} */ (
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.endContainer).closest('li')
        : range.endContainer.parentElement?.closest('li')
    )

    if (!currentLi || !endLi || currentLi.parentElement !== list || endLi.parentElement !== list) return false

    // If current item is empty — remove it and let block-level handle exit
    if ((currentLi.textContent?.trim().length ?? 0) === 0) {
      const remainingCount = list.querySelectorAll(':scope > li').length

      if (remainingCount <= 1) {
        context.exitEmptyBlock()
        return true
      }

      // Remove empty item
      context.mutate(() => {
        const isLast = currentLi === list.lastElementChild
        const removedIdx = Array.from(list.children).indexOf(currentLi)
        currentLi.remove()

        if (isLast) {
          // Focus last remaining item end, then ask the core to create the
          // following default block inside this same command transaction.
          const lastItem = /** @type {HTMLElement | null} */ (list.querySelector(':scope > li:last-child'))
          if (lastItem) {
            this.#setCaretToEnd(lastItem)
          }
          context.splitBlock()
        } else {
          // Focus the item that took its place
          const items = list.querySelectorAll(':scope > li')
          const focusIdx = Math.min(removedIdx, items.length - 1)
          const focusItem = items[Math.max(0, focusIdx)] || items[0]
          if (focusItem) {
            /** @type {HTMLElement} */ (focusItem).focus()
            this.#setCaretToStart(/** @type {HTMLElement} */ (focusItem))
          }
        }
      })
      return true
    }

    // Replace a non-collapsed selection before splitting, matching native
    // editable-list behaviour for both one-item and multi-item selections.
    context.mutate(() => {
      const selectionEnd = document.createRange()
      selectionEnd.setStart(range.endContainer, range.endOffset)
      selectionEnd.setEnd(endLi, endLi.childNodes.length)
      const fragment = selectionEnd.extractContents()

      if (currentLi === endLi) {
        range.deleteContents()
      } else {
        const selectedStart = document.createRange()
        selectedStart.setStart(range.startContainer, range.startOffset)
        selectedStart.setEnd(currentLi, currentLi.childNodes.length)
        selectedStart.deleteContents()

        let item = currentLi.nextElementSibling
        while (item) {
          const next = item.nextElementSibling
          const reachedEnd = item === endLi
          item.remove()
          if (reachedEnd) break
          item = next
        }
      }

      // Create new li with the extracted content
      const newLi = document.createElement('li')
      newLi.classList.add('oe-list__item')
      newLi.contentEditable = 'true'
      newLi.appendChild(fragment)

      // Insert after current
      currentLi.after(newLi)

      // Set caret to beginning of new item
      this.#setCaretToStart(newLi)
    })
    return true
  }

  /**
   * Handle Backspace — merge with previous item when at start, or delete empty items.
   * @param {HTMLElement} list
   * @param {KeyboardEvent} e
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {void}
   */
  #handleBackspace(list, e, context) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return

    const currentLi = /** @type {HTMLElement | null} */ (
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.startContainer).closest('li')
        : range.startContainer.parentElement?.closest('li')
    )
    if (!currentLi || currentLi.parentElement !== list) return

    // Check if caret is at the very start of the li
    const isAtStart = this.#isCaretAtStart(currentLi, range)
    if (!isAtStart) return

    const prevLi = /** @type {HTMLElement | null} */ (currentLi.previousElementSibling)

    // If first item — let it bubble (BlockOperations handles merge with prev block)
    if (!prevLi) return

    e.preventDefault()
    e.stopPropagation()

    // Merge current into previous
    context.mutate(() => {
      const mergeOffset = prevLi.childNodes.length
      while (currentLi.firstChild) {
        prevLi.appendChild(currentLi.firstChild)
      }
      currentLi.remove()

      // Set caret at merge point
      prevLi.focus()
      const newRange = document.createRange()
      if (prevLi.childNodes[mergeOffset]) {
        newRange.setStartBefore(prevLi.childNodes[mergeOffset])
      } else {
        newRange.setStart(prevLi, prevLi.childNodes.length)
      }
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    })
  }

  /**
   * @param {HTMLElement} li
   * @param {Range} range
   * @returns {boolean}
   */
  #isCaretAtStart(li, range) {
    const { startContainer, startOffset } = range

    // Caret directly inside the li at offset 0
    if (startContainer === li && startOffset === 0) return true

    // Caret in a text node that is the first child (or nested first child)
    if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
      /** @type {Node | null} */
      let node = startContainer
      while (node && node !== li) {
        if (node.previousSibling) return false
        node = node.parentNode
      }
      return node === li
    }

    return false
  }

  /** @param {HTMLElement} el @returns {void} */
  #setCaretToStart(el) {
    const sel = window.getSelection()
    if (!sel) return

    el.focus()
    const range = document.createRange()

    // If element has content, set before first child node
    if (el.firstChild) {
      if (el.firstChild.nodeType === Node.TEXT_NODE) {
        range.setStart(el.firstChild, 0)
      } else {
        range.setStartBefore(el.firstChild)
      }
    } else {
      range.setStart(el, 0)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** @param {HTMLElement} el @returns {void} */
  #setCaretToEnd(el) {
    const sel = window.getSelection()
    if (!sel) return

    el.focus()
    const range = document.createRange()

    if (el.lastChild) {
      if (el.lastChild.nodeType === Node.TEXT_NODE) {
        range.setStart(el.lastChild, el.lastChild.textContent?.length || 0)
      } else {
        range.setStartAfter(el.lastChild)
      }
    } else {
      range.setStart(el, 0)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
