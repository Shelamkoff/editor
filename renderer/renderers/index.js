// @ts-check
import { createParagraphRenderer } from './paragraph/index.js'
import { createHeaderRenderer } from './heading/index.js'
import { createListRenderer } from './list/index.js'
import { createQuoteRenderer } from './quote/index.js'
import { createCodeRenderer } from './code/index.js'
import { createImageRenderer } from './image/index.js'
import { createDelimiterRenderer } from './delimiter/index.js'
import { createTableRenderer } from './table/index.js'
import { createChecklistRenderer } from './checklist/index.js'
import { createWarningRenderer } from './warning/index.js'
import { createEmbedRenderer } from './embed/index.js'
import { createRawRenderer } from './raw/index.js'
import { createGalleryRenderer } from './gallery/index.js'
import { createCarouselRenderer } from './carousel/index.js'
import { createAttachesRenderer } from './attaches/index.js'
import { createLinkPreviewRenderer } from './link-preview/index.js'
import { createToggleRenderer } from './toggle/index.js'
import { createColumnsRenderer } from './columns/index.js'
import { createSpoilerRenderer } from './spoiler/index.js'
import { createPollRenderer } from './poll/index.js'
import { createPersonRenderer } from './person/index.js'
import { BLOCK_TYPES } from '../../shared/blockTypes.js'

/**
 * @typedef {(prefix: string, locale: Record<string, import('../../shared/localeTypes').LocaleValue>, config?: unknown) => import('../types').BlockRenderer} RendererFactory
 */

// Factory functions map for Rector document block types.
/** @type {Record<import('../types').BlockType, RendererFactory>} */
const rendererFactories = {
  paragraph: createParagraphRenderer,
  heading: createHeaderRenderer,
  list: createListRenderer,
  quote: createQuoteRenderer,
  code: createCodeRenderer,
  image: createImageRenderer,
  delimiter: createDelimiterRenderer,
  table: createTableRenderer,
  checklist: createChecklistRenderer,
  warning: createWarningRenderer,
  embed: createEmbedRenderer,
  raw: createRawRenderer,
  gallery: createGalleryRenderer,
  carousel: createCarouselRenderer,
  attaches: createAttachesRenderer,
  linkPreview: createLinkPreviewRenderer,
  toggle: createToggleRenderer,
  columns: createColumnsRenderer,
  spoiler: createSpoilerRenderer,
  poll: createPollRenderer,
  person: createPersonRenderer,
}

/**
 * Get all supported block types
 * @returns {import('../types').BlockType[]}
 */
export function getSupportedBlockTypes() {
  return [...BLOCK_TYPES]
}

/**
 * Create all default renderers
 * @param {string} classPrefix
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue>} locale
 * @param {import('../types').BlockType[]} [types]
 * @param {Record<string, unknown>} [configs]
 * @returns {Map<string, import('../types').BlockRenderer>}
 */
export function createDefaultRenderers(classPrefix, locale, types = getSupportedBlockTypes(), configs = {}) {
  /** @type {Map<string, import('../types').BlockRenderer>} */
  const renderers = new Map()

  for (const type of new Set(types)) {
    const factory = rendererFactories[type]
    if (!factory) continue
    renderers.set(type, factory(classPrefix, locale, configs[type]))
  }

  return renderers
}

/**
 * Create a single renderer by type
 * @template {import('../types').OutputBlockData} T
 * @param {T['type']} type
 * @param {string} classPrefix
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue>} [locale]
 * @param {unknown} [config]
 * @returns {import('../types').BlockRenderer<T> | null}
 */
export function createRenderer(type, classPrefix, locale, config) {
  const factory = rendererFactories[/** @type {import('../types').BlockType} */ (type)]

  if (!factory) {
    return null
  }

  return /** @type {import('../types').BlockRenderer<T>} */ (factory(classPrefix, locale || {}, config))
}

export {
  createParagraphRenderer,
  createHeaderRenderer,
  createListRenderer,
  createQuoteRenderer,
  createCodeRenderer,
  createImageRenderer,
  createDelimiterRenderer,
  createTableRenderer,
  createChecklistRenderer,
  createWarningRenderer,
  createEmbedRenderer,
  createRawRenderer,
  createGalleryRenderer,
  createCarouselRenderer,
  createAttachesRenderer,
  createLinkPreviewRenderer,
  createToggleRenderer,
  createColumnsRenderer,
  createSpoilerRenderer,
  createPollRenderer,
  createPersonRenderer,
}
