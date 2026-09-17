import { setTrustedHtml } from '../../../shared/sanitize/sanitizeHtml.js'
// @ts-check
import { mapWarningTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

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
        render(block, parseInline, context = { ownerDocument: globalThis.document }) {
            const { title, message } = block.data

            const wrapper = context.ownerDocument.createElement('div')
            wrapper.className = `${classPrefix}-warning`
            wrapper.setAttribute('role', 'note')

            const icon = context.ownerDocument.createElement('span')
            icon.className = `${classPrefix}-warning__icon`
            icon.setAttribute('aria-hidden', 'true')
            setTrustedHtml(icon, ICON_WARNING)

            const content = context.ownerDocument.createElement('div')
            content.className = `${classPrefix}-warning__content`

            if (title) {
                const titleElement = context.ownerDocument.createElement('strong')
                titleElement.className = `${classPrefix}-warning__title`
                titleElement.appendChild(parseInline(title))
                content.appendChild(titleElement)
            }

            if (message) {
                const messageElement = context.ownerDocument.createElement('p')
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
