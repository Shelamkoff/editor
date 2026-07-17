// @ts-check
import { normalizeCarouselData } from './carouselData.js'
import {
  COLUMN_LAYOUT_SIZES,
  GALLERY_LAYOUTS,
  LINK_PREVIEW_TEMPLATES,
} from './blockDataValidators.js'
import { normalizePollData } from './pollData.js'
import { sanitizeUrl } from './sanitize/sanitizeUrl.js'
import {
  normalizeHeadingLevel,
  normalizeTextAlign,
  normalizeTextValue,
} from './textFormat.js'

const ATTACH_VARIANTS = new Set(['a', 'b', 'f', 'g'])
const GALLERY_BOOLEAN_OPTIONS = [
  'loop', 'zoom', 'navigation', 'captions', 'thumbnails', 'fullscreen',
]

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/** @param {unknown} value @param {'link' | 'external' | 'media' | 'download'} policy */
function url(value, policy) {
  return sanitizeUrl(normalizeTextValue(value), { policy, fallback: '' })
}

/** @param {unknown} value */
function positiveNumber(value) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined
}

/** @param {unknown} value */
function nonNegativeNumber(value) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : 0
}

/** @param {unknown} value */
function stringProperties(value) {
  /** @type {Record<string, string>} */
  const result = {}
  for (const [key, item] of Object.entries(record(value))) {
    if (typeof item === 'string') result[key] = item
  }
  return result
}

/**
 * Convert malformed built-in block data into a safe render-only value.
 *
 * The `preserve` validation policy reports invalid data instead of rejecting
 * the document. Renderers therefore need a deterministic boundary that cannot
 * throw on arrays, objects, missing fields, or unsafe URLs. This function
 * never mutates the caller's document and is used only after strict validation
 * of the corresponding built-in block has failed.
 *
 * @param {string} type
 * @param {unknown} input
 * @returns {Record<string, unknown>}
 */
