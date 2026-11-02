import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/** Read one Blob through the owning window and release every event lease.
 * The caller retains task ownership; failures and consumer callback errors
 * keep the existing Image contained-failure contract.
 * @param {Blob} file
 * @param {(result:{url:string})=>void} onResolve
 * @param {AbortSignal | undefined} signal
 * @param {Document} [ownerDocument]
 * @returns {Promise<void>}
 */
export function readImageDataUrl(file, onResolve, signal, ownerDocument = globalThis.document) {
    if (signal?.aborted) return Promise.resolve()
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
