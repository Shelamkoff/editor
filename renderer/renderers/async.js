// @ts-check
import { BLOCK_TYPES } from '../../shared/blockTypes.js'
import { snapshotPollRendererConfig } from '../pollConfigSnapshot.js'

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

/** @param {unknown} value @param {string} label */
function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return /** @type {Record<string, unknown>} */ (value)
}


/** @param {Record<string, import('../../shared/localeTypes').LocaleValue>} locale */
function snapshotLocale(locale) {
  /** @type {Record<string, import('../../shared/localeTypes').LocaleValue>} */
  const snapshot = Object.create(null)
  for (const key of Object.keys(locale)) {
    const value = locale[key]
    snapshot[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {import('../../shared/localeTypes').LocaleValue} */ ({ ...value })
      : value
  }
  return snapshot
}

/** Snapshot one renderer config without imposing a shape on renderer-specific options. */
function snapshotRendererConfig(type, value) {
  if (type === 'poll') return snapshotPollRendererConfig(value, 'configs.poll')
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return { .../** @type {Record<string, unknown>} */ (value) }
  return value
}

/** @param {readonly string[] | { blocks?: readonly { type: string }[] } | undefined} source */
function requestedTypes(source) {
  if (source === undefined) return [...BLOCK_TYPES]
  if (Array.isArray(source)) {
    const types = []
    for (let index = 0; index < source.length; index++) {
      if (!Object.hasOwn(source, index)) throw new RangeError('Unknown editor preset type: undefined')
      types.push(source[index])
    }
    return [...new Set(types)]
  }
  if (!source || typeof source !== 'object') throw new TypeError('source must be an array or document object')
  const document = /** @type {Record<string, unknown>} */ (source)
  if (!Object.hasOwn(document, 'blocks')) return [...BLOCK_TYPES]
  const blocks = document.blocks
  if (!Array.isArray(blocks)) throw new TypeError('source.blocks must be an array')
  const types = []
  for (let index = 0; index < blocks.length; index++) {
    if (!Object.hasOwn(blocks, index)) throw new TypeError('source.blocks must be a dense array')
    const block = blocks[index]
    types.push(
      block && typeof block === 'object' && !Array.isArray(block) && Object.hasOwn(block, 'type')
        ? /** @type {Record<string, unknown>} */ (block).type
        : undefined,
    )
  }
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
  if (!Object.hasOwn(rendererLoaders, type)) throw new RangeError(`Unknown editor renderer type: ${type}`)
  const loader = rendererLoaders[/** @type {import('../types').BlockType} */ (type)]
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
  if (typeof classPrefix !== 'string') throw new TypeError('classPrefix must be a string')
  const localeMap = snapshotLocale(
    /** @type {Record<string, import('../../shared/localeTypes').LocaleValue>} */ (requireRecord(locale, 'locale')),
  )
  const configSnapshot = snapshotRendererConfig(type, config)
  const factory = await loadRendererFactory(type)
  return factory(classPrefix, localeMap, configSnapshot)
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
  if (typeof classPrefix !== 'string') throw new TypeError('classPrefix must be a string')
  const localeMap = snapshotLocale(
    /** @type {Record<string, import('../../shared/localeTypes').LocaleValue>} */ (requireRecord(locale, 'locale')),
  )
  const configMap = requireRecord(configs, 'configs')
  const types = requestedTypes(source)
  const configSnapshots = new Map()
  for (const type of types) {
    configSnapshots.set(
      type,
      Object.hasOwn(configMap, type) ? snapshotRendererConfig(type, configMap[type]) : undefined,
    )
  }

  // Snapshot caller-owned inputs before the dynamic import boundary.
  const factories = await preloadRendererFactories(types)
  return new Map([...factories].map(([type, factory]) => [
    type,
    factory(classPrefix, localeMap, configSnapshots.get(type)),
  ]))
}
