import { createPluginLayer } from './layer.js'

/**
 * @typedef {Object} SourceEditorSurface
 * @property {HTMLElement} root
 * @property {HTMLButtonElement} backdrop
 * @property {HTMLFormElement} panel
 * @property {HTMLHeadingElement} title
 * @property {HTMLSpanElement} labelText
 * @property {HTMLInputElement | HTMLTextAreaElement} field
 * @property {HTMLDivElement} error
 * @property {HTMLButtonElement} cancel
 * @property {HTMLButtonElement} submit
 * @property {AbortSignal} signal
 * @property {{ open: () => void, close: () => void }} layer
 * @property {() => void} destroy
 */

/** @type {WeakMap<HTMLElement, { close: () => void, surface: SourceEditorSurface }>} */
const activeEditors = new WeakMap()

/** @type {WeakMap<HTMLElement, Map<'url' | 'html', SourceEditorSurface>>} */
const surfaces = new WeakMap()

/**
 * @typedef {Object} SourceEditorConfig
 * @property {HTMLElement} wrapper Plugin wrapper that owns the editor.
 * @property {AbortSignal} signal Plugin render lifecycle signal.
 * @property {'url' | 'html'} kind Source value kind.
 * @property {string} title Dialog title.
 * @property {string} label Accessible field label.
 * @property {string} placeholder Field placeholder.
 * @property {string} submitText Submit button label.
 * @property {string} cancelText Cancel button label.
 * @property {string} invalidText Validation error.
 * @property {(value: string) => string} normalize Sanitizes and validates input.
 * @property {(value: string) => void} onSubmit Receives the normalized value.
 */

/**
 * Build URL/HTML forms while the owning plugin view is rendered so their
 * first style and layout pass does not happen in the user's click handler.
 *
 * @param {HTMLElement} wrapper Plugin wrapper that owns the editor.
 * @param {AbortSignal} signal Plugin render lifecycle signal.
 * @param {Array<'url' | 'html'>} kinds Forms used by the current plugin view.
 * @returns {void}
 */
export function preloadSourceEditor(wrapper, signal, kinds) {
  if (signal.aborted) return
  for (const kind of new Set(kinds)) ensureSurface(wrapper, signal, kind)
}

/**
 * Open an editor-owned URL or HTML input surface without relying on native
 * browser prompts.
 *
 * @param {SourceEditorConfig} config Source editor configuration.
 * @returns {{ close: () => void }}
 */
export function openSourceEditor(config) {
  if (config.signal.aborted) return { close() {} }
  activeEditors.get(config.wrapper)?.close()

  const surface = ensureSurface(config.wrapper, config.signal, config.kind)
  if (!surface) return { close() {} }
  const controller = new AbortController()
  const { root, backdrop, panel, title, labelText, field, error, cancel, submit } = surface
  backdrop.setAttribute('aria-label', config.cancelText)
  panel.setAttribute('aria-label', config.title)
  title.textContent = config.title
  labelText.textContent = config.label
  field.value = ''
  field.placeholder = config.placeholder
  field.removeAttribute('aria-invalid')
  error.textContent = ''
  error.hidden = true
  cancel.textContent = config.cancelText
  submit.textContent = config.submitText
  setSurfaceVisible(surface, true)
  surface.layer.open()

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    if (activeEditors.get(config.wrapper)?.close === close) activeEditors.delete(config.wrapper)
    controller.abort()
    surface.layer.close()
    setSurfaceVisible(surface, false)
  }
  activeEditors.set(config.wrapper, { close, surface })

  config.signal.addEventListener('abort', close, { once: true, signal: controller.signal })
  backdrop.addEventListener('click', close, { signal: controller.signal })
  cancel.addEventListener('click', close, { signal: controller.signal })
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }, { signal: controller.signal })
  panel.addEventListener('submit', (event) => {
    event.preventDefault()
    let value = ''
    try {
      value = config.normalize(field.value)
    } catch {
      value = ''
    }
    if (!value) {
      error.textContent = config.invalidText
      error.hidden = false
      field.setAttribute('aria-invalid', 'true')
      field.focus()
      return
    }
    close()
    config.onSubmit(value)
  }, { signal: controller.signal })
  field.addEventListener('input', () => {
    error.hidden = true
    field.removeAttribute('aria-invalid')
  }, { signal: controller.signal })

  queueMicrotask(() => {
    if (!closed) field.focus({ preventScroll: true })
  })

  return { close }
}

