// @ts-check
import { setSanitizedRawHtml } from '../../../shared/sanitize/sanitizeRawHtml.js'

/**
 * Raw HTML block renderer
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').RawBlock>}
 */
export function createRawRenderer(classPrefix, _locale) {
  return {
    type: 'raw',
    styles: [],

    /**
     * @param {import('../../types').RawBlock} block
     * @param {import('../../types').InlineParser} _parseInline
     * @returns {HTMLElement}
     */
    render(block, _parseInline) {
      const wrapper = document.createElement('div')
      wrapper.className = `${classPrefix}-raw`
      setSanitizedRawHtml(wrapper, block.data.html)
      return wrapper
    },
  }
}
