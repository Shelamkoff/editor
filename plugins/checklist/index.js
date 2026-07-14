import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateChecklistData } from '../../shared/blockDataValidators.js'
import { mapTextFields } from './mapTextFields.js'

const editorStyles = resolvePath('./checklist.css', import.meta.url)

// Tabler icon: list-check
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.5 1.5l2.5-2.5"/><path d="M3.5 11.5l1.5 1.5l2.5-2.5"/><path d="M3.5 17.5l1.5 1.5l2.5-2.5"/><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/></svg>'

// Check icon inside checkbox
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

/** @type {WeakMap<HTMLElement, import('../../core/types').BlockMutationContext>} */
const mutationContexts = new WeakMap()


export class Checklist extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'checklist'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  /** @returns {string} */
  get title() {
    return this._t('title', 'Checklist')
  }

  pasteConfig = {}

  /**
   * @param {{ items?: Array<{ text: string, checked: boolean }> }} data
   * @returns {HTMLElement}
   */
  render(data, context) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-checklist')
    mutationContexts.set(wrapper, context)

    const items = data?.items?.length ? data.items : [{ text: '', checked: false }]

    for (const item of items) {
      this.#addItem(wrapper, item.text, !!item.checked)
    }

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        this.#handleEnter(wrapper)
      }
      if (e.key === 'Backspace') {
        this.#handleBackspace(wrapper, e)
      }
    })

    return wrapper
  }

  /**
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
   * @param {{ items?: Array<{ text: string, checked: boolean }> }} data
   * @returns {boolean}
   */
  // noinspection JSUnusedGlobalSymbols
  validate(data) {
    return validateChecklistData(data)
  }

  /**
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
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const texts = []
    for (const item of element.querySelectorAll('.oe-checklist__text')) {
      const t = item.textContent?.trim()
      if (t) texts.push(t)
    }
    return { text: texts.join('\n') }
  }

  /**
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   */
  merge(element, data) {
    if (Array.isArray(data?.items)) {
      for (const item of data.items) {
        this.#addItem(element, item.text || '', !!item.checked)
      }
    } else if (data?.text) {
      this.#addItem(element, String(data.text), false)
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

  /**
   * @param {import('../../types').PasteEvent} event
   * @returns {Record<string, unknown> | null}
   */
  onPaste(event) {
    if (event.type === 'tag') {
      const el = /** @type {HTMLElement} */ (event.element.cloneNode(true))
      const items = []
      for (const li of el.querySelectorAll('li')) {
        items.push({ text: li.innerHTML.trim(), checked: false })
      }
      if (items.length > 0) return { items }
    }
    return null
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @param {string} text
   * @param {boolean} checked
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

  /** @param {HTMLElement} wrapper */
  #handleEnter(wrapper) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return

    const range = sel.getRangeAt(0)
    const currentText = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement?.closest('.oe-checklist__text')
      : /** @type {HTMLElement} */ (range.startContainer).closest('.oe-checklist__text')
    if (!currentText) return

    const currentItem = currentText.closest('.oe-checklist__item')
    if (!currentItem) return

    const context = mutationContexts.get(wrapper)
    if (!context) return

    context.mutate(() => {
      // Split content at caret
      const afterRange = document.createRange()
      afterRange.setStart(range.endContainer, range.endOffset)
      afterRange.setEndAfter(currentText.lastChild || currentText)
      const afterFrag = afterRange.extractContents()

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
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} item
   * @param {boolean} checked
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
    if (!currentText) return

    // Only merge if caret is at the very start
    const offset = range.startOffset
    const isAtStart = offset === 0 && (
      range.startContainer === currentText ||
      (range.startContainer.nodeType === Node.TEXT_NODE && range.startContainer === currentText.firstChild)
    )
    if (!isAtStart) return

    const currentItem = currentText.closest('.oe-checklist__item')
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

}
