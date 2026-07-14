/**
 * @typedef {import('./types').InlinePlugin} InlinePlugin
 * @typedef {import('./types').InlinePluginContext} InlinePluginContext
 */

/**
 * Registry for inline plugins (widgets inside text blocks).
 * Inline plugins are different from block plugins (full blocks) and inline tools (text formatting).
 */
export class InlinePluginRegistry {
  /** @type {Map<string, InlinePlugin>} */
  #plugins = new Map()

  /** @type {Map<string, InlinePlugin>} */
  #triggers = new Map()

  /**
   * @param {InlinePlugin[]} plugins
   */
  constructor(plugins = []) {
    for (const plugin of plugins) {
      this.register(plugin)
    }
  }

  /**
   * @param {InlinePlugin} plugin
   */
  register(plugin) {
    if (!plugin || typeof plugin.type !== 'string' || !plugin.type) {
      throw new TypeError('Every inline plugin must have a non-empty string type')
    }
    for (const method of ['createWidget', 'hydrate', 'getData']) {
      if (typeof plugin[method] !== 'function') {
        throw new TypeError(`Inline plugin "${plugin.type}" must implement ${method}()`)
      }
    }
    if (this.#plugins.has(plugin.type)) {
      throw new Error(`Duplicate inline plugin type: "${plugin.type}"`)
    }
    if (plugin.trigger) {
      if (this.#triggers.has(plugin.trigger)) {
        throw new Error(`Duplicate inline plugin trigger: "${plugin.trigger}"`)
      }
      this.#triggers.set(plugin.trigger, plugin)
    }
    this.#plugins.set(plugin.type, plugin)
  }

  /**
   * @param {string} type
   * @returns {InlinePlugin | undefined}
   */
  get(type) {
    return this.#plugins.get(type)
  }

  /**
   * @param {string} char
   * @returns {InlinePlugin | undefined}
   */
  getByTrigger(char) {
    return this.#triggers.get(char)
  }

  /** @returns {IterableIterator<InlinePlugin>} */
  values() {
    return this.#plugins.values()
  }

  /** @returns {number} */
  get size() {
    return this.#plugins.size
  }

  /** @returns {boolean} */
  get hasTriggers() {
    return this.#triggers.size > 0
  }

  /**
   * Acquire resources that must be scoped to one live editor root.
   * @param {HTMLElement} rootElement
   * @param {import('./types').InlinePluginContext} ctx
   */
  mount(rootElement, ctx) {
    const mounted = []
    try {
      for (const plugin of this.#plugins.values()) {
        plugin.mount?.(rootElement, ctx)
        mounted.push(plugin)
      }
    } catch (error) {
      for (const plugin of mounted.reverse()) {
        try { plugin.destroy?.() } catch { /* preserve the mount failure */ }
      }
      throw error
    }
  }

  /**
   * Get all registered trigger characters.
   * @returns {string[]}
   */
  triggerKeys() {
    return [...this.#triggers.keys()]
  }

  /**
   * Release plugin-level resources such as global listeners and shared styles.
   */
  destroy() {
    for (const plugin of this.#plugins.values()) {
      try {
        plugin.destroy?.()
      } catch (err) {
        console.warn('[InlinePluginRegistry] Failed to destroy plugin "' + plugin.type + '":', err)
      }
    }
    this.#plugins.clear()
    this.#triggers.clear()
  }
}
