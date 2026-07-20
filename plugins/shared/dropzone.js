/**
 * Shared dropzone (empty-state) view for media block plugins (image, gallery).
 * Eliminates duplicate DOM construction and drag-and-drop wiring.
 */

/**
 * @typedef {Object} DropzoneCssMap
 * @property {string} select Wrapper class.
 * @property {string} selectIcon Icon container class.
 * @property {string} selectText Text container class.
 * @property {string} selectLink Upload link class.
 * @property {string} dropzoneActive Class added during dragover.
 * @property {string} filled Class removed from the wrapper during rendering.
 * @property {string} [selectActions] Optional application-source list class.
 * @property {string} [selectAction] Optional application-source button class.
 */

/**
 * @typedef {Object} DropzoneConfig
 * @property {string} iconHtml SVG icon markup.
 * @property {string} uploadText Localized upload-link text.
 * @property {string} afterText Localized text after the upload link.
 * @property {() => void} onUploadClick Opens the file input.
 * @property {(dataTransfer: DataTransfer) => void} onDrop Handles dropped files.
 * @property {Array<{ label: string, prefix?: string, onSelect: () => void }>} [inlineActions]
 * @property {Array<{ icon?: string, label: string, onSelect: () => void }>} [actions]
 * @property {boolean} [readOnly] Render a non-interactive empty state.
 * @property {string} [emptyText] Text shown for an empty read-only block.
 */

/**
 * Render a dropzone (empty-state) view into a wrapper element.
 * Clears the wrapper, removes the `filled` class, and wires drag-and-drop.
 *
 * @param {HTMLElement} wrapper Block wrapper element.
 * @param {AbortSignal} signal Enables automatic listener cleanup.
 * @param {DropzoneCssMap} css — plugin-specific CSS class names
 * @param {DropzoneConfig} config — icon, text, and callbacks
 * @returns {void}
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

  if (config.readOnly) {
    text.textContent = config.emptyText || config.afterText
    select.append(icon, text)
    wrapper.appendChild(select)
    return
  }

  const uploadLink = document.createElement('button')
  uploadLink.type = 'button'
  uploadLink.className = css.selectLink
  uploadLink.textContent = config.uploadText
  uploadLink.addEventListener('click', (e) => {
    e.stopPropagation()
    config.onUploadClick()
  }, { signal })

  text.append(uploadLink, document.createTextNode(' ' + config.afterText))
  for (const action of config.inlineActions || []) {
    if (action.prefix) text.append(document.createTextNode(' ' + action.prefix + ' '))
    const button = document.createElement('button')
    button.type = 'button'
    button.className = css.selectLink
    button.textContent = action.label
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      action.onSelect()
    }, { signal })
    text.appendChild(button)
  }
  select.append(icon, text)

  if (css.selectActions && css.selectAction && config.actions?.length) {
    const actions = document.createElement('div')
    actions.className = css.selectActions
    for (const action of config.actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = css.selectAction
      if (action.icon) button.insertAdjacentHTML('afterbegin', action.icon)
      button.append(document.createTextNode(action.label))
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        action.onSelect()
      }, { signal })
      actions.appendChild(button)
    }
    select.appendChild(actions)
  }

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
