// @ts-check
import { InvalidBlockDataError, UnknownBlockTypeError } from './errors.js'
import { createInlineParser } from './inline.js'
import { createDefaultRenderers, getSupportedBlockTypes } from './renderers/index.js'
import { deserializeInlineHtml } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import defaultLocale from './locale/en.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'
import { validateKnownBlockData } from '../shared/blockDataValidators.js'
import { normalizeKnownBlockData } from '../shared/blockDataNormalizers.js'
import { normalizeTextAlign } from '../shared/textFormat.js'
import { resolveValidationMode } from '../shared/validationMode.js'

const baseCssUrl = new URL('./styles/base.css', import.meta.url).href
const bundledRendererCssRoot = new URL('./renderers/', import.meta.url).href
const validationSourceKey = Symbol.for('@shelamkoff/rector/renderer-validation-source')

/**
 * Renders Rector document blocks to DOM elements.
 */
export class EditorRenderer {
  /** @type {{ injectStyles: boolean, classPrefix: string, throwOnUnknown: boolean, theme: 'dark' | 'light', validationMode: 'preserve' | 'strict', onValidationError?: (issue: { blockId?: string, type: string }) => void | Promise<void> }} */
  #config
  /** @type {Map<string, import('./types').BlockRenderer>} */
  #renderers
  /** @type {Map<string, import('./types').InlinePluginLike>} */
  #inlinePlugins
  /** @type {Map<HTMLElement, { wrapper: HTMLElement, blocks: Map<string, { element: HTMLElement, type: string, signature: string, renderer?: import('./types').BlockRenderer }> }>} */
  #mountedContainers = new Map()
  /** Containers currently inside renderTo(); protects staged ownership from same-container reentry. */
  /** @type {WeakSet<HTMLElement>} */
  #renderingContainers = new WeakSet()
  #activeRenderToCount = 0
  /** Targets detached from ownership while their user disposers run. */
  /** @type {WeakSet<HTMLElement>} */
  #destroyingTargets = new WeakSet()

  /** Results returned by render(); keyed by their document wrapper. */
  /** @type {Map<HTMLElement, Array<{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>>} */
  #detachedDocuments = new Map()

  /** Results returned directly by renderBlock(). */
  /** @type {Map<HTMLElement, { element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>} */
  #detachedBlocks = new Map()

  /** @type {Map<string, number>} */
  #rendererRevisions = new Map()

  /** Exact renderer owners of created results, including staged results.
   * Count by renderer rather than scanning every live block on each render.
   * @type {Map<import('./types').BlockRenderer, number>}
   */
  #liveRenderers = new Map()

  /** Built-in types use the same neutral validators as their editor plugins. */
  #defaultRendererTypes = new Set()

  /** @type {WeakMap<Document, import('./types').InlineParser>} */
  #inlineParsers = new WeakMap()

  /** Source block objects whose validation issue is being reported on this stack. */
  /** @type {WeakSet<object>} */
  #reportingValidation = new WeakSet()

  /** Automatic stylesheet owners are isolated per owning document. */
  /** @type {Map<Document, { owner: { destroy(): void }, key: string }>} */
  #styleOwners = new Map()

  /**
   * @param {import('./types').RendererConfig} [config]
   * @param {string[] | null} [resolvedInlinePluginTypes]
   */
  constructor(config = {}, resolvedInlinePluginTypes = null) {
    if (config.injectStyles !== undefined && typeof config.injectStyles !== 'boolean') {
      throw new TypeError('EditorRenderer injectStyles must be a boolean')
    }
    this.#config = {
      injectStyles: config.injectStyles ?? true,
      classPrefix: config.classPrefix ?? 'editor',
      throwOnUnknown: config.throwOnUnknown ?? true,
      theme: config.theme ?? 'dark',
      validationMode: resolveValidationMode(config.validationMode),
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

    // Inline plugin registry (for rehydrating `{{<id>}}` placeholder
    // tokens into real widget DOM). Caller supplies lightweight widget
    // factories — see `createMentionWidget()` for the canonical
    // renderer-only variant.
    this.#inlinePlugins = new Map()
    if (config.inlinePlugins) {
      for (let index = 0; index < config.inlinePlugins.length; index++) {
        const plugin = config.inlinePlugins[index]
        const type = resolvedInlinePluginTypes?.[index] ?? plugin.type
        this.#inlinePlugins.set(type, plugin)
      }
    }
  }

