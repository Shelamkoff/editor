// =============================================================================
// Spoiler — hidden text revealed on click
//
// Data: { label: string, content: string }
// =============================================================================

import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./spoiler.css', import.meta.url)

// Tabler icon: eye-off
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87"/><path d="M3 3l18 18"/></svg>'


export class Spoiler extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'spoiler'
  icon = ICON
  inlineTools = true

  /** @returns {string} */
  get title() {
    return this._t('title', 'Spoiler')
  }

  /**
   * @param {{ label?: string, content?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-spoiler')

    // Label (always visible)
    const label = document.createElement('div')
    label.className = 'oe-spoiler__label'
    label.contentEditable = 'true'
    label.dataset.placeholder = this._t('labelPlaceholder', 'Spoiler label...')
    if (data?.label) label.innerHTML = sanitizeHtml(data.label)
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const content = wrapper.querySelector('.oe-spoiler__content')
        if (content) /** @type {HTMLElement} */ (content).focus()
      }
    })

    // Toggle button
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'oe-spoiler__toggle'
    toggle.innerHTML = ICON
    toggle.title = this._t('toggle', 'Toggle spoiler')
    toggle.addEventListener('mousedown', (e) => e.preventDefault())
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      wrapper.classList.toggle('oe-spoiler--open')
    })

    // Header row
    const header = document.createElement('div')
    header.className = 'oe-spoiler__header'
    header.append(toggle, label)

    // Hidden content
    const content = document.createElement('div')
    content.className = 'oe-spoiler__content'
    content.contentEditable = 'true'
    content.dataset.placeholder = this._t('contentPlaceholder', 'Hidden content...')
    if (data?.content) content.innerHTML = sanitizeHtml(data.content)
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    wrapper.append(header, content)

    // Start open in editor so content is editable
    wrapper.classList.add('oe-spoiler--open')

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ label: string, content: string }}
   */
  save(element) {
    const label = element.querySelector('.oe-spoiler__label')
    const content = element.querySelector('.oe-spoiler__content')
    return {
      label: sanitizeHtml(label?.innerHTML?.trim() || ''),
      content: sanitizeHtml(content?.innerHTML?.trim() || ''),
    }
  }

  /** @param {Record<string, unknown>} data */
  validate(data) {
    return !!(/** @type {any} */ (data)?.content?.trim())
  }

  /** @param {HTMLElement} element */
  isEmpty(element) {
    const label = element.querySelector('.oe-spoiler__label')
    const content = element.querySelector('.oe-spoiler__content')
    return !label?.textContent?.trim() && !content?.textContent?.trim()
  }

  /** @param {HTMLElement} element */
  exportData(element) {
    const label = element.querySelector('.oe-spoiler__label')?.textContent?.trim() || ''
    return { text: label }
  }

  /**
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   */
  merge(element, data) {
    const content = element.querySelector('.oe-spoiler__content')
    if (content && data?.text) {
      if (content.innerHTML.trim()) content.innerHTML += '<br>'
      content.innerHTML += sanitizeHtml(String(data.text))
    }
  }

}
