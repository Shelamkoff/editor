// @ts-check
import { BLOCK_TYPES } from '../../shared/blockTypes.js'

/** @typedef {(prefix: string, locale: Record<string, import('../../shared/localeTypes').LocaleValue>, config?: unknown) => import('../types').BlockRenderer} RendererFactory */
/** @typedef {() => Promise<RendererFactory>} RendererLoader */

/** @type {Record<import('../types').BlockType, RendererLoader>} */
const rendererLoaders = {
  paragraph: () => import('./paragraph/index.js').then(module => module.createParagraphRenderer),
  heading: () => import('./heading/index.js').then(module => module.createHeaderRenderer),
  list: () => import('./list/index.js').then(module => module.createListRenderer),
  quote: () => import('./quote/index.js').then(module => module.createQuoteRenderer),
  code: () => import('./code/index.js').then(module => module.createCodeRenderer),
  image: () => import('./image/index.js').then(module => module.createImageRenderer),
  delimiter: () => import('./delimiter/index.js').then(module => module.createDelimiterRenderer),
  table: () => import('./table/index.js').then(module => module.createTableRenderer),
  checklist: () => import('./checklist/index.js').then(module => module.createChecklistRenderer),
  warning: () => import('./warning/index.js').then(module => module.createWarningRenderer),
  embed: () => import('./embed/index.js').then(module => module.createEmbedRenderer),
  raw: () => import('./raw/index.js').then(module => module.createRawRenderer),
  gallery: () => import('./gallery/index.js').then(module => module.createGalleryRenderer),
  carousel: () => import('./carousel/index.js').then(module => module.createCarouselRenderer),
  attaches: () => import('./attaches/index.js').then(module => module.createAttachesRenderer),
  linkPreview: () => import('./link-preview/index.js').then(module => module.createLinkPreviewRenderer),
  toggle: () => import('./toggle/index.js').then(module => module.createToggleRenderer),
  columns: () => import('./columns/index.js').then(module => module.createColumnsRenderer),
  spoiler: () => import('./spoiler/index.js').then(module => module.createSpoilerRenderer),
  poll: () => import('./poll/index.js').then(module => module.createPollRenderer),
  person: () => import('./person/index.js').then(module => module.createPersonRenderer),
}

/** @param {readonly string[] | { blocks?: readonly { type: string }[] } | undefined} source */
function requestedTypes(source) {
  const document = /** @type {{ blocks?: readonly { type: string }[] } | undefined} */ (source)
  const types = Array.isArray(source) ? source : document?.blocks?.map(block => block.type) ?? BLOCK_TYPES
  return [...new Set(types)]
}

/**
 * List every built-in block type supported by the asynchronous renderer loader.
 * @returns {import('../types').BlockType[]}
 */
export function getAsyncRendererTypes() {
  return [...BLOCK_TYPES]
}

/**
 * Load the renderer factory for one built-in block type without creating it.
 * @param {string} type
 * @returns {Promise<RendererFactory>}
 * @throws {RangeError} when `type` is not a built-in renderer type
 */
export async function loadRendererFactory(type) {
  const loader = rendererLoaders[/** @type {import('../types').BlockType} */ (type)]
  if (!loader) throw new RangeError(`Unknown editor renderer type: ${type}`)
  return loader()
}

/**
 * Preload factories for explicit types or for the types present in a document.
 * Duplicate type names are loaded once and map order follows first occurrence.
 *
 * @param {readonly string[] | { blocks?: readonly { type: string }[] }} [source]
 * @returns {Promise<Map<string, RendererFactory>>}
 */
export async function preloadRendererFactories(source) {
  const types = requestedTypes(source)
  const factories = await Promise.all(types.map(loadRendererFactory))
  return new Map(types.map((type, index) => [type, factories[index]]))
}

/**
 * Load and create one built-in renderer.
 *
 * @param {string} type
 * @param {string} classPrefix
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue>} [locale]
 * @param {unknown} [config]
 * @returns {Promise<import('../types').BlockRenderer>}
 */
export async function createRendererAsync(type, classPrefix, locale = {}, config) {
  const factory = await loadRendererFactory(type)
  return factory(classPrefix, locale, config)
}

/**
 * Load and create a renderer map for explicit types or document block types.
 * Per-renderer configuration is selected from `configs` by block type.
 *
 * @param {string} classPrefix
 * @param {Record<string, import('../../shared/localeTypes').LocaleValue>} [locale]
 * @param {readonly string[] | { blocks?: readonly { type: string }[] }} [source]
 * @param {Record<string, unknown>} [configs]
 * @returns {Promise<Map<string, import('../types').BlockRenderer>>}
 */
export async function createDefaultRenderersAsync(classPrefix, locale = {}, source, configs = {}) {
  const factories = await preloadRendererFactories(source)
  return new Map([...factories].map(([type, factory]) => [type, factory(classPrefix, locale, configs[type])]))
}
