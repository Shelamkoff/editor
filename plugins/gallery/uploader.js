import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 */

/**
 * Resolve a batch of gallery images through a consumer upload callback or
 * local data URLs. The caller owns loading state and operation lifetime.
 * Result order always follows input-file order; failed files are omitted.
 * Failure to apply a completed batch rejects handle() in both upload modes.
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
   * @param {Document} [ownerDocument]
   * @returns {Promise<void>}
   */
  async handle(files, onAdded, signal, ownerDocument = globalThis.document) {
    if (signal?.aborted || files.length === 0) return
    if (this.#uploadFn) {
      await this.#uploadRemote(files, onAdded, signal, ownerDocument)
    } else {
      await this.#readDataUrls(files, onAdded, signal, ownerDocument)
    }
  }

  /**
   * Upload sequentially so consumers do not receive an uncontrolled request
   * burst and the resulting image order stays deterministic.
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   * @param {AbortSignal | undefined} signal
   * @param {Document} ownerDocument
   * @returns {Promise<void>}
   */
  async #uploadRemote(files, onAdded, signal, ownerDocument) {
    if (!this.#uploadFn) return
    /** @type {Array<{ url: string, caption: string }>} */
    const added = []
    for (const file of files) {
      if (signal?.aborted) break
      try {
        const AbortControllerCtor = ownerDocument?.defaultView?.AbortController ?? AbortController
        const result = await this.#uploadFn(file, { signal: signal ?? new AbortControllerCtor().signal })
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
   * @param {Document} ownerDocument
   * @returns {Promise<void>}
   */
  #readDataUrls(files, onAdded, signal, ownerDocument) {
    return new Promise((resolve, reject) => {
      /** @type {Array<{ url: string, caption: string } | null>} */
      const results = files.map(() => null)
      let remaining = files.length
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        try {
          const added = results.filter((item) => item !== null)
          if (!signal?.aborted && added.length > 0) onAdded(added)
          resolve(undefined)
        } catch (error) {
          // FileReader events run after the Promise executor has returned.
          // Match the remote path: reject instead of throwing from the event
          // and leaving the caller (and its loading cleanup) pending forever.
          reject(error)
        }
      }

      const FileReaderCtor = ownerDocument?.defaultView?.FileReader ?? FileReader
      files.forEach((file, index) => {
        const reader = new FileReaderCtor()
        let readerComplete = false
        const completeReader = () => {
          if (readerComplete) return
          readerComplete = true
          reader.onload = reader.onerror = reader.onabort = null
          signal?.removeEventListener('abort', abort)
          remaining--
          if (remaining === 0) finish()
        }
        const abort = () => reader.abort()
        signal?.addEventListener('abort', abort, { once: true })
        reader.onload = () => {
          if (readerComplete) return
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
