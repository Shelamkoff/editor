import { uploadImageFile } from './remoteUpload.js'
import { readImageDataUrl } from '../shared/readImageDataUrl.js'

/** @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,alt?:string}>} UploadFn */

/** Resolve an image through its application upload or owner-realm local reader.
 * The caller owns loading state and task lifetime. Failed work leaves data intact.
 */
export class ImageUploader {
  /** @type {UploadFn | undefined} */
  #uploadFn

  /** @param {{uploadFile?:UploadFn}} config */
  constructor(config) { this.#uploadFn = config.uploadFile }

  /** @param {File} file
   * @param {(result:{url:string,alt?:string})=>void} onResolve
   * @param {AbortSignal | undefined} signal
   * @param {Document} [ownerDocument]
   * @returns {Promise<void>}
   */
  async handle(file, onResolve, signal, ownerDocument = globalThis.document) {
    if (signal?.aborted) return
    if (this.#uploadFn) await uploadImageFile(this.#uploadFn, file, onResolve, signal, ownerDocument)
    else await readImageDataUrl(file, onResolve, signal, ownerDocument)
  }
}
