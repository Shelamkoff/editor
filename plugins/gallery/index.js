import { resolvePath } from '../../shared/resolvePath.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'
import { GalleryState, normalizeGalleryData, emptyGalleryData } from './state.js'
import { GalleryUploader } from './uploader.js'
import { renderEmptyView } from './view-empty.js'
import { renderFilledView } from './view-filled.js'

const editorStyles = resolvePath('./gallery.css', import.meta.url)

/**
 * @typedef {(file: File) => Promise<{ url: string, alt?: string }>} UploadFn
 *
 * @typedef {Object} GalleryConfig
 * @property {UploadFn} [uploadFile]
 * @property {Array<{ icon: string, label: string, handler: () => Promise<Array<{url: string, alt?: string}> | null> }>} [actions]
 */

/**
 * Block plugin for image galleries. Public surface implements `BlockPlugin`.
 * Internal logic is split across:
 *  - `state.js`     — per-block state container (replaces module WeakMap)
 *  - `uploader.js`  — multi-file upload pipeline
 *  - `layout.js`    — layout selection algorithms
 *  - `slot.js`      — slot/overflow item DOM builders + drag handling
 *  - `view-empty.js`/ `view-filled.js` — DOM rendering for the two states
 *  - `settings.js`  — settings dropdown form
 *  - `styles.js`    — gallery-level inline style application
 */
/**
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

  /** @type {GalleryUploader} */
  #uploader

  /** Per-block state, encapsulated to this plugin instance. */
  #states = /** @type {WeakMap<HTMLElement, GalleryState>} */ (new WeakMap())

  /** @param {GalleryConfig} [config] */
  constructor(config) {
    super(config)
    this.#uploader = new GalleryUploader(this._config)
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Gallery')
  }

  // ── BlockPlugin contract ───────────────────────────────────────────────────

  /**
   * @param {Record<string, unknown>} data
   * @returns {HTMLElement}
   */
  render(data) {
    const blockData = normalizeGalleryData(data)

    const wrapper = document.createElement('div')
    wrapper.classList.add(CSS.wrapper)
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    const state = new GalleryState(blockData)
    this.#states.set(wrapper, state)

    if (blockData.images.length > 0) {
      this.#renderFilled(wrapper)
    } else {
      this.#renderEmpty(wrapper)
    }

    return wrapper
  }

  /**
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
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return Array.isArray(/** @type {any} */ (data)?.images)
      && /** @type {any} */ (data).images.length > 0
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const state = this.#states.get(element)
    return !state || state.data.images.length === 0
  }

  /**
   * @param {HTMLElement} _element
   * @returns {Record<string, unknown>}
   */
  exportData(_element) {
    return { text: '' }
  }

  /**
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
   * @param {HTMLElement} element
   */
  destroy(element) {
    const state = this.#states.get(element)
    if (!state) return
    state.dispose()
    this.#states.delete(element)
  }

  // ── Internal coordination ──────────────────────────────────────────────────

  /** @param {string} key @param {string} fallback */
  #t = (key, fallback) => this._t(key, fallback)

  /** @param {HTMLElement} wrapper */
  #notifyChanged = (wrapper) => {
    wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }

  /**
   * Flush in-flight contenteditable caption text into state before any
   * mutation that would re-render and tear down the live caption nodes.
   *
   * @param {HTMLElement} wrapper
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

  /** @param {HTMLElement} wrapper */
  #renderEmpty(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderEmptyView(wrapper, state, {
      t: this.#t,
      onUploadClick: () => this.#triggerFileInput(wrapper),
      onFilesDropped: (files) => { void this.#handleFiles(wrapper, files) },
    })
  }

  /** @param {HTMLElement} wrapper */
  #renderFilled(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    renderFilledView(wrapper, state, {
      t: this.#t,
      syncCaptions: () => this.#syncCaptions(wrapper),
      getState: () => this.#states.get(wrapper),
      reRender: () => this.#renderFilled(wrapper),
      renderEmpty: () => this.#renderEmpty(wrapper),
      notifyChanged: () => this.#notifyChanged(wrapper),
      onFilesDropped: (files) => { void this.#handleFiles(wrapper, files) },
      onTriggerFileInput: () => this.#triggerFileInput(wrapper),
      onPromptUrl: () => this.#promptUrl(wrapper),
      onDeleteAll: () => this.#deleteAll(wrapper),
      customActions: this._config.actions || [],
      runCustomAction: async (handler) => this.#runCustomAction(wrapper, handler),
    })
  }

  /** @param {HTMLElement} wrapper */
  #triggerFileInput(wrapper) {
    triggerFileInput({
      accept: 'image/*',
      multiple: true,
      onFiles: (files) => void this.#handleFiles(wrapper, files),
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File[]} files
   */
  async #handleFiles(wrapper, files) {
    const state = this.#states.get(wrapper)
    if (!state) return
    await this.#uploader.handle(wrapper, files, (added) => {
      state.data.images.push(...added)
      this.#renderFilled(wrapper)
      this.#notifyChanged(wrapper)
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {() => Promise<Array<{url: string, alt?: string}> | null>} handler
   */
  async #runCustomAction(wrapper, handler) {
    const state = this.#states.get(wrapper)
    if (!state) return
    try {
      const result = await handler()
      if (Array.isArray(result) && result.length > 0) {
        for (const item of result) {
          if (item?.url) state.data.images.push({ url: item.url, caption: '' })
        }
        this.#renderFilled(wrapper)
        this.#notifyChanged(wrapper)
      }
    } catch {
      // Action cancelled or failed.
    }
  }

  /** @param {HTMLElement} wrapper */
  #promptUrl(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    const url = prompt(this.#t('urlPrompt', 'Image URL:'))
    if (url && /^https?:\/\/.+/i.test(url)) {
      state.data.images.push({ url, caption: '' })
      this.#syncCaptions(wrapper)
      this.#renderFilled(wrapper)
      this.#notifyChanged(wrapper)
    }
  }

  /** @param {HTMLElement} wrapper */
  #deleteAll(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state) return
    state.data.images = []
    this.#renderEmpty(wrapper)
    this.#notifyChanged(wrapper)
  }
}
