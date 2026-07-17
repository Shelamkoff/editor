// @ts-check
import { Carousel, createSwipe, carouselStylesUrl } from '@shelamkoff/carousel'
import { resolvePath } from '../../../shared/resolvePath.js'
import { setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'

const styles = resolvePath('./styles.css', import.meta.url)
const carouselStyles = carouselStylesUrl

const ICON_LEFT = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>'
const ICON_RIGHT = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>'

/** @type {Record<string, string>} */
const SOCIAL_ICONS = {
    website: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    twitter: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733-16z"/><path d="M4 20l6.768-6.768m2.46-2.46l6.772-6.772"/></svg>`,
    github: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>`,
    telegram: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l-4 4l6 6l4-16l-18 7l4 2l2 6l3-4"/></svg>`,
    linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 11v5"/><path d="M8 8v.01"/><path d="M12 16v-5"/><path d="M16 16v-3a2 2 0 1 0-4 0"/></svg>`,
}

/**
 * Person/author card block renderer — supports multi-person with carousel
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} locale
 * @returns {import('../../types').BlockRenderer<import('../../types').PersonBlock>}
 */
export function createPersonRenderer(classPrefix, /** @type {Record<string, import('../../../shared/localeTypes').LocaleValue>} */ locale) {
    const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
        const value = locale?.[key]
        return typeof value === 'string' ? value : fallback
    }
    const p = `${classPrefix}-person`
    const mounted = new WeakMap()


    return {
        type: 'person',
        styles: [styles, carouselStyles],

        /**
         * @param {import('../../types').PersonBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline) {
            const persons = /** @type {any[]} */ (block.data.persons || [])

            const wrapper = document.createElement('div')
            wrapper.className = p
            /** @type {{ observer: ResizeObserver | null, carousel: Carousel | null }} */
            const resources = { observer: null, carousel: null }
            mounted.set(wrapper, resources)


            if (persons.length <= 1) {
                const person = persons[0] || block.data
                wrapper.appendChild(renderCard(person, parseInline, p, t))
            } else {
                const carouselContainer = document.createElement('div')
                carouselContainer.className = `${p}__carousel`
                wrapper.appendChild(carouselContainer)

                // Build slides from persons
                const slides = persons.map(person => ({
                    content: () => renderCard(person, parseInline, p, t),
                }))

                // Measure once mounted to decide if carousel is needed
                const CARD_W = 300
                const GAP = 16
                const ro = new ResizeObserver(() => {
                    if (!carouselContainer.offsetWidth) return
                    ro.disconnect()

                    const totalW = persons.length * CARD_W + (persons.length - 1) * GAP

                    if (totalW <= carouselContainer.offsetWidth) {
                        // All fit — simple flex row
                        const list = document.createElement('div')
                        list.className = `${p}__list`
                        for (const person of persons) {
                            list.appendChild(renderCard(person, parseInline, p, t))
                        }
                        carouselContainer.appendChild(list)
                        return
                    }

                    // Overflow — init Carousel
                    const slidesPerView = Math.max(1, Math.floor(carouselContainer.offsetWidth / (CARD_W + GAP)))
                    const carousel = new Carousel(carouselContainer, slides, {
                        slidesPerView,
                        gap: GAP,
                        loop: persons.length > slidesPerView,
                        plugins: [createSwipe()],
                    })
                    resources.carousel = carousel

                    // External nav below carousel (not inside viewport)
                    const nav = document.createElement('div')
                    nav.className = `${p}__nav`
                    const prevBtn = document.createElement('button')
                    prevBtn.type = 'button'
                    prevBtn.className = `${p}__nav-btn`
                    prevBtn.innerHTML = ICON_LEFT
                    prevBtn.setAttribute('aria-label', t('renderer.person.previous', 'Previous person'))
                    prevBtn.querySelector('svg')?.setAttribute('aria-hidden', 'true')
                    prevBtn.addEventListener('click', () => carousel.prev())
                    const nextBtn = document.createElement('button')
                    nextBtn.type = 'button'
                    nextBtn.className = `${p}__nav-btn`
                    nextBtn.innerHTML = ICON_RIGHT
                    nextBtn.setAttribute('aria-label', t('renderer.person.next', 'Next person'))
                    nextBtn.querySelector('svg')?.setAttribute('aria-hidden', 'true')
                    nextBtn.addEventListener('click', () => carousel.next())
                    nav.appendChild(prevBtn)
                    nav.appendChild(nextBtn)
                    wrapper.appendChild(nav)
                })
                resources.observer = ro
                ro.observe(carouselContainer)
            }

            return wrapper
        },
        destroy(element) {
            const resources = mounted.get(element)
            if (!resources) return
            resources.observer?.disconnect()
            resources.carousel?.destroy()
            mounted.delete(element)
        },
    }
}

/**
 * @param {any} person
 * @param {import('../../types').InlineParser} parseInline
 * @param {string} p
 * @param {(key: string, fallback: string) => string} t
 * @returns {HTMLElement}
 */
function renderCard(person, parseInline, p, t) {
    const { avatar, name, role, bio, links } = person

    const card = document.createElement('div')
    card.className = `${p}__card`

    if (avatar) {
        const avatarWrap = document.createElement('div')
        avatarWrap.className = `${p}__avatar-wrap`
        const img = document.createElement('img')
        img.className = `${p}__avatar-img`
        setSafeUrlAttribute(img, 'src', avatar, 'media')
        img.alt = name || ''
        img.loading = 'lazy'
        avatarWrap.appendChild(img)
        card.appendChild(avatarWrap)
    }

    const info = document.createElement('div')
    info.className = `${p}__info`

    if (name) {
        const nameEl = document.createElement('div')
        nameEl.className = `${p}__name`
        nameEl.appendChild(parseInline(name))
        info.appendChild(nameEl)
    }

    if (role) {
        const roleEl = document.createElement('div')
        roleEl.className = `${p}__role`
        roleEl.appendChild(parseInline(role))
        info.appendChild(roleEl)
    }

    if (bio) {
        const bioEl = document.createElement('div')
        bioEl.className = `${p}__bio`
        bioEl.appendChild(parseInline(bio))
        info.appendChild(bioEl)
    }

    const validLinks = (links || []).filter(/** @type {(l: import('../../types').PersonLink) => boolean} */ (l => !!l.url))
    if (validLinks.length > 0) {
        const linksEl = document.createElement('div')
        linksEl.className = `${p}__links`
        for (const link of validLinks) {
            const a = document.createElement('a')
            a.className = `${p}__link`
            setSafeUrlAttribute(a, 'href', link.url, 'external')
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.title = link.type || t('renderer.person.link', 'Link')

            const iconSpan = document.createElement('span')
            iconSpan.className = `${p}__link-icon`
            iconSpan.innerHTML = (link.type && SOCIAL_ICONS[link.type]) || SOCIAL_ICONS.website
            a.appendChild(iconSpan)

            const urlSpan = document.createElement('span')
            urlSpan.className = `${p}__link-url`
            urlSpan.textContent = link.url.replace(/^https?:\/\//, '')
            a.appendChild(urlSpan)

            linksEl.appendChild(a)
        }
        info.appendChild(linksEl)
    }

    card.appendChild(info)
    return card
}
