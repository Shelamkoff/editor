// @ts-check
import { galleryDataSchema } from '../../../shared/blockSchemas/gallery.js'
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
import { requiresTrustedHtml } from '../../../shared/sanitize/trustedHtml.js'
import { mountGalleryMasonry } from '../../../shared/galleryMasonry.js'
import { gallerySlotCount as getSlotsCount, autoGalleryLayout as selectAutoTemplate, galleryOrientation as detectOrientation } from '../../../shared/galleryLayout.js'
import { localeText } from '../locale.js'

const styles = new URL('./styles.css', import.meta.url).href
const exposeStyles = exposeStylesUrl

const MAX_VISIBLE = 6
/** @typedef {'L' | 'P' | 'S'} Orientation */

/**
 * Create the gallery renderer and own image notifications and opened viewers.
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} locale
 * @returns {import('../../types').BlockRendererDefinition<import('../../../shared/blockDataTypes.js').GalleryBlock>}
 */
export function createGalleryRenderer(classPrefix, locale) {
  /** @type {WeakMap<HTMLElement, Set<{ destroy(): void }>>} */
  const activeInstances = new WeakMap()
  /** @type {WeakMap<HTMLElement, ReturnType<typeof mountGalleryMasonry>>} */
  const masonryMounts = new WeakMap()
  return {
    type: 'gallery',
    schema: galleryDataSchema,
    styles: [styles, exposeStyles],

    /**
     * @param {import('../../../shared/blockDataTypes.js').GalleryBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @param {import('../../types').RendererContext} context
     * @returns {HTMLElement}
     */
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      const { styles, options } = block.data
      // Grid labels and both viewer implementations consume plain text.
      // Resolve the canonical rich field once through its owning parser so
      // entities, literal tokens and registered inline widgets have the same
      // readable meaning on visible and overflow images.
      const images = block.data.images.map(image => ({
        ...image,
        caption: image.caption ? parseInline(image.caption).textContent || '' : '',
      }))
      const ownerDocument = context.ownerDocument
      const layout = block.data.layout

      const container = ownerDocument.createElement('div')
      /** @type {Set<{ destroy(): void }>} */
      const instances = new Set()
      activeInstances.set(container, instances)
      container.className = `${classPrefix}-gallery`

      const slots = getSlotsCount(layout)
      const visibleCount = Math.min(images.length, layout === 'auto' ? MAX_VISIBLE : slots)
      const visibleImages = images.slice(0, visibleCount)
      const overflowCount = images.length - visibleCount
      const openLabel = localeText(locale, 'renderer.gallery.open', 'Open image')
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
          if (activeInstances.get(container) !== instances) return
          // Remove all eg-- classes
          const classes = Array.from(container.classList)
          for (const cls of classes) {
            if (cls.startsWith('eg--')) container.classList.remove(cls)
          }
          container.classList.add(`eg--${selectAutoTemplate(visibleImages.length, orientations)}`)
        }

        visibleImages.forEach((image, i) => {
          const item = createItem(image, classPrefix, openLabel, ownerDocument)
          const img = item.querySelector('img')
          if (img) {
            let settled = false
            const imageLease = {
              destroy() {
                img.removeEventListener('load', onImgReady)
                img.removeEventListener('error', onImgReady)
                instances.delete(imageLease)
              },
            }
            const onImgReady = () => {
              if (settled || activeInstances.get(container) !== instances) return
              settled = true
              imageLease.destroy()
              orientations[i] = img.naturalWidth ? detectOrientation(img) : 'S'
              loadedCount++
              if (loadedCount >= visibleImages.length) onAllLoaded()
            }
            instances.add(imageLease)
            img.addEventListener('load', onImgReady, { once: true })
            img.addEventListener('error', onImgReady, { once: true })
            // A cached image can become complete between assigning `src` in
            // createItem() and registering these listeners. Account for that
            // path without counting a later load/error event twice.
            if (img.complete) queueMicrotask(onImgReady)
          }
          if (overflowCount > 0 && i === visibleImages.length - 1) {
            item.appendChild(createOverflow(overflowCount, classPrefix, ownerDocument))
          }
          container.appendChild(item)
        })
      } else if (layout === 'masonry') {
        container.classList.add('eg--masonry')
        masonryItems = []

        images.forEach((image) => {
          const item = createItem(image, classPrefix, openLabel, ownerDocument)
          const img = item.querySelector('img')
          if (img) img.loading = 'eager'
          masonryItems?.push(item)
          container.appendChild(item)
        })
      } else {
        // Specific template: 1, 2, 3a-6c, triptych, poly-*
        container.classList.add(`eg--${layout}`)

        visibleImages.forEach((image, i) => {
          const item = createItem(image, classPrefix, openLabel, ownerDocument)
          if (overflowCount > 0 && i === visibleImages.length - 1) {
            item.appendChild(createOverflow(overflowCount, classPrefix, ownerDocument))
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
        if (activeInstances.get(container) !== instances) return
        const target = /** @type {HTMLElement} */ (e.target)
        const item = target.closest(`.${classPrefix}-gallery__item`)
        if (!item) return

        const idx = Array.from(container.querySelectorAll(`.${classPrefix}-gallery__item`)).indexOf(item)
        if (idx === -1) return

        // @shelamkoff/expose 1.x owns its DOM through the module realm's
        // global document/window. Renderer output may live in a different
        // same-origin document, so keep lightbox DOM in the target realm with
        // a native dialog instead of leaking an Expose overlay to the parent.
        if (ownerDocument !== globalThis.document || requiresTrustedHtml(ownerDocument)) {
          let fallback = null
          fallback = openOwnedGalleryDialog(
            ownerDocument, images, idx, classPrefix,
            {
              close: localeText(locale, 'renderer.gallery.close', 'Close gallery'),
              previous: localeText(locale, 'renderer.gallery.previous', 'Previous image'),
              next: localeText(locale, 'renderer.gallery.next', 'Next image'),
              zoomIn: localeText(locale, 'renderer.gallery.zoomIn', 'Zoom in'),
              zoomOut: localeText(locale, 'renderer.gallery.zoomOut', 'Zoom out'),
              fullscreen: localeText(locale, 'renderer.gallery.fullscreen', 'Fullscreen'),
              autoplay: localeText(locale, 'renderer.gallery.autoplay', 'Autoplay'),
              rotate: localeText(locale, 'renderer.gallery.rotate', 'Rotate image'),
              flip: localeText(locale, 'renderer.gallery.flip', 'Flip image'),
              download: localeText(locale, 'renderer.gallery.download', 'Download image'),
            },
            () => { if (fallback) instances.delete(fallback) },
            options,
          )
          if (activeInstances.get(container) !== instances) { fallback.destroy(); return }
          instances.add(fallback)
          return
        }

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
     * Revoke pending image notifications and dispose open viewers/layouts.
     * @param {HTMLElement} element
     */
    destroy(element) {
      const instances = activeInstances.get(element)
      // Revoke interaction ownership before invoking resource cleanup.
      activeInstances.delete(element)
      masonryMounts.get(element)?.destroy()
      masonryMounts.delete(element)
      if (instances) {
        for (const resource of instances) {
          resource.destroy()
        }
        instances.clear()
      }
    },
  }
}

/**
 * Open the gallery entirely inside its owning document when Expose's ambient
 * document or plain HTML sinks are incompatible with that document.
 * @param {Document} ownerDocument
 * @param {Array<{ url: string; caption?: string }>} images
 * @param {number} startIndex
 * @param {string} classPrefix
 * @param {Record<string,string>} labels
 * @param {() => void} onClose
 * @param {import('../../../shared/blockDataTypes.js').GalleryOptions} [options]
 * @returns {{ destroy(): void }}
 */
function openOwnedGalleryDialog(ownerDocument, images, startIndex, classPrefix, labels, onClose, options = {}) {
  const dialog = ownerDocument.createElement('dialog')
  dialog.className = `${classPrefix}-gallery__lightbox`
  dialog.setAttribute('aria-label', labels.close)
  const surface = ownerDocument.createElement('div')
  surface.className = `${classPrefix}-gallery__lightbox-surface`

  const image = ownerDocument.createElement('img')
  image.className = `${classPrefix}-gallery__lightbox-image`
  const caption = ownerDocument.createElement('p')
  caption.className = `${classPrefix}-gallery__lightbox-caption`
  const close = ownerDocument.createElement('button')
  close.type = 'button'
  close.className = `${classPrefix}-gallery__lightbox-close`
  close.textContent = '×'
  close.setAttribute('aria-label', labels.close)

  const prev = ownerDocument.createElement('button')
  prev.type = 'button'
  prev.className = `${classPrefix}-gallery__lightbox-prev`
  prev.textContent = '‹'
  prev.setAttribute('aria-label', labels.previous)
  const next = ownerDocument.createElement('button')
  next.type = 'button'
  next.className = `${classPrefix}-gallery__lightbox-next`
  next.textContent = '›'
  next.setAttribute('aria-label', labels.next)

  const Controller = ownerDocument.defaultView?.AbortController ?? AbortController
  const lifetime = new Controller()
  const viewport = ownerDocument.createElement('div')
  viewport.className = `${classPrefix}-gallery__lightbox-viewport`
  viewport.appendChild(image)
  const toolbar = ownerDocument.createElement('div')
  toolbar.className = `${classPrefix}-gallery__lightbox-toolbar`
  const thumbnails = ownerDocument.createElement('div')
  thumbnails.className = `${classPrefix}-gallery__lightbox-thumbnails`
  const view = ownerDocument.defaultView
  const interval = options.autoplayInterval ?? 0
  let timer = null
  let index = Math.max(0, Math.min(startIndex, images.length - 1))
  let destroyed = false
  let scale = 1
  let playing = Number.isFinite(interval) && interval > 0
  const transforms = new Map()
  const addControl = (name, text, action) => {
    const button = ownerDocument.createElement('button')
    button.type = 'button'; button.dataset.galleryControl = name
    button.textContent = text; button.setAttribute('aria-label', text)
    button.addEventListener('click', action, { signal: lifetime.signal })
    toolbar.appendChild(button)
    return button
  }
  const transform = () => {
    const state = transforms.get(index) ?? { rotation: 0, horizontal: false, vertical: false }
    image.style.transform = `rotate(${state.rotation}deg) scaleX(${state.horizontal ? -1 : 1}) scaleY(${state.vertical ? -1 : 1})`
    image.style.width = scale === 1 ? '' : `${scale * 100}%`
    image.style.maxHeight = scale === 1 ? '' : 'none'
  }
  if (options.zoom !== false) {
    addControl('zoom-in', labels.zoomIn, () => { scale = Math.min(4, scale + .5); transform() })
    addControl('zoom-out', labels.zoomOut, () => { scale = Math.max(1, scale - .5); transform() })
  }
  if (options.fullscreen !== false) addControl('fullscreen', labels.fullscreen, async () => {
    if (destroyed) return
    try {
      if (ownerDocument.fullscreenElement && surface.contains(ownerDocument.fullscreenElement)) await ownerDocument.exitFullscreen()
      else {
        await surface.requestFullscreen()
        if (destroyed && ownerDocument.fullscreenElement && surface.contains(ownerDocument.fullscreenElement)) {
          await ownerDocument.exitFullscreen()
        }
      }
    } catch { /* A host/browser denial leaves the owned viewer usable. */ }
  })
  const autoplay = playing ? addControl('autoplay', labels.autoplay, () => {
    playing = !playing; autoplay.setAttribute('aria-pressed', String(playing)); schedule()
  }) : null
  autoplay?.setAttribute('aria-pressed', 'true')
  for (const name of ['rotate-cw', 'rotate-ccw', 'flip-h', 'flip-v']) {
    addControl(name, name.startsWith('rotate') ? labels.rotate : labels.flip, () => {
      const state = transforms.get(index) ?? { rotation: 0, horizontal: false, vertical: false }
      if (name === 'rotate-cw') state.rotation += 90
      else if (name === 'rotate-ccw') state.rotation -= 90
      else if (name === 'flip-h') state.horizontal = !state.horizontal
      else state.vertical = !state.vertical
      transforms.set(index, state); transform()
    })
  }
  const download = ownerDocument.createElement('a')
  download.dataset.galleryControl = 'download'; download.textContent = labels.download
  toolbar.appendChild(download)
  if (options.thumbnails && images.length > 1) images.forEach((item, itemIndex) => {
    const button = ownerDocument.createElement('button')
    button.type = 'button'; button.className = `${classPrefix}-gallery__lightbox-thumb`
    button.setAttribute('aria-label', item.caption || String(itemIndex + 1))
    const thumbnail = ownerDocument.createElement('img')
    setSafeUrlAttribute(thumbnail, 'src', item.url, 'media'); thumbnail.alt = item.caption || ''
    button.appendChild(thumbnail)
    button.addEventListener('click', () => move(itemIndex - index), { signal: lifetime.signal })
    thumbnails.appendChild(button)
  })
  const show = () => {
    const current = images[index]
    if (!current) return
    setSafeUrlAttribute(image, 'src', current.url, 'media')
    image.alt = current.caption || ''
    caption.textContent = current.caption || ''
    caption.hidden = options.captions === false || !current.caption
    const multiple = images.length > 1
    prev.hidden = !multiple || options.navigation === false || options.loop === false && index === 0
    next.hidden = !multiple || options.navigation === false || options.loop === false && index === images.length - 1
    setSafeUrlAttribute(download, 'href', current.url, 'download')
    download.download = `image-${index + 1}`
    for (const [itemIndex, button] of [...thumbnails.children].entries()) button.setAttribute('aria-current', String(itemIndex === index))
    transform()
  }
  const move = (delta) => {
    if (destroyed || images.length <= 1) return
    const next = options.loop === false ? Math.max(0, Math.min(images.length - 1, index + delta))
      : (index + delta + images.length) % images.length
    if (next !== index) { index = next; scale = 1; viewport.scrollTop = viewport.scrollLeft = 0; show() }
    schedule()
  }
  const schedule = () => {
    if (timer !== null) { (view ?? globalThis).clearTimeout(timer); timer = null }
    if (destroyed || !playing || images.length <= 1) return
    timer = (view ?? globalThis).setTimeout(() => {
      timer = null
      if (destroyed) return
      if (options.loop === false && index === images.length - 1) {
        playing = false; autoplay?.setAttribute('aria-pressed', 'false'); return
      }
      move(1)
    }, interval)
  }
  const onKeydown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
  }
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    playing = false
    schedule()
    lifetime.abort()
    transforms.clear()
    ownerDocument.removeEventListener('keydown', onKeydown)
    if (ownerDocument.fullscreenElement && surface.contains(ownerDocument.fullscreenElement)) void ownerDocument.exitFullscreen().catch(() => {})
    try { if (dialog.open && typeof dialog.close === 'function') dialog.close() }
    finally { dialog.remove(); onClose() }
  }

  close.addEventListener('click', destroy, { signal: lifetime.signal })
  prev.addEventListener('click', () => move(-1), { signal: lifetime.signal })
  next.addEventListener('click', () => move(1), { signal: lifetime.signal })
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); destroy() }, { signal: lifetime.signal })
  dialog.addEventListener('click', (event) => { if (event.target === dialog) destroy() }, { signal: lifetime.signal })
  try {
    ownerDocument.addEventListener('keydown', onKeydown)
    surface.append(close, toolbar, prev, viewport, next, caption, thumbnails)
    dialog.appendChild(surface)
    ownerDocument.body.appendChild(dialog)
    show()
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    schedule()
    close.focus()
  } catch (error) { destroy(); throw error }
  return { destroy }
}

