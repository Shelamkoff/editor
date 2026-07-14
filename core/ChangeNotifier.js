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
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(async () => {
      this.#timer = null
      if (this.#onChange) {
        try {
          const data = await this.#saveFn()
          if (!this.#destroyed) this.#onChange?.(data)
        } catch (err) {
          console.warn('[ChangeNotifier] Failed to save:', err)
        }
      }
    }, this.#delay)
  }

  destroy() {
    this.#destroyed = true
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
  }
}
