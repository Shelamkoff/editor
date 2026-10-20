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
    observer?.disconnect()
    if (pendingFrame !== null && cancelFrame) cancelFrame(pendingFrame)
  }

  const readGap = () => {
    if (!getStyle) return 4
    const style = getStyle(container)
    const value = Number.parseFloat(style.columnGap || style.gap)
    return Number.isFinite(value) && value >= 0 ? value : 4
  }

  const start = async () => {
    if (destroyed || starting || settled) return
    if (!container.isConnected || container.getBoundingClientRect().width <= 0) return
    // Geometry callbacks can synchronously abort the owner.
    if (destroyed || settled) return

    starting = true
    stopWaiting()
    // Disconnecting the observer can itself trigger teardown.
    if (destroyed || settled) return

    try {
      const gap = readGap()
      if (destroyed || settled) return
      instance = new Masonry(container, {
        columnWidth,
        layoutMode: 'masonry',
        autoColSpan: false,
        gap,
        transitionDuration,
        fadeInDuration,
        contentLoadTimeout,
      })
      // A custom DOM adapter can abort from inside the constructor.
      // The returned instance was not yet visible to destroy() at that point.
      if (destroyed || settled) {
        const retired = instance
        instance = null
        retired.destroy()
        return
      }
      await instance.append(elements.map((element, index) => ({
        id: `gallery-item-${index}`,
        element,
        colSpan: 1,
        meta: { index },
      })))

      // destroy() already released the owned instance while append awaited.
      if (destroyed) return
      settle(instance)
    } catch (error) {
      instance?.destroy()
      instance = null
      if (!destroyed) {
        container.classList.add('eg--masonry-fallback')
        invokeObserver(onError, [error])
      }
      settle(null)
    }
  }

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    stopWaiting()
    instance?.destroy()
    instance = null
    signal?.removeEventListener('abort', destroy)
    settle(null)
  }

  if (signal?.aborted) {
    destroy()
  } else {
    signal?.addEventListener('abort', destroy, { once: true })
    if (!destroyed && ResizeObserverCtor) {
      waitingObserver = new ResizeObserverCtor(() => {
        void start()
      })
      if (!destroyed) waitingObserver.observe(container)
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
  }

  return {
    ready,
    destroy,
    get instance() {
      return instance
    },
  }
}
