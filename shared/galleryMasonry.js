// @ts-check
import { Masonry } from '@shelamkoff/masonry'
import { invokeObserver } from './invokeObserver.js'

/**
 * @typedef {Object} GalleryMasonryOptions
 * @property {AbortSignal} [signal]
 * @property {number} [columnWidth]
 * @property {number} [transitionDuration]
 * @property {number} [fadeInDuration]
 * @property {number} [contentLoadTimeout]
 * @property {(error: unknown) => void | Promise<void>} [onError]
 */

/**
 * Mount a Masonry instance once its container is connected and measurable.
 *
 * Editor plugins and renderers both create their DOM before the host inserts
 * it into the document. Waiting for a non-zero box avoids a failed first
 * layout and keeps the two rendering paths on the same implementation.
 *
 * @param {HTMLElement} container
 * @param {HTMLElement[]} elements
 * @param {GalleryMasonryOptions} [options]
 */
export function mountGalleryMasonry(container, elements, options = {}) {
  const {
    signal,
    columnWidth = 240,
    transitionDuration = 200,
    fadeInDuration = 180,
    contentLoadTimeout = 10_000,
    onError,
  } = options

  const view = /** @type {(Window & typeof globalThis) | null} */ (container.ownerDocument?.defaultView ?? null)
  const ResizeObserverCtor = view?.ResizeObserver
  const requestFrame = view?.requestAnimationFrame?.bind(view)
  const cancelFrame = view?.cancelAnimationFrame?.bind(view)
  const getStyle = view?.getComputedStyle?.bind(view)
  const scheduleMicrotask = view?.queueMicrotask?.bind(view) ?? queueMicrotask

  /** @type {Masonry | null} */
  let instance = null
  /** @type {ResizeObserver | null} */
  let waitingObserver = null
  /** @type {number | null} */
  let frameId = null
  let destroyed = false
  let starting = false
  let settled = false
  /** @type {(value: Masonry | null) => void} */
  let resolveReady = () => {}

  const ready = new Promise((resolve) => {
    resolveReady = resolve
  })

  const settle = (/** @type {Masonry | null} */ value) => {
    if (settled) return
    settled = true
    resolveReady(value)
  }

  const stopWaiting = () => {
    // Detach every pending lease before entering a DOM host callback.
    // A disconnect/cancel adapter may synchronously abort this mount and
    // reenter destroy(); no observer or frame may be released twice.
    const observer = waitingObserver
    waitingObserver = null
    const pendingFrame = frameId
    frameId = null
    // Every owner is released independently. An observer/DOM adapter may
    // throw during teardown, but it cannot strand the next resource or the
    // mount's ready promise.
    try { observer?.disconnect() }
    catch (error) { invokeObserver(onError, [error]) }
    try {
      if (pendingFrame !== null && cancelFrame) cancelFrame(pendingFrame)
    } catch (error) { invokeObserver(onError, [error]) }
  }

  const readGap = () => {
    if (!getStyle) return 4
    const style = getStyle(container)
    const value = Number.parseFloat(style.columnGap || style.gap)
    return Number.isFinite(value) && value >= 0 ? value : 4
  }

  // Release one owned layout at most once, even if its disposer fails.
  // Cleanup failures are observer errors, not permission to leave ready pending.
  const releaseInstance = () => {
    const owned = instance
    instance = null
    if (!owned) return
    try { owned.destroy() }
    catch (error) { invokeObserver(onError, [error]) }
  }

  const reportFailure = error => {
    if (destroyed) return
    try { container.classList.add('eg--masonry-fallback') }
    catch (fallbackError) { invokeObserver(onError, [fallbackError]) }
    invokeObserver(onError, [error])
  }

  const start = async () => {
    if (destroyed || starting || settled) return
    // Preflight is owned by this start lease too. Calling a DOM getter may
    // reenter the observer callback or throw before layout construction.
    starting = true
    try {
      if (!container.isConnected || container.getBoundingClientRect().width <= 0) return
      if (destroyed || settled) return

      stopWaiting()
      if (destroyed || settled) return

      const gap = readGap()
      if (destroyed || settled) return
      const owned = new Masonry(container, {
        columnWidth,
        layoutMode: 'masonry',
        autoColSpan: false,
        gap,
        transitionDuration,
        fadeInDuration,
        contentLoadTimeout,
      })
      instance = owned
      // Constructor callbacks can synchronously destroy this mount before
      // its newly constructed instance becomes visible in the owner ledger.
      if (destroyed || settled) {
        releaseInstance()
        return
      }
      const items = elements.map((element, index) => ({
        id: `gallery-item-${index}`,
        element,
        colSpan: 1,
        meta: { index },
      }))
      // Reading caller-supplied elements may also trigger cancellation.
      if (destroyed || settled) return
      await owned.append(items)
      if (destroyed || settled) return
      settle(owned)
    } catch (error) {
      releaseInstance()
      reportFailure(error)
      settle(null)
    } finally {
      starting = false
    }
  }

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    stopWaiting()
    releaseInstance()
    try { signal?.removeEventListener('abort', destroy) }
    catch (error) { invokeObserver(onError, [error]) }
    settle(null)
  }

  if (signal?.aborted) {
    destroy()
  } else {
    try {
      signal?.addEventListener('abort', destroy, { once: true })
      if (!destroyed && ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(() => {
        void start()
      })
      // The constructor may synchronously abort through an owner-realm
      // callback before the returned observer is published to our ledger.
      if (destroyed || settled) {
        try { observer.disconnect() }
        catch (error) { invokeObserver(onError, [error]) }
      } else {
        waitingObserver = observer
        observer.observe(container)
      }
    }
    if (!destroyed && requestFrame) {
      // Some owner-realm animation adapters fire synchronously. Do not
      // publish a phantom frame handle after that callback has completed or
      // after it has synchronously aborted the mount.
      let fired = false
      const pendingFrame = requestFrame(() => {
        fired = true
        frameId = null
        void start()
      })
      if (destroyed || settled) {
        if (!fired && cancelFrame) cancelFrame(pendingFrame)
      } else if (!fired) {
        frameId = pendingFrame
      }
    }
      if (!destroyed) {
        scheduleMicrotask(() => {
          void start()
        })
      }
    } catch (error) {
      // Optional Masonry initialization must never make the owning Gallery
      // fail to mount or retain a half-registered observer/frame/signal.
      reportFailure(error)
      destroy()
    }
  }

  return {
    ready,
    destroy,
    get instance() {
      return instance
    },
  }
}
