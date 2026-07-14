// @ts-check
import { InvalidBlockDataError } from '../../errors.js'
import { resolvePath } from '../../../shared/resolvePath.js'
import { setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'

const styles = resolvePath('./styles.css', import.meta.url)

/**
 * Apply user-configured inline styles to the image and figure.
 * Width-related styles are skipped when expanded mode is active.
 * @param {HTMLImageElement} img
 * @param {HTMLElement} figure
 * @param {import('../../types').ImageStyles} styles
 * @param {boolean} [expanded]
 * @param {boolean} [withBackground]
 * @returns {void}
 */
function applyInlineStyles(img, figure, styles, expanded, withBackground) {
  if (styles.objectFit) img.style.objectFit = styles.objectFit
  if (styles.objectPosition) img.style.objectPosition = styles.objectPosition
  if (styles.height) img.style.height = styles.height
  if (styles.maxHeight) img.style.maxHeight = styles.maxHeight
  if (styles.minHeight) img.style.minHeight = styles.minHeight

  if (!expanded) {
    if (styles.width) img.style.width = styles.width
    if (styles.maxWidth) img.style.maxWidth = styles.maxWidth
    if (styles.minWidth) img.style.minWidth = styles.minWidth
  }

  if (styles.borderStyle && styles.borderStyle !== 'none') {
    img.style.borderStyle = styles.borderStyle
    img.style.borderWidth = styles.borderWidth || '1px'
    img.style.borderColor = styles.borderColor || '#2e2e35'
  }
  if (styles.borderRadius) img.style.borderRadius = styles.borderRadius

  if (styles.backgroundColor && withBackground) figure.style.backgroundColor = styles.backgroundColor
}

/**
 * Image block renderer
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').ImageBlock>}
 */
export function createImageRenderer(classPrefix, _locale) {
  return {
    type: 'image',
    styles: [styles],

    /**
     * @param {import('../../types').ImageBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const { file, caption, withBorder, expanded, withBackground, styles } = block.data

      if (!file?.url) {
        throw new InvalidBlockDataError('image', 'Missing file URL', block.id)
      }

      const figure = document.createElement('figure')
      figure.className = `${classPrefix}-image`

      if (withBorder) figure.classList.add(`${classPrefix}-image--bordered`)
      if (expanded) figure.classList.add(`${classPrefix}-image--expanded`)
      if (withBackground) figure.classList.add(`${classPrefix}-image--background`)

      const img = document.createElement('img')
      img.className = `${classPrefix}-image__picture`
      setSafeUrlAttribute(img, 'src', file.url, 'media')
      img.alt = caption || ''

      if (file.width) img.width = file.width
      if (file.height) img.height = file.height

      img.loading = 'lazy'

      // Apply user-configured inline styles
      if (styles) applyInlineStyles(img, figure, styles, expanded, withBackground)

      figure.appendChild(img)

      if (caption) {
        const figcaption = document.createElement('figcaption')
        figcaption.className = `${classPrefix}-image__caption`
        figcaption.appendChild(parseInline(caption))
        figure.appendChild(figcaption)
      }

      return figure
    },
  }
}
