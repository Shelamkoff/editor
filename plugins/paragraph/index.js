import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { mapTextFields } from './mapTextFields.js'
import { validateParagraphData } from '../../shared/blockDataValidators.js'

const editorStyles = resolvePath('./paragraph.css', import.meta.url)

// Tabler icon: letter-t
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l12 0"/><path d="M12 4l0 16"/></svg>'


/** @typedef {{ placeholder?: string, injectStyles?: boolean, css?: string }} ParagraphConfig */

/** @extends {BlockPluginAbstract<ParagraphConfig>} */
export class Paragraph extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'paragraph'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  /** @param {ParagraphConfig} [config] */
  constructor(config) {
    super(config)
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Text')
  }

  /**
   * Set placeholder from editor-level config (lower priority than constructor config).
   * @param {string} placeholder
   */
  setPlaceholder(placeholder) {
    if (!this._config.placeholder) {
      this._config = /** @type {typeof this._config} */ (Object.freeze({ ...this._config, placeholder }))
    }
  }

  /**
   * @param {{ text?: string, align?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const p = document.createElement('p')
    p.classList.add('oe-paragraph')
    p.contentEditable = 'true'

    if (data.text) {
      p.innerHTML = sanitizeHtml(data.text)
    }
    if (data.align) {
      p.style.textAlign = data.align
    }

    // Placeholder via data attribute + CSS :empty::before
    // Priority: explicit config > i18n locale > empty (no placeholder)
    const placeholder = this._config.placeholder
      || this._t('placeholder', '')
      || ''
    if (placeholder) {
      p.dataset.placeholder = placeholder
    }

    // No Level 1 paste handler — paragraph is a simple text block.
    // Clipboard (Level 2) handles all paste: sanitization, multi-line splitting.
    // Level 1 is for specialized plugins (code block, image) that need custom paste.

    return p
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string, align?: string }}
   */
  save(element) {
    /** @type {{ text: string, align?: string }} */
    const data = { text: element.innerHTML.trim() }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  /**
   * @param {{ text: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateParagraphData(data)
  }

  /**
   * Merge another paragraph's data into this element.
   * @param {HTMLElement} element
   * @param {{ text?: string, align?: string }} data
   */
  merge(element, data) {
    if (data.text) {
      element.innerHTML += sanitizeHtml(data.text)
    }
    // Preserve alignment from merged block if current has none
    if (data.align && !element.style.textAlign) {
      element.style.textAlign = data.align
    }
  }

  /**
   * Extract transferable data for block type conversion.
   * @param {HTMLElement} element
   * @returns {{ text: string, align?: string }}
   */
  exportData(element) {
    /** @type {{ text: string, align?: string }} */
    const data = { text: element.innerHTML.trim() }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  /**
   * Check if the paragraph content is empty.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    return (element.textContent?.trim().length ?? 0) === 0
  }

}
