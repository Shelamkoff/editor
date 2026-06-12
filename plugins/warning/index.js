// =============================================================================
// Warning — callout/notice block with title and message
//
// Data: { title: string, message: string }
// =============================================================================

import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./warning.css', import.meta.url)

// Tabler icon: alert-triangle
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'

// Large icon for the warning block
const ICON_LARGE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'


export class Warning extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'warning'
  icon = ICON
  inlineTools = true

  /** @returns {string} */
  get title() {
    return this._t('title', 'Warning')
  }

  /**
   * @param {{ title?: string, message?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-warning')
    wrapper.setAttribute('role', 'alert')

    const icon = document.createElement('div')
    icon.className = 'oe-warning__icon'
    icon.innerHTML = ICON_LARGE

    const content = document.createElement('div')
    content.className = 'oe-warning__content'

    const titleEl = document.createElement('div')
    titleEl.className = 'oe-warning__title'
    titleEl.contentEditable = 'true'
    titleEl.dataset.placeholder = this._t('titlePlaceholder', 'Title')
    if (data?.title) titleEl.innerHTML = sanitizeHtml(data.title)

    const messageEl = document.createElement('div')
    messageEl.className = 'oe-warning__message'
    messageEl.contentEditable = 'true'
    messageEl.dataset.placeholder = this._t('messagePlaceholder', 'Message')
    if (data?.message) messageEl.innerHTML = sanitizeHtml(data.message)

    // Tab between title and message
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        messageEl.focus()
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        messageEl.focus()
      }
    })

    messageEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        titleEl.focus()
      }
      // Prevent Enter from creating new block — allow Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    content.append(titleEl, messageEl)
    wrapper.append(icon, content)

    return wrapper
  }

  /**
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
   * @param {{ title?: string, message?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return !!(data?.title?.trim() || data?.message?.trim())
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const title = element.querySelector('.oe-warning__title')
    const message = element.querySelector('.oe-warning__message')
    return !title?.textContent?.trim() && !message?.textContent?.trim()
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const title = element.querySelector('.oe-warning__title')?.textContent?.trim() || ''
    const message = element.querySelector('.oe-warning__message')?.textContent?.trim() || ''
    return { text: [title, message].filter(Boolean).join('\n') }
  }

  /**
   * @param {Record<string, unknown>} data
   * @param {HTMLElement} element
   */
  merge(element, data) {
    const message = element.querySelector('.oe-warning__message')
    if (message && data?.text) {
      if (message.innerHTML.trim()) {
        message.innerHTML += '<br>' + sanitizeHtml(String(data.text))
      } else {
        message.innerHTML = sanitizeHtml(String(data.text))
      }
    }
  }

}