  /**
   * Register a custom block renderer.
   * @param {import('./types').BlockRenderer} renderer
   * @param {string} [resolvedType] Type already observed at the public boundary.
   * @returns {this}
   */
  registerRenderer(renderer, resolvedType = renderer.type) {
    this.#rendererRevisions.set(resolvedType, (this.#rendererRevisions.get(resolvedType) ?? 0) + 1)
    this.#renderers.set(resolvedType, renderer)
    this.#defaultRendererTypes.delete(resolvedType)
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
    const ownerDocument = globalThis.document
    this.#ensureStyles(ownerDocument)
    try {
      const entry = this.#createRenderedBlock(block, ownerDocument)
      this.#detachedBlocks.set(entry.element, entry)
      return entry.element
    } catch (error) {
      this.#releaseAutomaticStylesIfIdle()
      throw error
    }
  }

  /**
   * Create a block together with the exact renderer that owns its resources.
   * Internal aggregate rendering uses this method so ownership is registered
   * exactly once by the public operation that returns or mounts the result.
   * @param {import('./types').OutputBlockData} block
   * @param {Document} ownerDocument
   * @param {object} [validationSource] Original identity, not a signature clone.
   * @returns {{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }}
   */
  #createRenderedBlock(block, ownerDocument, validationSource = /** @type {any} */ (block)[validationSourceKey] ?? block) {
    // Keep the caller-owned identity even through aggregate/signature clones.
    // Rendering still clones before any renderer or validator can observe data.
    // A block crosses the public rendering boundary only when it is actually
    // rendered. This preserves O(1) reuse for equal producer revisions while
    // ensuring custom/default renderers never observe caller-owned JSON data.
    block = cloneEditorData(block)
    const renderer = this.#renderers.get(block.type)

    if (!renderer) {
      if (this.#config.throwOnUnknown) {
        throw new UnknownBlockTypeError(block.type, block.id)
      }

      // Return empty div for unknown blocks when not throwing
      const placeholder = ownerDocument.createElement('div')
      placeholder.className = this.#withStableClass(`${this.#config.classPrefix}-unknown`)
      placeholder.dataset.blockType = block.type
      return { element: placeholder, type: block.type }
    }

    let renderableBlock = block
    if (this.#defaultRendererTypes.has(block.type) && !validateKnownBlockData(block.type, block.data)) {
      const issue = { blockId: block.id, type: block.type }
      const observer = this.#config.onValidationError
      if (typeof observer === 'function' && !this.#reportingValidation.has(validationSource)) {
        this.#reportingValidation.add(validationSource)
        let result
        try {
          result = observer(issue)
        } catch (error) {
          this.#reportingValidation.delete(validationSource)
          console.warn('[EditorRenderer] Validation observer failed:', error)
        }
        let then
        try {
          then = result && /** @type {any} */ (result).then
        } catch (error) {
          this.#reportingValidation.delete(validationSource)
          console.warn('[EditorRenderer] Validation observer failed:', error)
          then = null
        }
        if (typeof then === 'function') {
          new Promise((resolve, reject) => then.call(result, resolve, reject))
            .catch(error => console.warn('[EditorRenderer] Validation observer failed:', error))
            .finally(() => this.#reportingValidation.delete(validationSource))
        } else {
          this.#reportingValidation.delete(validationSource)
        }
      }
      if (this.#config.validationMode === 'strict') {
        throw new InvalidBlockDataError(block.type, 'Block data does not match its schema', block.id)
      }
      renderableBlock = { ...block, data: normalizeKnownBlockData(block.type, block.data, ownerDocument) }
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
        (html) => deserializeInlineHtml(html, inline, registry, ownerDocument),
      )
      renderableBlock = { ...renderableBlock, data: hydratedData }
    }

