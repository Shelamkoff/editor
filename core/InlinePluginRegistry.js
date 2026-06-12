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
    if (this.#plugins.has(plugin.type)) {
      console.warn(`[InlinePluginRegistry] Plugin "${plugin.type}" already registered, overwriting`)
    }
    this.#plugins.set(plugin.type, plugin)
    if (plugin.trigger) {
      this.#triggers.set(plugin.trigger, plugin)
    }
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
   * Get all registered trigger characters.
   * @returns {string[]}
   */
  triggerKeys() {
    return [...this.#triggers.keys()]
  }
}
