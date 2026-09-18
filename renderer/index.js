// @ts-check
import { EditorRenderer as EditorRendererImpl, getSupportedBlockTypes } from './EditorRenderer.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'

const validationSourceKey = Symbol.for('@shelamkoff/rector/renderer-validation-source')

/** @param {unknown} value @param {string} label */
function assertOptionalRecord(value, label) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new TypeError(`EditorRenderer ${label} must be an object`)
  }
}

/** @param {unknown[]} value @param {string} label */
function assertDenseArray(value, label) {
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`EditorRenderer ${label} must be a dense array`)
    }
  }
}

/** @param {import('./types').RendererConfig} config @returns {string[] | null} */
function validateRendererConfig(config) {
  if (config.injectStyles !== undefined && typeof config.injectStyles !== 'boolean') {
    throw new TypeError('EditorRenderer injectStyles must be a boolean')
  }
  if (config.classPrefix !== undefined && typeof config.classPrefix !== 'string') {
    throw new TypeError('EditorRenderer classPrefix must be a string')
  }
  if (config.throwOnUnknown !== undefined && typeof config.throwOnUnknown !== 'boolean') {
    throw new TypeError('EditorRenderer throwOnUnknown must be a boolean')
  }
  if (config.theme !== undefined && config.theme !== 'dark' && config.theme !== 'light') {
    throw new TypeError('EditorRenderer theme must be "dark" or "light"')
  }
  if (config.onValidationError !== undefined && typeof config.onValidationError !== 'function') {
    throw new TypeError('EditorRenderer onValidationError must be a function')
  }
  assertOptionalRecord(config.locale, 'locale')
  if (config.blockTypes !== undefined) {
    if (!Array.isArray(config.blockTypes)) {
      throw new TypeError('EditorRenderer blockTypes must be an array')
    }
    assertDenseArray(config.blockTypes, 'blockTypes')
    const supported = new Set(getSupportedBlockTypes())
    /** @type {import('./types').BlockType[]} */
    const snapshot = []
    for (let index = 0; index < config.blockTypes.length; index++) {
      const type = config.blockTypes[index]
      if (typeof type !== 'string' || !supported.has(type)) {
        throw new TypeError(`EditorRenderer unknown block type: ${String(type)}`)
      }
      snapshot.push(type)
    }
    config.blockTypes = snapshot
  }
  config.blockConfigs = snapshotBlockConfigs(config.blockConfigs)
  let inlinePluginTypes = null
  if (config.inlinePlugins !== undefined) {
    if (!Array.isArray(config.inlinePlugins)) {
      throw new TypeError('EditorRenderer inlinePlugins must be an array')
    }
    assertDenseArray(config.inlinePlugins, 'inlinePlugins')
    const types = new Set()
    const plugins = []
    inlinePluginTypes = []
    for (let index = 0; index < config.inlinePlugins.length; index++) {
      const plugin = config.inlinePlugins[index]
      if (!plugin || typeof plugin !== 'object') {
        throw new TypeError('EditorRenderer inline plugin must have a non-empty string type')
      }
      const type = plugin.type
      if (typeof type !== 'string' || !type) {
        throw new TypeError('EditorRenderer inline plugin must have a non-empty string type')
      }
      const createWidget = plugin.createWidget
      const getData = plugin.getData
      if (typeof createWidget !== 'function' || typeof getData !== 'function') {
        throw new TypeError(`EditorRenderer inline plugin "${type}" must implement createWidget() and getData()`)
      }
      if (types.has(type)) throw new Error(`Duplicate renderer inline plugin type: "${type}"`)
      types.add(type)
      plugins.push({
        type,
        createWidget: createWidget.bind(plugin),
        getData: getData.bind(plugin),
      })
      inlinePluginTypes.push(type)
    }
    config.inlinePlugins = plugins
  }
  return inlinePluginTypes
}

/**
 * Snapshot one public block envelope before validation. Object spread reads
 * each own enumerable property once, so accessor-backed API inputs cannot
 * change between validation and ownership transfer. Deep payloads remain
 * opaque here; producer revisions may therefore still skip deep traversal.
 * @param {unknown} block
 * @returns {import('./types').OutputBlockData}
 */
