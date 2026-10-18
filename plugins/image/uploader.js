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
   * @param {Document} [ownerDocument]
   * @returns {Promise<void>}
   */
  async handle(file, onResolve, signal, ownerDocument = globalThis.document) {
    if (signal?.aborted) return
    if (this.#uploadFn) {
      await this.#uploadRemote(file, onResolve, signal, ownerDocument)
    } else {
      await this.#readDataUrl(file, onResolve, signal, ownerDocument)
    }
  }

  /**
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   * @param {Document} ownerDocument
   * @returns {Promise<void>}
   */
  async #uploadRemote(file, onResolve, signal, ownerDocument) {
    if (!this.#uploadFn) return
    try {
      const AbortControllerCtor = ownerDocument?.defaultView?.AbortController ?? AbortController
      const result = await this.#uploadFn(file, { signal: signal ?? new AbortControllerCtor().signal })
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
   * @param {Document} ownerDocument
   * @returns {Promise<void>}
   */
  #readDataUrl(file, onResolve, signal, ownerDocument) {
    return new Promise((resolve) => {
      const FileReaderCtor = ownerDocument?.defaultView?.FileReader ?? FileReader
      const reader = new FileReaderCtor()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        reader.onload = reader.onerror = reader.onabort = null
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const abort = () => {
        // Abort dispatch is the authoritative task cancellation. FileReader
        // adapters may omit onabort or throw, but the Promise must settle.
        try { reader.abort() } catch {}
        finally { finish() }
      }
      signal?.addEventListener('abort', abort, { once: true })

      reader.onload = () => {
        if (settled) return
        try {
          const url = typeof reader.result === 'string' ? sanitizeMediaUrl(reader.result) : ''
          if (!signal?.aborted && url) onResolve({ url })
        } catch {
          // Match the remote path's contained-failure contract. A finally
          // alone would resolve handle() AND throw from the FileReader event.
        } finally {
          finish()
        }
      }
      reader.onerror = finish
      reader.onabort = finish

      // A cross-realm FileReader constructor may synchronously tear down the
      // owning block before its signal listener can be registered. Observe
      // the state after installation instead of waiting for an event already
      // dispatched; never begin a reader for a retired task.
      if (signal?.aborted) {
        abort()
        return
      }

      try {
        reader.readAsDataURL(file)
      } catch {
        finish()
      }
    })
  }
}
