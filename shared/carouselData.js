import { sanitizeRawHtml } from './sanitize/sanitizeRawHtml.js'
import { sanitizeUrl } from './sanitize/sanitizeUrl.js'

/**
 * @typedef {{ id: string, type: 'image' | 'video' | 'html', src?: string, alt?: string, caption?: string, poster?: string, html?: string }} CarouselSlide
 * @typedef {{ loop: boolean, autoplay: boolean, autoplayDelay: number, navigation: boolean, pagination: boolean, thumbnails: boolean, aspectRatio?: string }} CarouselOptions
 * @typedef {{ slides: CarouselSlide[], options: CarouselOptions }} CarouselData
 */

const ASPECT_RATIO_RE = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Normalize a CSS aspect-ratio value accepted by the carousel contract.
 * Both numeric components must be finite and strictly positive.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function normalizeCarouselAspectRatio(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (normalized === 'auto') return normalized
  const match = normalized.match(ASPECT_RATIO_RE)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? normalized
    : undefined
}

/** @param {unknown} input @param {() => string} createId @returns {CarouselData} */
export function normalizeCarouselData(input, createId) {
  const source = isRecord(input) ? /** @type {Record<string, unknown>} */ (input) : {}
  const seen = new Set()
  const slides = (Array.isArray(source.slides) ? source.slides : []).flatMap(raw => {
    if (!isRecord(raw)) return []
    const type = raw.type === 'video' || raw.type === 'html' ? raw.type : 'image'
    let id = typeof raw.id === 'string' && raw.id ? raw.id : createId()
    while (seen.has(id)) id = createId()
    seen.add(id)
    /** @type {CarouselSlide} */
    const slide = { id, type }
    if (type === 'html') {
      slide.html = sanitizeRawHtml(typeof raw.html === 'string' ? raw.html : '')
    } else {
      slide.src = sanitizeUrl(typeof raw.src === 'string' ? raw.src : '', { policy: 'media', fallback: '' })
      if (type === 'video') {
        slide.poster = sanitizeUrl(typeof raw.poster === 'string' ? raw.poster : '', { policy: 'media', fallback: '' })
      }
      if (typeof raw.alt === 'string') slide.alt = raw.alt
    }
    if (typeof raw.caption === 'string') slide.caption = raw.caption
    return [slide]
  })
  const rawOptions = isRecord(source.options) ? source.options : {}
  /** @type {CarouselOptions} */
  const options = {
    loop: rawOptions.loop === true,
    autoplay: rawOptions.autoplay === true,
    autoplayDelay: typeof rawOptions.autoplayDelay === 'number'
      && Number.isFinite(rawOptions.autoplayDelay)
      && rawOptions.autoplayDelay > 0
      ? Math.floor(rawOptions.autoplayDelay)
      : 3000,
    navigation: rawOptions.navigation !== false,
    pagination: rawOptions.pagination !== false,
    thumbnails: rawOptions.thumbnails === true,
  }
  const aspectRatio = normalizeCarouselAspectRatio(rawOptions.aspectRatio)
  if (aspectRatio) options.aspectRatio = aspectRatio
  return { slides, options }
}

/** @param {unknown} data */
export function validateCarouselData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (!Array.isArray(value.slides) || value.slides.length === 0) return false
  const ids = new Set()
  for (const slide of value.slides) {
    if (!isRecord(slide) || typeof slide.id !== 'string' || !slide.id || ids.has(slide.id)) return false
    ids.add(slide.id)
    if (typeof slide.type !== 'string' || !['image', 'video', 'html'].includes(slide.type)) return false
    if (slide.caption !== undefined && typeof slide.caption !== 'string') return false
    if (slide.type === 'html') {
      if (typeof slide.html !== 'string' || !slide.html.trim()) return false
    } else {
      if (typeof slide.src !== 'string' || !slide.src
        || sanitizeUrl(slide.src, { policy: 'media', fallback: '' }) !== slide.src) return false
      if (slide.alt !== undefined && typeof slide.alt !== 'string') return false
      if (slide.type === 'video' && slide.poster !== undefined
        && (typeof slide.poster !== 'string'
          || sanitizeUrl(slide.poster, { policy: 'media', fallback: '' }) !== slide.poster)) return false
    }
  }
  if (!isRecord(value.options)) return false
  for (const key of ['loop', 'autoplay', 'navigation', 'pagination', 'thumbnails']) {
    if (typeof value.options[key] !== 'boolean') return false
  }
  if (typeof value.options.autoplayDelay !== 'number'
    || !Number.isFinite(value.options.autoplayDelay)
    || value.options.autoplayDelay <= 0) return false
  return value.options.aspectRatio === undefined
    || normalizeCarouselAspectRatio(value.options.aspectRatio) !== undefined
}
