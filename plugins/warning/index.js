// =============================================================================
// Warning — callout/notice block with title and message
//
// Data: { title: string, message: string }
// =============================================================================

import { sanitizeHtml } from '../../core/sanitize.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateWarningData } from '../../shared/blockDataValidators.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { mapWarningTextFields } from '../../shared/mapTextFields.js'

const editorStyles = new URL('./warning.css', import.meta.url).href

// Tabler icon: alert-triangle
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'

// Large icon for the warning block
const ICON_LARGE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'

/** Warning callout with an editable title and message. */
export class Warning extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'warning'
  icon = ICON
  inlineTools = true
  mapTextFields = mapWarningTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Warning')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ title?: string, message?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-warning')
    wrapper.setAttribute('role', 'note')

    const icon = document.createElement('div')
    icon.className = 'oe-warning__icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.innerHTML = ICON_LARGE

    const content = document.createElement('div')
    content.className = 'oe-warning__content'

    const titleEl = document.createElement('div')
    titleEl.className = 'oe-warning__title'
    titleEl.contentEditable = 'true'
    titleEl.dataset.placeholder = this._t('titlePlaceholder', 'Title')
    const title = normalizeTextValue(data?.title)
    if (title) titleEl.innerHTML = sanitizeHtml(title)

    const messageEl = document.createElement('div')
    messageEl.className = 'oe-warning__message'
    messageEl.contentEditable = 'true'
    messageEl.dataset.placeholder = this._t('messagePlaceholder', 'Message')
    const message = normalizeTextValue(data?.message)
    if (message) messageEl.innerHTML = sanitizeHtml(message)

    // Tab between title and message
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        messageEl.focus()
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        messageEl.focus()
      }
    })

    messageEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        titleEl.focus()
      }
      // Keep an ordinary Enter inside the message instead of letting the
      // editor split the block. The browser still inserts the line break.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    content.append(titleEl, messageEl)
    wrapper.append(icon, content)

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ title: string, message: string }}
   */
  save(element) {
    const title = element.querySelector('.oe-warning__title')
    const message = element.querySelector('.oe-warning__message')
    return {
      title: sanitizeHtml(title?.innerHTML?.trim() || ''),
      message: sanitizeHtml(message?.innerHTML?.trim() || ''),
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {{ title?: string, message?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateWarningData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const title = element.querySelector('.oe-warning__title')
    const message = element.querySelector('.oe-warning__message')
    return !title?.textContent?.trim() && !message?.textContent?.trim()
  }

  /**
   * Extract neutral rich text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const title = sanitizeHtml(element.querySelector('.oe-warning__title')?.innerHTML?.trim() || '')
    const message = sanitizeHtml(element.querySelector('.oe-warning__message')?.innerHTML?.trim() || '')
    return { text: [title, message].filter(Boolean).join('<br>') }
  }

  /**
   * Merge incoming text into the current block.
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   * @returns {void}
   */
  merge(element, data) {
    const message = element.querySelector('.oe-warning__message')
    const text = normalizeTextValue(data?.text)
    if (message && text) {
      if (message.innerHTML.trim()) {
        message.innerHTML += '<br>' + sanitizeHtml(text)
      } else {
        message.innerHTML = sanitizeHtml(text)
      }
    }
  }

}
