import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { uid } from '../../core/uid.js'
import {
  normalizeCarouselAspectRatio,
  normalizeCarouselData,
  validateCarouselData,
} from '../../shared/carouselData.js'
import {
  sanitizeRawHtml,
  sanitizeUrl,
  setSafeUrlAttribute,
  setSanitizedRawHtml,
} from '../../shared/sanitize/index.js'
import { makeActionBtn, makeSep } from '../shared/actionBar.js'
import { renderDropzone } from '../shared/dropzone.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { createPluginLayer } from '../shared/layer.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { CarouselState } from './state.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../core/constants.js'
import {
  ICON, ICON_BACK, ICON_CHEVRON, ICON_CODE, ICON_NEXT, ICON_PREVIOUS,
  ICON_REPLACE, ICON_SELECT, ICON_SETTINGS, ICON_TRASH, ICON_UPLOAD, ICON_URL,
} from './icons.js'

const editorStyles = new URL('./carousel.css', import.meta.url).href
const sourceEditorStyles = new URL('../shared/sourceEditor.css', import.meta.url).href

/**
 * Read a local image while respecting the owning block's lifecycle.
 * @param {File} file File to encode.
 * @param {AbortSignal} signal Lifecycle signal owned by the rendered block.
 * @returns {Promise<string>} A data URL for the file.
 */
function readFileDataUrl(file, signal) {
  if (signal.aborted) {
    return Promise.reject(signal.reason || new DOMException('File read aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    let settled = false
    /**
     * Run a completion callback exactly once and detach the abort listener.
     * @param {() => void} callback Completion callback to invoke.
     * @returns {void}
     */
    const finish = (callback) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onSignalAbort)
      callback()
    }
    const rejectAbort = () => reject(signal.reason || new DOMException('File read aborted', 'AbortError'))
    const onSignalAbort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort()
      finish(rejectAbort)
    }
    signal.addEventListener('abort', onSignalAbort, { once: true })
    reader.onload = () => finish(() => resolve(typeof reader.result === 'string' ? reader.result : ''))
    reader.onerror = () => finish(() => reject(reader.error || new Error('Failed to read file')))
    reader.onabort = () => finish(rejectAbort)
    try {
      reader.readAsDataURL(file)
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

/**
 * Determine the slide type represented by a local file. Some file pickers omit
 * the MIME type, so common image and video extensions are used as a narrow
 * fallback only when no MIME type is available.
 * @param {File} file File selected by the user or supplied by a drop operation.
 * @returns {'image' | 'video' | null} Supported slide type, or `null`.
 */
function getMediaFileType(file) {
  const type = file.type.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type) return null
  if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)) return 'image'
  if (/\.(?:mp4|m4v|mov|ogv|webm)$/i.test(file.name)) return 'video'
  return null
}

/**
 * Check whether a local file can be represented by a carousel slide.
 * @param {File} file File selected by the user or supplied by a drop operation.
 * @returns {boolean} Whether the file is a supported image or video.
 */
function isSupportedMediaFile(file) {
  return getMediaFileType(file) !== null
}

/**
 * Infer the media type represented by a sanitized URL. URLs without a known
 * video extension remain images because browsers can still decode extensionless
 * image endpoints, while treating them as videos would remove image semantics.
 * @param {string} url Sanitized media URL.
 * @returns {'image' | 'video'} Slide type inferred from the URL path.
 */
