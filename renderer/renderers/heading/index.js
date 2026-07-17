// @ts-check
import { mapHeadingTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Heading block renderer for the Rector document format.
 * Block type: 'heading' (not 'header')
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').HeadingBlock>}
 */
export function createHeaderRenderer(classPrefix, _locale) {
  return {
    type: 'heading',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').HeadingBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const { level, text, align } = block.data

      const heading = document.createElement(`h${level}`)
      heading.className = `${classPrefix}-header ${classPrefix}-header--level-${level}`
      if (align && align !== 'left') {
        heading.style.textAlign = align
      }
      heading.appendChild(parseInline(text))

      return heading
    },
  }
}
