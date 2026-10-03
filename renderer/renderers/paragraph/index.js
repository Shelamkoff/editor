// @ts-check
import { paragraphDataSchema } from '../../../shared/blockSchemas/paragraph.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Paragraph block renderer for the Rector document format.
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRendererDefinition<import('../../types').ParagraphBlock>}
 */
export function createParagraphRenderer(classPrefix, _locale) {
  return {
    type: 'paragraph',
    schema: paragraphDataSchema,
    styles: [styles],

    /**
     * @param {import('../../types').ParagraphBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      const p = context.ownerDocument.createElement('p')
      p.className = `${classPrefix}-paragraph`
      const { text } = block.data
      p.appendChild(parseInline(text))
      return p
    },
  }
}
