// @ts-check
import {
  Expose,
  createCaptions,
  createZoom,
  createThumbnails,
  createAutoplay,
  createTransform,
  createDownload,
  createFullscreen,
  exposeStylesUrl,
} from '@shelamkoff/expose'
import { setSafeUrlAttribute } from '../../../shared/sanitize/sanitizeUrl.js'
import { mountGalleryMasonry } from '../../../shared/galleryMasonry.js'

const styles = new URL('./styles.css', import.meta.url).href
const exposeStyles = exposeStylesUrl

const MAX_VISIBLE = 6

/**
 * @typedef {'L' | 'P' | 'S'} Orientation
 */

/** Legacy layout values that should be treated as 'auto' */
const LEGACY_AUTO = new Set(['grid', 'grid-2', 'grid-3', 'grid-4', 'slider'])

/**
 * @param {HTMLImageElement} img
 * @returns {Orientation}
 */
function detectOrientation(img) {
  const r = img.naturalWidth / img.naturalHeight
  if (r > 1.2) return 'L'
  if (r < 1 / 1.2) return 'P'
  return 'S'
}

/** @type {Record<string, number>} */
const POLY_SLOTS = {
  'poly-5': 5, 'poly-3arch': 3, 'poly-5flat': 5, 'poly-3steps': 3,
}

/**
 * @param {import('../../types').GalleryLayout} layout
 * @returns {number}
 */
function getSlotsCount(layout) {
  if (layout === 'auto' || layout === 'masonry') return Infinity
  if (layout === 'triptych') return 3
  if (layout in POLY_SLOTS) return POLY_SLOTS[layout] ?? 6
  const m = layout.match(/^(\d)/)
  return m && m[1] ? parseInt(m[1], 10) : 6
}

/**
 * @param {number} count
 * @param {Orientation[]} orientations
 * @returns {string}
 */
function selectAutoTemplate(count, orientations) {
  if (count <= 1) return '1'
  if (count === 2) return '2'
  const firstP = orientations[0] === 'P'
  const lastP = orientations[orientations.length - 1] === 'P'
  const allLS = orientations.every(o => o !== 'P')
  const n = Math.min(count, MAX_VISIBLE)
  switch (n) {
    case 3:
      if (firstP) return '3a'
      if (lastP) return '3b'
      return '3c'
    case 4:
      if (firstP) return '4b'
      if (allLS) return '4c'
      return '4a'
    case 5:
      if (firstP) return '5b'
      if (allLS) return '5c'
      return '5a'
    case 6:
    default:
      if (firstP) return '6b'
      if (allLS) return '6c'
      return '6a'
  }
}

/**
 * Create the gallery renderer and own every opened Expose instance.
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} locale
 * @returns {import('../../types').BlockRenderer<import('../../types').GalleryBlock>}
 */
