import { normalizeCarouselData } from '../../shared/carouselData.js'

/**
 * Mutable state and listener ownership for one mounted Carousel block.
 * A state instance belongs to one block render and must be disposed when that
 * block is replaced or removed.
 */
export class CarouselState {
  /**
   * @param {Record<string, unknown>} data Serialized carousel data.
   * @param {() => string} createId Factory for missing slide identifiers.
   * @param {import('../../core/types').BlockMutationContext} context Editor mutation and lifecycle context.
   */
  constructor(data, createId, context) {
    this.data = normalizeCarouselData(data, createId)
    this.context = context
    this.activeIndex = 0
    this.viewController = new AbortController()
    this.lifecycleController = new AbortController()
    this.pendingUpload = null
  }

  /**
   * Abort listeners for the previous view and return a signal for the next one.
   * @returns {AbortSignal} Signal aborted by the next view reset or state disposal.
   */
  resetView() {
    this.viewController.abort()
    this.viewController = new AbortController()
    this.activeIndex = Math.max(0, Math.min(this.activeIndex, this.data.slides.length - 1))
    return this.viewController.signal
  }

  /**
   * Abort all work owned by this rendered block.
   * @returns {void}
   */
  dispose() {
    this.viewController.abort()
    this.lifecycleController.abort()
  }
}
