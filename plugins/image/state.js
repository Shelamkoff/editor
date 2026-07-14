/**
 * @typedef {Object} ImageData
 * @property {{ url: string, width?: number, height?: number }} file
 * @property {string} caption
 * @property {boolean} withBorder
 * @property {boolean} expanded
 * @property {boolean} withBackground
 * @property {Record<string, string>} styles
 */

/**
 * Per-block state for an Image instance.
 *
 * Replaces the previous module-level `WeakMap` keyed by wrapper element.
 * Encapsulates lifecycle: an `AbortController` so all DOM listeners attached
 * with `{ signal }` are torn down on `dispose()`, plus a `MutationObserver`
 * for the border-style row in the settings form, plus an object URL for
 * data-URL fallback uploads (revoked on dispose).
 */
export class ImageState {
  /** @type {ImageData} */
  data

  /** @type {AbortController | null} */
  abortController = null

  /** @type {MutationObserver | null} */
  borderObserver = null

  /** @type {string | null} */
  objectUrl = null

  /** @type {File | null} */
  pendingFile = null

  /** @type {Promise<void> | null} */
  pendingUpload = null

  /**
   * @param {ImageData} data
   * @param {File | null} [pendingFile]
   */
  constructor(data, pendingFile = null) {
    this.data = data
    this.pendingFile = pendingFile
  }

  /**
   * Reset listener controller, observer, and any held object URL.
   * Called between view renders (empty → filled, filled → empty)
   * and from full disposal.
   */
  resetTransient() {
    this.abortController?.abort()
    this.abortController = new AbortController()
    this.borderObserver?.disconnect()
    this.borderObserver = null
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  /**
   * Final disposal — block was removed from the editor.
   * After this the state is no longer usable.
   */
  dispose() {
    this.abortController?.abort()
    this.borderObserver?.disconnect()
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.abortController = null
    this.borderObserver = null
    this.objectUrl = null
    this.pendingFile = null
    this.pendingUpload = null
  }
}

/**
 * Construct a fresh `ImageData` from arbitrary user input.
 * Defensive: every field is normalized to its expected type.
 *
 * @param {Record<string, unknown>} [data]
 * @returns {ImageData}
 */
export function normalizeImageData(data) {
  const fileObj = /** @type {any} */ (data?.file)
  /** @type {{ url: string, width?: number, height?: number }} */
  const file = {
    url: sanitizeUrl(String(fileObj?.url || ''), { policy: 'media', fallback: '' }),
  }
  if (Number.isFinite(fileObj?.width) && fileObj.width > 0) file.width = Number(fileObj.width)
  if (Number.isFinite(fileObj?.height) && fileObj.height > 0) file.height = Number(fileObj.height)
  return {
    file,
    caption: String(data?.caption || ''),
    withBorder: !!data?.withBorder,
    expanded: !!data?.expanded,
    withBackground: !!data?.withBackground,
    styles: data?.styles
      ? /** @type {Record<string, string>} */ ({ .../** @type {any} */ (data.styles) })
      : {},
  }
}

/** @returns {ImageData} */
export function emptyImageData() {
  return {
    file: { url: '' },
    caption: '',
    withBorder: false,
    expanded: false,
    withBackground: false,
    styles: {},
  }
}
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
