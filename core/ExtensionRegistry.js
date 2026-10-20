// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { snapshotDataSchema as snapshotSchema } from '../shared/snapshotDataSchema.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'
import { captureInstanceDestroy } from './instanceMethods.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { invokeObserver } from '../shared/invokeObserver.js'

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

/** Read validated dense arrays by index; never invoke an extension's map or iterator.
 * @template T,U
 * @param {readonly T[]} array
 * @param {(item:T,index:number)=>U} mapper
 * @returns {U[]}
 */
function mapDenseArray(array, mapper) {
  const result = []
  for (let index = 0; index < array.length; index++) {
    result.push(mapper(array[index], index))
  }
  return result
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

function bindMethod(receiver, method, label, { optional = false, synchronous = true } = {}) {
  if (method === undefined && optional) return undefined
  if (typeof method !== 'function') throw new TypeError(`${label} must be a function`)
  return (...args) => {
    const result = Reflect.apply(method, receiver, args)
    return synchronous ? synchronousResult(result) : result
  }
}

function snapshotLabel(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`)
  }
  // Only the declared label fields are part of the schema. Spreading an
  // extension object invokes unrelated getters during registration.
  const key = input.key
  const fallback = input.fallback
  if (typeof key !== 'string' || !key || typeof fallback !== 'string') {
    throw new TypeError(`${label} must contain key and fallback strings`)
  }
  return Object.freeze({ key, fallback })
}

function snapshotFormatting(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} formatting capability must be an object`)
  }
  const inlineTools = source.inlineTools
  if (inlineTools !== true) assertDenseArray(inlineTools, `${label} formatting inlineTools`)
  const ownedTools = inlineTools === true ? true : Object.freeze(mapDenseArray(inlineTools, tool => {
    if (typeof tool !== 'string' || !tool) {
      throw new TypeError(`${label} formatting inlineTools must contain non-empty strings`)
    }
    return tool
  }))
  return Object.freeze({ inlineTools: ownedTools })
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

function snapshotConversion(source, label) {
  const methods = snapshotCapabilityObject(source, label, [
    ['export', false], ['canImport', false], ['import', false], ['joinSelection', true],
  ])
  const declaredMode = source.selectionMode
  const selectionMode = declaredMode === undefined ? 'single' : declaredMode
  if (selectionMode !== 'single' && selectionMode !== 'per-block') {
    throw new TypeError(label + ' selectionMode must be single or per-block')
  }
  return Object.freeze({ ...methods, selectionMode })
}

