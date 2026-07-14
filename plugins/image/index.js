import { resolvePath } from '../../shared/resolvePath.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateImageData } from '../../shared/blockDataValidators.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'
import { ImageState, normalizeImageData, emptyImageData } from './state.js'
import { ImageUploader } from './uploader.js'
import { renderEmptyView } from './view-empty.js'
import { renderFilledView } from './view-filled.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

const editorStyles = resolvePath('./image.css', import.meta.url)

/**
 * @typedef {Object} ImageConfig
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} [uploadFile]
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null> }>} [actions]
 * @property {boolean} [injectStyles]
 * @property {string} [css]
 */

/**
 * Block plugin for images. Public surface implements `BlockPlugin`.
 * Internal logic is split across:
 *  - `state.js`     — per-block state container (replaces module WeakMap)
 *  - `uploader.js`  — file upload pipeline (HTTP or data-URL fallback)
 *  - `view-empty.js`/ `view-filled.js` — DOM rendering for the two states
 *  - `settings.js`  — settings dropdown form
 *  - `styles.js`    — inline style application
 */
/**
 * @extends {BlockPluginAbstract<ImageConfig>}
 */
export class Image extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]

  type = 'image'
  icon = ICON
  inlineTools = false

  pasteConfig = {
    files: ['image/*'],
    patterns: [/https?:\/\/\S+\.(gif|jpe?g|png|svg|webp)(\?[^\s]*)?$/i],
  }

  /** @type {ImageUploader} */
  #uploader

  /** Per-block state, keyed by wrapper element. Encapsulated to this instance. */
  #states = /** @type {WeakMap<HTMLElement, ImageState>} */ (new WeakMap())

  /** @type {WeakMap<HTMLElement, import('../../core/types').BlockMutationContext>} */
  #contexts = new WeakMap()

  /** @param {ImageConfig} [config] */
  constructor(config) {
    super(config)
    this.#uploader = new ImageUploader(this._config)
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Image')
  }

  // ── BlockPlugin contract ───────────────────────────────────────────────────

  /**
   * @param {Record<string, unknown>} data
   * @returns {HTMLElement}
   */
  render(data, context) {
    const blockData = normalizeImageData(data)
    const pendingFile = /** @type {File | null} */ (/** @type {any} */ (data)?._pendingFile || null)

    const wrapper = document.createElement('div')
    wrapper.classList.add(CSS.wrapper)
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    const state = new ImageState(blockData, pendingFile)
    this.#states.set(wrapper, state)
    this.#contexts.set(wrapper, context)

    if (blockData.withBorder) wrapper.classList.add(CSS.withBorder)
    if (blockData.expanded) wrapper.classList.add(CSS.expanded)
    if (blockData.withBackground) wrapper.classList.add(CSS.withBackground)

    if (blockData.file.url) {
      this.#renderFilled(wrapper)
    } else {
      this.#renderEmpty(wrapper)
    }

    // Drain pending file from paste (async; renders after upload completes).
    if (state.pendingFile && !context.readOnly) {
      const file = state.pendingFile
      state.pendingFile = null
      state.pendingUpload = this.#handleFile(wrapper, file).finally(() => {
        if (this.#states.get(wrapper) === state) state.pendingUpload = null
      })
    }

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  save(element) {
    const state = this.#states.get(element)
    if (!state) return emptyImageData()
    return { ...state.data, styles: { ...state.data.styles } }
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validateImageData(data)
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const state = this.#states.get(element)
    return !state?.data.file.url
  }

  /**
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  exportData(element) {
    const state = this.#states.get(element)
    return { text: state?.data.caption || '' }
  }

  /**
   * @param {import('../../types').PasteEvent} event
   * @returns {Record<string, unknown> | null}
   */
  onPaste(event) {
    if (event.type === 'file') {
      // Pass file via _pendingFile marker — render() will pick it up.
      const data = /** @type {any} */ (emptyImageData())
      data._pendingFile = event.file
      return data
    }
    if (event.type === 'pattern') {
      const url = String(event.data)
      if (url && /^https?:\/\/.+/i.test(url)) {
        return { ...emptyImageData(), file: { url } }
      }
    }
    return null
  }

  /**
   * Keep a file paste inside one undo transaction until its upload finishes.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  waitForPaste(element) {
    return this.#states.get(element)?.pendingUpload ?? Promise.resolve()
  }

  /**
   * @param {HTMLElement} element
   */
  destroy(element) {
    const state = this.#states.get(element)
    if (!state) return
    state.dispose()
    this.#states.delete(element)
    this.#contexts.delete(element)
  }

  // ── Internal coordination ──────────────────────────────────────────────────

  /** @param {string} key @param {string} fallback */
  #t = (key, fallback) => this._t(key, fallback)

  /** @param {HTMLElement} wrapper @param {() => void} operation */
  #mutate = (wrapper, operation) => {
    this.#contexts.get(wrapper)?.mutate(operation)
  }

  /** @param {HTMLElement} wrapper */
  #renderEmpty(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderEmptyView(wrapper, state, {
      t: this.#t,
      onUploadClick: () => this.#triggerFileInput(wrapper),
      onFileDropped: (file) => { void this.#handleFile(wrapper, file) },
      customActions: this._config.actions || [],
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper */
  #renderFilled(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderFilledView(wrapper, state, {
      t: this.#t,
      mutate: (operation) => this.#mutate(wrapper, operation),
      customActions: this._config.actions || [],
      onTriggerFileInput: () => this.#triggerFileInput(wrapper),
      onPromptUrl: () => this.#promptUrl(wrapper),
      onDelete: () => this.#deleteImage(wrapper),
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper */
  #triggerFileInput(wrapper) {
    if (this.#contexts.get(wrapper)?.readOnly) return
    triggerFileInput({
      accept: 'image/*',
      onFiles: (files) => {
        if (files[0]) void this.#handleFile(wrapper, files[0])
      },
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   */
  async #handleFile(wrapper, file) {
    const state = this.#states.get(wrapper)
    const context = this.#contexts.get(wrapper)
    if (!state || !context || context.readOnly) return
    await this.#uploader.handle(wrapper, file, (result) => {
      if (this.#states.get(wrapper) !== state) return
      this.#mutate(wrapper, () => {
        state.data.file = { url: result.url }
        if (result.alt && !state.data.caption) state.data.caption = result.alt
        this.#renderFilled(wrapper)
      })
    }, state.abortController?.signal)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {(context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null>} handler
   */
  async #runCustomAction(wrapper, handler) {
    const state = this.#states.get(wrapper)
    if (!state || this.#contexts.get(wrapper)?.readOnly) return
    try {
      const signal = state.abortController?.signal ?? new AbortController().signal
      const result = await handler({ signal })
      const url = sanitizeMediaUrl(result?.url || '')
      if (!signal.aborted && this.#states.get(wrapper) === state && url) {
        this.#mutate(wrapper, () => {
          state.data.file = { url }
          if (result?.alt && !state.data.caption) state.data.caption = result.alt
          this.#renderFilled(wrapper)
        })
      }
    } catch {
      // Action cancelled or failed.
    }
  }

  /** @param {HTMLElement} wrapper */
  #promptUrl(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state || this.#contexts.get(wrapper)?.readOnly) return
    const url = prompt(this.#t('urlPrompt', 'Image URL:'))
    if (url && /^https?:\/\/.+/i.test(url)) {
      this.#mutate(wrapper, () => {
        state.data.file = { url }
        this.#renderFilled(wrapper)
      })
    }
  }

  /** @param {HTMLElement} wrapper */
  #deleteImage(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    this.#mutate(wrapper, () => {
      state.data.file = { url: '' }
      state.data.styles = {}
      this.#renderEmpty(wrapper)
    })
  }
}