/**
 * @param {{ url: string; caption?: string }} image
 * @param {string} classPrefix
 * @param {string} openLabel
 * @param {Document} ownerDocument
 * @returns {HTMLElement}
 */
function createItem(image, classPrefix, openLabel, ownerDocument) {
  const caption = image.caption || ''
  const figure = ownerDocument.createElement('figure')
  figure.className = `${classPrefix}-gallery__item`
  figure.tabIndex = 0
  figure.setAttribute('role', 'button')
  figure.setAttribute('aria-label', caption ? `${openLabel}: ${caption}` : openLabel)
  figure.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    figure.click()
  })

  const img = ownerDocument.createElement('img')
  img.className = `${classPrefix}-gallery__image`
  setSafeUrlAttribute(img, 'src', image.url, 'media')
  img.alt = caption
  img.loading = 'lazy'
  figure.appendChild(img)

  return figure
}

/**
 * @param {number} count
 * @param {string} classPrefix
 * @param {Document} ownerDocument
 * @returns {HTMLElement}
 */
function createOverflow(count, classPrefix, ownerDocument) {
  const overlay = ownerDocument.createElement('div')
  overlay.className = `${classPrefix}-gallery__overflow`
  overlay.textContent = `+${count}`
  return overlay
}

/**
 * @param {HTMLElement} container
 * @param {import('../../../shared/blockDataTypes.js').GalleryStyles} styles
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
