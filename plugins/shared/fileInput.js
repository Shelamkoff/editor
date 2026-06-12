/**
 * Shared file input trigger for block plugins (image, gallery, attaches).
 * Eliminates duplicate #triggerFileInput methods.
 */

/**
 * @typedef {Object} FileInputConfig
 * @property {string} [accept] - accepted MIME types (e.g. 'image/*')
 * @property {boolean} [multiple] - allow multiple file selection
 * @property {(files: File[]) => void} onFiles - callback with selected files
 */

/**
 * Programmatically open a file picker dialog and call back with selected files.
 *
 * @param {FileInputConfig} config
 */
export function triggerFileInput(config) {
  const input = document.createElement('input')
  input.type = 'file'
  input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1'
  if (config.accept) input.accept = config.accept
  if (config.multiple) input.multiple = true
  input.addEventListener('change', () => {
    const files = [...(input.files || [])]
    if (files.length > 0) config.onFiles(files)
    input.remove()
  })
  document.body.appendChild(input)
  input.click()
}
