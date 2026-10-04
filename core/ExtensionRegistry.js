// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'

function assertDenseArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be a dense ${allowEmpty ? '' : 'non-empty '}array`)
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${label} must be a dense ${allowEmpty ? '' : 'non-empty '}array`)
    }
  }
}

function validateType(type, label) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new TypeError(`${label} type must be a non-empty string`)
  }
}

function ownObject(value, label) {
  const owned = cloneEditorData(value)
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) {
    throw new TypeError(`${label} must be a JSON object`)
  }
  return owned
}

function bindMethod(receiver, method, label, { optional = false } = {}) {
  if (method === undefined && optional) return undefined
  if (typeof method !== 'function') throw new TypeError(`${label} must be a function`)
  return (...args) => Reflect.apply(method, receiver, args)
}

function snapshotLabel(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`)
  }
  const value = { ...input }
  if (typeof value.key !== 'string' || !value.key || typeof value.fallback !== 'string') {
    throw new TypeError(`${label} must contain key and fallback strings`)
  }
  return Object.freeze({ key: value.key, fallback: value.fallback })
}

function snapshotSchema(source, label, { richText = false } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} must provide a current exact-version data schema`)
  }
  if (Object.hasOwn(source, 'legacyVersion') || Object.hasOwn(source, 'migrations')) {
    throw new TypeError(`${label} schema contains removed compatibility members`)
  }
  const currentVersion = source.currentVersion
  const createDefault = bindMethod(source, source.createDefault, `${label} schema createDefault`)
  const decode = bindMethod(source, source.decode, `${label} schema decode`)
  const encode = bindMethod(source, source.encode, `${label} schema encode`)
  const mapRichText = richText
    ? bindMethod(source, source.mapRichText, `${label} schema mapRichText`, { optional: true })
    : undefined

  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new TypeError(`${label} schema currentVersion must be a positive safe integer`)
  }

  const schema = {
    currentVersion,

    createDefault() {
      return ownObject(createDefault(), `${label} schema default`)
    },

    decode(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError(`${label} schema decode input must be an object`)
      }
      const candidate = { ...input }
      if (candidate.dataVersion !== currentVersion) {
        throw new RangeError(
          `Unsupported ${label} data version ${String(candidate.dataVersion)}; current version is ${currentVersion}`,
        )
      }
      const result = decode({
        dataVersion: currentVersion,
        data: cloneEditorData(candidate.data),
      })
      if (!result || typeof result !== 'object' || Array.isArray(result)
          || result.dataVersion !== currentVersion) {
        throw new TypeError(`${label} schema decode() must preserve currentVersion`)
      }
      return {
        dataVersion: currentVersion,
        data: ownObject(result.data, `${label} schema decoded data`),
      }
    },

    encode(data) {
      const result = encode(ownObject(data, `${label} schema local data`))
      if (!result || typeof result !== 'object' || Array.isArray(result)
          || result.dataVersion !== currentVersion) {
        throw new TypeError(`${label} schema encode() must emit currentVersion`)
      }
      return {
        dataVersion: currentVersion,
        data: ownObject(result.data, `${label} schema encoded data`),
      }
    },
  }

  if (mapRichText) {
    schema.mapRichText = (data, transform) => {
      if (typeof transform !== 'function') throw new TypeError('Rich-text transform must be a function')
      return ownObject(
        mapRichText(ownObject(data, `${label} rich-text data`), transform),
        `${label} rich-text result`,
      )
    }
  }

  const initial = schema.createDefault()
  const encoded = schema.encode(initial)
  const decoded = schema.decode(encoded)
  if (JSON.stringify(decoded.data) !== JSON.stringify(encoded.data)) {
    throw new TypeError(`${label} default must round-trip through encode/decode`)
  }

  return Object.freeze(schema)
}

function snapshotFormatting(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} formatting capability must be an object`)
  }
  const inlineTools = source.inlineTools
  if (inlineTools !== true) {
    assertDenseArray(inlineTools, `${label} formatting inlineTools`)
    for (const tool of inlineTools) {
      if (typeof tool !== 'string' || !tool) {
        throw new TypeError(`${label} formatting inlineTools must contain non-empty strings`)
      }
    }
  }
  return Object.freeze({
    inlineTools: inlineTools === true ? true : Object.freeze([...inlineTools]),
  })
}

function snapshotCapabilityObject(source, label, methods) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} capability must be an object`)
  }
  const result = {}
  for (const [name, optional] of methods) {
    const method = bindMethod(source, source[name], `${label} capability ${name}`, { optional })
    if (method) result[name] = method
  }
  return Object.freeze(result)
}

