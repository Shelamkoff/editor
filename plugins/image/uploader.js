import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 */

/**
 * Resolve an image file through the consumer upload callback or a local data
 * URL fallback. The caller owns visual loading state so an older operation
 * cannot clear the indicator for a newer one. Failures leave data unchanged.
 */
export class ImageUploader {
  /** @type {UploadFn | undefined} */
  #uploadFn

  /** @param {{ uploadFile?: UploadFn }} config */
  constructor(config) {
    this.#uploadFn = config.uploadFile
  }

  /**
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  async handle(file, onResolve, signal) {
    if (signal?.aborted) return
    if (this.#uploadFn) {
      await this.#uploadRemote(file, onResolve, signal)
    } else {
      await this.#readDataUrl(file, onResolve, signal)
    }
  }

  /**
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  async #uploadRemote(file, onResolve, signal) {
    if (!this.#uploadFn) return
    try {
      const result = await this.#uploadFn(file, { signal: signal ?? new AbortController().signal })
      const url = sanitizeMediaUrl(result?.url || '')
      if (!signal?.aborted && url) {
        onResolve({ url, alt: typeof result?.alt === 'string' ? result.alt : undefined })
      }
    } catch {
      // Upload failed or was cancelled; keep the current image data.
    }
  }

  /**
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  #readDataUrl(file, onResolve, signal) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const abort = () => reader.abort()
      signal?.addEventListener('abort', abort, { once: true })

      reader.onload = () => {
        try {
          const url = typeof reader.result === 'string' ? sanitizeMediaUrl(reader.result) : ''
          if (!signal?.aborted && url) onResolve({ url })
        } finally {
          finish()
        }
      }
      reader.onerror = finish
      reader.onabort = finish

      try {
        reader.readAsDataURL(file)
      } catch {
        finish()
      }
    })
  }
}
