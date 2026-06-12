/**
 * Debounced change notification.
 * Calls the onChange callback after a quiet period following editor changes.
 */
export class ChangeNotifier {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null

  /** @type {() => Promise<import('./types').EditorDocument>} */
  #saveFn

  /** @type {((data: import('./types').EditorDocument) => void) | undefined} */
  #onChange

  /** @type {number} */
  #delay

  /**
   * @param {() => Promise<import('./types').EditorDocument>} saveFn
   * @param {((data: import('./types').EditorDocument) => void)} [onChange]
   * @param {number} [delay]
   */
  constructor(saveFn, onChange, delay = 250) {
    this.#saveFn = saveFn
    this.#onChange = onChange
    this.#delay = delay
  }

  schedule() {
    if (!this.#onChange) return
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(async () => {
      this.#timer = null
      if (this.#onChange) {
        try {
          const data = await this.#saveFn()
          this.#onChange(data)
        } catch (err) {
          console.warn('[ChangeNotifier] Failed to save:', err)
        }
      }
    }, this.#delay)
  }

  destroy() {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
  }
}
