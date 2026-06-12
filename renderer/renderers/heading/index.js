// @ts-check
import { InvalidBlockDataError } from '../../errors.js'
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapTextFields } from '../../../plugins/heading/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

/** @type {Set<2 | 3 | 4 | 5 | 6>} */
const VALID_LEVELS = new Set([2, 3, 4, 5, 6])

/**
 * Heading block renderer — Ophire Editor format
 * Block type: 'heading' (not 'header')
 * @param {string} classPrefix
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

      if (!VALID_LEVELS.has(level)) {
        throw new InvalidBlockDataError('heading', `Invalid heading level: ${level}`, block.id)
      }

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
