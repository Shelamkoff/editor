import { sanitizeUrl } from './sanitize/sanitizeUrl.js'
import { validatePollData } from './pollData.js'
import { validateCarouselData } from './carouselData.js'

export const COLUMN_LAYOUT_SIZES = Object.freeze({
  '1-1': 2,
  '1-2': 2,
  '2-1': 2,
  '1-1-1': 3,
})

export const GALLERY_LAYOUTS = Object.freeze([
  'auto', '1', '2', '3a', '3b', '3c', '4a', '4b', '4c',
  '5a', '5b', '5c', '6a', '6b', '6c', 'triptych', 'masonry',
  'poly-5', 'poly-3arch', 'poly-5flat', 'poly-3steps',
])

export const LINK_PREVIEW_TEMPLATES = Object.freeze([
  'horizontal', 'compact', 'large-top', 'minimal', 'twitter', 'notion', 'split',
])

const ATTACH_VARIANTS = new Set(['a', 'b', 'f', 'g'])
const GALLERY_BOOLEAN_OPTIONS = [
  'loop', 'zoom', 'navigation', 'captions', 'thumbnails', 'fullscreen',
]
const OPTIONAL_LINK_PREVIEW_STRINGS = [
  'title', 'description', 'image', 'favicon', 'domain',
]
const OPTIONAL_EMBED_STRINGS = ['caption', 'cover', 'title', 'duration']
const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify'])

/** @param {unknown} value */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** @param {Record<string, unknown>} data @param {string[]} keys */
function hasOptionalStrings(data, keys) {
  return keys.every(key => data[key] === undefined || typeof data[key] === 'string')
}

/** @param {unknown} value */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/** @param {unknown} value */
function isOptionalTextAlign(value) {
  return value === undefined || (typeof value === 'string' && TEXT_ALIGNS.has(value))
}

/** @param {unknown} data */
export function validateParagraphData(data) {
  return isRecord(data)
    && isNonEmptyString(data.text)
    && isOptionalTextAlign(data.align)
}

/** @param {unknown} data */
export function validateHeadingData(data) {
  return isRecord(data)
    && isNonEmptyString(data.text)
    && Number.isInteger(data.level)
    && Number(data.level) >= 2
    && Number(data.level) <= 6
    && isOptionalTextAlign(data.align)
}

/** @param {unknown} data */
export function validateListData(data) {
  return isRecord(data)
    && (data.style === 'ordered' || data.style === 'unordered')
    && Array.isArray(data.items)
    && data.items.length > 0
    && data.items.every(item => typeof item === 'string')
    && data.items.some(isNonEmptyString)
}

/** @param {unknown} data */
export function validateQuoteData(data) {
  return isRecord(data)
    && isNonEmptyString(data.text)
    && typeof data.caption === 'string'
}

/** @param {unknown} data */
export function validateCodeData(data) {
  return isRecord(data)
    && isNonEmptyString(data.code)
    && (data.language === undefined || typeof data.language === 'string')
}

/** @param {unknown} data */
export function validateDelimiterData(data) {
  return isRecord(data)
}

/** @param {unknown} data */
export function validateWarningData(data) {
  return isRecord(data)
    && typeof data.title === 'string'
    && typeof data.message === 'string'
    && (isNonEmptyString(data.title) || isNonEmptyString(data.message))
}

/** @param {unknown} data */
export function validateRawData(data) {
  return isRecord(data) && isNonEmptyString(data.html)
}

/** @param {unknown} data */
export function validateToggleData(data) {
  return isRecord(data)
    && typeof data.title === 'string'
    && typeof data.content === 'string'
    && (data.open === undefined || typeof data.open === 'boolean')
    && (isNonEmptyString(data.title) || isNonEmptyString(data.content))
}

/** @param {unknown} data */
export function validateSpoilerData(data) {
  return isRecord(data)
    && typeof data.label === 'string'
    && isNonEmptyString(data.content)
}

/**
 * Strict URL validation deliberately requires the stored value to already be
 * canonical. Preserve mode may still normalize a value at the DOM boundary.
 * @param {unknown} value
 * @param {'link' | 'external' | 'media' | 'download'} policy
 * @param {boolean} [optional]
 */
export function isCanonicalUrl(value, policy, optional = false) {
  if (optional && (value === undefined || value === '')) return true
  if (typeof value !== 'string' || value.length === 0) return false
  return sanitizeUrl(value, { policy, fallback: '' }) === value
}

/** @param {unknown} data */
export function validateTableData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  const rows = value.content
  if (!Array.isArray(rows) || rows.length === 0) return false
  if (value.withHeadings !== undefined && typeof value.withHeadings !== 'boolean') return false
  const width = Array.isArray(rows[0]) ? rows[0].length : 0
  return width > 0 && rows.every(row => (
    Array.isArray(row)
    && row.length === width
    && row.every(cell => typeof cell === 'string')
  ))
}

/** @param {unknown} data */
export function validateColumnsData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (typeof value.layout !== 'string') return false
  const size = COLUMN_LAYOUT_SIZES[value.layout]
  return Number.isInteger(size)
    && Array.isArray(value.columns)
    && value.columns.length === size
    && value.columns.every(column => isRecord(column) && typeof column.content === 'string')
}

