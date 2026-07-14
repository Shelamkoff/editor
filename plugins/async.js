// @ts-check
import { BLOCK_TYPES } from '../shared/blockTypes.js'

/** @typedef {new (config?: Record<string, unknown>) => import('../core/types').BlockPlugin} AsyncBlockPluginConstructor */
/** @typedef {() => Promise<AsyncBlockPluginConstructor>} BlockPluginLoader */

/** @type {Record<import('../renderer/types').BlockType, BlockPluginLoader>} */
const pluginLoaders = {
  paragraph: () => import('./paragraph/index.js').then(module => module.Paragraph),
  heading: () => import('./heading/index.js').then(module => module.Heading),
  list: () => import('./list/index.js').then(module => module.List),
  quote: () => import('./quote/index.js').then(module => module.Quote),
  code: () => import('./code/index.js').then(module => module.Code),
  image: () => import('./image/index.js').then(module => module.Image),
  delimiter: () => import('./delimiter/index.js').then(module => module.Delimiter),
  table: () => import('./table/index.js').then(module => module.Table),
  checklist: () => import('./checklist/index.js').then(module => module.Checklist),
  warning: () => import('./warning/index.js').then(module => module.Warning),
  embed: () => import('./embed/index.js').then(module => module.Embed),
  raw: () => import('./raw/index.js').then(module => module.Raw),
  gallery: () => import('./gallery/index.js').then(module => module.Gallery),
  carousel: () => import('./carousel/index.js').then(module => module.CarouselBlock),
  attaches: () => import('./attaches/index.js').then(module => module.Attaches),
  linkPreview: () => import('./link-preview/index.js').then(module => module.LinkPreview),
  toggle: () => import('./toggle/index.js').then(module => module.Toggle),
  columns: () => import('./columns/index.js').then(module => module.Columns),
  spoiler: () => import('./spoiler/index.js').then(module => module.Spoiler),
  poll: () => import('./poll/index.js').then(module => module.Poll),
  person: () => import('./person/index.js').then(module => module.Person),
}

/** @param {readonly string[] | { blocks?: readonly { type: string }[] } | undefined} source */
function requestedTypes(source) {
  const document = /** @type {{ blocks?: readonly { type: string }[] } | undefined} */ (source)
  const types = Array.isArray(source) ? source : document?.blocks?.map(block => block.type) ?? BLOCK_TYPES
  return [...new Set(types)]
}

/** @returns {import('../renderer/types').BlockType[]} */
export function getAsyncBlockPluginTypes() {
  return [...BLOCK_TYPES]
}

/**
 * Resolve one block plugin constructor without instantiating it.
 * @param {string} type
 * @returns {Promise<AsyncBlockPluginConstructor>}
 */
export async function loadBlockPlugin(type) {
  const loader = pluginLoaders[/** @type {import('../renderer/types').BlockType} */ (type)]
  if (!loader) throw new RangeError(`Unknown editor block plugin type: ${type}`)
  return loader()
}

/**
 * Preload unique plugin constructors for a type list or an existing document.
 * The input document remains untouched if a chunk fails to load.
 * @param {readonly string[] | { blocks?: readonly { type: string }[] }} [source]
 * @returns {Promise<Map<string, AsyncBlockPluginConstructor>>}
 */
export async function preloadBlockPlugins(source) {
  const types = requestedTypes(source)
  const constructors = await Promise.all(types.map(loadBlockPlugin))
  return new Map(types.map((type, index) => [type, constructors[index]]))
}

/**
 * Create a deterministic plugin preset after every requested chunk loaded.
 * @param {readonly string[] | { blocks?: readonly { type: string }[] }} [source]
 * @param {Partial<Record<import('../renderer/types').BlockType, Record<string, unknown>>>} [configs]
 * @returns {Promise<import('../core/types').BlockPlugin[]>}
 */
export async function createBlockPluginsAsync(source, configs = {}) {
  const constructors = await preloadBlockPlugins(source)
  return [...constructors].map(([type, Plugin]) => new Plugin(configs[/** @type {import('../renderer/types').BlockType} */ (type)]))
}
