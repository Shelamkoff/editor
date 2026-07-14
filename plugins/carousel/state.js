import { normalizeCarouselData } from '../../shared/carouselData.js'

export class CarouselState {
  /** @param {Record<string, unknown>} data @param {() => string} createId @param {import('../../core/types').BlockMutationContext} context */
  constructor(data, createId, context) {
    this.data = normalizeCarouselData(data, createId)
    this.context = context
    this.activeIndex = 0
    this.viewController = new AbortController()
    this.lifecycleController = new AbortController()
    this.objectUrls = new Set()
    this.pendingUpload = null
  }

  resetView() {
    this.viewController.abort()
    this.viewController = new AbortController()
    this.activeIndex = Math.max(0, Math.min(this.activeIndex, this.data.slides.length - 1))
    return this.viewController.signal
  }

  dispose() {
    this.viewController.abort()
    this.lifecycleController.abort()
    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls.clear()
  }
}
