// @ts-check
import { UnknownBlockTypeError } from './errors.js'
import { createInlineParser } from './inline.js'
import { createDefaultRenderers, getSupportedBlockTypes } from './renderers/index.js'
import { resolvePath } from '../shared/resolvePath.js'
import { deserializeInlineHtml } from '../shared/inlineMarshal.js'
import defaultLocale from './locale/en.js'

const baseCssUrl = resolvePath('./styles/base.css', import.meta.url)

/**
 * Renders Ophire Editor blocks to DOM elements.
 */
export class EditorRenderer {
  /** @type {{ classPrefix: string, throwOnUnknown: boolean, theme: 'dark' | 'light' }} */
  #config
  /** @type {Map<string, import('./types').BlockRenderer>} */
  #renderers
  /** @type {Map<string, import('./types').InlinePluginLike>} */
  #inlinePlugins
  /** @type {import('./types').InlineParser} */
  #parseInline

  /** @param {import('./types').RendererConfig} [config] */
  constructor(config = {}) {
    this.#config = {
      classPrefix: config.classPrefix ?? 'editor',
      throwOnUnknown: config.throwOnUnknown ?? true,
      theme: config.theme ?? 'dark',
    }
    const locale = { ...defaultLocale, ...config.locale }
    this.#renderers = createDefaultRenderers(this.#config.classPrefix, locale)
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
    this.#renderers.set(renderer.type, renderer)
    return this
  }

  /**
   * Unregister a block renderer
   * @param {string} type
   * @returns {this}
   */
  unregisterRenderer(type) {
    this.#renderers.delete(type)
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
    const renderer = this.#renderers.get(block.type)

    if (!renderer) {
      if (this.#config.throwOnUnknown) {
        throw new UnknownBlockTypeError(block.type, block.id)
      }

      // Return empty div for unknown blocks when not throwing
      const placeholder = document.createElement('div')
      placeholder.className = `${this.#config.classPrefix}-unknown`
      placeholder.dataset.blockType = block.type
      return placeholder
    }

    // Rehydrate inline widget placeholders before calling the block
    // renderer — mirrors editor-side `BlockManager.insert` behavior.
    // Only text renderers that opted in (`mapTextFields`) participate.
    let renderableBlock = block
    if (block.inline && typeof renderer.mapTextFields === 'function' && this.#inlinePlugins.size > 0) {
      const inline = block.inline
      const registry = this.#inlinePlugins
      // Clone `data` so we don't mutate the caller's object with hydrated HTML.
      const hydratedData = { ...block.data }
      renderer.mapTextFields(
        /** @type {Record<string, unknown>} */ (hydratedData),
        (html) => deserializeInlineHtml(html, inline, registry),
      )
      renderableBlock = { ...block, data: hydratedData }
    }

    const element = renderer.render(renderableBlock, this.#parseInline)

    // Add block id as data attribute if present
    if (block.id) {
      element.dataset.blockId = block.id
    }

    return element
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

    if (data.blocks?.length) {
      for (const block of data.blocks) {
        wrapper.appendChild(this.renderBlock(block))
      }
    }

    return wrapper
  }

  /**
   * Render all blocks to a container element
   * @param {import('./types').OutputData} data
   * @param {HTMLElement} container
   * @returns {void}
   */
  renderTo(data, container) {
    container.innerHTML = ''
    container.appendChild(this.render(data))
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
    const urls = this.getStyleUrls()
    /** @type {HTMLLinkElement[]} */
    const links = []

    for (const url of urls) {
      if (document.querySelector(`link[href="${CSS.escape(url)}"]`)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset.editorRenderer = ''
      document.head.appendChild(link)
      links.push(link)
    }

    return {
      destroy() {
        for (const link of links) link.remove()
      }
    }
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
