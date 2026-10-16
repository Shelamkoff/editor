import { invokeObserver } from '../shared/invokeObserver.js'
import { synchronousResult } from '../shared/synchronousResult.js'

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

  /** @type {((error: unknown) => void) | null} */
  #onError

  /** @param {(error: unknown) => void} [onError] */
  constructor(onError) {
    this.#onError = typeof onError === 'function' ? onError : null
  }

  /**
   * @template T
   * @param {T & { destroy(): void }} resource
   * @returns {T}
   */
  register(resource) {
    if (this.#destroyed) {
      this.#dispose(resource)
      throw new Error('Cannot register a resource in a destroyed lifecycle scope')
    }
    this.#resources.push(resource)
    return resource
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    // Revoke the retained ledger before invoking external cleanup. A
    // reentrant callback must never reuse or double-release old resources.
    const resources = this.#resources
    this.#resources = []
    for (let index = resources.length - 1; index >= 0; index--) {
      this.#dispose(resources[index])
    }
  }

  /** @param {{ destroy(): void }} resource */
  #dispose(resource) {
    try {
      synchronousResult(resource.destroy(), error => this.#report(error))
    } catch (error) {
      this.#report(error)
    }
  }

  /** @param {unknown} error */
  #report(error) {
    if (this.#onError) {
      invokeObserver(this.#onError, [error], sinkError => {
        try { console.warn('[LifecycleScope] Error sink failed:', sinkError) } catch {}
      })
    } else {
      try { console.warn('[LifecycleScope] Failed to destroy a resource:', error) } catch {}
    }
  }
}
