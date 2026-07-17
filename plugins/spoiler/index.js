// =============================================================================
// Spoiler — hidden text revealed on click
//
// Data: { label: string, content: string }
// =============================================================================

import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateSpoilerData } from '../../shared/blockDataValidators.js'
import { mapSpoilerTextFields } from '../../shared/mapTextFields.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../core/constants.js'

const editorStyles = resolvePath('./spoiler.css', import.meta.url)

// Tabler icon: eye-off
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87"/><path d="M3 3l18 18"/></svg>'
let spoilerSequence = 0

/** Collapsible rich-text disclosure block with an editable label. */
export class Spoiler extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'spoiler'
  icon = ICON
  inlineTools = true
  mapTextFields = mapSpoilerTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Spoiler')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ label?: string, content?: string }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-spoiler')

    // Label (always visible)
    const label = document.createElement('div')
    label.className = 'oe-spoiler__label'
    label.contentEditable = 'true'
    label.dataset.placeholder = this._t('labelPlaceholder', 'Spoiler label...')
    const labelText = normalizeTextValue(data?.label)
    if (labelText) label.innerHTML = sanitizeHtml(labelText)
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
    toggle.setAttribute('aria-label', this._t('toggle', 'Toggle spoiler'))
    toggle.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
    toggle.setAttribute('aria-expanded', String(!context.readOnly))
    toggle.querySelector('svg')?.setAttribute('aria-hidden', 'true')
    toggle.addEventListener('mousedown', (e) => e.preventDefault())
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = wrapper.classList.toggle('oe-spoiler--open')
      toggle.setAttribute('aria-expanded', String(open))
      content.hidden = !open
    })

    // Header row
    const header = document.createElement('div')
    header.className = 'oe-spoiler__header'
    header.append(toggle, label)

    // Hidden content
    const content = document.createElement('div')
    content.className = 'oe-spoiler__content'
    content.id = `oe-spoiler-content-${++spoilerSequence}`
    toggle.setAttribute('aria-controls', content.id)
    content.contentEditable = 'true'
    content.dataset.placeholder = this._t('contentPlaceholder', 'Hidden content...')
    const contentText = normalizeTextValue(data?.content)
    if (contentText) content.innerHTML = sanitizeHtml(contentText)
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    wrapper.append(header, content)

    // Editing starts expanded; read-only display starts collapsed but remains
    // revealable through a presentation-only control.
    wrapper.classList.toggle('oe-spoiler--open', !context.readOnly)
    content.hidden = context.readOnly

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
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

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data @returns {boolean}
   */
  validate(data) {
    return validateSpoilerData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element @returns {boolean}
   */
  isEmpty(element) {
    const label = element.querySelector('.oe-spoiler__label')
    const content = element.querySelector('.oe-spoiler__content')
    return !label?.textContent?.trim() && !content?.textContent?.trim()
  }

  /**
   * Extract neutral rich text that can initialize another block type.
   * @param {HTMLElement} element @returns {{ text: string }}
   */
  exportData(element) {
    const label = sanitizeHtml(element.querySelector('.oe-spoiler__label')?.innerHTML?.trim() || '')
    const content = sanitizeHtml(element.querySelector('.oe-spoiler__content')?.innerHTML?.trim() || '')
    return { text: [label, content].filter(Boolean).join('<br>') }
  }

  /**
   * Merge incoming text into the current block.
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   * @returns {void}
   */
  merge(element, data) {
    const content = element.querySelector('.oe-spoiler__content')
    const text = normalizeTextValue(data?.text)
    if (content && text) {
      if (content.innerHTML.trim()) content.innerHTML += '<br>'
      content.innerHTML += sanitizeHtml(text)
    }
  }

}
