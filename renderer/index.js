// @ts-check
import { EditorRenderer as EditorRendererImpl, getSupportedBlockTypes } from './EditorRenderer.js'

/** @param {unknown} value @param {string} label */
function assertOptionalRecord(value, label) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new TypeError(`EditorRenderer ${label} must be an object`)
  }
}

/** @param {import('./types').RendererConfig} config */
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
    const supported = new Set(getSupportedBlockTypes())
    for (const type of config.blockTypes) {
      if (typeof type !== 'string' || !supported.has(type)) {
        throw new TypeError(`EditorRenderer unknown block type: ${String(type)}`)
      }
    }
  }
  assertOptionalRecord(config.blockConfigs, 'blockConfigs')
  if (config.inlinePlugins !== undefined) {
    if (!Array.isArray(config.inlinePlugins)) {
      throw new TypeError('EditorRenderer inlinePlugins must be an array')
    }
    const types = new Set()
    for (const plugin of config.inlinePlugins) {
      if (!plugin || typeof plugin !== 'object' || typeof plugin.type !== 'string' || !plugin.type) {
        throw new TypeError('EditorRenderer inline plugin must have a non-empty string type')
      }
      if (typeof plugin.createWidget !== 'function' || typeof plugin.getData !== 'function') {
        throw new TypeError(`EditorRenderer inline plugin "${plugin.type}" must implement createWidget() and getData()`)
      }
      if (types.has(plugin.type)) throw new Error(`Duplicate renderer inline plugin type: "${plugin.type}"`)
      types.add(plugin.type)
    }
  }
}

/** @param {unknown} block */
function validateOutputBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError('EditorRenderer block must be an object')
  }
  const candidate = /** @type {Record<string, unknown>} */ (block)
  if (typeof candidate.type !== 'string' || !candidate.type) {
    throw new TypeError('EditorRenderer block type must be a non-empty string')
  }
  if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    throw new TypeError('EditorRenderer block data must be an object')
  }
  if (candidate.id !== undefined && typeof candidate.id !== 'string') {
    throw new TypeError('EditorRenderer block id must be a string')
  }
  if (candidate.revision !== undefined && typeof candidate.revision !== 'string' && typeof candidate.revision !== 'number') {
    throw new TypeError('EditorRenderer block revision must be a string or number')
  }
  assertOptionalRecord(candidate.tunes, 'block tunes')
  assertOptionalRecord(candidate.inline, 'block inline data')
}

/** @param {unknown} data */
function validateOutputData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('EditorRenderer data must be an object')
  }
  const candidate = /** @type {Record<string, unknown>} */ (data)
  if (!Array.isArray(candidate.blocks)) {
    throw new TypeError('EditorRenderer blocks must be an array')
  }
  for (const block of candidate.blocks) validateOutputBlock(block)
}

/** @param {unknown} renderer */
function validateCustomRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object' || Array.isArray(renderer)) {
    throw new TypeError('EditorRenderer custom renderer must be an object')
  }
  const candidate = /** @type {Record<string, unknown>} */ (renderer)
  if (typeof candidate.type !== 'string' || !candidate.type) {
    throw new TypeError('EditorRenderer custom renderer must have a non-empty string type')
  }
  if (typeof candidate.render !== 'function') {
    throw new TypeError(`EditorRenderer custom renderer "${candidate.type}" must implement render()`)
  }
  if (candidate.styles !== undefined && (!Array.isArray(candidate.styles) || candidate.styles.some(url => typeof url !== 'string'))) {
    throw new TypeError(`EditorRenderer custom renderer "${candidate.type}" styles must be an array of strings`)
  }
  for (const method of ['destroy', 'mapTextFields']) {
    if (candidate[method] !== undefined && typeof candidate[method] !== 'function') {
      throw new TypeError(`EditorRenderer custom renderer "${candidate.type}" ${method} must be a function`)
    }
  }
}

/** Public renderer with runtime validation matching RendererConfig declarations. */
export class EditorRenderer extends EditorRendererImpl {
  /** @param {import('./types').RendererConfig} [config] */
  constructor(config = {}) {
    validateRendererConfig(config)
    super(config)
  }

  /** @param {import('./types').BlockRenderer} renderer @returns {this} */
  registerRenderer(renderer) {
    validateCustomRenderer(renderer)
    return super.registerRenderer(renderer)
  }

  /** @param {import('./types').OutputBlockData} block */
  renderBlock(block) {
    validateOutputBlock(block)
    return super.renderBlock(block)
  }

  /** @param {import('./types').OutputData} data */
  render(data) {
    validateOutputData(data)
    return super.render(data)
  }

  /** @param {import('./types').OutputData} data @param {HTMLElement} container */
  renderTo(data, container) {
    validateOutputData(data)
    return super.renderTo(data, container)
  }
}

/** @param {import('./types').RendererConfig} [config] */
export function createEditorRenderer(config) {
  return new EditorRenderer(config)
}

export { getSupportedBlockTypes }
