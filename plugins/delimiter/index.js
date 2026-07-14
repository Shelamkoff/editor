// =============================================================================
// Delimiter — horizontal rule / section break
// =============================================================================

import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateDelimiterData } from '../../shared/blockDataValidators.js'

const editorStyles = resolvePath('./delimiter.css', import.meta.url)

// Tabler icon: separator-horizontal (three dots)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h2"/><path d="M17 12h2"/><path d="M11 12h2"/></svg>'


export class Delimiter extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'delimiter'
  icon = ICON
  inlineTools = false

  /** @returns {string} */
  get title() {
    return this._t('title', 'Delimiter')
  }

  /**
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
   * @returns {{}}
   */
  save() {
    return {}
  }

  /**
   * @returns {boolean}
   */
  validate(data) {
    return validateDelimiterData(data)
  }

  /**
   * @param {HTMLElement} _element
   * @returns {boolean}
   */
  isEmpty(_element) {
    // Delimiter is never empty — it's always valid
    return false
  }

}
