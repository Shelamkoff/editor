import { invokeObserver } from '../shared/invokeObserver.js'

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
    // Revoke the previous handle before entering the host's clearTimeout:
    // it may synchronously schedule a successor. The outer caller must not
    // cancel that successor or allocate another timer for a retired epoch.
    const previousTimer = this.#timer
    this.#timer = null
    if (previousTimer !== null) this.#timerHost.clearTimeout(previousTimer)
    if (this.#destroyed || generation !== this.#generation) return
    let fired = false
    const nextTimer = this.#timerHost.setTimeout(async () => {
      fired = true
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
        if (this.#onError) invokeObserver(this.#onError, [err], sinkError => {
          // Even a throwing diagnostic console cannot reject this timer task.
          try { console.warn('[ChangeNotifier] Error sink failed:', sinkError) } catch {}
        })
        else {
          try { console.warn('[ChangeNotifier] Failed to save or notify:', err) } catch {}
        }
      }
    }, this.#delay)
    // Timer registration itself is a host callback. It may synchronously
    // schedule a newer change or destroy this notifier before returning its
    // handle. Only the surviving generation may publish a pending timer.
    if (this.#destroyed || generation !== this.#generation) {
      this.#timerHost.clearTimeout(nextTimer)
      return
    }
    // Some supplied timer hosts invoke a callback during registration.
    // Its finished callback must not become a phantom pending handle.
    if (fired) return
    this.#timer = nextTimer
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#generation++
    // Detach the lease before the host cancellation callback: a timer host
    // can synchronously reenter destroy() and must never cancel it twice.
    const timer = this.#timer
    this.#timer = null
    if (timer !== null) this.#timerHost.clearTimeout(timer)
  }
}
