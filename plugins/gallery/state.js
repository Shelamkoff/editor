import { ALL_LAYOUTS } from './layout.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {{ url: string, caption: string }} GalleryImage
 *
 * @typedef {Object} GalleryData
 * @property {GalleryImage[]} images
 * @property {string} layout
 * @property {Record<string, any>} styles
 * @property {Record<string, any>} options
 */

/**
 * Per-block state for a Gallery instance. Encapsulates:
 *  - resolved data (`images`, `layout`, `styles`, `options`)
 *  - an `AbortController` to tear down all signal-bound listeners on
 *    re-render or disposal
 *  - the in-flight drag index (used by slot drag/drop reorder)
 */
export class GalleryState {
  /** @type {GalleryData} */
  data

  /** @type {AbortController | null} */
  abortController = null

  /** @type {number} -1 when no drag in progress */
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
   * Reset the abort controller — used between view renders so that listeners
   * attached to the previous DOM are cleaned up before new ones are added.
   */
  resetTransient() {
    this.abortController?.abort()
    this.abortController = new AbortController()
  }

  /** Final disposal — block was removed from the editor. */
  dispose() {
    this.abortController?.abort()
    this.abortController = null
    this.pendingFiles = []
    this.pendingUpload = null
  }
}

/** @returns {GalleryData} */
export function emptyGalleryData() {
  return {
    images: [],
    layout: 'auto',
    styles: {},
    options: { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false },
  }
}

/**
 * Normalize arbitrary user input into a clean GalleryData.
 * Defensive: validates layout against the known list, coerces strings.
 *
 * @param {Record<string, unknown>} [data]
 * @returns {GalleryData}
 */
export function normalizeGalleryData(data) {
  const images = Array.isArray(data?.images)
    ? data.images.map((img) => ({
        url: sanitizeUrl(String(/** @type {any} */ (img)?.url || ''), { policy: 'media', fallback: '' }),
        caption: String(/** @type {any} */ (img)?.caption || ''),
      }))
    : []

  const layout = ALL_LAYOUTS.includes(String(data?.layout)) ? String(data?.layout) : 'auto'
  const styles = data?.styles ? /** @type {Record<string, any>} */ ({ .../** @type {any} */ (data.styles) }) : {}
  const options = data?.options
    ? /** @type {Record<string, any>} */ ({ .../** @type {any} */ (data.options) })
    : { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false }

  return { images, layout, styles, options }
}