function snapshotOutputBlockEnvelope(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError('EditorRenderer block must be an object')
  }
  const prototype = Object.getPrototypeOf(block)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('EditorRenderer block must be a JSON object')
  }
  const snapshot = /** @type {import('./types').OutputBlockData} */ ({ ...block })
  Object.defineProperty(snapshot, validationSourceKey, {
    value: block,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return snapshot
}
/** @param {unknown} block */
function validateOutputBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError('EditorRenderer block must be an object')
  }
  const prototype = Object.getPrototypeOf(block)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('EditorRenderer block must be a JSON object')
  }
  const candidate = /** @type {Record<string, unknown>} */ (block)
  if (!Object.hasOwn(candidate, 'type') || typeof candidate.type !== 'string' || !candidate.type) {
    throw new TypeError('EditorRenderer block type must be a non-empty string')
  }
  if (!Object.hasOwn(candidate, 'data') || !candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    throw new TypeError('EditorRenderer block data must be an object')
  }
  if (Object.hasOwn(candidate, 'id') && candidate.id !== undefined && typeof candidate.id !== 'string') {
    throw new TypeError('EditorRenderer block id must be a string')
  }
  if (Object.hasOwn(candidate, 'revision') && candidate.revision !== undefined
      && typeof candidate.revision !== 'string' && typeof candidate.revision !== 'number') {
    throw new TypeError('EditorRenderer block revision must be a string or number')
  }
  if (Object.hasOwn(candidate, 'tunes')) assertOptionalRecord(candidate.tunes, 'block tunes')
  if (Object.hasOwn(candidate, 'inline')) assertOptionalRecord(candidate.inline, 'block inline data')
}

/**
 * Normalize the public document boundary without defeating producer revisions.
 * Unrevisioned blocks are snapshotted before their deep signature is computed.
 * Revisioned blocks keep opaque payloads unread until a changed block actually
 * needs rendering; the renderer snapshots them at that point.
 * @param {unknown} data
 * @returns {import('./types').OutputData}
 */
function prepareOutputData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('EditorRenderer data must be an object')
  }

  // Own the document envelope before inspecting it. The blocks property may
  // be accessor-backed application input and must not be observed once for
  // validation and again for rendering.
  const candidate = /** @type {Record<string, unknown>} */ ({ ...data })
  if (!Object.hasOwn(candidate, 'blocks') || !Array.isArray(candidate.blocks)) {
    throw new TypeError('EditorRenderer blocks must be an array')
  }
  const inputBlocks = candidate.blocks
  assertDenseArray(inputBlocks, 'blocks')

  const blocks = inputBlocks.map(block => {
    const source = snapshotOutputBlockEnvelope(block)
    validateOutputBlock(source)
    if (typeof source.revision !== 'string' && typeof source.revision !== 'number') {
      const snapshot = cloneEditorData(source)
      validateOutputBlock(snapshot)
      return snapshot
    }

    // Keeping the payload opaque is deliberate: equal producer revisions
    // promise that content is unchanged, so renderTo() can reuse mounted DOM
    // without traversing data/tunes/inline.
    return source
  })

  return /** @type {import('./types').OutputData} */ ({ ...candidate, blocks })
}

/**
 * Snapshot the built-in Poll runtime adapter so validated configuration cannot
 * drift through accessor-backed properties after construction.
 * @param {unknown} input
 * @returns {import('./types').PollRendererConfig | undefined}
 */
function snapshotPollRendererConfig(input) {
  if (input === undefined) return undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('EditorRenderer blockConfigs.poll must be an object')
  }
  const source = /** @type {Record<string, unknown>} */ (input)
  const dataSourceInput = source.dataSource
  let dataSource
  if (dataSourceInput !== undefined) {
    if (!dataSourceInput || typeof dataSourceInput !== 'object' || Array.isArray(dataSourceInput)) {
      throw new TypeError('EditorRenderer Poll dataSource must be an object')
    }
    const adapter = /** @type {Record<string, unknown>} */ (dataSourceInput)
    const load = adapter.load
    const vote = adapter.vote
    const subscribe = adapter.subscribe
    if (typeof load !== 'function' || typeof vote !== 'function') {
      throw new TypeError('EditorRenderer Poll dataSource must implement load() and vote()')
    }
    if (subscribe !== undefined && typeof subscribe !== 'function') {
      throw new TypeError('EditorRenderer Poll dataSource subscribe must be a function')
    }
    dataSource = {
      load: /** @type {any} */ (load).bind(dataSourceInput),
      vote: /** @type {any} */ (vote).bind(dataSourceInput),
      ...(typeof subscribe === 'function'
        ? { subscribe: /** @type {any} */ (subscribe).bind(dataSourceInput) }
        : {}),
    }
  }

  const onError = source.onError
  if (onError !== undefined && typeof onError !== 'function') {
    throw new TypeError('EditorRenderer Poll onError must be a function')
  }
  const compareRevisions = source.compareRevisions
  if (compareRevisions !== undefined && typeof compareRevisions !== 'function') {
    throw new TypeError('EditorRenderer Poll compareRevisions must be a function')
  }
  const maxVoters = source.maxVoters

  return {
    ...(dataSource ? { dataSource } : {}),
    ...(typeof onError === 'function' ? { onError: /** @type {any} */ (onError).bind(input) } : {}),
    ...(typeof compareRevisions === 'function'
      ? { compareRevisions: /** @type {any} */ (compareRevisions).bind(input) }
      : {}),
    ...(maxVoters !== undefined ? { maxVoters: /** @type {any} */ (maxVoters) } : {}),
  }
}