    const element = renderer.render(renderableBlock, this.#inlineParserFor(ownerDocument), { ownerDocument })
    const HTMLElementCtor = element?.ownerDocument?.defaultView?.HTMLElement
      ?? ownerDocument.defaultView?.HTMLElement
      ?? globalThis.HTMLElement
    if (!HTMLElementCtor || !(element instanceof HTMLElementCtor)) {
      throw new TypeError(`Block renderer "${block.type}" render() must return an HTMLElement`)
    }
    this.#addBundledStyleAliases(element, renderer)

    const textAlign = normalizeTextAlign(block.tunes?.textAlign)
    if (textAlign) element.style.textAlign = textAlign

    // Add block id as data attribute if present
    if (block.id) {
      element.dataset.blockId = block.id
    }

    element.dataset.blockType = block.type
    this.#liveRenderers.set(renderer, (this.#liveRenderers.get(renderer) ?? 0) + 1)
    return { element, type: block.type, renderer }
  }

  /**
   * Render all blocks into a wrapper element with CSS variable scope.
   * @param {import('./types').OutputData} data
   * @returns {HTMLElement}
   */
  render(data) {
    const ownerDocument = globalThis.document
    this.#ensureStyles(ownerDocument)
    const wrapper = ownerDocument.createElement('div')
    const theme = this.#config.theme
    wrapper.className = this.#contentClassName(theme)

    /** @type {Array<{ element: HTMLElement, type: string, renderer?: import('./types').BlockRenderer }>} */
    const created = []
    try {
      const blocks = data.blocks
      if (blocks?.length) {
        for (const block of blocks) {
          const entry = this.#createRenderedBlock(block, ownerDocument)
          created.push(entry)
          wrapper.appendChild(entry.element)
        }
      }
    } catch (error) {
      for (const entry of created) this.#disposeRenderedElement(entry)
      this.#releaseAutomaticStylesIfIdle()
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
    } finally {
      if (entry.renderer) {
        const count = this.#liveRenderers.get(entry.renderer) ?? 0
        if (count > 1) this.#liveRenderers.set(entry.renderer, count - 1)
        else this.#liveRenderers.delete(entry.renderer)
      }
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
    if (this.#renderingContainers.has(container) || this.#destroyingTargets.has(container)) {
      throw new Error('Cannot reenter renderTo() for the same container')
    }
    this.#renderingContainers.add(container)
    this.#activeRenderToCount++
    try {
      const ownerDocument = container.ownerDocument ?? globalThis.document
      this.#ensureStyles(ownerDocument)
      const mounted = this.#mountedContainers.get(container)
      const wrapper = mounted?.wrapper ?? ownerDocument.createElement('div')
      if (!mounted) {
        const theme = this.#config.theme
        wrapper.className = this.#contentClassName(theme)
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
          const hasProducerRevision = typeof block.revision === 'string' || typeof block.revision === 'number'
          // Plain JSON compatibility mode already pays for a deep signature.
          // Take ownership first so accessor-backed input is observed exactly
          // once; the later render clone then reads only our plain snapshot.
          // Producer revisions keep the O(1) fast path and deliberately avoid
          // touching deep content when the authoritative revision is unchanged.
          const signatureBlock = hasProducerRevision ? block : cloneEditorData(block)
          const baseKey = signatureBlock.id ? 'id:' + signatureBlock.id : 'index:' + index
          const occurrence = occurrences.get(baseKey) ?? 0
          occurrences.set(baseKey, occurrence + 1)
          const key = baseKey + '#' + occurrence
          const revision = this.#rendererRevisions.get(signatureBlock.type) ?? 0
          const signature = this.#blockSignature(signatureBlock, revision)
          const existing = previous.get(key)

          let element
          let owner
          if (existing && existing.type === signatureBlock.type && existing.signature === signature) {
            element = existing.element
            owner = existing.renderer
          } else {
            const entry = this.#createRenderedBlock(
              signatureBlock, ownerDocument,
              /** @type {any} */ (block)[validationSourceKey] ?? block,
            )
            owner = entry.renderer
            element = entry.element
            created.push(entry)
          }

          next.set(key, { element, type: signatureBlock.type, signature, renderer: owner })
          ordered.push(element)
        }
      } catch (error) {
        for (const entry of created) this.#disposeRenderedElement(entry)
        this.#releaseAutomaticStylesIfIdle()
        throw error
      }

      for (const [key, entry] of previous) {
        if (next.get(key)?.element !== entry.element) {
          this.#disposeRenderedElement(entry)
        }
      }

      // Keep unchanged nodes connected. Replacing even the same children resets
      // iframe browsing contexts, focus, and custom-element lifecycle state.
      const retained = new Set(ordered)
      for (const child of Array.from(wrapper.childNodes)) {
        if (!retained.has(/** @type {HTMLElement} */ (child))) child.remove()
      }
      const movable = /** @type {HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void }} */ (wrapper)
      let cursor = wrapper.firstChild
      for (const element of ordered) {
        if (element === cursor) {
          cursor = cursor.nextSibling
          continue
        }
        if (typeof movable.moveBefore === 'function' && element.isConnected && wrapper.isConnected) {
          movable.moveBefore(element, cursor)
        } else {
          wrapper.insertBefore(element, cursor)
        }
      }
      if (wrapper.parentNode !== container || container.childNodes.length !== 1) {
        container.replaceChildren(wrapper)
      }
      this.#mountedContainers.set(container, { wrapper, blocks: next })
      this.#ensureStyles(ownerDocument)
    } finally {
      this.#renderingContainers.delete(container)
      this.#activeRenderToCount--
    }
  }

  /**
   * Dispose one result returned by renderBlock()/render(), one renderTo()
   * container, or every resource owned by this renderer instance.
   * @param {HTMLElement} [target]
   */
  destroy(target) {
    if (target ? this.#renderingContainers.has(target) : this.#activeRenderToCount > 0) {
      throw new Error('Cannot destroy renderer output during an active renderTo()')
    }
    const containers = target
      ? (this.#mountedContainers.has(target) ? [target] : [])
      : [...this.#mountedContainers.keys()]
    const documents = target
      ? (this.#detachedDocuments.has(target) ? [target] : [])
      : [...this.#detachedDocuments.keys()]
    const blocks = target
      ? (this.#detachedBlocks.has(target) ? [target] : [])
      : [...this.#detachedBlocks.keys()]
    for (const container of containers) {
      const mounted = this.#mountedContainers.get(container)
      if (!mounted) continue
      // Relinquish ownership before invoking extension code. A disposer may
      // call destroy() again (including on siblings) without double release.
      this.#mountedContainers.delete(container)
      this.#destroyingTargets.add(container)
      try {
        for (const entry of mounted.blocks.values()) this.#disposeRenderedElement(entry)
        container.replaceChildren()
      } finally {
        this.#destroyingTargets.delete(container)
      }
    }

    for (const wrapper of documents) {
      const entries = this.#detachedDocuments.get(wrapper)
      if (!entries) continue
      this.#detachedDocuments.delete(wrapper)
      this.#destroyingTargets.add(wrapper)
      try {
        for (const entry of entries) this.#disposeRenderedElement(entry)
        wrapper.replaceChildren()
      } finally {
        this.#destroyingTargets.delete(wrapper)
      }
    }

    for (const element of blocks) {
      const entry = this.#detachedBlocks.get(element)
      if (!entry) continue
      this.#detachedBlocks.delete(element)
      this.#destroyingTargets.add(element)
      try {
        this.#disposeRenderedElement(entry)
        element.replaceChildren()
      } finally {
        this.#destroyingTargets.delete(element)
      }
    }

    // A disposer may create independent output. Never release its styles just
    // because this invocation originally requested destruction of all output.
    this.#releaseAutomaticStylesIfIdle()
  }

  /**
   * Get the class prefix used by this renderer
   * @returns {string}
   */
  getClassPrefix() {
    return this.#config.classPrefix
  }

  /** Keep bundled CSS addressable even when consumers choose a namespace. */
  #withStableClass(className) {
    if (this.#config.classPrefix === 'editor') return className
    const sourcePrefix = this.#config.classPrefix + '-'
    if (!className.startsWith(sourcePrefix)) return className
    return className + ' editor-' + className.slice(sourcePrefix.length)
  }

  /** @param {'dark' | 'light'} theme */
  #contentClassName(theme) {
    const prefix = this.#config.classPrefix
    const classes = [`${prefix}-content`]
    if (prefix !== 'editor') classes.push('editor-content')
    if (theme === 'light') {
      classes.push(`${prefix}-content--light`)
      if (prefix !== 'editor') classes.push('editor-content--light')
    }
    return classes.join(' ')
  }

  /**
   * Bundled renderer styles are authored against the stable `editor-` namespace.
   * Preserve the consumer namespace while adding stable aliases to bundled DOM.
   * Custom renderers without Rector-owned styles are left untouched.
   * @param {HTMLElement} root
   * @param {import('./types').BlockRenderer} renderer
   */
  #addBundledStyleAliases(root, renderer) {
    const prefix = this.#config.classPrefix
    if (prefix === 'editor' || !renderer.styles?.some(url => typeof url === 'string' && url.startsWith(bundledRendererCssRoot))) return

    const sourcePrefix = prefix + '-'
    /** @type {Element[]} */
    const stack = [root]
    while (stack.length) {
      const element = stack.pop()
      if (!element) continue
      if (typeof element.className === 'string' && element.className) {
        const classes = element.className.split(/\s+/).filter(Boolean)
        const aliases = classes
          .filter(name => name.startsWith(sourcePrefix))
          .map(name => 'editor-' + name.slice(sourcePrefix.length))
        if (aliases.length) element.className = [...new Set([...classes, ...aliases])].join(' ')
      }
      for (const child of element.children ?? []) stack.push(child)
    }
  }

  /**
   * Collect CSS from registered renderers and every still-owned result
   * @returns {string[]}
   */
  getStyleUrls() {
    /** @type {Set<string>} */
    const urls = new Set([baseCssUrl])

    for (const renderer of new Set([...this.#renderers.values(), ...this.#liveRenderers.keys()])) {
      if (renderer.styles) {
        for (const url of renderer.styles) urls.add(url)
      }
    }

    return [...urls]
  }

  /** @param {Document} ownerDocument */
  #inlineParserFor(ownerDocument) {
    let parser = this.#inlineParsers.get(ownerDocument)
    if (!parser) {
      parser = createInlineParser(this.#config.classPrefix, ownerDocument)
      this.#inlineParsers.set(ownerDocument, parser)
    }
    return parser
  }

  /** @param {Document} ownerDocument */
  #ensureStyles(ownerDocument) {
    if (!this.#config.injectStyles) return
    const urls = this.getStyleUrls()
    const key = urls.join('\n')
    const current = this.#styleOwners.get(ownerDocument)
    if (current?.key === key) return
    const nextOwner = acquireStyleUrls(urls, ownerDocument)
    current?.owner.destroy()
    this.#styleOwners.set(ownerDocument, { owner: nextOwner, key })
  }

  /** @param {Document} ownerDocument */
  #hasLiveResultInDocument(ownerDocument) {
    for (const [container, mounted] of this.#mountedContainers) {
      if (container.ownerDocument === ownerDocument || mounted.wrapper.ownerDocument === ownerDocument) return true
    }
    for (const wrapper of this.#detachedDocuments.keys()) {
      if (wrapper.ownerDocument === ownerDocument) return true
    }
    for (const element of this.#detachedBlocks.keys()) {
      if (element.ownerDocument === ownerDocument) return true
    }
    return false
  }

  /** Release automatic styles after the last rendered result in each document, or unconditionally. */
  #releaseAutomaticStylesIfIdle(force = false) {
    for (const [ownerDocument, entry] of this.#styleOwners) {
      if (!force && this.#hasLiveResultInDocument(ownerDocument)) {
        // A retired renderer may have changed the collected style set.
        this.#ensureStyles(ownerDocument)
        continue
      }
      entry.owner.destroy()
      this.#styleOwners.delete(ownerDocument)
    }
  }

  /**
   * Inject <link> tags for all collected CSS URLs.
   * @param {Document} [ownerDocument]
   * @returns {{ destroy(): void }}
   */
  injectStyles(ownerDocument = globalThis.document) {
    return acquireStyleUrls(this.getStyleUrls(), ownerDocument)
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
