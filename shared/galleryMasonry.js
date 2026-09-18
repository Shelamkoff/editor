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
    waitingObserver?.disconnect()
    waitingObserver = null
    if (frameId !== null && cancelFrame) cancelFrame(frameId)
    frameId = null
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

    starting = true
    stopWaiting()

    try {
      instance = new Masonry(container, {
        columnWidth,
        layoutMode: 'masonry',
        autoColSpan: false,
        gap: readGap(),
        transitionDuration,
        fadeInDuration,
        contentLoadTimeout,
      })
      await instance.append(elements.map((element, index) => ({
        id: `gallery-item-${index}`,
        element,
        colSpan: 1,
        meta: { index },
      })))

      if (destroyed) {
        instance.destroy()
        instance = null
        settle(null)
        return
      }
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
    if (ResizeObserverCtor) {
      waitingObserver = new ResizeObserverCtor(() => {
        void start()
      })
      waitingObserver.observe(container)
    }
    if (requestFrame) {
      frameId = requestFrame(() => {
        frameId = null
        void start()
      })
    }
    scheduleMicrotask(() => {
      void start()
    })
  }

  return {
    ready,
    destroy,
    get instance() {
      return instance
    },
  }
}
