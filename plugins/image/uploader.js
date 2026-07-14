import { CSS } from './css.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 */

/**
 * File upload pipeline for the Image plugin.
 *
 * Two paths:
 *  - configured `uploadFile`: send to backend, await `{ url }`, render.
 *  - no upload endpoint: read as data-URL via `FileReader`, render in place.
 *
 * Both paths set/clear the loading class on the wrapper and call `onResolve`
 * with the resolved URL on success. Failures are swallowed silently — image
 * data is not corrupted, the user can simply retry.
 *
 * The aborting/cleanup of any in-flight reader is delegated to ImageState's
 * `AbortController`, which the caller resets between renders.
 */
export class ImageUploader {
  /** @type {UploadFn | undefined} */
  #uploadFn

  /** @param {{ uploadFile?: UploadFn }} config */
  constructor(config) {
    this.#uploadFn = config.uploadFile
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   */
  async handle(wrapper, file, onResolve, signal) {
    if (signal?.aborted) return
    if (this.#uploadFn) {
      await this.#uploadRemote(wrapper, file, onResolve, signal)
    } else {
      await this.#readDataUrl(wrapper, file, onResolve, signal)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   */
  async #uploadRemote(wrapper, file, onResolve, signal) {
    if (!this.#uploadFn) return
    wrapper.classList.add(CSS.loading)
    try {
      const result = await this.#uploadFn(file, { signal: signal ?? new AbortController().signal })
      const url = sanitizeMediaUrl(result?.url || '')
      if (!signal?.aborted && url) onResolve({ url, alt: result?.alt })
    } catch {
      // Upload failed, keep current state.
    } finally {
      wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @param {(result: { url: string, alt?: string }) => void} onResolve
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<void>}
   */
  #readDataUrl(wrapper, file, onResolve, signal) {
    wrapper.classList.add(CSS.loading)
    return new Promise((resolve) => {
      const reader = new FileReader()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        wrapper.classList.remove(CSS.loading)
        resolve()
      }
      const abort = () => reader.abort()
      signal?.addEventListener('abort', abort, { once: true })

      reader.onload = () => {
        try {
          if (!signal?.aborted && typeof reader.result === 'string') onResolve({ url: reader.result })
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
