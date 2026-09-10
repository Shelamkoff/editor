/**
 * @typedef {import('./types').InlinePlugin} InlinePlugin
 * @typedef {import('./types').InlinePluginContext} InlinePluginContext
 */

/** @typedef {import('./types').IInlinePluginRegistry} IInlinePluginRegistryContract */
/**
 * Registry for inline plugins (widgets inside text blocks).
 * Inline plugins are different from block plugins (full blocks) and inline tools (text formatting).
 * @implements {IInlinePluginRegistryContract}
 */
export class InlinePluginRegistry {
  /** @type {Map<string, InlinePlugin>} */
  #plugins = new Map()

  /** @type {Map<string, InlinePlugin>} */
  #triggers = new Map()

  /** Plugins already released during rollback; prevents duplicate destroy(). */
  #disposed = new WeakSet()

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
    if (plugin.trigger !== undefined) {
      if (typeof plugin.trigger !== 'string' || Array.from(plugin.trigger).length !== 1) {
        throw new TypeError(`Inline plugin "${plugin.type}" trigger must be exactly one Unicode code point`)
      }
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
    for (const plugin of this.#plugins.values()) {
      // A retry after a rolled-back mount starts a fresh ownership cycle.
      this.#disposed.delete(plugin)
      try {
        plugin.mount?.(rootElement, ctx)
      } catch (error) {
        // The failing plugin may already have acquired resources before throwing.
        this.#release(plugin, false)
        for (const mountedPlugin of mounted.reverse()) this.#release(mountedPlugin, false)
        throw error
      }
      mounted.push(plugin)
    }
  }

  /** @param {InlinePlugin} plugin @param {boolean} report */
  #release(plugin, report) {
    if (this.#disposed.has(plugin)) return
    this.#disposed.add(plugin)
    try {
      plugin.destroy?.()
    } catch (err) {
      if (report) console.warn('[InlinePluginRegistry] Failed to destroy plugin "' + plugin.type + '":', err)
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
    for (const plugin of this.#plugins.values()) this.#release(plugin, true)
    this.#plugins.clear()
    this.#triggers.clear()
  }
}