/** @param {unknown} data */
export function validateChecklistData(data) {
  if (!isRecord(data)) return false
  const items = /** @type {Record<string, unknown>} */ (data).items
  return Array.isArray(items) && items.length > 0 && items.every(item => (
    isRecord(item)
    && typeof item.text === 'string'
    && typeof item.checked === 'boolean'
  ))
}

/** @param {unknown} data */
export function validateGalleryData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (!Array.isArray(value.images) || value.images.length === 0) return false
  if (!value.images.every(image => (
    isRecord(image)
    && isCanonicalUrl(image.url, 'media')
    && (image.caption === undefined || typeof image.caption === 'string')
  ))) return false
  if (typeof value.layout !== 'string' || !GALLERY_LAYOUTS.includes(value.layout)) return false
  if (value.styles !== undefined) {
    if (!isRecord(value.styles)) return false
    if (!Object.values(value.styles).every(item => typeof item === 'string')) return false
  }
  if (value.options !== undefined) {
    if (!isRecord(value.options)) return false
    for (const key of GALLERY_BOOLEAN_OPTIONS) {
      if (value.options[key] !== undefined && typeof value.options[key] !== 'boolean') return false
    }
    if (value.options.autoplayInterval !== undefined
      && (!Number.isFinite(value.options.autoplayInterval) || value.options.autoplayInterval <= 0)) return false
  }
  return true
}

/** @param {unknown} data */
export function validateEmbedData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (!hasOptionalStrings(value, OPTIONAL_EMBED_STRINGS)) return false
  if (value.cover !== undefined && !isCanonicalUrl(value.cover, 'media', true)) return false
  if (value.service === 'youtube') return typeof value.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value.videoId)
  if (value.service === 'vimeo') return typeof value.videoId === 'string' && /^\d+$/.test(value.videoId)
  return false
}

/** @param {unknown} data */
export function validateLinkPreviewData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (!isCanonicalUrl(value.url, 'external')) return false
  if (!hasOptionalStrings(value, OPTIONAL_LINK_PREVIEW_STRINGS)) return false
  if (!isCanonicalUrl(value.image, 'media', true) || !isCanonicalUrl(value.favicon, 'media', true)) return false
  return value.template === undefined
    || (typeof value.template === 'string' && LINK_PREVIEW_TEMPLATES.includes(value.template))
}

/** @param {unknown} data */
export function validateImageData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (!isRecord(value.file) || !isCanonicalUrl(value.file.url, 'media')) return false
  for (const key of ['width', 'height']) {
    const dimension = value.file[key]
    if (dimension !== undefined && (!Number.isFinite(dimension) || dimension <= 0)) return false
  }
  if (value.caption !== undefined && typeof value.caption !== 'string') return false
  for (const key of ['withBorder', 'expanded', 'withBackground']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false
  }
  return value.styles === undefined
    || (isRecord(value.styles) && Object.values(value.styles).every(item => typeof item === 'string'))
}

/** @param {unknown} data */
export function validateAttachesData(data) {
  if (!isRecord(data)) return false
  const value = /** @type {Record<string, unknown>} */ (data)
  if (value.variant !== undefined && (typeof value.variant !== 'string' || !ATTACH_VARIANTS.has(value.variant))) return false
  const files = Array.isArray(value.files)
    ? value.files
    : (isRecord(value.file) ? [value.file] : null)
  return Array.isArray(files) && files.length > 0 && files.every(file => (
    isRecord(file)
    && isCanonicalUrl(file.url, 'download')
    && typeof file.name === 'string'
    && typeof file.extension === 'string'
    && Number.isFinite(file.size)
    && file.size >= 0
  ))
}

/** @param {unknown} data */
export function validatePersonData(data) {
  if (!isRecord(data)) return false
  const persons = /** @type {Record<string, unknown>} */ (data).persons
  return Array.isArray(persons) && persons.length > 0 && persons.every(person => (
    isRecord(person)
    && typeof person.name === 'string'
    && typeof person.role === 'string'
    && typeof person.bio === 'string'
    && isCanonicalUrl(person.avatar, 'media', true)
    && Array.isArray(person.links)
    && person.links.every(link => (
      isRecord(link)
      && typeof link.type === 'string'
      && isCanonicalUrl(link.url, 'link')
    ))
  ))
}

export const BLOCK_DATA_VALIDATORS = Object.freeze({
  attaches: validateAttachesData,
  carousel: validateCarouselData,
  checklist: validateChecklistData,
  code: validateCodeData,
  columns: validateColumnsData,
  delimiter: validateDelimiterData,
  embed: validateEmbedData,
  gallery: validateGalleryData,
  heading: validateHeadingData,
  image: validateImageData,
  linkPreview: validateLinkPreviewData,
  list: validateListData,
  paragraph: validateParagraphData,
  person: validatePersonData,
  poll: validatePollData,
  quote: validateQuoteData,
  raw: validateRawData,
  spoiler: validateSpoilerData,
  table: validateTableData,
  toggle: validateToggleData,
  warning: validateWarningData,
})

/** @param {string} type @param {unknown} data */
export function validateKnownBlockData(type, data) {
  const validator = BLOCK_DATA_VALIDATORS[type]
  return validator ? validator(data) : false
}
