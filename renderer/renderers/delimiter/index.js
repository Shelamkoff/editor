// @ts-check

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Delimiter block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
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