/**
 * @param {HTMLElement} wrapper
 * @param {AbortSignal} signal
 * @param {'url' | 'html'} kind
 * @returns {SourceEditorSurface | null}
 */
function ensureSurface(wrapper, signal, kind) {
  if (signal.aborted) return null

  let owned = surfaces.get(wrapper)
  if (!owned) {
    owned = new Map()
    surfaces.set(wrapper, owned)
  }

  const cached = owned.get(kind)
  if (cached?.signal === signal && cached.root.isConnected) return cached
  cached?.destroy()

  const root = document.createElement('div')
  root.className = 'oe-source-editor oe-source-editor--preloaded'
  root.dataset.oeSourceEditor = kind
  root.setAttribute('aria-hidden', 'true')
  root.inert = true

  const backdrop = document.createElement('button')
  backdrop.type = 'button'
  backdrop.className = 'oe-source-editor__backdrop'
  backdrop.setAttribute('aria-label', 'Cancel')
  backdrop.tabIndex = -1

  const panel = document.createElement('form')
  panel.className = 'oe-source-editor__panel'
  panel.noValidate = true
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', 'Source')

  const title = document.createElement('h3')
  title.className = 'oe-source-editor__title'
  title.textContent = 'Source'

  const label = document.createElement('label')
  label.className = 'oe-source-editor__label'
  const labelText = document.createElement('span')
  labelText.textContent = 'Source'

  /** @type {HTMLInputElement | HTMLTextAreaElement} */
  let field
  if (kind === 'html') {
    const textarea = document.createElement('textarea')
    textarea.rows = 6
    textarea.spellcheck = false
    field = textarea
  } else {
    const input = document.createElement('input')
    input.type = 'url'
    input.inputMode = 'url'
    input.setAttribute('autocomplete', 'url')
    field = input
  }
  field.className = 'oe-source-editor__field'
  field.required = true
  label.append(labelText, field)

  const error = document.createElement('div')
  error.className = 'oe-source-editor__error'
  error.setAttribute('role', 'alert')
  error.hidden = true

  const actions = document.createElement('div')
  actions.className = 'oe-source-editor__actions'

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'oe-source-editor__button oe-source-editor__button--secondary'
  cancel.textContent = 'Cancel'

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'oe-source-editor__button oe-source-editor__button--primary'
  submit.textContent = 'Insert'

  actions.append(cancel, submit)
  panel.append(title, label, error, actions)
  root.append(backdrop, panel)
  wrapper.appendChild(root)

  const layer = createPluginLayer(wrapper, signal)
  /** @type {SourceEditorSurface} */
  let surface
  const destroy = () => {
    const active = activeEditors.get(wrapper)
    if (active?.surface === surface) active.close()
    root.remove()
    if (owned?.get(kind) === surface) owned.delete(kind)
    if (owned?.size === 0) surfaces.delete(wrapper)
  }
  surface = {
    root,
    backdrop,
    panel,
    title,
    labelText,
    field,
    error,
    cancel,
    submit,
    signal,
    layer,
    destroy,
  }
  owned.set(kind, surface)
  signal.addEventListener('abort', destroy, { once: true })
  return surface
}

/**
 * @param {SourceEditorSurface} surface
 * @param {boolean} visible
 * @returns {void}
 */
function setSurfaceVisible(surface, visible) {
  surface.root.classList.toggle('oe-source-editor--preloaded', !visible)
  surface.root.setAttribute('aria-hidden', String(!visible))
  surface.root.inert = !visible
}