function snapshotPasteCapability(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} paste capability must be an object`)
  }
  return Object.freeze({
    accepts: bindMethod(source, source.accepts, `${label} paste accepts`),
    resolve: bindMethod(source, source.resolve, `${label} paste resolve`),
  })
}

function snapshotSettings(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} settings capability must be an object`)
  }
  const kind = source.kind
  if (kind === 'actions') {
    return Object.freeze({
      kind,
      actions: bindMethod(source, source.actions, `${label} settings actions`),
      apply: bindMethod(source, source.apply, `${label} settings apply`),
    })
  }
  if (kind === 'panel') {
    return Object.freeze({
      kind,
      render: bindMethod(source, source.render, `${label} settings render`),
    })
  }
  throw new TypeError(`${label} settings kind must be actions or panel`)
}

function snapshotCapabilities(source, label) {
  if (source === undefined) return undefined
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} capabilities must be an object`)
  }
  const candidate = { ...source }
  const result = {}
  if (candidate.empty !== undefined) {
    result.empty = snapshotCapabilityObject(candidate.empty, `${label} empty`, [['isEmpty', false]])
  }
  if (candidate.formatting !== undefined) result.formatting = snapshotFormatting(candidate.formatting, label)
  if (candidate.merge !== undefined) {
    result.merge = snapshotCapabilityObject(candidate.merge, `${label} merge`, [['merge', false]])
  }
  if (candidate.conversion !== undefined) {
    result.conversion = snapshotCapabilityObject(candidate.conversion, `${label} conversion`, [
      ['export', false], ['canImport', false], ['import', false],
    ])
  }
  if (candidate.htmlImport !== undefined) {
    result.htmlImport = snapshotCapabilityObject(candidate.htmlImport, `${label} htmlImport`, [
      ['matchesRoot', false], ['importRoot', false],
    ])
  }
  if (candidate.clipboard !== undefined) {
    result.clipboard = snapshotCapabilityObject(
      candidate.clipboard, `${label} clipboard`, [['slice', false]],
    )
  }
  if (candidate.selectionSlice !== undefined) {
    result.selectionSlice = snapshotCapabilityObject(
      candidate.selectionSlice, `${label} selectionSlice`, [['slice', false]],
    )
  }
  if (candidate.inlineControls !== undefined) {
    result.inlineControls = snapshotSettings(candidate.inlineControls, `${label} inlineControls`)
  }
  if (candidate.settings !== undefined) result.settings = snapshotSettings(candidate.settings, label)
  if (candidate.paste !== undefined) result.paste = snapshotPasteCapability(candidate.paste, label)
  if (candidate.shortcuts !== undefined) {
    result.shortcuts = snapshotCapabilityObject(candidate.shortcuts, `${label} shortcuts`, [['handle', false]])
  }
  return Object.freeze(result)
}

function snapshotToolbox(source, label) {
  if (source === undefined) return undefined
  assertDenseArray(source, `${label} toolbox`)
  const ids = new Set()
  return Object.freeze(source.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`${label} toolbox[${index}] must be an object`)
    }
    const candidate = { ...item }
    if (typeof candidate.id !== 'string' || !candidate.id || ids.has(candidate.id)) {
      throw new TypeError(`${label} toolbox item id must be unique and non-empty`)
    }
    ids.add(candidate.id)
    if (typeof candidate.icon !== 'string') {
      throw new TypeError(`${label} toolbox item icon must be a string`)
    }
    const result = {
      id: candidate.id,
      label: snapshotLabel(candidate.label, `${label} toolbox item label`),
      icon: candidate.icon,
    }
    const configure = bindMethod(item, candidate.configure, `${label} toolbox configure`, { optional: true })
    if (configure) result.configure = configure
    return Object.freeze(result)
  }))
}

function snapshotBlockDefinition(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('Block definition must be an object')
  }
  const candidate = { ...source }
  validateType(candidate.type, 'Block definition')
  if (typeof candidate.icon !== 'string') throw new TypeError(`Block definition "${candidate.type}" icon must be a string`)
  const styles = candidate.styles ?? []
  assertDenseArray(styles, `Block definition "${candidate.type}" styles`)
  for (const url of styles) {
    if (typeof url !== 'string') throw new TypeError(`Block definition "${candidate.type}" styles must be strings`)
  }
  return Object.freeze({
    type: candidate.type,
    label: snapshotLabel(candidate.label, `Block definition "${candidate.type}" label`),
    icon: candidate.icon,
    styles: Object.freeze([...styles]),
    schema: snapshotSchema(candidate.schema, `Block definition "${candidate.type}"`, { richText: true }),
    ...(candidate.toolbox === undefined ? {} : { toolbox: snapshotToolbox(candidate.toolbox, `Block definition "${candidate.type}"`) }),
    ...(candidate.capabilities === undefined ? {} : { capabilities: snapshotCapabilities(candidate.capabilities, `Block definition "${candidate.type}"`) }),
    setup: bindMethod(source, candidate.setup, `Block definition "${candidate.type}" setup`),
  })
}

function snapshotInlineDefinition(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('Inline definition must be an object')
  }
  const candidate = { ...source }
  validateType(candidate.type, 'Inline definition')
  if (typeof candidate.icon !== 'string') throw new TypeError(`Inline definition "${candidate.type}" icon must be a string`)
  const styles = candidate.styles ?? []
  assertDenseArray(styles, `Inline definition "${candidate.type}" styles`)
  for (const url of styles) {
    if (typeof url !== 'string') throw new TypeError(`Inline definition "${candidate.type}" styles must be strings`)
  }

  let trigger
  if (candidate.trigger !== undefined) {
    if (typeof candidate.trigger !== 'string' || [...candidate.trigger].length !== 1) {
      throw new TypeError(`Inline definition "${candidate.type}" trigger must be exactly one Unicode code point`)
    }
    trigger = candidate.trigger
  }

  let paste
  if (candidate.paste !== undefined) {
    if (!candidate.paste || typeof candidate.paste !== 'object' || Array.isArray(candidate.paste)) {
      throw new TypeError(`Inline definition "${candidate.type}" paste must be an object`)
    }
    const patterns = candidate.paste.patterns
    assertDenseArray(patterns, `Inline definition "${candidate.type}" paste patterns`)
    const ownedPatterns = patterns.map(pattern => {
      if (!(pattern instanceof RegExp)) throw new TypeError('Inline paste patterns must be RegExp values')
      return new RegExp(pattern.source, pattern.flags)
    })
    paste = Object.freeze({
      patterns: Object.freeze(ownedPatterns),
      fromMatch: bindMethod(candidate.paste, candidate.paste.fromMatch, `Inline definition "${candidate.type}" paste fromMatch`),
    })
  }

  let editing
  if (candidate.editing !== undefined) {
    editing = snapshotCapabilityObject(
      candidate.editing, `Inline definition "${candidate.type}" editing`, [['handle', false]],
    )
  }

  let insertion
  if (candidate.insertion !== undefined) {
    insertion = snapshotCapabilityObject(
      candidate.insertion, `Inline definition "${candidate.type}" insertion`, [['createInitial', false]],
    )
  }

  return Object.freeze({
    type: candidate.type,
    label: snapshotLabel(candidate.label, `Inline definition "${candidate.type}" label`),
    icon: candidate.icon,
    styles: Object.freeze([...styles]),
    schema: snapshotSchema(candidate.schema, `Inline definition "${candidate.type}"`),
    ...(trigger === undefined ? {} : { trigger }),
    ...(paste ? { paste } : {}),
    ...(editing ? { editing } : {}),
    ...(insertion ? { insertion } : {}),
    setup: bindMethod(source, candidate.setup, `Inline definition "${candidate.type}" setup`),
  })
}

function snapshotBlockRuntime(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  const create = bindMethod(source, source.create, `${label} runtime create`)
  const destroy = bindMethod(source, source.destroy, `${label} runtime destroy`)
  return Object.freeze({ create, destroy })
}

function snapshotInlineRuntime(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  const runtime = {
    create: bindMethod(source, source.create, `${label} runtime create`),
    destroy: bindMethod(source, source.destroy, `${label} runtime destroy`),
  }
  for (const name of ['onTriggerQuery', 'onTriggerKeydown', 'onTriggerCancel']) {
    const method = bindMethod(source, source[name], `${label} runtime ${name}`, { optional: true })
    if (method) runtime[name] = method
  }
  return Object.freeze(runtime)
}

export class ExtensionRegistry {
  #ownerDocument
  #abortController
  #blockDefinitions = new Map()
  #blockRuntimes = new Map()
  #inlineDefinitions = new Map()
  #inlineRuntimes = new Map()
  #inlineTriggers = new Map()
  #resources = []
  #destroyed = false
  #defaultBlockType

  constructor(options) {
    if (!options || typeof options !== 'object') throw new TypeError('ExtensionRegistry options must be an object')
    const ownerDocument = options.ownerDocument
    if (!ownerDocument?.createElement) throw new TypeError('ExtensionRegistry requires an ownerDocument')
    assertDenseArray(options.blocks, 'blocks', { allowEmpty: false })
    const inline = options.inline ?? []
    assertDenseArray(inline, 'inline')

    this.#ownerDocument = ownerDocument
    this.#abortController = new (ownerDocument.defaultView?.AbortController ?? AbortController)()
    const acquireStyles = options.acquireStyles !== false
    const translate = typeof options.translate === 'function'
      ? options.translate
      : (_key, fallback = '') => fallback

    const blocks = options.blocks.map(snapshotBlockDefinition)
    const inlines = inline.map(snapshotInlineDefinition)

    for (const definition of blocks) {
      if (this.#blockDefinitions.has(definition.type)) {
        throw new Error(`Duplicate block definition type: ${definition.type}`)
      }
      this.#blockDefinitions.set(definition.type, definition)
    }

    const defaultBlock = options.defaultBlock
      ?? (this.#blockDefinitions.has('paragraph') ? 'paragraph' : blocks[0].type)
    if (!this.#blockDefinitions.has(defaultBlock)) {
      throw new Error(`Default block type is not registered: ${defaultBlock}`)
    }
    this.#defaultBlockType = defaultBlock

    for (const definition of inlines) {
      if (this.#inlineDefinitions.has(definition.type)) {
        throw new Error(`Duplicate inline definition type: ${definition.type}`)
      }
      if (definition.trigger !== undefined) {
        if (this.#inlineTriggers.has(definition.trigger)) throw new Error(`Duplicate inline trigger: ${definition.trigger}`)
        this.#inlineTriggers.set(definition.trigger, definition)
      }
      this.#inlineDefinitions.set(definition.type, definition)
    }

    try {
      for (const definition of blocks) {
        if (acquireStyles && definition.styles.length) {
          const resource = acquireStyleUrls(definition.styles, ownerDocument)
          this.#resources.push(resource)
        }
        let runtimeSource
        try {
          runtimeSource = definition.setup({
            ownerDocument,
            signal: this.#abortController.signal,
            isDefaultBlock: definition.type === defaultBlock,
            editorPlaceholder: definition.type === defaultBlock ? options.placeholder : undefined,
            t: (key, fallback = '', params = undefined) => translate(`plugin.${definition.type}.${key}`, fallback, params),
          })
          const runtime = snapshotBlockRuntime(runtimeSource, `Block definition "${definition.type}"`)
          this.#blockRuntimes.set(definition.type, runtime)
        } catch (error) {
          try { runtimeSource?.destroy?.() } catch {}
          throw error
        }
      }

      for (const definition of inlines) {
        if (acquireStyles && definition.styles.length) {
          const resource = acquireStyleUrls(definition.styles, ownerDocument)
          this.#resources.push(resource)
        }
        let runtimeSource
        try {
          runtimeSource = definition.setup({
            ownerDocument,
            signal: this.#abortController.signal,
            t: (key, fallback = '', params = undefined) => translate(`inlinePlugin.${definition.type}.${key}`, fallback, params),
            showPopup: typeof options.showPopup === 'function' ? options.showPopup : () => {},
            hidePopup: typeof options.hidePopup === 'function' ? options.hidePopup : () => {},
          })
          const runtime = snapshotInlineRuntime(runtimeSource, `Inline definition "${definition.type}"`)
          this.#inlineRuntimes.set(definition.type, runtime)
        } catch (error) {
          try { runtimeSource?.destroy?.() } catch {}
          throw error
        }
      }
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  get defaultBlockType() { return this.#defaultBlockType }
  get blockTypes() { return [...this.#blockDefinitions.keys()] }
  get inlineTypes() { return [...this.#inlineDefinitions.keys()] }
  getBlockDefinition(type) { return this.#blockDefinitions.get(type) }
  getBlockRuntime(type) { return this.#blockRuntimes.get(type) }
  getInlineDefinition(type) { return this.#inlineDefinitions.get(type) }
  getInlineRuntime(type) { return this.#inlineRuntimes.get(type) }
  getInlineByTrigger(trigger) { return this.#inlineTriggers.get(trigger) }
  hasBlock(type) { return this.#blockDefinitions.has(type) }
  hasInline(type) { return this.#inlineDefinitions.has(type) }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#abortController.abort()

    for (const runtime of [...this.#inlineRuntimes.values()].reverse()) {
      try { runtime.destroy() } catch {}
    }
    this.#inlineRuntimes.clear()

    for (const runtime of [...this.#blockRuntimes.values()].reverse()) {
      try { runtime.destroy() } catch {}
    }
    this.#blockRuntimes.clear()

    for (let index = this.#resources.length - 1; index >= 0; index--) {
      try { this.#resources[index]?.destroy() } catch {}
    }
    this.#resources = []
  }
}
