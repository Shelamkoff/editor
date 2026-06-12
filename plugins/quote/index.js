// =============================================================================
// Quote — blockquote with optional caption
// =============================================================================

import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { mapTextFields } from './mapTextFields.js'

const editorStyles = resolvePath('./quote.css', import.meta.url)

// Tabler icon: blockquote
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a2 2 0 0 1 2 2v6c0 3.13 -1.65 5.193 -4.757 5.97a1 1 0 1 1 -.486 -1.94c2.227 -.557 3.243 -1.827 3.243 -4.03v-1h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 2 -2z"/><path d="M18 5a2 2 0 0 1 2 2v6c0 3.13 -1.65 5.193 -4.757 5.97a1 1 0 1 1 -.486 -1.94c2.227 -.557 3.243 -1.827 3.243 -4.03v-1h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 2 -2z"/></svg>'


export class Quote extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'quote'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  pasteConfig = {
    tags: ['blockquote'],
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Quote')
  }

  /**
   * @param {{ text?: string, caption?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-quote')

    const blockquote = document.createElement('blockquote')
    blockquote.classList.add('oe-quote__text')
    blockquote.contentEditable = 'true'
    blockquote.dataset.placeholder = this._t('textPlaceholder', 'Quote')
    if (data.text) {
      blockquote.innerHTML = sanitizeHtml(data.text)
    }

    const caption = document.createElement('cite')
    caption.classList.add('oe-quote__caption')
    caption.contentEditable = 'true'
    caption.dataset.placeholder = this._t('captionPlaceholder', 'Caption')
    if (data.caption) {
      caption.innerHTML = sanitizeHtml(data.caption)
    }

    // Tab switches between text and caption
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        const active = document.activeElement
        if (active === blockquote || blockquote.contains(/** @type {Node} */ (active))) {
          caption.focus()
        } else {
          blockquote.focus()
        }
      }
    })

    wrapper.appendChild(blockquote)
    wrapper.appendChild(caption)

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string, caption: string }}
   */
  save(element) {
    const textEl = element.querySelector('.oe-quote__text')
    const captionEl = element.querySelector('.oe-quote__caption')
    return {
      text: textEl?.innerHTML.trim() || '',
      caption: captionEl?.innerHTML.trim() || '',
    }
  }

  /**
   * @param {{ text?: string, caption?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return typeof data.text === 'string' && data.text.trim().length > 0
  }

  /**
   * @param {HTMLElement} element
   * @param {{ text?: string }} data
   */
  merge(element, data) {
    const textEl = element.querySelector('.oe-quote__text')
    if (textEl && data.text) {
      textEl.innerHTML += sanitizeHtml(data.text)
    }
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string, caption: string }}
   */
  exportData(element) {
    const textEl = element.querySelector('.oe-quote__text')
    const captionEl = element.querySelector('.oe-quote__caption')
    return {
      text: textEl?.innerHTML.trim() || '',
      caption: captionEl?.innerHTML.trim() || '',
    }
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const textEl = element.querySelector('.oe-quote__text')
    return (textEl?.textContent?.trim().length ?? 0) === 0
  }

  /**
   * Handle pasted blockquote elements.
   * @param {import('../../types').TagPasteEvent} event
   * @returns {{ text: string, caption: string } | null}
   */
  onPaste(event) {
    if (event.type !== 'tag') return null
    // Clone to avoid mutating the original pasted element
    const clone = /** @type {HTMLElement} */ (event.element.cloneNode(true))
    // Extract cite if present
    const cite = clone.querySelector('cite, footer, figcaption')
    const caption = cite?.textContent?.trim() || ''
    if (cite) cite.remove()
    return { text: clone.innerHTML, caption }
  }

}
