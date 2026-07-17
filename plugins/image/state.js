import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

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
 * Owns view listeners, the settings observer, paste coordination, and the
 * latest asynchronous image-source operation.
 */
export class ImageState {
  /** @type {ImageData} */
  data

  /** @type {AbortController | null} */
  abortController = null

  /** @type {MutationObserver | null} */
  borderObserver = null

  /** @type {File | null} */
  pendingFile = null

  /** @type {Promise<void> | null} */
  pendingUpload = null

  /** @type {AbortController | null} */
  taskController = null

  /**
   * @param {ImageData} data
   * @param {File | null} [pendingFile]
   */
  constructor(data, pendingFile = null) {
    this.data = data
    this.pendingFile = pendingFile
  }

  /**
   * Reset listeners and the observer between empty and filled view renders.
   * Source operations use a separate controller because rendering a filled
   * view is part of completing such an operation.
   * @returns {void}
   */
  resetTransient() {
    this.abortController?.abort()
    this.abortController = new AbortController()
    this.borderObserver?.disconnect()
    this.borderObserver = null
  }

  /**
   * Start an asynchronous source operation and cancel the previous one.
   * @returns {AbortController}
   */
  beginTask() {
    this.taskController?.abort()
    this.taskController = new AbortController()
    return this.taskController
  }

  /**
   * Mark a source operation as complete if it is still the latest operation.
   * @param {AbortController} controller
   * @returns {boolean} Whether the controller was current.
   */
  finishTask(controller) {
    if (this.taskController !== controller) return false
    this.taskController = null
    return true
  }

  /**
   * Cancel the current upload or custom source action.
   * @returns {void}
   */
  cancelTask() {
    this.taskController?.abort()
    this.taskController = null
  }

  /**
   * Release all resources after the block was removed from the editor.
   * @returns {void}
   */
  dispose() {
    this.abortController?.abort()
    this.borderObserver?.disconnect()
    this.cancelTask()
    this.abortController = null
    this.borderObserver = null
    this.pendingFile = null
    this.pendingUpload = null
  }
}

/**
 * Construct a fresh `ImageData` from arbitrary user input.
 * Every field is normalized to its expected type.
 *
 * @param {Record<string, unknown>} [data]
 * @returns {ImageData}
 */
export function normalizeImageData(data) {
  const fileObj = /** @type {any} */ (data?.file)
  /** @type {{ url: string, width?: number, height?: number }} */
  const file = {
    url: sanitizeUrl(normalizeTextValue(fileObj?.url), { policy: 'media', fallback: '' }),
  }
  if (Number.isFinite(fileObj?.width) && fileObj.width > 0) file.width = Number(fileObj.width)
  if (Number.isFinite(fileObj?.height) && fileObj.height > 0) file.height = Number(fileObj.height)
  const rawStyles = data?.styles && typeof data.styles === 'object' && !Array.isArray(data.styles)
    ? /** @type {Record<string, unknown>} */ (data.styles)
    : {}
  /** @type {Record<string, string>} */
  const styles = {}
  for (const [name, value] of Object.entries(rawStyles)) {
    if (typeof value === 'string') styles[name] = value
  }
  return {
    file,
    caption: normalizeTextValue(data?.caption),
    withBorder: data?.withBorder === true,
    expanded: data?.expanded === true,
    withBackground: data?.withBackground === true,
    styles,
  }
}

/**
 * Create the canonical empty value used for a new Image block.
 * @returns {ImageData}
 */
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
