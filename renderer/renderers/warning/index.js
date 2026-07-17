// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapWarningTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

// Tabler icon: alert-triangle
const ICON_WARNING = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>`

/**
 * Warning block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').WarningBlock>}
 */
export function createWarningRenderer(classPrefix, _locale) {
    return {
        type: 'warning',
        styles: [styles],
        mapTextFields,

        /**
         * @param {import('../../types').WarningBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline) {
            const { title, message } = block.data

            const wrapper = document.createElement('div')
            wrapper.className = `${classPrefix}-warning`
            wrapper.setAttribute('role', 'note')

            const icon = document.createElement('span')
            icon.className = `${classPrefix}-warning__icon`
            icon.setAttribute('aria-hidden', 'true')
            icon.innerHTML = ICON_WARNING

            const content = document.createElement('div')
            content.className = `${classPrefix}-warning__content`

            if (title) {
                const titleElement = document.createElement('strong')
                titleElement.className = `${classPrefix}-warning__title`
                titleElement.appendChild(parseInline(title))
                content.appendChild(titleElement)
            }

            if (message) {
                const messageElement = document.createElement('p')
                messageElement.className = `${classPrefix}-warning__message`
                messageElement.appendChild(parseInline(message))
                content.appendChild(messageElement)
            }

            wrapper.appendChild(icon)
            wrapper.appendChild(content)

            return wrapper
        },
    }
}