/** @param {unknown} input @returns {Record<string, unknown> | undefined} */
function snapshotBlockConfigs(input) {
  if (input === undefined) return undefined
  assertOptionalRecord(input, 'blockConfigs')
  const source = /** @type {Record<string, unknown>} */ (input)
  const snapshot = { ...source }
  if (Object.hasOwn(source, 'poll')) snapshot.poll = snapshotPollRendererConfig(snapshot.poll)
  return snapshot
}

/** @param {unknown} renderer @returns {import('./types').BlockRenderer} */
function snapshotCustomRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object' || Array.isArray(renderer)) {
    throw new TypeError('EditorRenderer custom renderer must be an object')
  }
  const candidate = /** @type {Record<string, unknown>} */ (renderer)
  const type = candidate.type
  if (typeof type !== 'string' || !type) {
    throw new TypeError('EditorRenderer custom renderer must have a non-empty string type')
  }
  const render = candidate.render
  if (typeof render !== 'function') {
    throw new TypeError(`EditorRenderer custom renderer "${type}" must implement render()`)
  }

  let styles
  const inputStyles = candidate.styles
  if (inputStyles !== undefined) {
    if (!Array.isArray(inputStyles)) {
      throw new TypeError(`EditorRenderer custom renderer "${type}" styles must be an array of strings`)
    }
    assertDenseArray(inputStyles, `custom renderer "${type}" styles`)
    styles = []
    for (let index = 0; index < inputStyles.length; index++) {
      const url = inputStyles[index]
      if (typeof url !== 'string') {
        throw new TypeError(`EditorRenderer custom renderer "${type}" styles must be an array of strings`)
      }
      styles.push(url)
    }
  }

  const destroy = candidate.destroy
  if (destroy !== undefined && typeof destroy !== 'function') {
    throw new TypeError(`EditorRenderer custom renderer "${type}" destroy must be a function`)
  }
  const mapTextFields = candidate.mapTextFields
  if (mapTextFields !== undefined && typeof mapTextFields !== 'function') {
    throw new TypeError(`EditorRenderer custom renderer "${type}" mapTextFields must be a function`)
  }

  return {
    type,
    render: /** @type {any} */ (render).bind(renderer),
    ...(styles ? { styles } : {}),
    ...(typeof destroy === 'function' ? { destroy: /** @type {any} */ (destroy).bind(renderer) } : {}),
    ...(typeof mapTextFields === 'function'
      ? { mapTextFields: /** @type {any} */ (mapTextFields).bind(renderer) }
      : {}),
  }
}

/** Public renderer with runtime validation matching RendererConfig declarations. */
export class EditorRenderer extends EditorRendererImpl {
  /** @param {import('./types').RendererConfig} [config] */
  constructor(config = {}) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new TypeError('EditorRenderer config must be an object')
    }
    const ownConfig = /** @type {import('./types').RendererConfig} */ ({ ...config })
    const inlinePluginTypes = validateRendererConfig(ownConfig)
    super(ownConfig, inlinePluginTypes)
  }

  /** @param {import('./types').BlockRenderer} renderer @returns {this} */
  registerRenderer(renderer) {
    const stable = snapshotCustomRenderer(renderer)
    return super.registerRenderer(stable, stable.type)
  }

  /** @param {import('./types').OutputBlockData} block */
  renderBlock(block) {
    const source = snapshotOutputBlockEnvelope(block)
    validateOutputBlock(source)
    return super.renderBlock(source)
  }

  /** @param {import('./types').OutputData} data */
  render(data) {
    return super.render(prepareOutputData(data))
  }

  /** @param {import('./types').OutputData} data @param {HTMLElement} container */
  renderTo(data, container) {
    return super.renderTo(prepareOutputData(data), container)
  }
}

/** @param {import('./types').RendererConfig} [config] */
export function createEditorRenderer(config) {
  return new EditorRenderer(config)
}

export { getSupportedBlockTypes }
