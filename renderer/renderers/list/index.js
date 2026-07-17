// @ts-check
import { mapListTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * List block renderer for the Rector document format.
 * Data: { style: 'ordered' | 'unordered', items: string[] }
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').ListBlock>}
 */
export function createListRenderer(classPrefix, _locale) {
  return {
    type: 'list',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').ListBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const { style, items } = block.data

      const tag = style === 'ordered' ? 'ol' : 'ul'
      const list = document.createElement(tag)
      list.className = `${classPrefix}-list ${classPrefix}-list--${style}`

      for (const item of items) {
        const li = document.createElement('li')
        li.className = `${classPrefix}-list__item`
        li.appendChild(parseInline(item))
        list.appendChild(li)
      }

      return list
    },
  }
}
