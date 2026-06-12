// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapTextFields } from '../../../plugins/quote/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

// Tabler icon: quote
const ICON_QUOTE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`

/**
 * Quote block renderer — callout style with icon
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').QuoteBlock>}
 */
export function createQuoteRenderer(classPrefix, _locale) {
  return {
    type: 'quote',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').QuoteBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const { text, caption, alignment = 'left' } = block.data

      const blockquote = document.createElement('blockquote')
      blockquote.className = `${classPrefix}-quote ${classPrefix}-quote--${alignment}`

      const icon = document.createElement('span')
      icon.className = `${classPrefix}-quote__icon`
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML = ICON_QUOTE

      const body = document.createElement('div')
      body.className = `${classPrefix}-quote__body`

      const content = document.createElement('p')
      content.className = `${classPrefix}-quote__text`
      content.appendChild(parseInline(text))
      body.appendChild(content)

      if (caption) {
        const cite = document.createElement('cite')
        cite.className = `${classPrefix}-quote__caption`
        cite.appendChild(parseInline(caption))
        body.appendChild(cite)
      }

      blockquote.appendChild(icon)
      blockquote.appendChild(body)

      return blockquote
    },
  }
}
