import { ALL_LAYOUTS } from './layout.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

/**
 * @typedef {{ url: string, caption: string }} GalleryImage
 *
 * @typedef {Object} GalleryData
 * @property {GalleryImage[]} images
 * @property {string} layout
 * @property {Record<string, any>} styles
 * @property {Record<string, any>} options
 */

/** Per-block Gallery state and resource ownership. */
export class GalleryState {
  /** @type {GalleryData} */
  data

  /** @type {AbortController | null} */
  abortController = null

  /** @type {Set<AbortController>} */
  taskControllers = new Set()

  /** @type {number} -1 when no drag is in progress. */
  dragIndex = -1

  /** @type {File[]} */
  pendingFiles = []

  /** @type {Promise<void> | null} */
  pendingUpload = null

  /**
   * @param {GalleryData} data
   * @param {File[]} [pendingFiles]
   */
  constructor(data, pendingFiles = []) {
    this.data = data
    this.pendingFiles = pendingFiles
  }

  /**
   * Replace the controller for listeners owned by the current rendered view.
   * Upload/source tasks are independent so re-rendering one completed batch
   * cannot cancel other batches that the user already started.
   * @returns {void}
   */
  resetTransient() {
    this.abortController?.abort()
    this.abortController = new AbortController()
  }

  /** Start and register one asynchronous additive source operation. @returns {AbortController} */
  beginTask() {
    const controller = new AbortController()
    this.taskControllers.add(controller)
    return controller
  }

  /**
   * Complete one source operation.
   * @param {AbortController} controller
   * @returns {boolean} Whether no source operations remain.
   */
  finishTask(controller) {
    this.taskControllers.delete(controller)
    return this.taskControllers.size === 0
  }

  /** Cancel every pending upload or application source action. @returns {void} */
  cancelTasks() {
    for (const controller of this.taskControllers) controller.abort()
    this.taskControllers.clear()
  }

  /** Dispose listeners and pending transient input owned by this block. @returns {void} */
  dispose() {
    this.abortController?.abort()
    this.cancelTasks()
    this.abortController = null
    this.pendingFiles = []
    this.pendingUpload = null
  }
}

/** Create the canonical empty value for a new Gallery block. @returns {GalleryData} */
export function emptyGalleryData() {
  return {
    images: [],
    layout: 'auto',
    styles: {},
    options: { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false },
  }
}

/**
 * Normalize arbitrary input into canonical Gallery data.
 * Unknown layouts and malformed values fall back to documented defaults.
 * @param {Record<string, unknown>} [data]
 * @returns {GalleryData}
 */
export function normalizeGalleryData(data) {
  const images = Array.isArray(data?.images)
    ? data.images.map((img) => ({
        url: sanitizeUrl(normalizeTextValue(/** @type {any} */ (img)?.url), { policy: 'media', fallback: '' }),
        caption: normalizeTextValue(/** @type {any} */ (img)?.caption),
      })).filter(image => image.url)
    : []

  const requestedLayout = normalizeTextValue(data?.layout)
  const layout = ALL_LAYOUTS.includes(requestedLayout) ? requestedLayout : 'auto'
  const rawStyles = data?.styles && typeof data.styles === 'object' && !Array.isArray(data.styles)
    ? /** @type {Record<string, unknown>} */ (data.styles)
    : {}
  const styles = Object.fromEntries(Object.entries(rawStyles).filter(([, value]) => typeof value === 'string'))

  const rawOptions = data?.options && typeof data.options === 'object' && !Array.isArray(data.options)
    ? /** @type {Record<string, unknown>} */ (data.options)
    : {}
  /** @type {Record<string, boolean | number>} */
  const options = {}
  const defaults = { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false }
  for (const [key, fallback] of Object.entries(defaults)) {
    options[key] = typeof rawOptions[key] === 'boolean' ? rawOptions[key] : fallback
  }
  if (Number.isFinite(rawOptions.autoplayInterval) && Number(rawOptions.autoplayInterval) > 0) {
    options.autoplayInterval = Number(rawOptions.autoplayInterval)
  }

  return { images, layout, styles, options }
}
