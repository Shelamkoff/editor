// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapParagraphTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

/**
 * Paragraph block renderer for the Rector document format.
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').ParagraphBlock>}
 */
export function createParagraphRenderer(classPrefix, _locale) {
  return {
    type: 'paragraph',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').ParagraphBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const p = document.createElement('p')
      p.className = `${classPrefix}-paragraph`
      const { text, align } = block.data
      if (align && align !== 'left') {
        p.style.textAlign = align
      }
      p.appendChild(parseInline(text))
      return p
    },
  }
}
