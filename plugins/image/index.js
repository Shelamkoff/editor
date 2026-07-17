import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateImageData } from '../../shared/blockDataValidators.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'
import { ImageState, normalizeImageData, emptyImageData } from './state.js'
import { ImageUploader } from './uploader.js'
import { renderEmptyView } from './view-empty.js'
import { renderFilledView } from './view-filled.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/index.js'

const editorStyles = new URL('./image.css', import.meta.url).href

/**
 * @typedef {{ url: string, alt?: string }} ImageSourceResult
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<ImageSourceResult>} ImageUpload
 * @typedef {(context: { signal: AbortSignal }) => Promise<ImageSourceResult | null>} ImageSourceHandler
 * @typedef {{ icon?: string, label: string, handler: ImageSourceHandler }} ImageSourceAction
 *
 * @typedef {Object} ImageConfig
 * @property {ImageUpload} [uploadFile] Uploads a browser file. Without this callback the plugin reads the file into a data URL stored in the document.
 * @property {ImageSourceAction[]} [actions] Additional application-owned image sources. `icon` is trusted application markup; never pass user-authored HTML.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in image stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 */

/**
 * Block plugin for images. Public surface implements `BlockPlugin`.
 * Internal logic is split across:
 *  - `state.js` — per-block state container (replaces module WeakMap)
 *  - `uploader.js` — file upload pipeline (HTTP or data-URL fallback)
 *  - `view-empty.js`/`view-filled.js` — DOM rendering for the two states
 *  - `settings.js` — settings dropdown form
 *  - `styles.js` — inline style application
 *
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
    patterns: [/https?:\/\/\S+\.(gif|jpe?g|png|svg|webp)(\?\S*)?$/i],
  }

  #uploader
  /** @type {ImageConfig} */
  #config
  /** Per-block state, keyed by wrapper element. Encapsulated to this instance. */
  #states = /** @type {WeakMap<HTMLElement, ImageState>} */ (new WeakMap())
  /** @type {WeakMap<HTMLElement, import('../../core/types').BlockMutationContext>} */
  #contexts = new WeakMap()
  /**
   * Create an Image instance with the supplied consumer configuration.
   * @param {ImageConfig} [config]
   */
  constructor(config) {
    super(config)
    this.#config = /** @type {ImageConfig} */ (this.getPluginConfig())
    this.#uploader = new ImageUploader(this.#config)
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Image')
  }

  // ── BlockPlugin contract ───────────────────────────────────────────────────

  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
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
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  save(element) {
    const state = this.#states.get(element)
    if (!state) return emptyImageData()
    return { ...state.data, styles: { ...state.data.styles } }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validateImageData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const state = this.#states.get(element)
    return !state?.data.file.url
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  exportData(element) {
    const state = this.#states.get(element)
    return { text: state?.data.caption || '' }
  }

  /**
   * Handle supported pasted content for this block.
   * @param {import('../../types').PasteEvent} event
   * @returns {Record<string, unknown> | null}
   */
  onPaste(event) {
    if (event.type === 'file') {
      // Pass the file through the _pendingFile marker; render() will pick it up.
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
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    const state = this.#states.get(element)
    if (!state) return
    state.dispose()
    this.#states.delete(element)
    this.#contexts.delete(element)
  }

  // ── Internal coordination ──────────────────────────────────────────────────

  /**
   * Resolve a localized image-plugin message.
   * @param {string} key Translation key scoped to the image plugin.
   * @param {string} fallback Message returned when the key is unavailable.
   * @returns {string}
   */
  #t = (key, fallback) => this._t(key, fallback)

  /**
   * Execute one completed block mutation through the editor command context.
   * @param {HTMLElement} wrapper Image block wrapper that owns the context.
   * @param {() => void} operation Synchronous DOM and state mutation.
   * @returns {void}
   */
  #mutate = (wrapper, operation) => {
    this.#contexts.get(wrapper)?.mutate(operation)
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #renderEmpty(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderEmptyView(wrapper, state, {
      t: this.#t,
      readOnly: Boolean(this.#contexts.get(wrapper)?.readOnly),
      onUploadClick: () => this.#triggerFileInput(wrapper),
      onFileDropped: (file) => { void this.#handleFile(wrapper, file) },
      customActions: this.#config.actions || [],
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #renderFilled(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderFilledView(wrapper, state, {
      t: this.#t,
      readOnly: Boolean(this.#contexts.get(wrapper)?.readOnly),
      mutate: (operation) => this.#mutate(wrapper, operation),
      customActions: this.#config.actions || [],
      onTriggerFileInput: () => this.#triggerFileInput(wrapper),
      onPromptUrl: () => this.#promptUrl(wrapper),
      onDelete: () => this.#deleteImage(wrapper),
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #triggerFileInput(wrapper) {
    if (this.#contexts.get(wrapper)?.readOnly) return
    triggerFileInput({
      accept: 'image/*',
      signal: this.#states.get(wrapper)?.abortController?.signal,
      onFiles: (files) => {
        if (files[0]) void this.#handleFile(wrapper, files[0])
      },
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @returns {Promise<void>}
   */
  async #handleFile(wrapper, file) {
    const state = this.#states.get(wrapper)
    const context = this.#contexts.get(wrapper)
    if (!state || !context || context.readOnly || !isSupportedImageFile(file)) return
    const controller = state.beginTask()
    wrapper.classList.add(CSS.loading)
    try {
      await this.#uploader.handle(file, (result) => {
        if (controller.signal.aborted || this.#states.get(wrapper) !== state) return
        this.#mutate(wrapper, () => {
          state.data.file = { url: result.url }
          if (result.alt && !state.data.caption) state.data.caption = result.alt
          this.#renderFilled(wrapper)
        })
      }, controller.signal)
    } finally {
      if (state.finishTask(controller)) wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {(context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null>} handler
   * @returns {Promise<void>}
   */
  async #runCustomAction(wrapper, handler) {
    const state = this.#states.get(wrapper)
    if (!state || this.#contexts.get(wrapper)?.readOnly) return
    const controller = state.beginTask()
    wrapper.classList.add(CSS.loading)
    try {
      const result = await handler({ signal: controller.signal })
      const url = sanitizeMediaUrl(result?.url || '')
      if (!controller.signal.aborted && this.#states.get(wrapper) === state && url) {
        this.#mutate(wrapper, () => {
          state.data.file = { url }
          if (typeof result?.alt === 'string' && result.alt && !state.data.caption) {
            state.data.caption = result.alt
          }
          this.#renderFilled(wrapper)
        })
      }
    } catch {
      // Action was canceled or failed.
    } finally {
      if (state.finishTask(controller)) wrapper.classList.remove(CSS.loading)
    }
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #promptUrl(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state || this.#contexts.get(wrapper)?.readOnly) return
    const url = sanitizeMediaUrl(prompt(this.#t('urlPrompt', 'Image URL:')) || '')
    if (url) {
      state.cancelTask()
      wrapper.classList.remove(CSS.loading)
      this.#mutate(wrapper, () => {
        state.data.file = { url }
        this.#renderFilled(wrapper)
      })
    }
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #deleteImage(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    state.cancelTask()
    wrapper.classList.remove(CSS.loading)
    this.#mutate(wrapper, () => {
      state.data.file = { url: '' }
      state.data.styles = {}
      this.#renderEmpty(wrapper)
    })
  }
}
