// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { sanitizeUrl, setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'

const styles = resolvePath('./styles.css', import.meta.url)

// Tabler icon: external-link
const ICON_EXTERNAL = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h-6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path d="M11 13l9-9"/><path d="M15 4h5v5"/></svg>`

const TEMPLATES = ['horizontal', 'compact', 'large-top', 'minimal', 'twitter', 'notion', 'split']

/**
 * Link preview (bookmark) block renderer with 7 templates support.
 * Mirrors the editor plugin: horizontal, compact, large-top, minimal, twitter, notion, split.
 *
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').LinkPreviewBlock>}
 */
export function createLinkPreviewRenderer(classPrefix, _locale) {
    const p = `${classPrefix}-link-preview`

    return {
        type: 'linkPreview',
        styles: [styles],

        /**
         * @param {import('../../types').LinkPreviewBlock} block
         * @param {import('../../types').InlineParser} _parseInline
         * @returns {HTMLElement}
         */
        render(block, _parseInline) {
            const { url, title, description, image, favicon, domain } = block.data
            const requestedTpl = block.data.template
            const tpl = (requestedTpl && TEMPLATES.includes(requestedTpl)) ? requestedTpl : 'notion'

            const card = document.createElement('a')
            card.className = `${p} ${p}--${tpl}`
            const href = sanitizeUrl(url, {
                policy: 'external', allowRelative: false, fallback: '',
            })
            if (href) card.href = href
            card.target = '_blank'
            card.rel = 'noopener noreferrer'

            // Notion: large favicon before content
            if (tpl === 'notion' && favicon) {
                const bigFav = document.createElement('img')
                bigFav.className = `${p}__favicon-large`
                setSafeUrlAttribute(bigFav, 'src', favicon || '', 'media')
                bigFav.width = 32
                bigFav.height = 32
                bigFav.alt = ''
                bigFav.loading = 'lazy'
                card.appendChild(bigFav)
            }

            // Content
            const content = document.createElement('div')
            content.className = `${p}__content`

            const titleText = title || url
            const titleEl = document.createElement('div')
            titleEl.className = `${p}__title`
            titleEl.textContent = titleText
            content.appendChild(titleEl)

            if (description) {
                const descEl = document.createElement('div')
                descEl.className = `${p}__desc`
                descEl.textContent = description
                content.appendChild(descEl)
            }

            // Domain line
            const domainLine = document.createElement('div')
            domainLine.className = `${p}__domain`

            // Favicon (not for notion — it has large favicon instead)
            if (favicon && tpl !== 'notion') {
                const fav = document.createElement('img')
                fav.className = `${p}__favicon`
                setSafeUrlAttribute(fav, 'src', favicon, 'media')
                fav.width = 14
                fav.height = 14
                fav.alt = ''
                fav.loading = 'lazy'
                domainLine.appendChild(fav)
            }

            const domainText = document.createElement('span')
            domainText.textContent = domain || url
            domainLine.appendChild(domainText)

            const ext = document.createElement('span')
            ext.className = `${p}__external`
            ext.innerHTML = ICON_EXTERNAL
            domainLine.appendChild(ext)

            content.appendChild(domainLine)
            card.appendChild(content)

            // Image (not for minimal/notion templates)
            if (image && tpl !== 'minimal' && tpl !== 'notion') {
                const imgWrap = document.createElement('div')
                imgWrap.className = `${p}__image`
                const img = document.createElement('img')
                setSafeUrlAttribute(img, 'src', image, 'media')
                img.alt = title || ''
                img.loading = 'lazy'
                imgWrap.appendChild(img)
                card.appendChild(imgWrap)
            }

            return card
        },
    }
}
