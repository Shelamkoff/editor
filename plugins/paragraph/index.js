import { insertSanitizedHtml, setSanitizedHtml } from '../../core/sanitize.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { mapTextFields } from './mapTextFields.js'
import { paragraphDataSchema } from '../../shared/blockSchemas/paragraph.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = new URL('./paragraph.css', import.meta.url).href

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
 * Editable paragraph block that stores sanitized rich text.
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
   * @param {{ text?: string }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const ownerDocument = context?.ownerDocument ?? globalThis.document
    const p = ownerDocument.createElement('p')
    p.classList.add('oe-paragraph')
    p.contentEditable = 'true'

    const text = normalizeTextValue(data?.text)
    if (text) setSanitizedHtml(p, text)

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
   * @returns {{ text: string }}
   */
  save(element) {
    return { text: element.innerHTML }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {unknown} data
   * @returns {boolean}
   */
  validate(data) {
    try {
      paragraphDataSchema.encode(/** @type {any} */ (data))
      return true
    } catch {
      return false
    }
  }

  /**
   * Merge another paragraph's data into this element.
   * @param {HTMLElement} element
   * @param {{ text?: string }} data
   * @returns {void}
   */
  merge(element, data) {
    const text = normalizeTextValue(data.text)
    if (text) insertSanitizedHtml(element, 'beforeend', text)
  }

  /**
   * Extract transferable data for block type conversion.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    return { text: element.innerHTML }
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
