// @ts-check
import { InvalidBlockDataError, UnknownBlockTypeError } from './errors.js'
import { createInlineParser } from './inline.js'
import { createDefaultRenderers, getSupportedBlockTypes } from './renderers/index.js'
import { resolvePath } from '../shared/resolvePath.js'
import { deserializeInlineHtml } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import defaultLocale from './locale/en.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'
import { validateKnownBlockData } from '../shared/blockDataValidators.js'
import { normalizeKnownBlockData } from '../shared/blockDataNormalizers.js'
import { normalizeTextAlign } from '../shared/textFormat.js'

const baseCssUrl = resolvePath('./styles/base.css', import.meta.url)

/**
 * Renders Rector document blocks to DOM elements.
 */
export class EditorRenderer {
  /** @type {{ classPrefix: string, throwOnUnknown: boolean, theme: 'dark' | 'light', validationMode: 'preserve' | 'strict', onValidationError?: (issue: { blockId?: string, type: string }) => void }} */
  #config
  /** @type {Map<string, import('./types').BlockRenderer>} */
  #renderers
  /** @type {Map<string, import('./types').InlinePluginLike>} */
  #inlinePlugins
  /** @type {Map<HTMLElement, { wrapper: HTMLElement, blocks: Map<string, { element: HTMLElement, type: string, signature: string, renderer?: import('./types').BlockRenderer }> }>} */
  #mountedContainers = new Map()

  /** Results returned by render(); keyed by their document wrapper. */
  /** @type {Map<HTMLElement, Array<{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>>} */
  #detachedDocuments = new Map()

  /** Results returned directly by renderBlock(). */
  /** @type {Map<HTMLElement, { element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>} */
  #detachedBlocks = new Map()

  /** @type {Map<string, number>} */
  #rendererRevisions = new Map()

  /** Built-in types use the same neutral validators as their editor plugins. */
  #defaultRendererTypes = new Set()

  /** @type {import('./types').InlineParser} */
  #parseInline

