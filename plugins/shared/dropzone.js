/**
 * Shared dropzone (empty-state) view for media block plugins (image, gallery).
 * Eliminates duplicate DOM construction and drag-and-drop wiring.
 */

/**
 * @typedef {Object} DropzoneCssMap
 * @property {string} select — wrapper class
 * @property {string} selectIcon — icon container class
 * @property {string} selectText — text container class
 * @property {string} selectLink — upload link class
 * @property {string} dropzoneActive — class added on dragover
 * @property {string} filled — class removed from wrapper on render
 */

/**
 * @typedef {Object} DropzoneConfig
 * @property {string} iconHtml — SVG icon markup
 * @property {string} uploadText — localized "Upload" link text
 * @property {string} afterText — localized text after the upload link
 * @property {() => void} onUploadClick — trigger file input
 * @property {(dataTransfer: DataTransfer) => void} onDrop — handle dropped files
 */

/**
 * Render a dropzone (empty-state) view into a wrapper element.
 * Clears the wrapper, removes the `filled` class, and wires drag-and-drop.
 *
 * @param {HTMLElement} wrapper — block wrapper element
 * @param {AbortSignal} signal — for automatic listener cleanup
 * @param {DropzoneCssMap} css — plugin-specific CSS class names
 * @param {DropzoneConfig} config — icon, text, and callbacks
 */
export function renderDropzone(wrapper, signal, css, config) {
  wrapper.innerHTML = ''
  wrapper.classList.remove(css.filled)

  const select = document.createElement('div')
  select.className = css.select

  const icon = document.createElement('div')
  icon.className = css.selectIcon
  icon.innerHTML = config.iconHtml

  const text = document.createElement('div')
  text.className = css.selectText

  const uploadLink = document.createElement('button')
  uploadLink.type = 'button'
  uploadLink.className = css.selectLink
  uploadLink.textContent = config.uploadText
  uploadLink.addEventListener('click', (e) => {
    e.stopPropagation()
    config.onUploadClick()
  }, { signal })

  const afterText = document.createTextNode(' ' + config.afterText)

  text.append(uploadLink, afterText)
  select.append(icon, text)

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault()
    select.classList.add(css.dropzoneActive)
  }, { signal })
  wrapper.addEventListener('dragleave', () => {
    select.classList.remove(css.dropzoneActive)
  }, { signal })
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault()
    select.classList.remove(css.dropzoneActive)
    if (e.dataTransfer) config.onDrop(e.dataTransfer)
  }, { signal })

  wrapper.appendChild(select)
}