function getMediaUrlType(url) {
  return /\.(?:m4v|mov|mp4|ogg|ogv|webm)(?:[?#]|$)/i.test(url) ? 'video' : 'image'
}

/**
 * @typedef {import('../../shared/carouselData').CarouselData} CarouselData
 * @typedef {import('../../shared/carouselData').CarouselSlide} CarouselSlide
 * @typedef {Object} CarouselAction
 * @property {string} label User-visible label for the application-owned source.
 * @property {string} [icon] Trusted application-provided SVG or HTML markup.
 * @property {(context: { signal: AbortSignal }) => Promise<CarouselSlide[] | null>} handler Loads slides and observes the supplied lifecycle signal.
 * @typedef {Object} CarouselConfig
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, poster?: string }>} [uploadFile] Uploads an image or video selected in the browser. Without this callback images become data URLs, while videos use temporary object URLs retained until editor disposal.
 * @property {CarouselAction[]} [actions] Additional application-owned slide sources such as a media library. Returned slides are normalized and unusable entries are ignored.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in carousel stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 */

/**
 * Editable mixed-media carousel with extensible file sources and display controls.
 * @extends {BlockPluginAbstract<CarouselConfig>}
 */
export class CarouselBlock extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles, sourceEditorStyles]
  type = 'carousel'
  icon = ICON
  inlineTools = false
  pasteConfig = { files: ['image/*', 'video/*'] }

  /** @type {WeakMap<HTMLElement, CarouselState>} */
  #states = new WeakMap()
  /** Temporary local URLs retained for undo/redo until editor disposal. @type {Set<string>} */
  #objectUrls = new Set()
  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() { return this._t('title', 'Carousel') }

  /** Create a stable identifier for a new slide. @returns {string} */
  #createId() { return `slide-${uid()}` }
  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data Serialized carousel data.
   * @param {import('../../core/types').BlockMutationContext} context Editor mutation and lifecycle context.
   * @returns {HTMLElement} Root element owned by this block render.
   */
  render(data, context) {
    const wrapper = document.createElement('div')
    wrapper.className = 'oe-carousel-block'
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1
    const state = new CarouselState(data, () => this.#createId(), context)
    this.#states.set(wrapper, state)
    this.#build(wrapper, state)

    const pending = /** @type {File | undefined} */ (/** @type {any} */ (data)?._pendingFile)
    if (pending && !context.readOnly) {
      state.pendingUpload = this.#addFiles(wrapper, [pending]).finally(() => {
        if (this.#states.get(wrapper) === state) state.pendingUpload = null
      })
    }
    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element Root element returned by `render()`.
   * @returns {CarouselData} Normalized serializable carousel data.
   */
  save(element) {
    const state = this.#states.get(element)
    return state ? structuredClone(state.data) : normalizeCarouselData({}, () => this.#createId())
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data Candidate serialized block data.
   * @returns {boolean} Whether the candidate satisfies the carousel schema.
   */
  validate(data) { return validateCarouselData(data) }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element Root element returned by `render()`.
   * @returns {boolean} Whether the carousel contains no slides.
   */
  isEmpty(element) { return (this.#states.get(element)?.data.slides.length || 0) === 0 }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element Root element returned by `render()`.
   * @returns {{ text: string }} Text assembled from slide captions and alternatives.
   */
  exportData(element) {
    const state = this.#states.get(element)
    return { text: state?.data.slides.map(slide => slide.caption || slide.alt || '').filter(Boolean).join(', ') || '' }
  }

  /**
   * Report whether paste handling completes asynchronously.
   * @param {HTMLElement} element Root element returned by `render()`.
   * @returns {Promise<void>} Promise settled after a pending pasted file is handled.
   */
  waitForPaste(element) { return this.#states.get(element)?.pendingUpload ?? Promise.resolve() }

  /**
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element Root element returned by `render()`.
   * @returns {void}
   */
  destroy(element) {
    const state = this.#states.get(element)
    if (!state) return
    state.dispose()
    this.#states.delete(element)
  }

  /**
   * Release temporary local video URLs after the owning editor has discarded
   * its blocks and history snapshots.
   * @returns {void}
   */
  dispose() {
    for (const url of this.#objectUrls) URL.revokeObjectURL(url)
    this.#objectUrls.clear()
  }

  /**
   * Handle supported pasted content for this block.
   * @param {import('../../types').PasteEvent} event Normalized editor paste event.
   * @returns {{ _pendingFile: File } | null} Deferred file marker, or `null` for unsupported content.
   */
  onPaste(event) {
    if (event.type === 'file' && event.file) return { _pendingFile: event.file }
    return null
  }

  /**
   * Rebuild the current carousel view from mutable block state.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @returns {void}
   */
  #build(wrapper, state) {
    const signal = state.resetView()
    wrapper.replaceChildren()
    wrapper.classList.toggle('oe-carousel-block--filled', state.data.slides.length > 0)
    if (state.data.slides.length === 0) {
      this.#renderEmpty(wrapper, state, signal)
      return
    }
    wrapper.appendChild(this.#stage(wrapper, state, signal))
    if (!state.context.readOnly) wrapper.appendChild(this.#actions(wrapper, state, signal))
    if (!state.context.readOnly) preloadSourceEditor(wrapper, state.lifecycleController.signal, ['url', 'html'])
  }

  /**
   * Render the empty-state file and application-source chooser.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {void}
   */
  #renderEmpty(wrapper, state, signal) {
    if (state.context.readOnly) {
      const empty = document.createElement('div')
      empty.className = 'oe-carousel-block__empty'
      empty.textContent = this._t('emptyReadonly', 'No slides')
      wrapper.appendChild(empty)
      return
    }
    renderDropzone(wrapper, signal, {
      select: 'oe-carousel-block__select',
      selectIcon: 'oe-carousel-block__select-icon',
      selectText: 'oe-carousel-block__select-text',
      selectLink: 'oe-carousel-block__select-link',
      selectActions: 'oe-carousel-block__select-actions',
      selectAction: 'oe-carousel-block__select-action',
      dropzoneActive: 'oe-carousel-block__select--dragover',
      filled: 'oe-carousel-block--filled',
    }, {
      iconHtml: ICON_SELECT,
      uploadText: this._t('upload', 'Upload'),
      afterText: this._t('dropzoneText', 'images or videos from your device or drag and drop them here'),
      onUploadClick: () => this.#triggerFileInput(wrapper),
      onDrop: dataTransfer => { if (dataTransfer.files.length) void this.#addFiles(wrapper, [...dataTransfer.files]) },
      inlineActions: [
        {
          prefix: this._t('dropzoneUrlPrefix', 'or'),
          label: this._t('dropzoneUrl', 'insert a URL'),
          onSelect: () => this.#addUrl(wrapper, state),
        },
        {
          prefix: this._t('dropzoneHtmlPrefix', 'or'),
          label: this._t('dropzoneHtml', 'insert HTML'),
          onSelect: () => this.#addHtml(wrapper, state),
        },
      ],
      actions: this.#sourceActions(wrapper, state),
    })
    preloadSourceEditor(wrapper, state.lifecycleController.signal, ['url', 'html'])
  }

  /**
   * Adapt application-provided slide sources to dropzone actions.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @returns {Array<{icon?: string,label: string,onSelect: () => void}>} Selectable source actions.
   */
  #sourceActions(wrapper, state) {
    return (this._config.actions || []).map(action => ({
      icon: action.icon,
      label: action.label,
      onSelect: () => { void this.#runAction(wrapper, state, action) },
    }))
  }

  /**
   * Build the active media stage and optional navigation controls.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLElement} Carousel stage for the active slide.
   */
  #stage(wrapper, state, signal) {
    const slide = state.data.slides[state.activeIndex]
    const stage = document.createElement('div')
    stage.className = 'oe-carousel-block__stage'
    if (state.data.options.aspectRatio && state.data.options.aspectRatio !== 'auto') {
      stage.classList.add('oe-carousel-block__stage--fixed-ratio')
      stage.style.aspectRatio = state.data.options.aspectRatio
    }

    const media = document.createElement('div')
    media.className = 'oe-carousel-block__media'
    if (slide.type === 'image') {
      const image = document.createElement('img')
      setSafeUrlAttribute(image, 'src', slide.src || '', 'media')
      image.alt = slide.alt || ''
      media.appendChild(image)
    } else if (slide.type === 'video') {
      const video = document.createElement('video')
      video.controls = true
      video.preload = 'metadata'
      setSafeUrlAttribute(video, 'src', slide.src || '', 'media')
      setSafeUrlAttribute(video, 'poster', slide.poster || '', 'media')
      video.setAttribute('aria-label', slide.alt || this._t('video', 'Video slide'))
      media.appendChild(video)
    } else {
      const html = document.createElement('div')
      html.className = 'oe-carousel-block__html'
      setSanitizedRawHtml(html, slide.html || '')
      media.appendChild(html)
    }
    stage.appendChild(media)

    if (state.data.slides.length > 1 && state.data.options.navigation) {
      const previous = this.#navButton(this._t('previous', 'Previous slide'), ICON_PREVIOUS, 'previous', () => this.#activate(wrapper, state, state.activeIndex - 1), signal)
      const next = this.#navButton(this._t('next', 'Next slide'), ICON_NEXT, 'next', () => this.#activate(wrapper, state, state.activeIndex + 1), signal)
      if (!state.data.options.loop) {
        previous.disabled = state.activeIndex === 0
        next.disabled = state.activeIndex === state.data.slides.length - 1
      }
      stage.append(previous, next)
    }

    const counter = document.createElement('span')
    counter.className = 'oe-carousel-block__counter'
    counter.setAttribute('aria-live', 'polite')
    counter.textContent = `${state.activeIndex + 1} / ${state.data.slides.length}`
    stage.appendChild(counter)

    const caption = document.createElement('div')
    caption.className = 'oe-carousel-block__caption'
    caption.contentEditable = state.context.readOnly ? 'false' : 'true'
    caption.dataset.placeholder = this._t('caption', 'Caption')
    caption.textContent = slide.caption || ''
    if (!state.context.readOnly) {
      caption.addEventListener('input', () => { slide.caption = caption.textContent?.trim() || '' }, { signal })
      caption.addEventListener('keydown', event => {
        if (event.key === 'Backspace' && !caption.textContent?.trim()) {
          event.preventDefault()
          event.stopPropagation()
        }
      }, { signal })
    }
    stage.appendChild(caption)

    if (state.data.slides.length > 1 && state.data.options.pagination) {
      const dots = document.createElement('div')
      dots.className = 'oe-carousel-block__dots'
      state.data.slides.forEach((_, index) => {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
        dot.className = 'oe-carousel-block__dot'
        dot.classList.toggle('oe-carousel-block__dot--active', index === state.activeIndex)
        dot.setAttribute('aria-label', this._t('goToSlide', 'Go to slide {index}').replace('{index}', String(index + 1)))
        dot.setAttribute('aria-current', index === state.activeIndex ? 'true' : 'false')
        dot.addEventListener('click', () => this.#activate(wrapper, state, index), { signal })
        dots.appendChild(dot)
      })
      stage.appendChild(dots)
    }

    if (state.data.options.thumbnails && state.data.slides.length > 1) {
      const thumbnails = document.createElement('div')
      thumbnails.className = 'oe-carousel-block__thumbnails'
      state.data.slides.forEach((item, index) => thumbnails.appendChild(this.#thumbnail(wrapper, state, item, index, signal)))
      stage.appendChild(thumbnails)
    }
    return stage
  }

  /**
   * Create one previous or next navigation button.
   * @param {string} label Accessible button label.
   * @param {string} icon Trusted internal SVG markup.
   * @param {string} direction Direction modifier used by the stylesheet.
   * @param {() => void} activate Callback that activates the adjacent slide.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLButtonElement} Configured navigation button.
   */
  #navButton(label, icon, direction, activate, signal) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
    button.className = `oe-carousel-block__nav oe-carousel-block__nav--${direction}`
    button.innerHTML = icon
    button.setAttribute('aria-label', label)
    button.addEventListener('click', activate, { signal })
    return button
  }

  /**
   * Create one thumbnail navigation control.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {CarouselSlide} slide Slide represented by the thumbnail.
   * @param {number} index Zero-based slide index.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLButtonElement} Configured thumbnail button.
   */
  #thumbnail(wrapper, state, slide, index, signal) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
    button.className = 'oe-carousel-block__thumbnail'
    button.classList.toggle('oe-carousel-block__thumbnail--active', index === state.activeIndex)
    button.setAttribute('aria-label', this._t('goToSlide', 'Go to slide {index}').replace('{index}', String(index + 1)))
    button.setAttribute('aria-current', index === state.activeIndex ? 'true' : 'false')
    if (slide.type === 'image' && slide.src) {
      const image = document.createElement('img')
      setSafeUrlAttribute(image, 'src', slide.src, 'media')
      image.alt = ''
      button.appendChild(image)
    } else {
      button.textContent = String(index + 1)
    }
    button.addEventListener('click', () => this.#activate(wrapper, state, index), { signal })
    return button
  }

  /**
   * Activate a slide, applying loop or boundary behavior from current options.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {number} index Requested zero-based slide index.
   * @returns {void}
   */
  #activate(wrapper, state, index) {
    const count = state.data.slides.length
    if (!count) return
    state.activeIndex = state.data.options.loop ? (index + count) % count : Math.max(0, Math.min(index, count - 1))
    this.#build(wrapper, state)
  }

  /**
   * Build the editing action bar shown below a populated carousel.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLElement} Carousel action bar.
   */
  #actions(wrapper, state, signal) {
    const actions = document.createElement('div')
    actions.className = 'oe-carousel-block__actions'
    const main = document.createElement('div')
    main.className = 'oe-carousel-block__actions-view'

    const settings = document.createElement('div')
    settings.className = 'oe-carousel-block__dropdown'
    const layer = createPluginLayer(wrapper, signal)
    const panel = this.#settingsPanel(wrapper, state, signal)
    panel.setAttribute('aria-hidden', 'true')
    /** @type {HTMLButtonElement} */
    let settingsButton
    const setSettingsOpen = open => {
      settings.classList.toggle('oe-carousel-block__dropdown--open', open)
      settingsButton?.setAttribute('aria-expanded', String(open))
      panel.setAttribute('aria-hidden', String(!open))
      if (open) layer.open()
      else layer.close()
    }
    settingsButton = makeActionBtn('oe-carousel-block__action-btn', `${ICON_SETTINGS} ${this._t('settings', 'Settings')}`, () => {
      setSettingsOpen(!settings.classList.contains('oe-carousel-block__dropdown--open'))
    }, signal)
    settingsButton.setAttribute('aria-haspopup', 'true')
    settingsButton.setAttribute('aria-expanded', 'false')
    settings.append(settingsButton, panel)
    document.addEventListener('click', event => {
      const target = event.target
      if (!(target instanceof Node) || !settings.contains(target)) {
        setSettingsOpen(false)
      }
    }, { signal })
    settings.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setSettingsOpen(false)
      settingsButton.focus()
    }, { signal })
    main.append(settings, makeSep('oe-carousel-block__actions-sep'))

    main.appendChild(makeActionBtn(
      'oe-carousel-block__action-btn',
      `${ICON_REPLACE} ${this._t('add', 'Add')} ${ICON_CHEVRON}`,
      () => this.#showAddView(actions, main, wrapper, state, signal),
      signal,
    ))
    main.appendChild(makeSep('oe-carousel-block__actions-sep'))
    const deleteAll = makeActionBtn('oe-carousel-block__action-btn oe-carousel-block__action-btn--danger', ICON_TRASH, () => {
      state.context.mutate(() => {
        state.data.slides = []
        state.activeIndex = 0
        this.#build(wrapper, state)
      })
    }, signal)
    deleteAll.setAttribute('aria-label', this._t('deleteAll', 'Remove all slides'))
    main.appendChild(deleteAll)
    actions.appendChild(main)
    return actions
  }

  /**
   * Replace the primary action bar with controls for adding more slides.
   * @param {HTMLElement} actions Action bar container.
   * @param {HTMLElement} main Primary action bar view to hide temporarily.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {void}
   */
  #showAddView(actions, main, wrapper, state, signal) {
    main.hidden = true
    const view = document.createElement('div')
    view.className = 'oe-carousel-block__actions-view'
    const restore = () => { view.remove(); main.hidden = false }
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_BACK} ${this._t('back', 'Back')}`, restore, signal))
    view.appendChild(makeSep('oe-carousel-block__actions-sep'))
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_UPLOAD} ${this._t('upload', 'Upload')}`, () => {
      this.#triggerFileInput(wrapper); restore()
    }, signal))
    for (const action of this._config.actions || []) {
      view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${action.icon || ''} ${action.label}`, () => {
        void this.#runAction(wrapper, state, action); restore()
      }, signal))
    }
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_URL} URL`, () => {
      restore()
      this.#addUrl(wrapper, state)
    }, signal))
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_CODE} HTML`, () => {
      restore()
      this.#addHtml(wrapper, state)
    }, signal))
    actions.appendChild(view)
  }

  /**
   * Build controls for the active slide and global carousel behavior.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLElement} Settings panel for the current carousel state.
   */
  #settingsPanel(wrapper, state, signal) {
    const slide = state.data.slides[state.activeIndex]
    const panel = document.createElement('div')
    panel.className = 'oe-carousel-block__dropdown-panel oe-carousel-block__settings'
    panel.setAttribute('role', 'group')
    panel.addEventListener('click', event => event.stopPropagation(), { signal })

    panel.appendChild(this.#sectionTitle(this._t('currentSlide', 'Current slide')))
    if (slide.type === 'html') {
      panel.appendChild(this.#field(this._t('html', 'HTML'), slide.html || '', true, value => {
        const html = sanitizeRawHtml(value)
        if (html.trim()) slide.html = html
      }, wrapper, state, signal, 'text', true))
    } else {
      const source = slide.src || ''
      const embeddedSource = /^data:/i.test(source)
      const sourceField = this.#field(this._t('source', 'Source URL'), embeddedSource ? '' : source, false, value => {
        const src = sanitizeUrl(value, { policy: 'media', fallback: '' })
        if (src) slide.src = src
      }, wrapper, state, signal, 'text', true)
      const sourceInput = sourceField.querySelector('input')
      if (embeddedSource && sourceInput instanceof HTMLInputElement) {
        sourceInput.placeholder = this._t('embeddedSource', 'Local file — paste a URL to replace it')
        sourceInput.dataset.oeEmbeddedSource = 'true'
      }
      panel.appendChild(sourceField)
      panel.appendChild(this.#field(this._t('alt', 'Alternative text'), slide.alt || '', false, value => { slide.alt = value }, wrapper, state, signal))
      if (slide.type === 'video') {
        panel.appendChild(this.#field(this._t('poster', 'Poster URL'), slide.poster || '', false, value => {
          slide.poster = sanitizeUrl(value, { policy: 'media', fallback: '' })
        }, wrapper, state, signal))
      }
    }
    panel.appendChild(this.#field(this._t('caption', 'Caption'), slide.caption || '', false, value => { slide.caption = value }, wrapper, state, signal))

    const order = document.createElement('div')
    order.className = 'oe-carousel-block__slide-actions'
    const backward = makeActionBtn('oe-carousel-block__settings-button', `${ICON_PREVIOUS} ${this._t('movePreviousShort', 'Earlier')}`, () => this.#move(wrapper, state, state.activeIndex, state.activeIndex - 1), signal)
    backward.setAttribute('aria-label', this._t('movePrevious', 'Move slide backward'))
    backward.disabled = state.activeIndex === 0
    const forward = makeActionBtn('oe-carousel-block__settings-button', `${this._t('moveNextShort', 'Later')} ${ICON_NEXT}`, () => this.#move(wrapper, state, state.activeIndex, state.activeIndex + 1), signal)
    forward.setAttribute('aria-label', this._t('moveNext', 'Move slide forward'))
    forward.disabled = state.activeIndex === state.data.slides.length - 1
    const remove = makeActionBtn('oe-carousel-block__settings-button oe-carousel-block__settings-button--danger', `${ICON_TRASH} ${this._t('removeSlide', 'Remove slide')}`, () => this.#removeSlide(wrapper, state, state.activeIndex), signal)
    order.append(backward, forward, remove)
    panel.appendChild(order)

    panel.appendChild(this.#sectionTitle(this._t('behavior', 'Behavior')))
    const switches = document.createElement('div')
    switches.className = 'oe-carousel-block__switches'
    for (const key of ['loop', 'autoplay', 'navigation', 'pagination', 'thumbnails']) {
      switches.appendChild(this.#checkbox(this._t(key, key), !!state.data.options[key], checked => {
        state.data.options[key] = checked
      }, wrapper, state, signal))
    }
    panel.appendChild(switches)
    panel.appendChild(this.#field(this._t('autoplayDelay', 'Autoplay delay, ms'), String(state.data.options.autoplayDelay), false, value => {
      const delay = Number(value)
      if (Number.isFinite(delay) && delay > 0) state.data.options.autoplayDelay = Math.floor(delay)
    }, wrapper, state, signal, 'number'))
    panel.appendChild(this.#field(this._t('aspectRatio', 'Aspect ratio'), state.data.options.aspectRatio || '', false, value => {
      const normalized = normalizeCarouselAspectRatio(value)
      if (normalized) state.data.options.aspectRatio = normalized
      else delete state.data.options.aspectRatio
    }, wrapper, state, signal))
    return panel
  }

  /**
   * Create a heading inside the settings panel.
   * @param {string} text Localized heading text.
   * @returns {HTMLElement} Settings section heading.
   */
  #sectionTitle(text) {
    const title = document.createElement('div')
    title.className = 'oe-carousel-block__settings-title'
    title.textContent = text
    return title
  }

  /**
   * Create a settings field that commits one mutation when its value changes.
   * @param {string} label Localized field label.
   * @param {string} value Initial field value.
   * @param {boolean} multiline Whether to create a textarea instead of an input.
   * @param {(value: string) => void} update State update performed inside the mutation.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @param {string} [type] HTML input type used for a single-line field.
   * @param {boolean} [fullWidth] Whether the field spans the settings panel width.
   * @returns {HTMLElement} Label containing the configured input control.
   */
  #field(label, value, multiline, update, wrapper, state, signal, type = 'text', fullWidth = false) {
    const row = document.createElement('label')
    row.className = 'oe-carousel-block__field'
    row.classList.toggle('oe-carousel-block__field--full', fullWidth)
    row.classList.toggle('oe-carousel-block__field--multiline', multiline)
    const title = document.createElement('span')
    title.textContent = label
    const input = multiline
      ? document.createElement('textarea')
      : document.createElement('input')
    if (input instanceof HTMLInputElement) input.type = type
    input.value = value
    input.addEventListener('change', () => state.context.mutate(() => {
      update(input.value)
      this.#build(wrapper, state)
    }), { signal })
    row.append(title, input)
    return row
  }

  /**
   * Create a boolean settings control that commits one mutation per change.
   * @param {string} label Localized control label.
   * @param {boolean} checked Initial checked state.
   * @param {(checked: boolean) => void} update State update performed inside the mutation.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {AbortSignal} signal Signal invalidated when the current view is rebuilt.
   * @returns {HTMLLabelElement} Label containing the checkbox.
   */
  #checkbox(label, checked, update, wrapper, state, signal) {
    const row = document.createElement('label')
    row.className = 'oe-carousel-block__switch'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.addEventListener('change', () => state.context.mutate(() => {
      update(input.checked)
      this.#build(wrapper, state)
    }), { signal })
    row.append(input, document.createTextNode(label))
    return row
  }

  /**
   * Move one slide and keep it active as a single history operation.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {number} from Current zero-based slide index.
   * @param {number} to Requested zero-based destination index.
   * @returns {void}
   */
  #move(wrapper, state, from, to) {
    if (from < 0 || from >= state.data.slides.length || to < 0 || to >= state.data.slides.length || from === to) return
    state.context.mutate(() => {
      const [slide] = state.data.slides.splice(from, 1)
      state.data.slides.splice(to, 0, slide)
      state.activeIndex = to
      this.#build(wrapper, state)
    })
  }

  /**
   * Remove one slide as a single history operation.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {number} index Zero-based index of the slide to remove.
   * @returns {void}
   */
  #removeSlide(wrapper, state, index) {
    if (index < 0 || index >= state.data.slides.length) return
    state.context.mutate(() => {
      state.data.slides.splice(index, 1)
      state.activeIndex = Math.max(0, Math.min(index, state.data.slides.length - 1))
      this.#build(wrapper, state)
    })
  }

  /**
   * Open the temporary local-media picker for this rendered block.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @returns {void}
   */
  #triggerFileInput(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state || state.context.readOnly) return
    triggerFileInput({
      accept: 'image/*,video/*',
      multiple: true,
      signal: state.lifecycleController.signal,
      onFiles: files => { void this.#addFiles(wrapper, files) },
    })
  }

  /**
   * Open the embedded URL editor and append a media slide after validation.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @returns {void}
   */
  #addUrl(wrapper, state) {
    if (state.context.readOnly) return
    openSourceEditor({
      wrapper,
      signal: state.lifecycleController.signal,
      kind: 'url',
      title: this._t('urlEditorTitle', 'Add media by URL'),
      label: this._t('urlEditorLabel', 'Media URL'),
      placeholder: this._t('urlEditorPlaceholder', 'https://example.com/image.jpg'),
      submitText: this._t('sourceSubmit', 'Add'),
      cancelText: this._t('sourceCancel', 'Cancel'),
      invalidText: this._t('invalidUrl', 'Enter a valid media URL.'),
      normalize: value => sanitizeUrl(value, { policy: 'media', fallback: '' }),
      onSubmit: src => {
        if (this.#states.get(wrapper) !== state || state.context.readOnly) return
        const type = getMediaUrlType(src)
        state.context.mutate(() => {
          state.data.slides.push({ id: this.#createId(), type, src, alt: '', caption: '' })
          state.activeIndex = state.data.slides.length - 1
          this.#build(wrapper, state)
        })
      },
    })
  }

  /**
   * Open the embedded HTML editor and append a sanitized HTML slide.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @returns {void}
   */
  #addHtml(wrapper, state) {
    if (state.context.readOnly) return
    openSourceEditor({
      wrapper,
      signal: state.lifecycleController.signal,
      kind: 'html',
      title: this._t('htmlEditorTitle', 'Add HTML slide'),
      label: this._t('htmlEditorLabel', 'Slide HTML'),
      placeholder: this._t('htmlEditorPlaceholder', '<article>...</article>'),
      submitText: this._t('sourceSubmit', 'Add'),
      cancelText: this._t('sourceCancel', 'Cancel'),
      invalidText: this._t('invalidHtml', 'Enter valid slide HTML.'),
      normalize: value => sanitizeRawHtml(value).trim(),
      onSubmit: html => {
        if (this.#states.get(wrapper) !== state || state.context.readOnly) return
        state.context.mutate(() => {
          state.data.slides.push({ id: this.#createId(), type: 'html', html, caption: '' })
          state.activeIndex = state.data.slides.length - 1
          this.#build(wrapper, state)
        })
      },
    })
  }

  /**
   * Convert supported local files to slides and commit them atomically.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {File[]} files Files selected by the user, pasted, or dropped.
   * @returns {Promise<void>} Promise settled after all supported files are processed.
   */
  async #addFiles(wrapper, files) {
    const state = this.#states.get(wrapper)
    if (!state || state.context.readOnly || state.lifecycleController.signal.aborted) return
    const signal = state.lifecycleController.signal
    const supportedFiles = files.filter(isSupportedMediaFile)
    if (!supportedFiles.length) return
    const slides = await Promise.all(supportedFiles.map(async file => {
      try {
        const type = getMediaFileType(file)
        if (!type) return null
        let src = ''
        let poster = ''
        if (this._config.uploadFile) {
          const result = await this._config.uploadFile(file, { signal })
          src = sanitizeUrl(result?.url || '', { policy: 'media', fallback: '' })
          poster = sanitizeUrl(result?.poster || '', { policy: 'media', fallback: '' })
        } else if (type === 'image') {
          src = sanitizeUrl(await readFileDataUrl(file, signal), { policy: 'media', fallback: '' })
        } else {
          src = URL.createObjectURL(file)
          this.#objectUrls.add(src)
        }
        if (!src) return null
        return {
          id: this.#createId(), type, src, alt: file.name, caption: '',
          ...(type === 'video' && poster ? { poster } : {}),
        }
      } catch (error) {
        if (!signal.aborted) console.warn(`[CarouselBlock] Failed to add "${file.name}":`, error)
        return null
      }
    }))
    if (signal.aborted || this.#states.get(wrapper) !== state) return
    const valid = /** @type {CarouselSlide[]} */ (slides.filter(slide => slide !== null))
    if (!valid.length) return
    state.context.mutate(() => {
      state.data.slides.push(...valid)
      state.activeIndex = state.data.slides.length - valid.length
      this.#build(wrapper, state)
    })
  }

  /**
   * Run an application-provided slide source and commit valid results atomically.
   * @param {HTMLElement} wrapper Root element owned by this block render.
   * @param {CarouselState} state Mutable state associated with `wrapper`.
   * @param {CarouselAction} action Application source to execute.
   * @returns {Promise<void>} Promise settled after the source completes or is cancelled.
   */
  async #runAction(wrapper, state, action) {
    try {
      const signal = state.lifecycleController.signal
      const slides = await action.handler({ signal })
      if (!slides || signal.aborted || this.#states.get(wrapper) !== state) return
      const normalized = normalizeCarouselData({ slides, options: state.data.options }, () => this.#createId()).slides
        .filter(slide => slide.type === 'html' ? !!slide.html?.trim() : !!slide.src)
      if (!normalized.length) return
      const usedIds = new Set(state.data.slides.map(slide => slide.id))
      for (const slide of normalized) {
        while (usedIds.has(slide.id)) slide.id = this.#createId()
        usedIds.add(slide.id)
      }
      state.context.mutate(() => {
        state.data.slides.push(...normalized)
        state.activeIndex = state.data.slides.length - normalized.length
        this.#build(wrapper, state)
      })
    } catch (error) {
      if (!state.lifecycleController.signal.aborted) console.warn('[CarouselBlock] Action failed:', error)
    }
  }
}

export { CarouselBlock as Carousel }