  /** @param {import('./types').RendererConfig} [config] */
  constructor(config = {}) {
    this.#config = {
      classPrefix: config.classPrefix ?? 'editor',
      throwOnUnknown: config.throwOnUnknown ?? true,
      theme: config.theme ?? 'dark',
      validationMode: config.validationMode ?? 'preserve',
      onValidationError: config.onValidationError,
    }
    const locale = { ...defaultLocale, ...config.locale }
    this.#renderers = createDefaultRenderers(
      this.#config.classPrefix,
      locale,
      config.blockTypes,
      config.blockConfigs,
    )
    this.#defaultRendererTypes = new Set(this.#renderers.keys())
    this.#parseInline = createInlineParser(this.#config.classPrefix)

    // Inline plugin registry (for rehydrating `{{<id>}}` placeholder
    // tokens into real widget DOM). Caller supplies lightweight widget
    // factories — see `createMentionWidget()` for the canonical
    // renderer-only variant.
    this.#inlinePlugins = new Map()
    if (config.inlinePlugins) {
      for (const p of config.inlinePlugins) this.#inlinePlugins.set(p.type, p)
    }
  }

  /**
   * Register a custom block renderer
   * @param {import('./types').BlockRenderer} renderer
   * @returns {this}
   */
  registerRenderer(renderer) {
    this.#rendererRevisions.set(renderer.type, (this.#rendererRevisions.get(renderer.type) ?? 0) + 1)
    this.#renderers.set(renderer.type, renderer)
    this.#defaultRendererTypes.delete(renderer.type)
    return this
  }

  /**
   * Unregister a block renderer
   * @param {string} type
   * @returns {this}
   */
  unregisterRenderer(type) {
    this.#rendererRevisions.set(type, (this.#rendererRevisions.get(type) ?? 0) + 1)
    this.#renderers.delete(type)
    this.#defaultRendererTypes.delete(type)
    return this
  }

  /**
   * Check if a block type is supported
   * @param {string} type
   * @returns {boolean}
   */
  hasRenderer(type) {
    return this.#renderers.has(type)
  }

  /**
   * Get list of all registered block types
   * @returns {string[]}
   */
  getRegisteredTypes() {
    return Array.from(this.#renderers.keys())
  }

  /**
   * Render a single block to HTMLElement
   * @param {import('./types').OutputBlockData} block
   * @returns {HTMLElement}
   */
  renderBlock(block) {
    const entry = this.#createRenderedBlock(block)
    this.#detachedBlocks.set(entry.element, entry)
    return entry.element
  }

  /**
   * Create a block together with the exact renderer that owns its resources.
   * Internal aggregate rendering uses this method so ownership is registered
   * exactly once by the public operation that returns or mounts the result.
   * @param {import('./types').OutputBlockData} block
   * @returns {{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }}
   */
  #createRenderedBlock(block) {
    const renderer = this.#renderers.get(block.type)

    if (!renderer) {
      if (this.#config.throwOnUnknown) {
        throw new UnknownBlockTypeError(block.type, block.id)
      }

      // Return empty div for unknown blocks when not throwing
      const placeholder = document.createElement('div')
      placeholder.className = `${this.#config.classPrefix}-unknown`
      placeholder.dataset.blockType = block.type
      return { element: placeholder, type: block.type }
    }

    let renderableBlock = block
    if (this.#defaultRendererTypes.has(block.type) && !validateKnownBlockData(block.type, block.data)) {
      const issue = { blockId: block.id, type: block.type }
      try {
        this.#config.onValidationError?.(issue)
      } catch {
        // Consumer diagnostics must not break rendering or alter validation.
      }
      if (this.#config.validationMode === 'strict') {
        throw new InvalidBlockDataError(block.type, 'Block data does not match its schema', block.id)
      }
      renderableBlock = { ...block, data: normalizeKnownBlockData(block.type, block.data) }
    }

    // Rehydrate inline widget placeholders before calling the block
    // renderer — mirrors editor-side `BlockManager.insert` behavior.
    // Only text renderers that opted in (`mapTextFields`) participate.
    if (renderableBlock.inline && typeof renderer.mapTextFields === 'function' && this.#inlinePlugins.size > 0) {
      const inline = renderableBlock.inline
      const registry = this.#inlinePlugins
      // Clone `data` so we don't mutate the caller's object with hydrated HTML.
      const hydratedData = cloneEditorData(renderableBlock.data)
      renderer.mapTextFields(
        /** @type {Record<string, unknown>} */ (hydratedData),
        (html) => deserializeInlineHtml(html, inline, registry),
      )
      renderableBlock = { ...renderableBlock, data: hydratedData }
    }

    const element = renderer.render(renderableBlock, this.#parseInline)
    if (!(element instanceof HTMLElement)) {
      throw new TypeError(`Block renderer "${block.type}" render() must return an HTMLElement`)
    }

    const textAlign = normalizeTextAlign(block.tunes?.textAlign)
    if (textAlign) element.style.textAlign = textAlign

    // Add block id as data attribute if present
    if (block.id) {
      element.dataset.blockId = block.id
    }

    element.dataset.blockType = block.type
    return { element, type: block.type, renderer }
  }

  /**
   * Render all blocks into a wrapper element with CSS variable scope.
   * @param {import('./types').OutputData} data
   * @returns {HTMLElement}
   */
  render(data) {
    const wrapper = document.createElement('div')
    const theme = this.#config.theme
    wrapper.className = `${this.#config.classPrefix}-content`
      + (theme === 'light' ? ` ${this.#config.classPrefix}-content--light` : '')

    /** @type {Array<{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>} */
    const created = []
    try {
      if (data.blocks?.length) {
        for (const block of data.blocks) {
          const entry = this.#createRenderedBlock(block)
          created.push(entry)
          wrapper.appendChild(entry.element)
        }
      }
    } catch (error) {
      for (const entry of created) this.#disposeRenderedElement(entry)
      throw error
    }

    this.#detachedDocuments.set(wrapper, created)
    return wrapper
  }

  /**
   * Release resources owned by one rendered block.
   * @param {{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }} entry
   */
  #disposeRenderedElement(entry) {
    try {
      entry.renderer?.destroy?.(entry.element)
    } catch (err) {
      console.warn('[EditorRenderer] Failed to destroy renderer "' + entry.type + '":', err)
    }
  }

  /**
   * Prefer a producer-owned O(1) content revision. Plain JSON documents keep
   * the deep signature fallback and therefore retain in-place mutation
   * detection without requiring a new contract.
   * @param {import('./types').OutputBlockData} block
   * @param {number} rendererRevision
   */
  #blockSignature(block, rendererRevision) {
    if (typeof block.revision === 'string' || typeof block.revision === 'number') {
      return JSON.stringify([rendererRevision, block.type, block.revision])
    }
    return JSON.stringify([
      rendererRevision,
      block.type,
      block.data,
      block.tunes ?? null,
      block.inline ?? null,
    ])
  }

  /**
   * Incrementally render blocks to a container. Stable block ids reuse their
   * DOM and renderer resources; changed blocks alone are replaced.
   * @param {import('./types').OutputData} data
   * @param {HTMLElement} container
   * @returns {void}
   */
  renderTo(data, container) {
    const mounted = this.#mountedContainers.get(container)
    const wrapper = mounted?.wrapper ?? document.createElement('div')
    if (!mounted) {
      const theme = this.#config.theme
      wrapper.className = this.#config.classPrefix + '-content'
        + (theme === 'light' ? ' ' + this.#config.classPrefix + '-content--light' : '')
    }

    const previous = mounted?.blocks ?? new Map()
    /** @type {Map<string, { element: HTMLElement, type: string, signature: string, renderer?: import('./types').BlockRenderer }>} */
    const next = new Map()
    /** @type {HTMLElement[]} */
    const ordered = []
    /** @type {Array<{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>} */
    const created = []
    /** @type {Map<string, number>} */
    const occurrences = new Map()

    try {
      const blocks = data.blocks ?? []
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index]
        const baseKey = block.id ? 'id:' + block.id : 'index:' + index
        const occurrence = occurrences.get(baseKey) ?? 0
        occurrences.set(baseKey, occurrence + 1)
        const key = baseKey + '#' + occurrence
        const revision = this.#rendererRevisions.get(block.type) ?? 0
        const signature = this.#blockSignature(block, revision)
        const existing = previous.get(key)

        let element
        let owner
        if (existing && existing.type === block.type && existing.signature === signature) {
          element = existing.element
          owner = existing.renderer
        } else {
          const entry = this.#createRenderedBlock(block)
          owner = entry.renderer
          element = entry.element
          created.push(entry)
        }

        next.set(key, { element, type: block.type, signature, renderer: owner })
        ordered.push(element)
      }
    } catch (error) {
      for (const entry of created) this.#disposeRenderedElement(entry)
      throw error
    }

    for (const [key, entry] of previous) {
      if (next.get(key)?.element !== entry.element) {
        this.#disposeRenderedElement(entry)
      }
    }

    wrapper.replaceChildren(...ordered)
    if (wrapper.parentNode !== container || container.childNodes.length !== 1) {
      container.replaceChildren(wrapper)
    }
    this.#mountedContainers.set(container, { wrapper, blocks: next })
  }

  /**
   * Dispose one result returned by renderBlock()/render(), one renderTo()
   * container, or every resource owned by this renderer instance.
   * @param {HTMLElement} [target]
   */
  destroy(target) {
    const containers = target
      ? (this.#mountedContainers.has(target) ? [target] : [])
      : [...this.#mountedContainers.keys()]
    for (const target of containers) {
      const mounted = this.#mountedContainers.get(target)
      if (mounted) {
        for (const entry of mounted.blocks.values()) {
          this.#disposeRenderedElement(entry)
        }
      }
      this.#mountedContainers.delete(target)
      target.replaceChildren()
    }

    const documents = target
      ? (this.#detachedDocuments.has(target) ? [target] : [])
      : [...this.#detachedDocuments.keys()]
    for (const wrapper of documents) {
      for (const entry of this.#detachedDocuments.get(wrapper) ?? []) {
        this.#disposeRenderedElement(entry)
      }
      this.#detachedDocuments.delete(wrapper)
      wrapper.replaceChildren()
    }

    const blocks = target
      ? (this.#detachedBlocks.has(target) ? [target] : [])
      : [...this.#detachedBlocks.keys()]
    for (const element of blocks) {
      const entry = this.#detachedBlocks.get(element)
      if (entry) this.#disposeRenderedElement(entry)
      this.#detachedBlocks.delete(element)
      element.replaceChildren()
    }
  }

  /**
   * Get the class prefix used by this renderer
   * @returns {string}
   */
  getClassPrefix() {
    return this.#config.classPrefix
  }

  /**
   * Collect all CSS URLs from base styles and registered renderers
   * @returns {string[]}
   */
  getStyleUrls() {
    /** @type {Set<string>} */
    const urls = new Set([baseCssUrl])

    for (const renderer of this.#renderers.values()) {
      if (renderer.styles) {
        for (const url of renderer.styles) urls.add(url)
      }
    }

    return [...urls]
  }

  /**
   * Inject <link> tags for all collected CSS URLs
   * @returns {{ destroy(): void }}
   */
  injectStyles() {
    return acquireStyleUrls(this.getStyleUrls())
  }
}

/**
 * Factory function for quick instance creation
 * @param {import('./types').RendererConfig} [config]
 * @returns {EditorRenderer}
 */
export function createEditorRenderer(config) {
  return new EditorRenderer(config)
}

export { getSupportedBlockTypes }
