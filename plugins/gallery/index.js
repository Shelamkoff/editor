import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateGalleryData } from '../../shared/blockDataValidators.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'
import { GalleryState, normalizeGalleryData, emptyGalleryData } from './state.js'
import { GalleryUploader } from './uploader.js'
import { renderEmptyView } from './view-empty.js'
import { renderFilledView } from './view-filled.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

const editorStyles = new URL('./gallery.css', import.meta.url).href

/**
 * @typedef {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, alt?: string }>} UploadFn
 *
 * @typedef {Object} GalleryConfig
 * @property {UploadFn} [uploadFile] Uploads one browser file. Without this callback the plugin reads each file into a data URL stored in the document.
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<Array<{url: string, alt?: string}> | null> }>} [actions] Additional application-owned image sources. `icon` is trusted application markup; never pass user-authored HTML.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in gallery stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 */

/**
 * Editable image gallery with upload-source extensions, ordering, and layout controls.
 * Internal logic is split across:
 *  - `state.js`     — per-block state container (replaces module WeakMap)
 *  - `uploader.js`  — multi-file upload pipeline
 *  - `layout.js`    — layout selection algorithms
 *  - `slot.js`      — slot/overflow item DOM builders + drag handling
 *  - `view-empty.js`/ `view-filled.js` — DOM rendering for the two states
 *  - `settings.js`  — settings dropdown form
 *  - `styles.js`    — gallery-level inline style application
 * @extends {BlockPluginAbstract<GalleryConfig>}
 */
