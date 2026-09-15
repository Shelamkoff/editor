// @ts-check
import {
  Carousel,
  carouselStylesUrl,
  createArrows,
  createAutoplay,
  createDots,
  createKeyboard,
  createSwipe,
  createThumbnails,
} from '@shelamkoff/carousel'
import { normalizeCarouselData } from '../../../shared/carouselData.js'
import { setSanitizedRawHtml } from '../../../shared/sanitize/sanitizeRawHtml.js'
import { setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'
import { localeText } from '../locale.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Create the mixed-media carousel renderer and own its Carousel instances.
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} locale
 * @returns {import('../../types').BlockRenderer<import('../../types').CarouselBlock>}
 */
export function createCarouselRenderer(classPrefix, locale) {
  const p = `${classPrefix}-carousel-block`
  /** @type {WeakMap<HTMLElement, Carousel>} */
  const instances = new WeakMap()
  /** @param {string} key @param {string} fallback */
  const t = (key, fallback) => localeText(locale, `renderer.carousel.${key}`, fallback)

  return {
    type: 'carousel',
    styles: [styles, carouselStylesUrl],
    render(block, _parseInline, context = { ownerDocument: globalThis.document }) {
      let fallback = 0
      const data = normalizeCarouselData(block.data, () => `legacy-slide-${++fallback}`, context.ownerDocument)
      const root = context.ownerDocument.createElement('div')
      root.className = p
      root.setAttribute('aria-label', t('label', 'Content carousel'))
      if (data.options.aspectRatio && data.options.aspectRatio !== 'auto') {
        root.classList.add(`${p}--fixed-ratio`)
        root.style.aspectRatio = data.options.aspectRatio
      }

      const slides = data.slides.map(slide => {
        const content = () => {
          const figure = context.ownerDocument.createElement('figure')
          figure.className = `${p}__slide`
          if (slide.type === 'image') {
            const image = context.ownerDocument.createElement('img')
            setSafeUrlAttribute(image, 'src', slide.src || '', 'media')
            image.alt = slide.alt || ''
            image.loading = 'lazy'
            figure.appendChild(image)
          } else if (slide.type === 'video') {
            const video = context.ownerDocument.createElement('video')
            video.controls = true
            video.preload = 'metadata'
            setSafeUrlAttribute(video, 'src', slide.src || '', 'media')
            setSafeUrlAttribute(video, 'poster', slide.poster || '', 'media')
            video.setAttribute('aria-label', slide.alt || t('video', 'Video slide'))
            figure.appendChild(video)
          } else {
            const html = context.ownerDocument.createElement('div')
            html.className = `${p}__html`
            setSanitizedRawHtml(html, slide.html || '')
            figure.appendChild(html)
          }
          if (slide.caption) {
            const caption = context.ownerDocument.createElement('figcaption')
            caption.textContent = slide.caption
            figure.appendChild(caption)
          }
          return figure
        }
        return {
          content,
          ...(slide.type === 'image' && slide.src ? { thumb: slide.src } : {}),
          ...(slide.type === 'video' && slide.poster ? { thumb: slide.poster } : {}),
          meta: { id: slide.id, type: slide.type },
        }
      })

      // Preserve mode may intentionally pass a normalized empty carousel.
      // Avoid constructing a runtime instance with no navigable slides.
      if (!slides.length) return root

      // @shelamkoff/carousel 1.x resolves HTMLElement/document/window from its
      // module realm. A renderer target may belong to another same-origin realm
      // (for example renderTo() into an iframe), where passing the foreign root
      // to that runtime would fail its instanceof checks and create UI in the
      // ambient document. Keep every slide available with a native static
      // fallback in that mounting mode; same-realm rendering retains the full
      // interactive carousel.
      if (context.ownerDocument !== globalThis.document) {
        root.classList.add(`${p}--static`)
        if (data.options.aspectRatio && data.options.aspectRatio !== 'auto') {
          root.classList.remove(`${p}--fixed-ratio`)
          root.style.aspectRatio = ''
        }
        for (const slide of slides) {
          const element = slide.content()
          if (data.options.aspectRatio && data.options.aspectRatio !== 'auto') {
            element.classList.add(`${p}__slide--fixed-ratio`)
            element.style.aspectRatio = data.options.aspectRatio
          }
          root.appendChild(element)
        }
        return root
      }

      const plugins = [createKeyboard({ scope: 'container' }), createSwipe({ mouse: true })]
      if (data.options.navigation) plugins.push(createArrows())
      if (data.options.pagination) plugins.push(createDots())
      if (data.options.thumbnails) plugins.push(createThumbnails())
      if (data.options.autoplay) plugins.push(createAutoplay({ interval: data.options.autoplayDelay }))

      const instance = new Carousel(root, slides, { loop: data.options.loop, plugins })
      instances.set(root, instance)
      root.querySelector('.carousel__arrow--prev')?.setAttribute('aria-label', t('previous', 'Previous slide'))
      root.querySelector('.carousel__arrow--next')?.setAttribute('aria-label', t('next', 'Next slide'))
      root.querySelectorAll('.carousel__dot').forEach((dot, index) => dot.setAttribute('aria-label', `${t('page', 'Go to page')} ${index + 1}`))
      root.querySelectorAll('.carousel__thumb').forEach((thumb, index) => thumb.setAttribute('aria-label', `${t('slide', 'Go to slide')} ${index + 1}`))
      return root
    },
    destroy(element) {
      instances.get(element)?.destroy()
      instances.delete(element)
    },
  }
}
