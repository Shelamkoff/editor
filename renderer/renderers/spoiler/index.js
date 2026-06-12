// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'

const styles = resolvePath('./styles.css', import.meta.url)

// Tabler icon: eye-off
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87"/><path d="M3 3l18 18"/></svg>'

/**
 * Spoiler (hidden text) block renderer.
 * Mirrors editor plugin layout: card with header (toggle + label) + content section.
 *
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').SpoilerBlock>}
 */
export function createSpoilerRenderer(classPrefix, /** @type {Record<string, string>} */ locale) {
    const t = (/** @type {string} */ key, /** @type {string} */ fb) => locale?.[key] ?? fb
    const p = `${classPrefix}-spoiler`

    return {
        type: 'spoiler',
        styles: [styles],

        /**
         * @param {import('../../types').SpoilerBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline) {
            const { label, content } = block.data

            const wrapper = document.createElement('div')
            wrapper.className = p

            // Header: toggle button + label
            const header = document.createElement('div')
            header.className = `${p}__header`

            const toggle = document.createElement('button')
            toggle.type = 'button'
            toggle.className = `${p}__toggle`
            toggle.innerHTML = ICON
            toggle.setAttribute('aria-label', t('renderer.spoiler.toggle', 'Toggle spoiler'))
            toggle.addEventListener('click', () => {
                wrapper.classList.toggle(`${p}--open`)
            })

            const labelEl = document.createElement('div')
            labelEl.className = `${p}__label`
            if (label) {
                labelEl.appendChild(parseInline(label))
            }

            header.append(toggle, labelEl)
            wrapper.appendChild(header)

            // Hidden content
            if (content) {
                const body = document.createElement('div')
                body.className = `${p}__content`
                body.appendChild(parseInline(content))
                wrapper.appendChild(body)
            }

            return wrapper
        },
    }
}
