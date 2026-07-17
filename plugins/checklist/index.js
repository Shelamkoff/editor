import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateChecklistData } from '../../shared/blockDataValidators.js'
import { mapTextFields } from './mapTextFields.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = resolvePath('./checklist.css', import.meta.url)

// Tabler icon: list-check
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.5 1.5l2.5-2.5"/><path d="M3.5 11.5l1.5 1.5l2.5-2.5"/><path d="M3.5 17.5l1.5 1.5l2.5-2.5"/><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/></svg>'

// Check icon inside checkbox
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'


const mutationContexts = new WeakMap()
/** Editable checklist block with independently toggleable rich-text items. */
export class Checklist extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'checklist'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Checklist')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ items?: Array<{ text: string, checked: boolean } | string>, text?: string }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-checklist')
    mutationContexts.set(wrapper, context)

    const serializedItems = Array.isArray(data?.items)
      ? data.items.flatMap(item => {
        if (typeof item === 'string') return [{ text: item, checked: false }]
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return [{
            text: typeof item.text === 'string' ? item.text : '',
            checked: item.checked === true,
          }]
        }
        return []
      })
      : []
    const transferredText = normalizeTextValue(data?.text)
    const items = serializedItems.length > 0
      ? serializedItems
      : [{ text: transferredText, checked: false }]

    for (const item of items) {
      this.#addItem(wrapper, typeof item.text === 'string' ? item.text : '', item.checked === true)
    }

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (this.#handleEnter(wrapper)) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
      if (e.key === 'Backspace') {
        this.#handleBackspace(wrapper, e)
      }
    })

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ items: Array<{ text: string, checked: boolean }> }}
   */
  save(element) {
    const items = []
    for (const item of element.querySelectorAll('.oe-checklist__item')) {
      const text = item.querySelector('.oe-checklist__text')
      const checked = item.classList.contains('oe-checklist__item--checked')
      items.push({
        text: sanitizeHtml(text?.innerHTML?.trim() || ''),
        checked,
      })
    }
    return { items }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {{ items?: Array<{ text: string, checked: boolean }> }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateChecklistData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const items = element.querySelectorAll('.oe-checklist__item')
    if (items.length === 0) return true
    if (items.length === 1) {
      const text = items[0]?.querySelector('.oe-checklist__text')
      return !text?.textContent?.trim()
    }
    return false
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const texts = []
    for (const item of element.querySelectorAll('.oe-checklist__text')) {
      const t = sanitizeHtml(item.innerHTML?.trim() || '')
      if (t) texts.push(t)
    }
    return { text: texts.join('<br>') }
  }

  /**
   * Merge incoming text into the current block.
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   * @returns {void}
   */
  merge(element, data) {
    if (Array.isArray(data?.items)) {
      for (const item of data.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        this.#addItem(element, typeof item.text === 'string' ? item.text : '', item.checked === true)
      }
    } else {
      const text = normalizeTextValue(data?.text)
      if (text) this.#addItem(element, text, false)
    }
    const lastText = /** @type {HTMLElement | null} */ (element.querySelector('.oe-checklist__item:last-child .oe-checklist__text'))
    if (lastText) {
      lastText.focus()
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.selectNodeContents(lastText)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @param {string} text
   * @param {boolean} checked
   * @returns {void}
   */
  #addItem(wrapper, text, checked) {
    const item = document.createElement('div')
    item.className = `oe-checklist__item${checked ? ' oe-checklist__item--checked' : ''}`

    const checkbox = this.#createCheckbox(wrapper, item, checked)

    const content = document.createElement('div')
    content.className = 'oe-checklist__text'
    content.contentEditable = 'true'
    if (text) content.innerHTML = sanitizeHtml(text)

    item.append(checkbox, content)
    wrapper.appendChild(item)
  }

  /** @param {HTMLElement} wrapper @returns {boolean} Whether the key press was handled by this checklist. */
  #handleEnter(wrapper) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return false

    const range = sel.getRangeAt(0)
    const currentText = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement?.closest('.oe-checklist__text')
      : /** @type {HTMLElement} */ (range.startContainer).closest('.oe-checklist__text')
    const endText = range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement?.closest('.oe-checklist__text')
      : /** @type {HTMLElement} */ (range.endContainer).closest('.oe-checklist__text')
    if (!currentText || !endText || !wrapper.contains(currentText) || !wrapper.contains(endText)) return false

    const currentItem = currentText.closest('.oe-checklist__item')
    const endItem = endText.closest('.oe-checklist__item')
    if (!currentItem || !endItem || currentItem.parentElement !== wrapper || endItem.parentElement !== wrapper) return false

    const context = mutationContexts.get(wrapper)
    if (!context) return false

    const itemCount = wrapper.querySelectorAll('.oe-checklist__item').length
    if (!currentText.textContent?.trim()) {
      if (itemCount <= 1) {
        context.exitEmptyBlock()
        return true
      }

      context.mutate(() => {
        const isLast = currentItem === wrapper.lastElementChild
        const nextItem = currentItem.nextElementSibling
        currentItem.remove()

        if (isLast) {
          const lastText = /** @type {HTMLElement | null} */ (
            wrapper.querySelector('.oe-checklist__item:last-child .oe-checklist__text')
          )
          if (lastText) {
            lastText.focus()
            const end = document.createRange()
            end.selectNodeContents(lastText)
            end.collapse(false)
            sel.removeAllRanges()
            sel.addRange(end)
          }
          context.splitBlock()
          return
        }

        const nextText = /** @type {HTMLElement | null} */ (nextItem?.querySelector('.oe-checklist__text'))
        if (nextText) {
          nextText.focus()
          const start = document.createRange()
          start.setStart(nextText, 0)
          start.collapse(true)
          sel.removeAllRanges()
          sel.addRange(start)
        }
      })
      return true
    }

    context.mutate(() => {
      const selectionEnd = document.createRange()
      selectionEnd.setStart(range.endContainer, range.endOffset)
      selectionEnd.setEnd(endText, endText.childNodes.length)
      const afterFrag = selectionEnd.extractContents()

      if (currentItem === endItem) {
        range.deleteContents()
      } else {
        const selectedStart = document.createRange()
        selectedStart.setStart(range.startContainer, range.startOffset)
        selectedStart.setEnd(currentText, currentText.childNodes.length)
        selectedStart.deleteContents()

        let item = currentItem.nextElementSibling
        while (item) {
          const next = item.nextElementSibling
          const reachedEnd = item === endItem
          item.remove()
          if (reachedEnd) break
          item = next
        }
      }

      const afterText = document.createElement('div')
      afterText.appendChild(afterFrag)
      const newText = afterText.innerHTML.trim()

      // Create new item after current
      const newItem = document.createElement('div')
      newItem.className = 'oe-checklist__item'

      const checkbox = this.#createCheckbox(wrapper, newItem, false)

      const content = document.createElement('div')
      content.className = 'oe-checklist__text'
      content.contentEditable = 'true'
      if (newText) content.innerHTML = newText

      newItem.append(checkbox, content)
      currentItem.after(newItem)

      // Focus new item
      content.focus()
      const newRange = document.createRange()
      newRange.setStart(content, 0)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    })
    return true
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} item
   * @param {boolean} checked
   * @returns {HTMLButtonElement}
   */
  #createCheckbox(wrapper, item, checked) {
    const checkbox = document.createElement('button')
    checkbox.type = 'button'
    checkbox.className = 'oe-checklist__checkbox'
    checkbox.innerHTML = CHECK_SVG
    checkbox.setAttribute('aria-label', this._t('toggle', 'Toggle checklist item'))
    checkbox.setAttribute('aria-pressed', String(checked))
    checkbox.addEventListener('mousedown', (event) => event.preventDefault())
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation()
      mutationContexts.get(wrapper)?.mutate(() => {
        const next = !item.classList.contains('oe-checklist__item--checked')
        item.classList.toggle('oe-checklist__item--checked', next)
        checkbox.setAttribute('aria-pressed', String(next))
      })
    })
    return checkbox
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  #handleBackspace(wrapper, e) {
    const items = wrapper.querySelectorAll('.oe-checklist__item')
    if (items.length <= 1) return

    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return

    const currentText = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement?.closest('.oe-checklist__text')
      : /** @type {HTMLElement} */ (range.startContainer).closest('.oe-checklist__text')
    if (!(currentText instanceof HTMLElement) || !wrapper.contains(currentText)) return

    if (!this.#isCaretAtStart(currentText, range)) return

    const currentItem = currentText.closest('.oe-checklist__item')
    if (!currentItem || currentItem.parentElement !== wrapper) return
    const prevItem = currentItem?.previousElementSibling
    if (!prevItem) return

    e.preventDefault()
    e.stopPropagation()

    const prevText = /** @type {HTMLElement | null} */ (prevItem.querySelector('.oe-checklist__text'))
    if (!prevText) return

    const context = mutationContexts.get(wrapper)
    if (!context) return

    context.mutate(() => {
      // Merge into previous
      const mergePoint = prevText.childNodes.length
      while (currentText.firstChild) {
        prevText.appendChild(currentText.firstChild)
      }
      currentItem.remove()

      // Set caret at merge point
      prevText.focus()
      const newRange = document.createRange()
      if (prevText.childNodes[mergePoint]) {
        newRange.setStartBefore(prevText.childNodes[mergePoint])
      } else {
        newRange.setStart(prevText, prevText.childNodes.length)
      }
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    })
  }

  /**
   * @param {HTMLElement} text
   * @param {Range} range
   * @returns {boolean}
   */
  #isCaretAtStart(text, range) {
    const { startContainer, startOffset } = range
    if (startContainer === text && startOffset === 0) return true
    if (startContainer.nodeType !== Node.TEXT_NODE || startOffset !== 0) return false

    /** @type {Node | null} */
    let node = startContainer
    while (node && node !== text) {
      if (node.previousSibling) return false
      node = node.parentNode
    }
    return node === text
  }

}
