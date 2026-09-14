/**
 * Debounced change notification.
 * Calls the onChange callback after a quiet period following editor changes.
 */
export class ChangeNotifier {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null

  /** @type {() => import('./types').EditorDocument | Promise<import('./types').EditorDocument>} */
  #saveFn

  /** @type {((data: import('./types').EditorDocument) => void) | undefined} */
  #onChange

  /** @type {number} */
  #delay

  /** @type {boolean} */
  #destroyed = false

  /** Monotonic ownership token for timer and in-flight save results. */
  #generation = 0

  /**
   * @param {() => import('./types').EditorDocument | Promise<import('./types').EditorDocument>} saveFn
   * @param {((data: import('./types').EditorDocument) => void)} [onChange]
   * @param {number} [delay]
   */
  constructor(saveFn, onChange, delay = 250) {
    this.#saveFn = saveFn
    this.#onChange = onChange
    this.#delay = delay
  }

  schedule() {
    if (this.#destroyed || !this.#onChange) return
    const generation = ++this.#generation
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(async () => {
      this.#timer = null
      if (!this.#onChange) return
      try {
        const data = await this.#saveFn()
        // A later schedule owns notification even when its save settles first.
        // Never deliver an older snapshot after a newer editor change.
        if (!this.#destroyed && generation === this.#generation) this.#onChange?.(data)
      } catch (err) {
        console.warn('[ChangeNotifier] Failed to save:', err)
      }
    }, this.#delay)
  }

  destroy() {
    this.#destroyed = true
    this.#generation++
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
  }
}
