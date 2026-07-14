import { CSS } from './css.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 */

/**
 * Multi-file upload pipeline for the Gallery plugin.
 *
 * - With `uploadFile` configured: each file is sent sequentially to the
 *   backend; failed files are skipped silently.
 * - Without `uploadFile`: files are read as data-URLs via `FileReader`,
 *   then pushed into the gallery in arrival order.
 *
 * Both paths set/clear the `loading` class on the wrapper and call
 * `onAdded(images)` once with the full batch.
 */
export class GalleryUploader {
  /** @type {UploadFn | undefined} */
  #uploadFn

  /** @param {{ uploadFile?: UploadFn }} config */
  constructor(config) {
    this.#uploadFn = config.uploadFile
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   */
  async handle(wrapper, files, onAdded, signal) {
    if (signal?.aborted) return
    if (this.#uploadFn) {
      await this.#uploadRemote(wrapper, files, onAdded, signal)
    } else {
      await this.#readDataUrls(wrapper, files, onAdded, signal)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   */
  async #uploadRemote(wrapper, files, onAdded, signal) {
    if (!this.#uploadFn) return
    wrapper.classList.add(CSS.loading)
    /** @type {Array<{ url: string, caption: string }>} */
    const added = []
    try {
      for (const file of files) {
        if (signal?.aborted) break
        try {
          const result = await this.#uploadFn(file, { signal: signal ?? new AbortController().signal })
          const url = sanitizeMediaUrl(result?.url || '')
          if (!signal?.aborted && url) added.push({ url, caption: result?.alt || '' })
        } catch {
          // Per-file failure — skip and continue.
        }
      }
      if (!signal?.aborted && added.length > 0) onAdded(added)
    } finally {
      wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   */
  #readDataUrls(wrapper, files, onAdded, signal) {
    return new Promise((resolve) => {
      wrapper.classList.add(CSS.loading)
      /** @type {Array<{ url: string, caption: string } | null>} */
      const results = files.map(() => null)
      let remaining = files.length
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        wrapper.classList.remove(CSS.loading)
        const added = results.filter((item) => item !== null)
        if (!signal?.aborted && added.length > 0) onAdded(added)
        resolve(undefined)
      }

      if (remaining === 0) {
        finish()
        return
      }

      files.forEach((file, index) => {
        const reader = new FileReader()
        let readerComplete = false
        const completeReader = () => {
          if (readerComplete) return
          readerComplete = true
          signal?.removeEventListener('abort', abort)
          remaining--
          if (remaining === 0) finish()
        }
        const abort = () => reader.abort()
        signal?.addEventListener('abort', abort, { once: true })
        reader.onload = () => {
          if (!signal?.aborted && typeof reader.result === 'string') {
            results[index] = { url: reader.result, caption: '' }
          }
          completeReader()
        }
        reader.onerror = completeReader
        reader.onabort = completeReader
        try {
          reader.readAsDataURL(file)
        } catch {
          completeReader()
        }
      })
    })
  }
}
