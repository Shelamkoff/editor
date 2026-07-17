/**
 * Owns a replaceable group of editor modules.
 *
 * Dynamic editor modes use a child scope so all listeners and UI managers
 * created for that mode are released together without touching resources
 * owned by the editor instance itself.
 */
export class LifecycleScope {
  /** @type {Array<{ destroy(): void }>} */
  #resources = []

  /** @type {boolean} */
  #destroyed = false

  /**
   * @template T
   * @param {T & { destroy(): void }} resource
   * @returns {T}
   */
  register(resource) {
    if (this.#destroyed) {
      resource.destroy()
      throw new Error('Cannot register a resource in a destroyed lifecycle scope')
    }
    this.#resources.push(resource)
    return resource
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    for (let index = this.#resources.length - 1; index >= 0; index--) {
      try {
        this.#resources[index]?.destroy()
      } catch (error) {
        console.warn('[LifecycleScope] Failed to destroy a resource:', error)
      }
    }
    this.#resources = []
  }
}
