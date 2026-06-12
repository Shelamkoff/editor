import { CSS } from './css.js'

/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
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
   * @param {(url: string) => void} onResolve
   */
  async handle(wrapper, file, onResolve) {
    if (this.#uploadFn) {
      await this.#uploadRemote(wrapper, file, onResolve)
    } else {
      this.#readDataUrl(wrapper, file, onResolve)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @param {(url: string) => void} onResolve
   */
  async #uploadRemote(wrapper, file, onResolve) {
    if (!this.#uploadFn) return
    wrapper.classList.add(CSS.loading)
    try {
      const result = await this.#uploadFn(file)
      if (result?.url) onResolve(result.url)
    } catch {
      // Upload failed, keep current state.
    } finally {
      wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @param {(url: string) => void} onResolve
   */
  #readDataUrl(wrapper, file, onResolve) {
    wrapper.classList.add(CSS.loading)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onResolve(reader.result)
      wrapper.classList.remove(CSS.loading)
    }
    reader.onerror = () => {
      wrapper.classList.remove(CSS.loading)
    }
    reader.readAsDataURL(file)
  }
}
