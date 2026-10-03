// @ts-check

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

    /**
     * @param {import('../../types').HeadingBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      const { level, text } = block.data

      const heading = context.ownerDocument.createElement(`h${level}`)
      heading.className = `${classPrefix}-header ${classPrefix}-header--level-${level}`
      heading.appendChild(parseInline(text))

      return heading
    },
  }
}
