/**
 * Shared file input trigger for block plugins (image, gallery, attaches).
 * Eliminates duplicate #triggerFileInput methods.
 */

/**
 * @typedef {Object} FileInputConfig
 * @property {string} [accept] - accepted MIME types (e.g. 'image/*')
 * @property {boolean} [multiple] - allow multiple file selection
 * @property {AbortSignal} [signal] - removes the temporary input when the owning view is disposed
 * @property {(files: File[]) => void} onFiles - callback with selected files
 */

/**
 * Programmatically open a file picker dialog and call back with selected files.
 *
 * @param {FileInputConfig} config
 * @returns {void}
 */
export function triggerFileInput(config) {
  if (config.signal?.aborted) return
  const input = document.createElement('input')
  input.type = 'file'
  input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1'
  if (config.accept) input.accept = config.accept
  if (config.multiple) input.multiple = true
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    config.signal?.removeEventListener('abort', cleanup)
    input.remove()
  }
  config.signal?.addEventListener('abort', cleanup, { once: true })
  input.addEventListener('change', () => {
    const files = [...(input.files || [])]
    if (files.length > 0) config.onFiles(files)
    cleanup()
  })
  input.addEventListener('cancel', cleanup, { once: true })
  document.body.appendChild(input)
  try {
    input.click()
  } catch (error) {
    cleanup()
    throw error
  }
}

/**
 * Return whether a browser `File` is an image accepted by media plugins.
 * MIME is authoritative when present; an extension fallback supports files
 * from drag sources that omit MIME metadata.
 * @param {File} file
 * @returns {boolean}
 */
export function isSupportedImageFile(file) {
  const type = file.type.trim().toLowerCase()
  if (type.startsWith('image/')) return true
  if (type) return false
  return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)
}
