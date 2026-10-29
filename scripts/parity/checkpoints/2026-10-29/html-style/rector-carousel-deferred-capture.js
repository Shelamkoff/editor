/**
 * Swipe plugin — position-first drag.
 *
 * pointerdown on viewport, pointermove/up on window (captures fast drags).
 * Uses setPositionDrag (lightweight, no timer cancellation) during drag.
 *
 * @param {object} [options]
 * @param {number} [options.threshold=50]
 * @param {boolean} [options.mouse=false]
 * @param {number} [options.resistance=0.3]
 * @returns {import('../types').CarouselPlugin}
 */
export function createSwipe(options = {}) {
  let ctx = null
  /** @type {HTMLElement | null} */
  let viewport = null

  const threshold = options.threshold ?? 50
  const enableMouse = options.mouse ?? false
  const resistance = options.resistance ?? 0.3
  if (typeof enableMouse !== 'boolean') {
    throw new TypeError('Carousel swipe mouse must be a boolean')
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('Carousel swipe threshold must be a non-negative number')
  }
  if (!Number.isFinite(resistance) || resistance < 0 || resistance > 1) {
    throw new RangeError('Carousel swipe resistance must be between 0 and 1')
  }
  const DEAD_ZONE = 5

  let startX = 0
  let startY = 0
  let startPosition = 0
  let startIndex = 0
  let previousTouchAction = ''
  let dragging = false
  let trackMoved = false
  let directionDecided = false
  let cachedLoop = false
  let cachedStep = 0
  let cachedN = 0
  let cachedPerView = 1
  let cachedPointerId = -1

  /** @type {((e: PointerEvent) => void) | null} */
  let onDown = null
  /** @type {((e: PointerEvent) => void) | null} */
  let onMove = null
  /** @type {((e: PointerEvent) => void) | null} */
  let onUp = null
  /** @type {((e: PointerEvent) => void) | null} */
  let onCancel = null
  /** @type {((e: DragEvent) => void) | null} */
  let onDragStart = null
  let resizeUnsub = null
  /** @type {AbortController | null} */
  let abortController = null

  function cancelDrag() {
    if (!dragging) return
    dragging = false
    trackMoved = false
    directionDecided = false
    if (viewport && cachedPointerId >= 0) {
      try { viewport.releasePointerCapture(cachedPointerId) } catch (_) {}
    }
    cachedPointerId = -1
  }

  return {
    name: 'swipe',

    install(context) {
      ctx = context
      viewport = context.getViewport()
      if (!viewport) return

      onDown = /** @param {PointerEvent} e */ (e) => {
        if (!enableMouse && e.pointerType === 'mouse') return
        if (e.button !== 0) return
        if (dragging || (e.pointerType === 'touch' && !e.isPrimary)) return
        if (/** @type {HTMLElement} */ (e.target).closest('.carousel__arrow, .carousel__dot, .carousel__thumb')) return

        // Take over: grab current position, stop animation cleanly
        startPosition = context.getPosition()
        startIndex = context.getIndex()
        // Cancel rAF/timers but DON'T re-render (slides already in correct position from last rAF frame)
        context.stopAnimation()

        dragging = true
        trackMoved = false
        directionDecided = false
        startX = e.clientX
        startY = e.clientY
        cachedPointerId = e.pointerId
        cachedLoop = context.isLoop()
        cachedStep = context.getStep()
        cachedN = context.getSlideCount()
        cachedPerView = context.getSlidesPerView()

      }

      onMove = /** @param {PointerEvent} e */ (e) => {
        if (!dragging || e.pointerId !== cachedPointerId) return

        const dx = e.clientX - startX
        const dy = e.clientY - startY

        // Dead zone: don't decide direction until 5px of movement
        if (!directionDecided) {
          if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return
          directionDecided = true
          if (Math.abs(dy) > Math.abs(dx)) {
            cancelDrag()
            context.snapBack(startIndex)
            return
          }
          // A press is not yet a swipe: keep native clicks on their original target.
          try { viewport?.setPointerCapture(e.pointerId) } catch { /* detached pointer */ }
        }

        trackMoved = true
        e.preventDefault()

        let newPos = startPosition - dx

        if (!cachedLoop) {
          const maxPos = Math.max(0, cachedN - cachedPerView) * cachedStep
          if (newPos < 0) newPos = newPos * resistance
          else if (newPos > maxPos) newPos = maxPos + (newPos - maxPos) * resistance
        }

        // Lightweight: only updates position + renders, no timer cleanup
        context.setPositionDrag(newPos)
      }

      onUp = /** @param {PointerEvent} e */ (e) => {
        if (!dragging || e.pointerId !== cachedPointerId) return
        dragging = false

        if (viewport && cachedPointerId >= 0) {
          try { viewport.releasePointerCapture(cachedPointerId) } catch (_) {}
        }

        cachedPointerId = -1
        if (!trackMoved) {
          context.snapBack(startIndex)
          return
        }

        const dx = e.clientX - startX

        if (Math.abs(dx) < threshold || cachedStep <= 0) {
          context.snapBack(startIndex)
          return
        }

        const pos = context.getPosition()
        const engine = context.getLoopEngine()
        const perScroll = context.getSlidesPerScroll()
        const direction = dx < 0 ? 1 : -1
        let targetIdx

        if (perScroll > 1) {
          // Exactly one scroll step from the index at pointerdown.
          targetIdx = startIndex + direction * perScroll
        } else {
          targetIdx = engine ? engine.toIndex(pos) : Math.round(pos / cachedStep)
          if (targetIdx === startIndex) targetIdx += direction
        }

        if (cachedLoop) {
          targetIdx = ((targetIdx % cachedN) + cachedN) % cachedN
        } else {
          const maxIdx = Math.max(0, Math.ceil(cachedN - cachedPerView))
          targetIdx = Math.max(0, Math.min(targetIdx, maxIdx))
        }

        if (targetIdx === startIndex) {
          context.snapBack(startIndex)
          return
        }

        context.goToAfterDrag(targetIdx, startIndex, perScroll > 1 ? direction : undefined, startPosition)
      }

      onCancel = e => {
        if (!dragging || e.pointerId !== cachedPointerId) return
        cancelDrag()
        context.snapBack(startIndex)
      }

      // AbortController: all listeners cleaned up on signal abort (destroy or DOM removal)
      abortController = new AbortController()
      const signal = abortController.signal

      // pointerdown on viewport, move/up on WINDOW (captures fast drags outside viewport)
      viewport.addEventListener('pointerdown', onDown, { signal })
      window.addEventListener('pointermove', onMove, { signal })
      window.addEventListener('pointerup', onUp, { signal })
      window.addEventListener('pointercancel', onCancel, { signal })

      previousTouchAction = viewport.style.touchAction
      viewport.style.touchAction = 'pan-y pinch-zoom'
      onDragStart = e => e.preventDefault()
      viewport.addEventListener('dragstart', onDragStart, { signal })

      resizeUnsub = context.on('resize', cancelDrag)
    },

    destroy() {
      cancelDrag()
      resizeUnsub?.()
      resizeUnsub = null
      // Abort all listeners at once (viewport + window)
      abortController?.abort()
      abortController = null
      if (viewport) viewport.style.touchAction = previousTouchAction
      previousTouchAction = ''
      viewport = null
      onDown = null
      onMove = null
      onUp = null
      onCancel = null
      onDragStart = null
      ctx = null
    },
  }
}
