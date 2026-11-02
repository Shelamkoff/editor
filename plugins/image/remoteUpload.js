import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/** Keep the application callback in the originating file-delivery turn.
 * @param {import('./uploader.js').UploadFn | undefined} uploadFile
 * @param {File} file
 * @param {(result:{url:string,alt?:string})=>void} onResolve
 * @param {AbortSignal | undefined} signal
 * @param {Document} ownerDocument
 * @returns {Promise<void>}
 */
export async function uploadImageFile(uploadFile, file, onResolve, signal, ownerDocument) {
  if (!uploadFile || signal?.aborted) return
  try {
    const AbortControllerCtor = ownerDocument?.defaultView?.AbortController ?? AbortController
    const result = await uploadFile(file, { signal: signal ?? new AbortControllerCtor().signal })
    const url = sanitizeMediaUrl(result?.url || '')
    if (!signal?.aborted && url) onResolve({ url, alt: typeof result?.alt === 'string' ? result.alt : undefined })
  } catch {
    // Upload and consumer failures retain the image's contained-failure contract.
  }
}
