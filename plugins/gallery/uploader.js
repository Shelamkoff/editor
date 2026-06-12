import { CSS } from './css.js'

/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
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
   */
  async handle(wrapper, files, onAdded) {
    if (this.#uploadFn) {
      await this.#uploadRemote(wrapper, files, onAdded)
    } else {
      await this.#readDataUrls(wrapper, files, onAdded)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   */
  async #uploadRemote(wrapper, files, onAdded) {
    if (!this.#uploadFn) return
    wrapper.classList.add(CSS.loading)
    /** @type {Array<{ url: string, caption: string }>} */
    const added = []
    try {
      for (const file of files) {
        try {
          const result = await this.#uploadFn(file)
          if (result?.url) added.push({ url: result.url, caption: '' })
        } catch {
          // Per-file failure — skip and continue.
        }
      }
      if (added.length > 0) onAdded(added)
    } finally {
      wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @param {(images: Array<{ url: string, caption: string }>) => void} onAdded
   */
  #readDataUrls(wrapper, files, onAdded) {
    return new Promise((resolve) => {
      wrapper.classList.add(CSS.loading)
      /** @type {Array<{ url: string, caption: string }>} */
      const added = []
      let remaining = files.length

      const finish = () => {
        wrapper.classList.remove(CSS.loading)
        if (added.length > 0) onAdded(added)
        resolve(undefined)
      }

      for (const file of files) {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            added.push({ url: reader.result, caption: '' })
          }
          remaining--
          if (remaining === 0) finish()
        }
        reader.onerror = () => {
          remaining--
          if (remaining === 0) finish()
        }
        reader.readAsDataURL(file)
      }
    })
  }
}