export function createGalleryRenderer(classPrefix, locale) {
  /** @type {WeakMap<HTMLElement, Set<import('@shelamkoff/expose').Expose>>} */
  const activeInstances = new WeakMap()
  /** @type {WeakMap<HTMLElement, ReturnType<typeof mountGalleryMasonry>>} */
  const masonryMounts = new WeakMap()
  return {
    type: 'gallery',
    styles: [styles, exposeStyles],

    /**
     * @param {import('../../types').GalleryBlock} block
     * @param {import('../../types').InlineParser} _parseInline
     * @returns {HTMLElement}
     */
    render(block, _parseInline) {
      const { images, styles, options } = block.data
      // Normalize legacy layouts to 'auto'
      const rawLayout = block.data.layout
      /** @type {import('../../types').GalleryLayout} */
      const layout = (!rawLayout || LEGACY_AUTO.has(/** @type {string} */ (rawLayout)))
        ? 'auto'
        : rawLayout

      const container = document.createElement('div')
      /** @type {Set<import('@shelamkoff/expose').Expose>} */
      const instances = new Set()
      activeInstances.set(container, instances)
      container.className = `${classPrefix}-gallery`

      const slots = getSlotsCount(layout)
      const visibleCount = Math.min(images.length, layout === 'auto' ? MAX_VISIBLE : slots)
      const visibleImages = images.slice(0, visibleCount)
      const overflowCount = images.length - visibleCount
      const openLabel = typeof locale['renderer.gallery.open'] === 'string'
        ? locale['renderer.gallery.open']
        : 'Open image'
      /** @type {HTMLElement[] | null} */
      let masonryItems = null

      if (layout === 'auto') {
        // Set initial template class, refine after images load
        const initialTemplate = visibleCount <= 1 ? '1' : visibleCount === 2 ? '2' : `${Math.min(visibleCount, MAX_VISIBLE)}a`
        container.classList.add(`eg--${initialTemplate}`)

        // Track orientations for auto template selection
        /** @type {Orientation[]} */
        const orientations = new Array(visibleImages.length)
        let loadedCount = 0

        const onAllLoaded = () => {
          // Remove all eg-- classes
          const classes = Array.from(container.classList)
          for (const cls of classes) {
            if (cls.startsWith('eg--')) container.classList.remove(cls)
          }
          container.classList.add(`eg--${selectAutoTemplate(visibleImages.length, orientations)}`)
        }

        visibleImages.forEach((image, i) => {
          const item = createItem(image, classPrefix, openLabel)
          const img = item.querySelector('img')
          if (img) {
            let settled = false
            const onImgReady = () => {
              if (settled) return
              settled = true
              orientations[i] = img.naturalWidth ? detectOrientation(img) : 'S'
              loadedCount++
              if (loadedCount >= visibleImages.length) onAllLoaded()
            }
            img.addEventListener('load', onImgReady, { once: true })
            img.addEventListener('error', onImgReady, { once: true })
            // A cached image can become complete between assigning `src` in
            // createItem() and registering these listeners. Account for that
            // path without counting a later load/error event twice.
            if (img.complete) queueMicrotask(onImgReady)
          }
          if (overflowCount > 0 && i === visibleImages.length - 1) {
            item.appendChild(createOverflow(overflowCount, classPrefix))
          }
          container.appendChild(item)
        })
      } else if (layout === 'masonry') {
        container.classList.add('eg--masonry')
        masonryItems = []

        images.forEach((image) => {
          const item = createItem(image, classPrefix, openLabel)
          const img = item.querySelector('img')
          if (img) img.loading = 'eager'
          masonryItems?.push(item)
          container.appendChild(item)
        })
      } else {
        // Specific template: 1, 2, 3a-6c, triptych, poly-*
        container.classList.add(`eg--${layout}`)

        visibleImages.forEach((image, i) => {
          const item = createItem(image, classPrefix, openLabel)
          if (overflowCount > 0 && i === visibleImages.length - 1) {
            item.appendChild(createOverflow(overflowCount, classPrefix))
          }
          container.appendChild(item)
        })
      }

      // Apply gallery inline styles
      if (styles) {
        applyGalleryStyles(container, styles, classPrefix)
      }
      if (masonryItems) {
        masonryMounts.set(container, mountGalleryMasonry(container, masonryItems))
      }

      // Expose lightbox on click
      container.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target)
        const item = target.closest(`.${classPrefix}-gallery__item`)
        if (!item) return

        const idx = Array.from(container.querySelectorAll(`.${classPrefix}-gallery__item`)).indexOf(item)
        if (idx === -1) return

        /** @type {import('@shelamkoff/expose').SlideData[]} */
        const slides = images.map(img => ({
          src: img.url,
          caption: img.caption || undefined,
          alt: img.caption || undefined,
        }))

        const single = slides.length === 1
        const o = options || {}
        const loop = single ? false : (o.loop ?? true)

        /** @type {import('@shelamkoff/expose').ExposePlugin[]} */
        const plugins = []

        if (o.zoom ?? true) plugins.push(createZoom())
        if (o.captions ?? true) plugins.push(createCaptions())
        if (o.thumbnails) plugins.push(createThumbnails())
        if (o.fullscreen ?? true) plugins.push(createFullscreen())
        const autoplay = o.autoplayInterval ? createAutoplay({ interval: o.autoplayInterval }) : null
        if (autoplay) plugins.push(autoplay)
        plugins.push(createTransform())
        plugins.push(createDownload())

        /** @type {Array<'counter'>} */
        const toolbar = single ? [] : ['counter']

        const expose = new Expose(slides, {
          startIndex: idx,
          animation: 'fade',
          loop,
          navigation: o.navigation ?? true,
          toolbar,
          plugins,
        })
        instances.add(expose)
        expose.on('close:complete', () => {
          expose.destroy()
          instances.delete(expose)
        })
        void expose.open(idx).then(() => {
          autoplay?.start()
        }).catch(() => {
          expose.destroy()
          instances.delete(expose)
        })
      })

      return container
    },

    /**
     * Dispose lightboxes that are still open when rendered content is replaced.
     * @param {HTMLElement} element
     */
    destroy(element) {
      masonryMounts.get(element)?.destroy()
      masonryMounts.delete(element)
      const instances = activeInstances.get(element)
      if (instances) {
        for (const expose of instances) {
          expose.destroy()
        }
        instances.clear()
        activeInstances.delete(element)
      }
    },
  }
}

/**
 * @param {{ url: string; caption?: string }} image
 * @param {string} classPrefix
 * @param {string} openLabel
 * @returns {HTMLElement}
 */
function createItem(image, classPrefix, openLabel) {
  const figure = document.createElement('figure')
  figure.className = `${classPrefix}-gallery__item`
  figure.tabIndex = 0
  figure.setAttribute('role', 'button')
  figure.setAttribute('aria-label', image.caption ? `${openLabel}: ${image.caption}` : openLabel)
  figure.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    figure.click()
  })

  const img = document.createElement('img')
  img.className = `${classPrefix}-gallery__image`
  setSafeUrlAttribute(img, 'src', image.url, 'media')
  img.alt = image.caption || ''
  img.loading = 'lazy'
  figure.appendChild(img)

  return figure
}

/**
 * @param {number} count
 * @param {string} classPrefix
 * @returns {HTMLElement}
 */
function createOverflow(count, classPrefix) {
  const overlay = document.createElement('div')
  overlay.className = `${classPrefix}-gallery__overflow`
  overlay.textContent = `+${count}`
  return overlay
}

/**
 * @param {HTMLElement} container
 * @param {import('../../types').GalleryStyles} styles
 * @param {string} classPrefix
 * @returns {void}
 */
function applyGalleryStyles(container, styles, classPrefix) {
  if (styles.gap) container.style.gap = styles.gap
  if (styles.height) container.style.height = styles.height
  if (styles.borderRadius) {
    for (const el of container.querySelectorAll(`.${classPrefix}-gallery__item`)) {
      const item = /** @type {HTMLElement} */ (el)
      item.style.borderRadius = /** @type {string} */ (styles.borderRadius)
      item.style.overflow = 'hidden'
    }
  }
}
