// =============================================================================
// Delimiter — horizontal rule / section break
// =============================================================================

import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateDelimiterData } from '../../shared/blockDataValidators.js'

const editorStyles = new URL('./delimiter.css', import.meta.url).href

// Tabler icon: separator-horizontal (three dots)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h2"/><path d="M17 12h2"/><path d="M11 12h2"/></svg>'

/** Visual section separator that stores no user data. */
export class Delimiter extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'delimiter'
  icon = ICON
  inlineTools = false

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Delimiter')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @returns {HTMLElement}
   */
  render() {
    const hr = document.createElement('hr')
    hr.classList.add('oe-delimiter')
    hr.contentEditable = 'false'
    hr.tabIndex = -1
    return hr
  }

  /**
   * Serialize the current block DOM into document data.
   * @returns {{}}
   */
  save() {
    return {}
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validateDelimiterData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} _element
   * @returns {boolean}
   */
  isEmpty(_element) {
    // Delimiter is never empty — it's always valid
    return false
  }

}
