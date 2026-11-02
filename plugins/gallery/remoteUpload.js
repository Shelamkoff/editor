import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/** Keep application upload callbacks in the originating file-delivery turn.
 * @param {import('./uploader.js').UploadFn | undefined} uploadFile
 * @param {File[]} files
 * @param {(images:Array<{url:string,caption:string}>)=>void} onAdded
 * @param {AbortSignal | undefined} signal
 * @param {Document} ownerDocument
 * @returns {Promise<void>}
 */
export async function uploadGalleryFiles(uploadFile, files, onAdded, signal, ownerDocument) {
  if (!uploadFile) return
  /** @type {Array<{ url: string, caption: string }>} */
  const added = []
  for (const file of files) {
    if (signal?.aborted) break
    try {
      const AbortControllerCtor = ownerDocument?.defaultView?.AbortController ?? AbortController
      const result = await uploadFile(file, { signal: signal ?? new AbortControllerCtor().signal })
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
