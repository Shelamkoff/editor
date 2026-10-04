// @ts-check
import { BLOCK_TYPES } from '../shared/blockTypes.js'
import { decodeCurrentBlock, snapshotCurrentDocumentEnvelope } from '../shared/DocumentSchema.js'
import { getBuiltInBlockDataSchema } from '../shared/blockSchemas/index.js'

/** @typedef {(config?: Record<string, unknown>) => import('../plugin-kit/types').BlockPluginDefinition} BlockPluginFactory */
/** @typedef {() => Promise<BlockPluginFactory>} BlockPluginLoader */

/** @type {Record<import('../renderer/types').BlockType, BlockPluginLoader>} */
const pluginLoaders = {
  paragraph: () => import('./paragraph/index.js').then(module => module.createParagraphPlugin),
  heading: () => import('./heading/index.js').then(module => module.createHeadingPlugin),
  list: () => import('./list/index.js').then(module => module.createListPlugin),
  quote: () => import('./quote/index.js').then(module => module.createQuotePlugin),
  code: () => import('./code/index.js').then(module => module.createCodePlugin),
  image: () => import('./image/index.js').then(module => module.createImagePlugin),
  delimiter: () => import('./delimiter/index.js').then(module => module.createDelimiterPlugin),
  table: () => import('./table/index.js').then(module => module.createTablePlugin),
  checklist: () => import('./checklist/index.js').then(module => module.createChecklistPlugin),
  warning: () => import('./warning/index.js').then(module => module.createWarningPlugin),
  embed: () => import('./embed/index.js').then(module => module.createEmbedPlugin),
  raw: () => import('./raw/index.js').then(module => module.createRawPlugin),
  gallery: () => import('./gallery/index.js').then(module => module.createGalleryPlugin),
  carousel: () => import('./carousel/index.js').then(module => module.createCarouselPlugin),
  attaches: () => import('./attaches/index.js').then(module => module.createAttachesPlugin),
  linkPreview: () => import('./link-preview/index.js').then(module => module.createLinkPreviewPlugin),
  toggle: () => import('./toggle/index.js').then(module => module.createTogglePlugin),
  columns: () => import('./columns/index.js').then(module => module.createColumnsPlugin),
  spoiler: () => import('./spoiler/index.js').then(module => module.createSpoilerPlugin),
  poll: () => import('./poll/index.js').then(module => module.createPollPlugin),
  person: () => import('./person/index.js').then(module => module.createPersonPlugin),
}

/** @param {unknown} value @param {string} label */
function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/** @param {readonly string[] | { version: '2.0.0', blocks: readonly import('../shared/documentTypes').EditorBlockData[] } | undefined} source */
function requestedTypes(source) {
  if (source === undefined) return [...BLOCK_TYPES]
  if (Array.isArray(source)) {
    const types = []
    for (let index = 0; index < source.length; index++) {
      if (!Object.hasOwn(source, index)) throw new RangeError('Unknown editor block plugin type: undefined')
      types.push(source[index])
    }
    return [...new Set(types)]
  }

  const document = snapshotCurrentDocumentEnvelope(source)
  const supported = new Set(/** @type {readonly string[]} */ (BLOCK_TYPES))
  const types = []
  for (const block of document.blocks) {
    if (!supported.has(block.type)) continue
    decodeCurrentBlock(block, {
      getBlockSchema: type => getBuiltInBlockDataSchema(type),
    })
    types.push(block.type)
  }
  return [...new Set(types)]
}

/** Return the canonical block types supported by the async plugin preset.\n * @returns {import('../renderer/types').BlockType[]}\n */
export function getAsyncBlockPluginTypes() {
  return [...BLOCK_TYPES]
}

/**
 * Load and instantiate one immutable block-plugin definition.
 * @param {string} type
 * @param {Record<string, unknown>} [config]
 * @returns {Promise<import('../plugin-kit/types').BlockPluginDefinition>}
 */
export async function loadBlockPluginDefinition(type, config = {}) {
  if (!Object.hasOwn(pluginLoaders, type)) throw new RangeError(`Unknown editor block plugin type: ${type}`)
  const snapshot = { ...requireRecord(config, `config for ${type}`) }
  const factory = await pluginLoaders[/** @type {import('../renderer/types').BlockType} */ (type)]()
  return factory(snapshot)
}

/**
 * Preload and create unique definitions for a type list or document.
 * @param {readonly string[] | { version: '2.0.0', blocks: readonly import('../shared/documentTypes').EditorBlockData[] }} [source]
 * @param {Partial<Record<import('../renderer/types').BlockType, Record<string, unknown>>>} [configs]
 * @returns {Promise<Map<string, import('../plugin-kit/types').BlockPluginDefinition>>}
 */
export async function preloadBlockPluginDefinitions(source, configs = {}) {
  const configMap = requireRecord(configs, 'configs')
  const types = requestedTypes(source)
  const definitions = await Promise.all(types.map(type => {
    const config = Object.hasOwn(configMap, type) && configMap[type] !== undefined
      ? { ...requireRecord(configMap[type], `configs.${type}`) }
      : {}
    return loadBlockPluginDefinition(type, config)
  }))
  return new Map(types.map((type, index) => [type, definitions[index]]))
}

/**
 * Create the deterministic async block-plugin preset.
 * @param {readonly string[] | { version: '2.0.0', blocks: readonly import('../shared/documentTypes').EditorBlockData[] }} [source]
 * @param {Partial<Record<import('../renderer/types').BlockType, Record<string, unknown>>>} [configs]
 * @returns {Promise<import('../plugin-kit/types').BlockPluginDefinition[]>}
 */
export async function createBlockPluginsAsync(source, configs = {}) {
  return [...(await preloadBlockPluginDefinitions(source, configs)).values()]
}
