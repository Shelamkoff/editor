import { invokeObserver } from '../shared/invokeObserver.js'

/**
 * Debounced change notification.
 * Calls the onChange callback after a quiet period following editor changes.
 */
export class ChangeNotifier {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null

  /** @type {() => import('../shared/documentTypes.js').EditorOutputData | Promise<import('../shared/documentTypes.js').EditorOutputData>} */
  #saveFn

  /** @type {((data: import('../shared/documentTypes.js').EditorOutputData) => void | Promise<void>) | undefined} */
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
   * @param {() => import('../shared/documentTypes.js').EditorOutputData | Promise<import('../shared/documentTypes.js').EditorOutputData>} saveFn
   * @param {((data: import('../shared/documentTypes.js').EditorOutputData) => void | Promise<void>)} [onChange]
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
    // Timer handles are already retired by generation. A host window whose
    // clearTimeout throws cannot keep the old callback authoritative or
    // prevent the next notification from being scheduled.
    if (previousTimer !== null) {
      try { this.#timerHost.clearTimeout(previousTimer) } catch {}
    }
    if (this.#destroyed || generation !== this.#generation) return
    let fired = false
    /** @type {ReturnType<typeof setTimeout>} */
    let nextTimer
    try {
      nextTimer = this.#timerHost.setTimeout(async () => {
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
    } catch (error) {
      // A timer host can schedule work and then throw without returning a
      // cancellable handle. Retire that orphan callback by generation so it
      // cannot save after a failed registration, or replace a newer lease.
      if (!this.#destroyed && generation === this.#generation) {
        this.#generation++
        if (this.#onError) invokeObserver(this.#onError, [error], sinkError => {
          try { console.warn('[ChangeNotifier] Error sink failed:', sinkError) } catch {}
        })
        else {
          try { console.warn('[ChangeNotifier] Timer registration failed:', error) } catch {}
        }
      }
      return
    }
    // Timer registration itself is a host callback. It may synchronously
    // schedule a newer change or destroy this notifier before returning its
    // handle. Only the surviving generation may publish a pending timer.
    if (this.#destroyed || generation !== this.#generation) {
      try { this.#timerHost.clearTimeout(nextTimer) } catch {}
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
    if (timer !== null) {
      try { this.#timerHost.clearTimeout(timer) } catch {}
    }
  }
}
