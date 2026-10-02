// @ts-check
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

function validateSchema(definition, label) {
  const schema = definition?.schema
  if (!schema || typeof schema.createDefault !== 'function' || typeof schema.encode !== 'function') {
    throw new TypeError(`${label} must provide a data schema`)
  }
  const initial = schema.createDefault()
  schema.encode(initial)
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

  /**
   * Create the v2 extension registry from immutable block and inline definitions.
   * @param {{
   *   ownerDocument: Document,
   *   blocks: import('../plugin-kit/types').BlockPluginDefinition[],
   *   inline?: import('../plugin-kit/types').InlinePluginDefinition[],
   *   defaultBlock?: string,
   *   placeholder?: string,
   *   acquireStyles?: boolean,
   *   translate?: (key: string, fallback?: string) => string,
   *   showPopup?: (anchor: HTMLElement, content: HTMLElement, cleanup?: () => void) => void,
   *   hidePopup?: () => void,
   * }} options
   */
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('ExtensionRegistry options must be an object')
    }
    const ownerDocument = options.ownerDocument
    if (!ownerDocument?.createElement) {
      throw new TypeError('ExtensionRegistry requires an ownerDocument')
    }
    assertDenseArray(options.blocks, 'blocks', { allowEmpty: false })
    const inline = options.inline ?? []
    assertDenseArray(inline, 'inline')

    this.#ownerDocument = ownerDocument
    this.#abortController = new (ownerDocument.defaultView?.AbortController ?? AbortController)()
    const acquireStyles = options.acquireStyles !== false
    const translate = typeof options.translate === 'function'
      ? options.translate
      : (_key, fallback = '') => fallback

    for (const definition of options.blocks) {
      validateType(definition?.type, 'Block definition')
      if (this.#blockDefinitions.has(definition.type)) {
        throw new Error(`Duplicate block definition type: ${definition.type}`)
      }
      validateSchema(definition, `Block definition "${definition.type}"`)
      this.#blockDefinitions.set(definition.type, definition)
    }

    const defaultBlock = options.defaultBlock
      ?? (this.#blockDefinitions.has('paragraph') ? 'paragraph' : options.blocks[0].type)
    if (!this.#blockDefinitions.has(defaultBlock)) {
      throw new Error(`Default block type is not registered: ${defaultBlock}`)
    }
    this.#defaultBlockType = defaultBlock

    for (const definition of inline) {
      validateType(definition?.type, 'Inline definition')
      if (this.#inlineDefinitions.has(definition.type)) {
        throw new Error(`Duplicate inline definition type: ${definition.type}`)
      }
      validateSchema(definition, `Inline definition "${definition.type}"`)
      const trigger = definition.trigger
      if (trigger !== undefined) {
        if (typeof trigger !== 'string' || [...trigger].length !== 1) {
          throw new TypeError(`Inline definition "${definition.type}" trigger must be exactly one Unicode code point`)
        }
        if (this.#inlineTriggers.has(trigger)) {
          throw new Error(`Duplicate inline trigger: ${trigger}`)
        }
        this.#inlineTriggers.set(trigger, definition)
      }
      this.#inlineDefinitions.set(definition.type, definition)
    }

    try {
      for (const definition of options.blocks) {
        const styles = acquireStyles ? [...(definition.styles ?? [])] : []
        if (styles.length) this.#resources.push(acquireStyleUrls(styles, ownerDocument))
        const runtime = definition.setup({
          ownerDocument,
          signal: this.#abortController.signal,
          isDefaultBlock: definition.type === defaultBlock,
          editorPlaceholder: definition.type === defaultBlock ? options.placeholder : undefined,
          t: (key, fallback = '') => translate(`plugin.${definition.type}.${key}`, fallback),
        })
        if (!runtime || typeof runtime.create !== 'function' || typeof runtime.destroy !== 'function') {
          throw new TypeError(`Block definition "${definition.type}" returned an invalid runtime`)
        }
        this.#blockRuntimes.set(definition.type, runtime)
      }

      for (const definition of inline) {
        const styles = [...(definition.styles ?? [])]
        if (styles.length) this.#resources.push(acquireStyleUrls(styles, ownerDocument))
        const runtime = definition.setup({
          ownerDocument,
          signal: this.#abortController.signal,
          t: (key, fallback = '') => translate(`inline.${definition.type}.${key}`, fallback),
          showPopup: typeof options.showPopup === 'function' ? options.showPopup : () => {},
          hidePopup: typeof options.hidePopup === 'function' ? options.hidePopup : () => {},
        })
        if (!runtime || typeof runtime.create !== 'function' || typeof runtime.destroy !== 'function') {
          throw new TypeError(`Inline definition "${definition.type}" returned an invalid runtime`)
        }
        this.#inlineRuntimes.set(definition.type, runtime)
      }
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  get defaultBlockType() {
    return this.#defaultBlockType
  }

  get blockTypes() {
    return [...this.#blockDefinitions.keys()]
  }

  get inlineTypes() {
    return [...this.#inlineDefinitions.keys()]
  }

  getBlockDefinition(type) {
    return this.#blockDefinitions.get(type)
  }

  getBlockRuntime(type) {
    return this.#blockRuntimes.get(type)
  }

  getInlineDefinition(type) {
    return this.#inlineDefinitions.get(type)
  }

  getInlineRuntime(type) {
    return this.#inlineRuntimes.get(type)
  }

  getInlineByTrigger(trigger) {
    return this.#inlineTriggers.get(trigger)
  }

  hasBlock(type) {
    return this.#blockDefinitions.has(type)
  }

  hasInline(type) {
    return this.#inlineDefinitions.has(type)
  }

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
