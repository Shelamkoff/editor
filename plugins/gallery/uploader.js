import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 */

/**
 * Resolve a batch of gallery images through a consumer upload callback or
 * local data URLs. The caller owns loading state and operation lifetime.
 * Result order always follows input-file order; failed files are omitted.
 */
export class GalleryUploader {
  /** @type {UploadFn | undefined} */
  #uploadFn

  /** @param {{ uploadFile?: UploadFn }} config */
  constructor(config) {
    this.#uploadFn = config.uploadFile
  }

  /**
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  async handle(files, onAdded, signal) {
    if (signal?.aborted || files.length === 0) return
    if (this.#uploadFn) {
      await this.#uploadRemote(files, onAdded, signal)
    } else {
      await this.#readDataUrls(files, onAdded, signal)
    }
  }

  /**
   * Upload sequentially so consumers do not receive an uncontrolled request
   * burst and the resulting image order stays deterministic.
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  async #uploadRemote(files, onAdded, signal) {
    if (!this.#uploadFn) return
    /** @type {Array<{ url: string, caption: string }>} */
    const added = []
    for (const file of files) {
      if (signal?.aborted) break
      try {
        const result = await this.#uploadFn(file, { signal: signal ?? new AbortController().signal })
        const url = sanitizeMediaUrl(result?.url || '')
        if (!signal?.aborted && url) {
          added.push({ url, caption: typeof result?.alt === 'string' ? result.alt : '' })
        }
      } catch {
        // Skip a failed file and continue the same batch.
      }
    }
    if (!signal?.aborted && added.length > 0) onAdded(added)
  }

  /**
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  #readDataUrls(files, onAdded, signal) {
    return new Promise((resolve) => {
      /** @type {Array<{ url: string, caption: string } | null>} */
      const results = files.map(() => null)
      let remaining = files.length
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        const added = results.filter((item) => item !== null)
        if (!signal?.aborted && added.length > 0) onAdded(added)
        resolve(undefined)
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
          const url = typeof reader.result === 'string' ? sanitizeMediaUrl(reader.result) : ''
          if (!signal?.aborted && url) results[index] = { url, caption: '' }
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
