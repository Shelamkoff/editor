/**
 * Debounced change notification.
 * Calls the onChange callback after a quiet period following editor changes.
 */
export class ChangeNotifier {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null

  /** @type {() => import('./types').EditorDocument | Promise<import('./types').EditorDocument>} */
  #saveFn

  /** @type {((data: import('./types').EditorDocument) => void | Promise<void>) | undefined} */
  #onChange

  /** @type {number} */
  #delay

  /** @type {((error: unknown) => void) | undefined} */
  #onError

  /** @type {boolean} */
  #destroyed = false

  /** @type {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} */
  #timerHost

  /** Monotonic ownership token for timer and in-flight save results. */
  #generation = 0

  /**
   * @param {() => import('./types').EditorDocument | Promise<import('./types').EditorDocument>} saveFn
   * @param {((data: import('./types').EditorDocument) => void | Promise<void>)} [onChange]
   * @param {number} [delay]
   * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [timerHost]
   * @param {(error: unknown) => void} [onError]
   */
  constructor(saveFn, onChange, delay = 250, timerHost = globalThis, onError) {
    this.#saveFn = saveFn
    this.#onChange = onChange
    this.#delay = delay
    this.#timerHost = timerHost
    this.#onError = onError
  }

  schedule() {
    if (this.#destroyed || !this.#onChange) return
    const generation = ++this.#generation
    if (this.#timer !== null) this.#timerHost.clearTimeout(this.#timer)
    this.#timer = this.#timerHost.setTimeout(async () => {
      // A retired timer may still be queued by the host. It must not clear
      // a newer pending timer or invoke save after replacement/destroy.
      if (this.#destroyed || generation !== this.#generation || !this.#onChange) return
      this.#timer = null
      try {
        const data = await this.#saveFn()
        // A later schedule owns notification even when its save settles first.
        // Never deliver an older snapshot after a newer editor change.
        if (!this.#destroyed && generation === this.#generation) await this.#onChange?.(data)
      } catch (err) {
        // Rejections from retired saves or observers belong to an old lease.
        if (this.#destroyed || generation !== this.#generation) return
        if (this.#onError) this.#onError(err)
        else console.warn('[ChangeNotifier] Failed to save or notify:', err)
      }
    }, this.#delay)
  }

  destroy() {
    this.#destroyed = true
    this.#generation++
    if (this.#timer !== null) {
      this.#timerHost.clearTimeout(this.#timer)
      this.#timer = null
    }
  }
}