export function normalizeKnownBlockData(type, input) {
  const source = record(input)
  let sequence = 0
  const createId = () => `preserved-${type}-${++sequence}`

  switch (type) {
    case 'paragraph':
      return { text: normalizeTextValue(source.text), align: normalizeTextAlign(source.align) }
    case 'heading':
      return {
        text: normalizeTextValue(source.text),
        level: normalizeHeadingLevel(source.level),
        align: normalizeTextAlign(source.align),
      }
    case 'list':
      return {
        style: source.style === 'ordered' ? 'ordered' : 'unordered',
        items: (Array.isArray(source.items) ? source.items : []).map(normalizeTextValue),
      }
    case 'quote':
      return { text: normalizeTextValue(source.text), caption: normalizeTextValue(source.caption) }
    case 'code':
      return { code: normalizeTextValue(source.code), language: normalizeTextValue(source.language) }
    case 'delimiter':
      return {}
    case 'warning':
      return { title: normalizeTextValue(source.title), message: normalizeTextValue(source.message) }
    case 'raw':
      return { html: normalizeTextValue(source.html) }
    case 'toggle':
      return {
        title: normalizeTextValue(source.title),
        content: normalizeTextValue(source.content),
        open: source.open === true,
      }
    case 'spoiler':
      return { label: normalizeTextValue(source.label), content: normalizeTextValue(source.content) }
    case 'table': {
      const rows = (Array.isArray(source.content) ? source.content : [])
        .filter(Array.isArray)
        .map(row => row.map(normalizeTextValue))
      const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
      return {
        withHeadings: source.withHeadings === true,
        content: rows.map(row => Array.from({ length: width }, (_, index) => row[index] ?? '')),
      }
    }
    case 'columns': {
      const layout = typeof source.layout === 'string' && COLUMN_LAYOUT_SIZES[source.layout]
        ? source.layout
        : '1-1'
      const columns = Array.isArray(source.columns) ? source.columns : []
      return {
        layout,
        columns: Array.from({ length: COLUMN_LAYOUT_SIZES[layout] }, (_, index) => ({
          content: normalizeTextValue(record(columns[index]).content),
        })),
      }
    }
    case 'checklist':
      return {
        items: (Array.isArray(source.items) ? source.items : []).map(item => {
          const value = record(item)
          return { text: normalizeTextValue(value.text), checked: value.checked === true }
        }),
      }
    case 'gallery': {
      const optionsSource = record(source.options)
      /** @type {Record<string, boolean | number>} */
      const options = {}
      for (const key of GALLERY_BOOLEAN_OPTIONS) options[key] = optionsSource[key] === true
      const autoplayInterval = positiveNumber(optionsSource.autoplayInterval)
      if (autoplayInterval) options.autoplayInterval = autoplayInterval
      return {
        images: (Array.isArray(source.images) ? source.images : []).flatMap(item => {
          const image = record(item)
          const safeUrl = url(image.url, 'media')
          return safeUrl ? [{ url: safeUrl, caption: normalizeTextValue(image.caption) }] : []
        }),
        layout: typeof source.layout === 'string' && GALLERY_LAYOUTS.includes(source.layout)
          ? source.layout
          : 'auto',
        styles: stringProperties(source.styles),
        options,
      }
    }
    case 'embed':
      return {
        service: source.service === 'vimeo' ? 'vimeo' : 'youtube',
        videoId: normalizeTextValue(source.videoId),
        caption: normalizeTextValue(source.caption),
        cover: url(source.cover, 'media'),
        title: normalizeTextValue(source.title),
        duration: normalizeTextValue(source.duration),
      }
    case 'linkPreview':
      return {
        url: url(source.url, 'external'),
        title: normalizeTextValue(source.title),
        description: normalizeTextValue(source.description),
        image: url(source.image, 'media'),
        favicon: url(source.favicon, 'media'),
        domain: normalizeTextValue(source.domain),
        template: typeof source.template === 'string' && LINK_PREVIEW_TEMPLATES.includes(source.template)
          ? source.template
          : 'notion',
      }
    case 'image': {
      const file = record(source.file)
      /** @type {Record<string, string | number>} */
      const normalizedFile = { url: url(file.url, 'media') }
      const width = positiveNumber(file.width)
      const height = positiveNumber(file.height)
      if (width) normalizedFile.width = width
      if (height) normalizedFile.height = height
      return {
        file: normalizedFile,
        caption: normalizeTextValue(source.caption),
        withBorder: source.withBorder === true,
        expanded: source.expanded === true,
        withBackground: source.withBackground === true,
        styles: stringProperties(source.styles),
      }
    }
    case 'attaches': {
      const candidates = Array.isArray(source.files)
        ? source.files
        : (Object.keys(record(source.file)).length ? [source.file] : [])
      return {
        files: candidates.flatMap(candidate => {
          const file = record(candidate)
          const safeUrl = url(file.url, 'download')
          if (!safeUrl) return []
          return [{
            url: safeUrl,
            name: normalizeTextValue(file.name),
            extension: normalizeTextValue(file.extension),
            size: nonNegativeNumber(file.size),
          }]
        }),
        variant: typeof source.variant === 'string' && ATTACH_VARIANTS.has(source.variant)
          ? source.variant
          : 'f',
      }
    }
    case 'person':
      return {
        persons: (Array.isArray(source.persons) ? source.persons : []).map(item => {
          const person = record(item)
          return {
            avatar: url(person.avatar, 'media'),
            name: normalizeTextValue(person.name),
            role: normalizeTextValue(person.role),
            bio: normalizeTextValue(person.bio),
            links: (Array.isArray(person.links) ? person.links : []).flatMap(item => {
              const link = record(item)
              const safeUrl = url(link.url, 'link')
              return safeUrl ? [{ type: normalizeTextValue(link.type), url: safeUrl }] : []
            }),
          }
        }),
      }
    case 'carousel':
      return normalizeCarouselData(source, createId)
    case 'poll':
      return normalizePollData(source, createId)
    default:
      return source
  }
}
