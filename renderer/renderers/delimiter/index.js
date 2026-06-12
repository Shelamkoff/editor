// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'

const styles = resolvePath('./styles.css', import.meta.url)

/**
 * Delimiter block renderer
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').DelimiterBlock>}
 */
export function createDelimiterRenderer(classPrefix, _locale) {
  return {
    type: 'delimiter',
    styles: [styles],

    /**
     * @param {import('../../types').DelimiterBlock} _block
     * @param {import('../../types').InlineParser} _parseInline
     * @returns {HTMLElement}
     */
    render(_block, _parseInline) {
      const hr = document.createElement('hr')
      hr.className = `${classPrefix}-delimiter`
      return hr
    },
  }
}
