import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { uid } from '../../core/uid.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { normalizeCarouselData, validateCarouselData } from '../../shared/carouselData.js'
import { sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/sanitizeRawHtml.js'
import { sanitizeUrl, setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { makeActionBtn, makeSep } from '../shared/actionBar.js'
import { renderDropzone } from '../shared/dropzone.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { CarouselState } from './state.js'
import {
  ICON, ICON_BACK, ICON_CHEVRON, ICON_CODE, ICON_NEXT, ICON_PREVIOUS,
  ICON_REPLACE, ICON_SELECT, ICON_SETTINGS, ICON_TRASH, ICON_UPLOAD, ICON_URL,
} from './icons.js'

const editorStyles = resolvePath('./carousel.css', import.meta.url)

/**
 * @typedef {import('../../shared/carouselData').CarouselData} CarouselData
 * @typedef {import('../../shared/carouselData').CarouselSlide} CarouselSlide
 * @typedef {{
 *   uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string, poster?: string }>,
 *   actions?: Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<CarouselSlide[] | null> }>,
 *   injectStyles?: boolean,
 *   css?: string,
 * }} CarouselConfig
 */

/** @extends {BlockPluginAbstract<CarouselConfig>} */
export class CarouselBlock extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'carousel'
  icon = ICON
  inlineTools = false
  pasteConfig = { files: ['image/*', 'video/*'] }

  /** @type {WeakMap<HTMLElement, CarouselState>} */
  #states = new WeakMap()

  /** @returns {string} */
  get title() { return this._t('title', 'Carousel') }

  /** @returns {string} */
  #createId() { return `slide-${uid()}` }

  /** @param {Record<string, unknown>} data @param {import('../../core/types').BlockMutationContext} context */
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

  /** @param {HTMLElement} element @returns {CarouselData} */
  save(element) {
    const state = this.#states.get(element)
    return state ? structuredClone(state.data) : normalizeCarouselData({}, () => this.#createId())
  }

  /** @param {Record<string, unknown>} data */
  validate(data) { return validateCarouselData(data) }

  /** @param {HTMLElement} element */
  isEmpty(element) { return (this.#states.get(element)?.data.slides.length || 0) === 0 }

  /** @param {HTMLElement} element */
  exportData(element) {
    const state = this.#states.get(element)
    return { text: state?.data.slides.map(slide => slide.caption || slide.alt || '').filter(Boolean).join(', ') || '' }
  }

  /** @param {HTMLElement} element */
  waitForPaste(element) { return this.#states.get(element)?.pendingUpload ?? Promise.resolve() }

  /** @param {HTMLElement} element */
  destroy(element) {
    const state = this.#states.get(element)
    if (!state) return
    state.dispose()
    this.#states.delete(element)
  }

  /** @param {import('../../types').PasteEvent} event */
  onPaste(event) {
    if (event.type === 'file' && event.file) return { _pendingFile: event.file }
    return null
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state */
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
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
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
      actions: [
        ...this.#sourceActions(wrapper, state),
        { icon: ICON_URL, label: this._t('addUrl', 'Add URL'), onSelect: () => this.#addUrl(wrapper, state) },
        { icon: ICON_CODE, label: this._t('addHtml', 'Add HTML'), onSelect: () => this.#addHtml(wrapper, state) },
      ],
    })
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @returns {Array<{icon?: string,label: string,onSelect: () => void}>} */
  #sourceActions(wrapper, state) {
    return (this._config.actions || []).map(action => ({
      icon: action.icon,
      label: action.label,
      onSelect: () => { void this.#runAction(wrapper, state, action) },
    }))
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
  #stage(wrapper, state, signal) {
    const slide = state.data.slides[state.activeIndex]
    const stage = document.createElement('div')
    stage.className = 'oe-carousel-block__stage'
    if (state.data.options.aspectRatio) stage.style.aspectRatio = state.data.options.aspectRatio

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
      media.appendChild(video)
    } else {
      const html = document.createElement('div')
      html.className = 'oe-carousel-block__html'
      setSanitizedRawHtml(html, slide.html || '')
      media.appendChild(html)
    }
    stage.appendChild(media)

    if (state.data.slides.length > 1 && state.data.options.navigation) {
      stage.append(
        this.#navButton(this._t('previous', 'Previous slide'), ICON_PREVIOUS, 'previous', () => this.#activate(wrapper, state, state.activeIndex - 1), signal),
        this.#navButton(this._t('next', 'Next slide'), ICON_NEXT, 'next', () => this.#activate(wrapper, state, state.activeIndex + 1), signal),
      )
    }

    const counter = document.createElement('span')
    counter.className = 'oe-carousel-block__counter'
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

  /** @param {string} label @param {string} icon @param {string} direction @param {() => void} activate @param {AbortSignal} signal */
  #navButton(label, icon, direction, activate, signal) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `oe-carousel-block__nav oe-carousel-block__nav--${direction}`
    button.innerHTML = icon
    button.setAttribute('aria-label', label)
    button.addEventListener('click', activate, { signal })
    return button
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {CarouselSlide} slide @param {number} index @param {AbortSignal} signal */
  #thumbnail(wrapper, state, slide, index, signal) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'oe-carousel-block__thumbnail'
    button.classList.toggle('oe-carousel-block__thumbnail--active', index === state.activeIndex)
    button.setAttribute('aria-label', this._t('goToSlide', 'Go to slide {index}').replace('{index}', String(index + 1)))
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

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {number} index */
  #activate(wrapper, state, index) {
    const count = state.data.slides.length
    if (!count) return
    state.activeIndex = state.data.options.loop ? (index + count) % count : Math.max(0, Math.min(index, count - 1))
    this.#build(wrapper, state)
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
  #actions(wrapper, state, signal) {
    const actions = document.createElement('div')
    actions.className = 'oe-carousel-block__actions'
    const main = document.createElement('div')
    main.className = 'oe-carousel-block__actions-view'

    const settings = document.createElement('div')
    settings.className = 'oe-carousel-block__dropdown'
    const settingsButton = makeActionBtn('oe-carousel-block__action-btn', `${ICON_SETTINGS} ${this._t('settings', 'Settings')}`, () => {
      settings.classList.toggle('oe-carousel-block__dropdown--open')
    }, signal)
    const panel = this.#settingsPanel(wrapper, state, signal)
    settings.append(settingsButton, panel)
    document.addEventListener('click', event => {
      if (!settings.contains(/** @type {Node} */ (event.target))) settings.classList.remove('oe-carousel-block__dropdown--open')
    }, { signal })
    main.append(settings, makeSep('oe-carousel-block__actions-sep'))

    main.appendChild(makeActionBtn(
      'oe-carousel-block__action-btn',
      `${ICON_REPLACE} ${this._t('add', 'Add')} ${ICON_CHEVRON}`,
      () => this.#showAddView(actions, main, wrapper, state, signal),
      signal,
    ))
    main.appendChild(makeSep('oe-carousel-block__actions-sep'))
    main.appendChild(makeActionBtn('oe-carousel-block__action-btn oe-carousel-block__action-btn--danger', ICON_TRASH, () => {
      state.context.mutate(() => {
        state.data.slides = []
        state.activeIndex = 0
        this.#build(wrapper, state)
      })
    }, signal))
    actions.appendChild(main)
    return actions
  }

  /** @param {HTMLElement} actions @param {HTMLElement} main @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
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
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_URL} URL`, () => { this.#addUrl(wrapper, state); restore() }, signal))
    view.appendChild(makeActionBtn('oe-carousel-block__action-btn', `${ICON_CODE} HTML`, () => { this.#addHtml(wrapper, state); restore() }, signal))
    actions.appendChild(view)
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
  #settingsPanel(wrapper, state, signal) {
    const slide = state.data.slides[state.activeIndex]
    const panel = document.createElement('div')
    panel.className = 'oe-carousel-block__dropdown-panel oe-carousel-block__settings'
    panel.addEventListener('click', event => event.stopPropagation(), { signal })

    panel.appendChild(this.#sectionTitle(this._t('currentSlide', 'Current slide')))
    if (slide.type === 'html') {
      panel.appendChild(this.#field(this._t('html', 'HTML'), slide.html || '', true, value => {
        slide.html = sanitizeRawHtml(value)
      }, wrapper, state, signal, 'text', true))
    } else {
      panel.appendChild(this.#field(this._t('source', 'Source URL'), slide.src || '', false, value => {
        slide.src = sanitizeUrl(value, { policy: 'media', fallback: '' })
      }, wrapper, state, signal, 'text', true))
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
      const normalized = value.trim()
      if (/^(?:auto|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)$/.test(normalized)) state.data.options.aspectRatio = normalized
      else delete state.data.options.aspectRatio
    }, wrapper, state, signal))
    return panel
  }

  /** @param {string} text */
  #sectionTitle(text) {
    const title = document.createElement('div')
    title.className = 'oe-carousel-block__settings-title'
    title.textContent = text
    return title
  }

  /** @param {string} label @param {string} value @param {boolean} multiline @param {(value: string) => void} update @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal @param {string} [type] @param {boolean} [fullWidth] */
  #field(label, value, multiline, update, wrapper, state, signal, type = 'text', fullWidth = false) {
    const row = document.createElement('label')
    row.className = 'oe-carousel-block__field'
    row.classList.toggle('oe-carousel-block__field--full', fullWidth)
    const title = document.createElement('span')
    title.textContent = label
    const input = document.createElement(multiline ? 'textarea' : 'input')
    if (!multiline) input.type = type
    input.value = value
    input.addEventListener('change', () => state.context.mutate(() => {
      update(input.value)
      this.#build(wrapper, state)
    }), { signal })
    row.append(title, input)
    return row
  }

  /** @param {string} label @param {boolean} checked @param {(checked: boolean) => void} update @param {HTMLElement} wrapper @param {CarouselState} state @param {AbortSignal} signal */
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

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {number} from @param {number} to */
  #move(wrapper, state, from, to) {
    if (to < 0 || to >= state.data.slides.length) return
    state.context.mutate(() => {
      const [slide] = state.data.slides.splice(from, 1)
      state.data.slides.splice(to, 0, slide)
      state.activeIndex = to
      this.#build(wrapper, state)
    })
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {number} index */
  #removeSlide(wrapper, state, index) {
    state.context.mutate(() => {
      state.data.slides.splice(index, 1)
      state.activeIndex = Math.min(index, state.data.slides.length - 1)
      this.#build(wrapper, state)
    })
  }

  /** @param {HTMLElement} wrapper */
  #triggerFileInput(wrapper) {
    const state = this.#states.get(wrapper)
    if (!state || state.context.readOnly) return
    triggerFileInput({ accept: 'image/*,video/*', multiple: true, onFiles: files => { void this.#addFiles(wrapper, files) } })
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state */
  #addUrl(wrapper, state) {
    if (state.context.readOnly) return
    const source = prompt(this._t('sourcePrompt', 'Media URL'))
    if (!source) return
    const src = sanitizeUrl(source, { policy: 'media', fallback: '' })
    if (!src) return
    const type = /\.(?:mp4|webm|ogg)(?:[?#]|$)/i.test(src) ? 'video' : 'image'
    state.context.mutate(() => {
      state.data.slides.push({ id: this.#createId(), type, src, alt: '', caption: '' })
      state.activeIndex = state.data.slides.length - 1
      this.#build(wrapper, state)
    })
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state */
  #addHtml(wrapper, state) {
    if (state.context.readOnly) return
    const html = prompt(this._t('htmlPrompt', 'Slide HTML'))
    if (!html) return
    const safe = sanitizeRawHtml(html)
    if (!safe.trim()) return
    state.context.mutate(() => {
      state.data.slides.push({ id: this.#createId(), type: 'html', html: safe, caption: '' })
      state.activeIndex = state.data.slides.length - 1
      this.#build(wrapper, state)
    })
  }

  /** @param {HTMLElement} wrapper @param {File[]} files */
  async #addFiles(wrapper, files) {
    const state = this.#states.get(wrapper)
    if (!state || state.context.readOnly || state.lifecycleController.signal.aborted) return
    const signal = state.lifecycleController.signal
    const slides = await Promise.all(files.map(async file => {
      const type = file.type.startsWith('video/') ? 'video' : 'image'
      let src = ''
      let poster = ''
      if (this._config.uploadFile) {
        const result = await this._config.uploadFile(file, { signal })
        src = sanitizeUrl(result?.url || '', { policy: 'media', fallback: '' })
        poster = sanitizeUrl(result?.poster || '', { policy: 'media', fallback: '' })
      } else if (type === 'image') {
        src = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
      } else {
        src = URL.createObjectURL(file)
        state.objectUrls.add(src)
      }
      return src ? { id: this.#createId(), type, src, poster, alt: file.name, caption: '' } : null
    })).catch(error => {
      if (!signal.aborted) console.warn('[CarouselBlock] Failed to add files:', error)
      return []
    })
    if (!Array.isArray(slides) || signal.aborted || this.#states.get(wrapper) !== state) return
    const valid = slides.filter(Boolean)
    if (!valid.length) return
    state.context.mutate(() => {
      state.data.slides.push(...valid)
      state.activeIndex = state.data.slides.length - valid.length
      this.#build(wrapper, state)
    })
  }

  /** @param {HTMLElement} wrapper @param {CarouselState} state @param {{ handler: (context: { signal: AbortSignal }) => Promise<CarouselSlide[] | null> }} action */
  async #runAction(wrapper, state, action) {
    try {
      const signal = state.lifecycleController.signal
      const slides = await action.handler({ signal })
      if (!slides || signal.aborted || this.#states.get(wrapper) !== state) return
      const normalized = normalizeCarouselData({ slides, options: state.data.options }, () => this.#createId()).slides
      if (!normalized.length) return
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
