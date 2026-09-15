// @ts-check
import { mapToggleTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

// Tabler icon: chevron-right
const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>`

/**
 * Toggle (accordion) block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').ToggleBlock>}
 */
export function createToggleRenderer(classPrefix, _locale) {
    return {
        type: 'toggle',
        styles: [styles],
        mapTextFields,

        /**
         * @param {import('../../types').ToggleBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline, context = { ownerDocument: globalThis.document }) {
            const { title, content, open } = block.data

            const details = context.ownerDocument.createElement('details')
            details.className = `${classPrefix}-toggle`
            details.open = open === true

            const summary = context.ownerDocument.createElement('summary')
            summary.className = `${classPrefix}-toggle__summary`

            const chevron = context.ownerDocument.createElement('span')
            chevron.className = `${classPrefix}-toggle__chevron`
            chevron.setAttribute('aria-hidden', 'true')
            chevron.innerHTML = ICON_CHEVRON

            const titleEl = context.ownerDocument.createElement('span')
            titleEl.className = `${classPrefix}-toggle__title`
            if (title) titleEl.appendChild(parseInline(title))

            summary.append(chevron, titleEl)
            details.appendChild(summary)

            if (content) {
                const body = context.ownerDocument.createElement('div')
                body.className = `${classPrefix}-toggle__body`
                body.appendChild(parseInline(content))
                details.appendChild(body)
            }

            return details
        },
    }
}
