// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapToggleTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

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
        render(block, parseInline) {
            const { title, content, open } = block.data

            const details = document.createElement('details')
            details.className = `${classPrefix}-toggle`
            details.open = open === true

            const summary = document.createElement('summary')
            summary.className = `${classPrefix}-toggle__summary`

            const chevron = document.createElement('span')
            chevron.className = `${classPrefix}-toggle__chevron`
            chevron.setAttribute('aria-hidden', 'true')
            chevron.innerHTML = ICON_CHEVRON

            const titleEl = document.createElement('span')
            titleEl.className = `${classPrefix}-toggle__title`
            if (title) titleEl.appendChild(parseInline(title))

            summary.append(chevron, titleEl)
            details.appendChild(summary)

            if (content) {
                const body = document.createElement('div')
                body.className = `${classPrefix}-toggle__body`
                body.appendChild(parseInline(content))
                details.appendChild(body)
            }

            return details
        },
    }
}