export class Gallery extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]

  type = 'gallery'
  icon = ICON
  inlineTools = false

  pasteConfig = {
    files: ['image/*'],
  }

  #uploader
  /** Per-block state, encapsulated to this plugin instance. */
  #states = /** @type {WeakMap<HTMLElement, GalleryState>} */ (new WeakMap())
  /** @type {WeakMap<HTMLElement, import('../../core/types').BlockMutationContext>} */
  #contexts = new WeakMap()
  /**
   * Create a Gallery instance with the supplied consumer configuration.
   * @param {GalleryConfig} [config]
   */
  constructor(config) {
    super(config)
    this.#uploader = new GalleryUploader(this._config)
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Gallery')
  }

  // ── BlockPlugin contract ───────────────────────────────────────────────────

  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const blockData = normalizeGalleryData(data)
    const pendingFile = /** @type {File | null} */ (/** @type {any} */ (data)?._pendingFile || null)

    const wrapper = document.createElement('div')
    wrapper.classList.add(CSS.wrapper)
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    const state = new GalleryState(blockData, pendingFile ? [pendingFile] : [])
    this.#states.set(wrapper, state)
    this.#contexts.set(wrapper, context)

    if (blockData.images.length > 0) {
      this.#renderFilled(wrapper)
    } else {
      this.#renderEmpty(wrapper)
    }

    if (state.pendingFiles.length > 0 && !context.readOnly) {
      const files = state.pendingFiles
      state.pendingFiles = []
      state.pendingUpload = this.#handleFiles(wrapper, files).finally(() => {
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
    if (!state) return emptyGalleryData()
    this.#syncCaptions(element)
    return {
      images: state.data.images.map((img) => ({ ...img })),
      layout: state.data.layout,
      styles: { ...state.data.styles },
      options: { ...state.data.options },
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validateGalleryData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const state = this.#states.get(element)
    return !state || state.data.images.length === 0
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  exportData(element) {
    const state = this.#states.get(element)
    return { text: state?.data.images.map(image => image.caption).filter(Boolean).join(' ') || '' }
  }

  /**
   * Handle supported pasted content for this block.
   * @param {import('../../types').PasteEvent} event
   * @returns {Record<string, unknown> | null}
   */
  onPaste(event) {
    if (event.type === 'file') {
      // Files dropped via paste — push immediately into the new block.
      // Render path will then upload via the wrapper bound to this default data.
      const data = /** @type {any} */ (emptyGalleryData())
      data._pendingFile = event.file
      return data
    }
    return null
  }

  /**
   * Keep pasted files inside one undo transaction until upload completes.
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

  /** @param {string} key @param {string} fallback @returns {string} */
  #t = (key, fallback) => this._t(key, fallback)

  /** @param {HTMLElement} wrapper @param {() => void} operation @returns {void} */
  #mutate = (wrapper, operation) => {
    this.#contexts.get(wrapper)?.mutate(operation)
  }

  /**
   * Flush in-flight contenteditable caption text into state before any
   * mutation that would re-render and tear down the live caption nodes.
   *
   * @param {HTMLElement} wrapper
   * @returns {void}
   */
  #syncCaptions(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    const slots = wrapper.querySelectorAll(`.${CSS.slot}.${CSS.slotFilled}`)
    slots.forEach((slotEl) => {
      const slot = /** @type {HTMLElement} */ (slotEl)
      const idx = parseInt(slot.dataset.slot || slot.dataset.index || '0', 10)
      const img = state.data.images[idx]
      if (img) {
        const caption = slot.querySelector(`.${CSS.slotCaption}`)
        img.caption = caption?.textContent?.trim() || ''
      }
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #renderEmpty(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderEmptyView(wrapper, state, {
      t: this.#t,
      readOnly: Boolean(this.#contexts.get(wrapper)?.readOnly),
      onUploadClick: () => this.#triggerFileInput(wrapper),
      onFilesDropped: (files) => { void this.#handleFiles(wrapper, files) },
      customActions: this._config.actions || [],
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
      syncCaptions: () => this.#syncCaptions(wrapper),
      getState: () => this.#states.get(wrapper),
      reRender: () => this.#renderFilled(wrapper),
      renderEmpty: () => this.#renderEmpty(wrapper),
      mutate: (operation) => this.#mutate(wrapper, operation),
      onFilesDropped: (files) => { void this.#handleFiles(wrapper, files) },
      onTriggerFileInput: () => this.#triggerFileInput(wrapper),
      onPromptUrl: () => this.#promptUrl(wrapper),
      onDeleteAll: () => this.#deleteAll(wrapper),
      customActions: this._config.actions || [],
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #triggerFileInput(wrapper) {
    if (this.#contexts.get(wrapper)?.readOnly) return
    triggerFileInput({
      accept: 'image/*',
      multiple: true,
      signal: this.#states.get(wrapper)?.abortController?.signal,
      onFiles: (files) => void this.#handleFiles(wrapper, files),
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   * @returns {Promise<void>}
   */
  async #handleFiles(wrapper, files) {
    const state = this.#states.get(wrapper)
    const context = this.#contexts.get(wrapper)
    if (!state || !context || context.readOnly) return
    const accepted = files.filter(isSupportedImageFile)
    if (accepted.length === 0) return
    const controller = state.beginTask()
    wrapper.classList.add(CSS.loading)
    try {
      await this.#uploader.handle(accepted, (added) => {
        if (controller.signal.aborted || this.#states.get(wrapper) !== state) return
        this.#mutate(wrapper, () => {
          this.#syncCaptions(wrapper)
          state.data.images.push(...added)
          this.#renderFilled(wrapper)
        })
      }, controller.signal)
    } finally {
      if (state.finishTask(controller)) wrapper.classList.remove(CSS.loading)
    }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {(context: { signal: AbortSignal }) => Promise<Array<{url: string, alt?: string}> | null>} handler
   * @returns {Promise<void>}
   */
  async #runCustomAction(wrapper, handler) {
    const state = this.#states.get(wrapper)
    if (!state || this.#contexts.get(wrapper)?.readOnly) return
    const controller = state.beginTask()
    wrapper.classList.add(CSS.loading)
    try {
      const result = await handler({ signal: controller.signal })
      if (!controller.signal.aborted && this.#states.get(wrapper) === state && Array.isArray(result) && result.length > 0) {
        const added = result.flatMap(item => {
          const url = sanitizeMediaUrl(item?.url || '')
          if (!url) return []
          return [{ url, caption: typeof item?.alt === 'string' ? item.alt : '' }]
        })
        if (!added.length) return
        this.#mutate(wrapper, () => {
          this.#syncCaptions(wrapper)
          state.data.images.push(...added)
          this.#renderFilled(wrapper)
        })
      }
    } catch {
      // Action cancelled or failed.
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
      this.#mutate(wrapper, () => {
        this.#syncCaptions(wrapper)
        state.data.images.push({ url, caption: '' })
        this.#renderFilled(wrapper)
      })
    }
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #deleteAll(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    state.cancelTasks()
    wrapper.classList.remove(CSS.loading)
    this.#mutate(wrapper, () => {
      state.data.images = []
      this.#renderEmpty(wrapper)
    })
  }
}
