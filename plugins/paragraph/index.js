import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { mapTextFields } from './mapTextFields.js'
import { validateParagraphData } from '../../shared/blockDataValidators.js'
import { normalizeTextAlign, normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = resolvePath('./paragraph.css', import.meta.url)

// Tabler icon: letter-t
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l12 0"/><path d="M12 4l0 16"/></svg>'


/**
 * Consumer configuration for {@link Paragraph}.
 * @typedef {Object} ParagraphConfig
 * @property {string} [placeholder] Text shown by an empty paragraph. The
 *   default comes from the active editor locale.
 * @property {boolean} [injectStyles=true] Whether the editor should load the
 *   built-in paragraph stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL
 *   when `injectStyles` is `false`.
 */

/**
 * Editable paragraph block that stores sanitized rich text and alignment.
 * @extends {BlockPluginAbstract<ParagraphConfig>}
 */
export class Paragraph extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'paragraph'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  /**
   * Create a Paragraph instance with the supplied consumer configuration.
   * @param {ParagraphConfig} [config]
   */
  constructor(config) {
    super(config)
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Text')
  }

  /**
   * Set placeholder from editor-level config (lower priority than constructor config).
   * @param {string} placeholder
   * @returns {void}
   */
  setPlaceholder(placeholder) {
    if (!Object.hasOwn(this._config, 'placeholder')) {
      this._config = /** @type {typeof this._config} */ (Object.freeze({ ...this._config, placeholder }))
    }
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ text?: string, align?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const p = document.createElement('p')
    p.classList.add('oe-paragraph')
    p.contentEditable = 'true'

    const text = normalizeTextValue(data?.text)
    if (text) {
      p.innerHTML = sanitizeHtml(text)
    }
    const align = normalizeTextAlign(data?.align)
    if (align) {
      p.style.textAlign = align
    }

    // Placeholder via data attribute + CSS :empty::before
    // Priority: explicit config > i18n locale > empty (no placeholder)
    const placeholder = Object.hasOwn(this._config, 'placeholder')
      ? this._config.placeholder
      : this._t('placeholder', '')
    if (placeholder) {
      p.dataset.placeholder = placeholder
    }

    // No Level 1 paste handler — paragraph is a simple text block.
    // Clipboard (Level 2) handles all paste: sanitization, multi-line splitting.
    // Level 1 is for specialized plugins (code block, image) that need custom paste.

    return p
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ text: string, align?: string }}
   */
  save(element) {
    const data = { text: element.innerHTML.trim() }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  /**
   * Check whether serialized data satisfies this block's schema.
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
   * @returns {void}
   */
  merge(element, data) {
    const text = normalizeTextValue(data.text)
    if (text) {
      element.innerHTML += sanitizeHtml(text)
    }
    // Preserve alignment from merged block if current has none
    const align = normalizeTextAlign(data.align)
    if (align && !element.style.textAlign) {
      element.style.textAlign = align
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