function snapshotPasteCapability(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} paste capability must be an object`)
  }
  return Object.freeze({
    accepts: bindMethod(source, source.accepts, `${label} paste accepts`),
    resolve: bindMethod(source, source.resolve, `${label} paste resolve`, { synchronous: false }),
  })
}

function snapshotSettings(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} settings capability must be an object`)
  }
  const kind = source.kind
  if (kind === 'actions') {
    // Getters on extension descriptors can be stateful. Snapshot the optional
    // label once, exactly like the captured actions/apply method references.
    const settingsLabel = source.label
    return Object.freeze({
      kind,
      ...(settingsLabel === undefined ? {} : { label: snapshotLabel(settingsLabel, `${label} settings label`) }),
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
  // Capture recognized capabilities once, without reading unknown properties
  // or depending on an extension-owned iterator or spread behavior.
  const candidate = {
    empty: source.empty,
    formatting: source.formatting,
    merge: source.merge,
    conversion: source.conversion,
    htmlImport: source.htmlImport,
    clipboard: source.clipboard,
    selectionSlice: source.selectionSlice,
    inlineControls: source.inlineControls,
    settings: source.settings,
    paste: source.paste,
    shortcuts: source.shortcuts,
  }
  const result = {}
  if (candidate.empty !== undefined) {
    result.empty = snapshotCapabilityObject(candidate.empty, `${label} empty`, [['isEmpty', false]])
  }
  if (candidate.formatting !== undefined) result.formatting = snapshotFormatting(candidate.formatting, label)
  if (candidate.merge !== undefined) {
    result.merge = snapshotCapabilityObject(candidate.merge, `${label} merge`, [['merge', false]])
  }
  if (candidate.conversion !== undefined) {
    result.conversion = snapshotConversion(candidate.conversion, label + ' conversion')
  }
  if (candidate.htmlImport !== undefined) {
    const importCapability=candidate.htmlImport
    const inlineWhenSingleRoot=importCapability.inlineWhenSingleRoot
    if(inlineWhenSingleRoot!==undefined&&typeof inlineWhenSingleRoot!=='boolean'){
      throw new TypeError(`${label} htmlImport inlineWhenSingleRoot must be a boolean`)
    }
    result.htmlImport=Object.freeze({
      ...snapshotCapabilityObject(importCapability,`${label} htmlImport`,[
        ['matchesRoot',false],['importRoot',false],
      ]),
      inlineWhenSingleRoot:inlineWhenSingleRoot===true,
    })
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
  return Object.freeze(mapDenseArray(source, (item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`${label} toolbox[${index}] must be an object`)
    }
    const candidate = {
      id: item.id,
      label: item.label,
      icon: item.icon,
      configure: item.configure,
    }
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
  const candidate = {
    type: source.type,
    label: source.label,
    icon: source.icon,
    styles: source.styles,
    schema: source.schema,
    toolbox: source.toolbox,
    capabilities: source.capabilities,
    setup: source.setup,
  }
  validateType(candidate.type, 'Block definition')
  if (typeof candidate.icon !== 'string') throw new TypeError(`Block definition "${candidate.type}" icon must be a string`)
  const styles = candidate.styles ?? []
  assertDenseArray(styles, `Block definition "${candidate.type}" styles`)
  const ownedStyles = mapDenseArray(styles, url => {
    if (typeof url !== 'string') throw new TypeError(`Block definition "${candidate.type}" styles must be strings`)
    return url
  })
  return Object.freeze({
    type: candidate.type,
    label: snapshotLabel(candidate.label, `Block definition "${candidate.type}" label`),
    icon: candidate.icon,
    styles: Object.freeze(ownedStyles),
    schema: snapshotSchema(candidate.schema, `Block definition "${candidate.type}"`, { richText: true }),
    ...(candidate.toolbox === undefined ? {} : { toolbox: snapshotToolbox(candidate.toolbox, `Block definition "${candidate.type}"`) }),
    ...(candidate.capabilities === undefined ? {} : { capabilities: snapshotCapabilities(candidate.capabilities, `Block definition "${candidate.type}"`) }),
    setup: bindMethod(source, candidate.setup, `Block definition "${candidate.type}" setup`, { synchronous: false }),
  })
}

function snapshotInlineDefinition(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('Inline definition must be an object')
  }
  const candidate = {
    type: source.type,
    label: source.label,
    icon: source.icon,
    styles: source.styles,
    schema: source.schema,
    trigger: source.trigger,
    paste: source.paste,
    editing: source.editing,
    insertion: source.insertion,
    setup: source.setup,
  }
  validateType(candidate.type, 'Inline definition')
  if (typeof candidate.icon !== 'string') throw new TypeError(`Inline definition "${candidate.type}" icon must be a string`)
  const styles = candidate.styles ?? []
  assertDenseArray(styles, `Inline definition "${candidate.type}" styles`)
  const ownedStyles = mapDenseArray(styles, url => {
    if (typeof url !== 'string') throw new TypeError(`Inline definition "${candidate.type}" styles must be strings`)
    return url
  })

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
    const ownedPatterns = mapDenseArray(patterns, pattern => {
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
      candidate.editing, `Inline definition "${candidate.type}" editing`,
      [['handle', false], ['reconcileNative', true]],
    )
  }

  let insertion
  if (candidate.insertion !== undefined) {
    insertion = snapshotCapabilityObject(
      candidate.insertion, `Inline definition "${candidate.type}" insertion`, [['createInitial', false]],
    )
    const trailingText = candidate.insertion.trailingText
    if (trailingText !== undefined) {
      if (typeof trailingText !== 'string' || /[\r\n]/.test(trailingText)) throw new TypeError('Inline insertion trailing text must be a single-line string')
      insertion = Object.freeze({ ...insertion, trailingText })
    }
  }

  return Object.freeze({
    type: candidate.type,
    label: snapshotLabel(candidate.label, `Inline definition "${candidate.type}" label`),
    icon: candidate.icon,
    styles: Object.freeze(ownedStyles),
    schema: snapshotSchema(candidate.schema, `Inline definition "${candidate.type}"`),
    ...(trigger === undefined ? {} : { trigger }),
    ...(paste ? { paste } : {}),
    ...(editing ? { editing } : {}),
    ...(insertion ? { insertion } : {}),
    setup: bindMethod(source, candidate.setup, `Inline definition "${candidate.type}" setup`, { synchronous: false }),
  })
}

function snapshotBlockRuntime(source, label, destroySource, assertActive) {
  synchronousResult(source)
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  const create = bindMethod(source, source.create, `${label} runtime create`)
  if (!destroySource) throw new TypeError(`${label} runtime destroy must be a function`)
  let retired = false
  const ensureActive = () => {
    assertActive()
    if (retired) throw new Error('Extension runtime is destroyed')
  }
  return Object.freeze({
    create: (...args) => { ensureActive(); return create(...args) },
    destroy: () => {
      if (retired) return
      // Revoke retained producers *before* invoking plugin cleanup, including
      // during a reentrant destroy or one that throws an exception.
      retired = true
      destroySource()
    },
  })
}

function snapshotInlineRuntime(source, label, destroySource, assertActive) {
  synchronousResult(source)
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  if (!destroySource) throw new TypeError(`${label} runtime destroy must be a function`)
  const create = bindMethod(source, source.create, `${label} runtime create`)
  let retired = false
  const ensureActive = () => {
    assertActive()
    if (retired) throw new Error('Extension runtime is destroyed')
  }
  const runtime = {
    create: (...args) => {
      ensureActive()
      return create(...args)
    },
    destroy: () => {
      if (retired) return
      retired = true
      destroySource()
    },
  }
  for (const name of ['onTriggerQuery', 'onTriggerKeydown', 'onTriggerCancel']) {
    const method = bindMethod(source, source[name], `${label} runtime ${name}`, { optional: true })
    if (method) runtime[name] = (...args) => { ensureActive(); return method(...args) }
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
    const acquireStyles = options.acquireStyles !== false
    const translate = typeof options.translate === 'function'
      ? options.translate
      : (_key, fallback = '') => fallback
    // Inline plugins retain their setup context. Snapshot the host callback
    // rather than consulting mutable editor options on every future popup.
    const suppliedShowPopup = inline.length ? options.showPopup : undefined
    const showPopupHost = typeof suppliedShowPopup === 'function' ? suppliedShowPopup : undefined

    const blocks = mapDenseArray(options.blocks, snapshotBlockDefinition)
    const inlines = mapDenseArray(inline, snapshotInlineDefinition)

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

    // Snapshot and validate *all* definitions before allocating an
    // owner-document controller. A custom realm constructor may reenter
    // application code and mutate the caller's block/inline arrays; at this
    // point the registry already owns its independent definitions.
    this.#abortController = new (ownerDocument.defaultView?.AbortController ?? AbortController)()

    const assertActive = () => {
      if (this.#destroyed) throw new Error('Extension registry is destroyed')
    }

    try {
      for (const definition of blocks) {
        if (acquireStyles && definition.styles.length) {
          const resource = acquireStyleUrls(definition.styles, ownerDocument)
          this.#resources.push(resource)
        }
        let destroySource
        try {
          const runtimeSource = definition.setup({
            ownerDocument,
            signal: this.#abortController.signal,
            isDefaultBlock: definition.type === defaultBlock,
            editorPlaceholder: definition.type === defaultBlock ? options.placeholder : undefined,
            t: (key, fallback = '', params = undefined) => translate(`plugin.${definition.type}.${key}`, fallback, params),
          })
          destroySource = captureInstanceDestroy(runtimeSource)
          const runtime = snapshotBlockRuntime(runtimeSource, `Block definition "${definition.type}"`, destroySource, assertActive)
          this.#blockRuntimes.set(definition.type, runtime)
        } catch (error) {
          try { destroySource?.() } catch {}
          throw error
        }
      }

      for (const definition of inlines) {
        if (acquireStyles && definition.styles.length) {
          const resource = acquireStyleUrls(definition.styles, ownerDocument)
          this.#resources.push(resource)
        }
        let destroySource
        const popupOwner=Object.freeze({})
        try {
          const runtimeSource = definition.setup({
            ownerDocument,
            signal: this.#abortController.signal,
            t: (key, fallback = '', params = undefined) => translate(`inlinePlugin.${definition.type}.${key}`, fallback, params),
            showPopup: (anchor, content, cleanup) => {
              // A saved plugin context must not mount another popup after its
              // registry has been retired. Declining the presentation still
              // releases the caller's provisional resource exactly once.
              if (!this.#destroyed && showPopupHost) {
                return Reflect.apply(showPopupHost, options, [popupOwner, anchor, content, cleanup])
              }
              invokeObserver(cleanup)
              return Object.freeze({ close() {} })
            },
          })
          destroySource = captureInstanceDestroy(runtimeSource)
          const runtime = snapshotInlineRuntime(runtimeSource, `Inline definition "${definition.type}"`, destroySource, assertActive)
          this.#inlineRuntimes.set(definition.type, runtime)
        } catch (error) {
          try { destroySource?.() } catch {}
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
    // The owning document may supply a custom AbortController whose abort()
    // throws synchronously. Cleanup must still release every registered
    // runtime and stylesheet; one failed disposer cannot retain the editor.
    try { this.#abortController.abort() } catch {}

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
