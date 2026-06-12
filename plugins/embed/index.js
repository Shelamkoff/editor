import { sanitizeHtml } from '../../core/sanitize.js'
import { SERVICES, buildPlayer } from './player.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./embed.css', import.meta.url)

// Tabler: device-tv (toolbox)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M16 3l-4 4l-4 -4"/></svg>'

// Tabler: forms
const ICON_FORMS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3"/><path d="M6 3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3"/><path d="M13 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7"/><path d="M5 7h-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1"/><path d="M17 12h.01"/><path d="M13 12h.01"/></svg>'
const ICON_LOADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="oe-embed__spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>'
const ICON_YOUTUBE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M10 9l5 3-5 3V9z"/></svg>'
const ICON_VIMEO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5c1 0 1.5-.5 2-2s1.5-2 2.5-2 2 1 2 2-.5 3.5-1.5 5.5-2 3-3 3.5"/><path d="M14 8.5c1 0 1.5-.5 2-2s1.5-2 2.5-2 2 1 2 2-.5 3.5-1.5 5.5-2 3-3 3.5"/></svg>'
const ICON_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" stroke-width="0" fill="currentColor"/></svg>'
const ICON_SETTINGS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/></svg>'
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M14 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>'
const ICON_UPLOAD = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 9l5-5 5 5"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12"/></svg>'
const ICON_REMOVE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12"/></svg>'
const ICON_VIDEO_PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'
const ICON_PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="3" stroke-linecap="round"/><circle cx="8.5" cy="8.5" r="1.5" stroke-linecap="round"/><path d="M5 19l4-4a1 1 0 0 1 1.4 0L13 17.2l2.3-2.3a1 1 0 0 1 1.4 0L20 18" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_LINK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15l6-6"/><path stroke-linecap="round" stroke-linejoin="round" d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13"/><path stroke-linecap="round" stroke-linejoin="round" d="M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0 4.972 4.972 0 0 1 0-7.071L6 11"/></svg>'
const ICON_BACK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6l6 6"/></svg>'
const ICON_CHEVRON_RIGHT = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6l-6 6"/></svg>'

/** @type {Record<string, string>} */
const BRAND_ICONS = { youtube: ICON_YOUTUBE, vimeo: ICON_VIMEO }

// SERVICES imported from ./player.js (shared with renderer)

const CSS = {
  wrapper: 'oe-embed',
  filled: 'oe-embed--filled',
  playing: 'oe-embed--playing',
  loading: 'oe-embed--loading',
  urlBar: 'oe-embed__url-bar',
  urlIcon: 'oe-embed__url-icon',
  urlInput: 'oe-embed__url-input',
  player: 'oe-embed__player',
  preview: 'oe-embed__preview',
  placeholder: 'oe-embed__placeholder',
  playBtn: 'oe-embed__play-btn',
  iframeWrap: 'oe-embed__iframe',
  titleOverlay: 'oe-embed__title',
  durationOverlay: 'oe-embed__duration',
  caption: 'oe-embed__caption',
  actions: 'oe-embed__actions',
  actionBtn: 'oe-embed__action-btn',
  actionBtnDanger: 'oe-embed__action-btn--danger',
  actionsSep: 'oe-embed__actions-sep',
  actionChevron: 'oe-embed__action-chevron',
  actionsView: 'oe-embed__actions-view',
  dropdown: 'oe-embed__dropdown',
  dropdownOpen: 'oe-embed__dropdown--open',
  dropdownPanel: 'oe-embed__dropdown-panel',
  styleForm: 'oe-embed__style-form',
  styleRow: 'oe-embed__style-row',
  styleLabel: 'oe-embed__style-label',
  styleInput: 'oe-embed__style-input',
  styleGroupTitle: 'oe-embed__style-group-title',
}

/** @param {string} url */
function parseVideoUrl(url) {
  for (const [name, config] of Object.entries(SERVICES)) {
    for (const regex of config.regex) {
      const match = url.match(regex)
      if (match?.[1]) return { service: name, videoId: match[1] }
    }
  }
  return null
}

/** Per-block state keyed by wrapper element */
const stateMap = new WeakMap()


export class Embed extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'embed'
  icon = ICON
  inlineTools = false

  pasteConfig = {
    patterns: [
      /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/,
      /https?:\/\/(?:www\.)?vimeo\.com\/\d+/,
    ],
  }

  get title() { return this._t('title', 'Video') }

  _defaultData() {
    return { service: '', videoId: '', caption: '', cover: '', title: '', duration: '' }
  }

  /** @param {Record<string, unknown>} data */
  render(data) {
    const blockData = {
      service: String(data?.service || ''),
      videoId: String(data?.videoId || ''),
      caption: String(data?.caption || ''),
      cover: String(data?.cover || ''),
      title: String(data?.title || ''),
      duration: String(data?.duration || ''),
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add(CSS.wrapper)
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: blockData,
      abortController: null,
      objectUrl: null,
      urlIconEl: null,
      inputTimer: null,
      playerRef: null,
    })

    this._renderUrlBar(wrapper)
    if (blockData.service && blockData.videoId) {
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
    }

    return wrapper
  }

  /** @param {HTMLElement} element */
  save(element) {
    const s = stateMap.get(element)
    if (!s) return this._defaultData()
    return { ...s.data }
  }

  /** @param {Record<string, unknown>} data */
  validate(data) { return !!data?.service && !!data?.videoId }

  /** @param {HTMLElement} element */
  isEmpty(element) {
    const s = stateMap.get(element)
    return !s || !s.data.videoId
  }

  /** @param {HTMLElement} element */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.data.caption || '' }
  }

  /** @param {import('../../types').PasteEvent} event */
  onPaste(event) {
    if (event.type === 'pattern') {
      const parsed = parseVideoUrl(String(event.data))
      if (parsed) return { ...this._defaultData(), service: parsed.service, videoId: parsed.videoId }
    }
    return null
  }

  /** @param {HTMLElement} element */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      s.abortController?.abort()
      if (s.inputTimer) clearTimeout(s.inputTimer)
      if (s.objectUrl) URL.revokeObjectURL(s.objectUrl)
      stateMap.delete(element)
    }
  }

  /** @param {HTMLElement} wrapper */
  _cleanup(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    s.abortController?.abort()
    s.abortController = new AbortController()
    if (s.objectUrl) { URL.revokeObjectURL(s.objectUrl); s.objectUrl = null }
  }

  // ── URL Bar ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderUrlBar(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this._cleanup(wrapper)
    const signal = s.abortController.signal

    const bar = document.createElement('div')
    bar.className = CSS.urlBar

    const iconEl = document.createElement('span')
    iconEl.className = CSS.urlIcon
    iconEl.innerHTML = s.data.service ? (BRAND_ICONS[s.data.service] || ICON_FORMS) : ICON_FORMS
    bar.appendChild(iconEl)
    s.urlIconEl = iconEl

    const input = document.createElement('input')
    input.className = CSS.urlInput
    input.type = 'text'
    input.placeholder = this._t('urlPrompt', 'Video URL (YouTube or Vimeo)')

    if (s.data.service && s.data.videoId) {
      input.value = s.data.service === 'youtube'
        ? `https://youtu.be/${s.data.videoId}`
        : `https://vimeo.com/${s.data.videoId}`
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (s.inputTimer) clearTimeout(s.inputTimer); this._processUrl(wrapper, input.value.trim()) }
      // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    }, { signal })
    input.addEventListener('paste', (e) => {
      e.stopPropagation()
      if (s.inputTimer) clearTimeout(s.inputTimer)
      requestAnimationFrame(() => this._processUrl(wrapper, input.value.trim()))
    }, { signal })
    input.addEventListener('input', () => {
      if (s.inputTimer) clearTimeout(s.inputTimer)
      s.inputTimer = setTimeout(() => { s.inputTimer = null; this._processUrl(wrapper, input.value.trim()) }, 500)
    }, { signal })

    bar.appendChild(input)
    wrapper.appendChild(bar)

    if (!s.data.service) requestAnimationFrame(() => input.focus())
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} url
   */
  _processUrl(wrapper, url) {
    const s = stateMap.get(wrapper)
    if (!s || !s.urlIconEl) return
    const iconEl = s.urlIconEl
    const parsed = url ? parseVideoUrl(url) : null

    if (!parsed) {
      if (s.data.service) {
        s.data.service = ''
        s.data.videoId = ''
        this._removePlayerElements(wrapper)
        iconEl.innerHTML = ICON_FORMS
      }
      return
    }
    if (parsed.service === s.data.service && parsed.videoId === s.data.videoId) return

    iconEl.innerHTML = ICON_LOADER
    s.data.service = parsed.service
    s.data.videoId = parsed.videoId

    requestAnimationFrame(() => {
      const st = stateMap.get(wrapper)
      if (!st) return
      iconEl.innerHTML = BRAND_ICONS[parsed.service] || ICON_FORMS
      this._removePlayerElements(wrapper)
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
  }

  /** @param {HTMLElement} wrapper */
  _removePlayerElements(wrapper) {
    for (const cls of [CSS.player, CSS.caption, CSS.actions]) {
      wrapper.querySelector(`.${cls}`)?.remove()
    }
    wrapper.classList.remove(CSS.filled, CSS.playing)
  }

  // ── Player ──────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderPlayer(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.abortController?.signal
    const svc = SERVICES[s.data.service]
    if (!svc) return

    // Use shared player builder
    const hasStaticPreview = !!(s.data.cover || svc.previewUrl)
    const result = buildPlayer({
      service: s.data.service,
      videoId: s.data.videoId,
      cover: s.data.cover,
      title: s.data.title,
      duration: s.data.duration,
      classPrefix: 'oe',
      playIcon: ICON_PLAY,
      placeholderHtml: hasStaticPreview ? undefined : ICON_VIDEO_PLACEHOLDER,
    })

    s.playerRef = result

    // Wire play button with editor-specific event handling
    const playBtn = result.player.querySelector(`.${CSS.playBtn}`)
    if (playBtn) {
      playBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      playBtn.addEventListener('click', (e) => { e.stopPropagation(); this._play(wrapper) }, { signal })
    }

    // Vimeo: no static preview → fetch via oEmbed API
    if (!hasStaticPreview && !s.data.cover) {
      const placeholder = result.player.querySelector(`.${CSS.placeholder}`)
      if (placeholder) void this._fetchVimeoPreview(wrapper, result.player, /** @type {HTMLElement} */ (placeholder))
    }

    wrapper.appendChild(result.player)
  }

  // ── Caption ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderCaption(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.abortController?.signal

    const caption = document.createElement('div')
    caption.className = CSS.caption
    caption.contentEditable = 'true'
    caption.dataset.placeholder = this._t('caption', 'Caption')

    if (s.data.caption) caption.innerHTML = sanitizeHtml(s.data.caption)
    if (!(caption.textContent || '').trim()) { s.data.caption = ''; caption.innerHTML = ''; caption.setAttribute('data-empty', 'true') }

    const sync = () => {
      const st = stateMap.get(wrapper)
      if (!st) return
      const has = !!(caption.textContent || '').trim()
      st.data.caption = has ? caption.innerHTML : ''
      caption.toggleAttribute('data-empty', !has)
    }
    caption.addEventListener('input', sync, { signal })
    caption.addEventListener('focus', () => caption.removeAttribute('data-empty'), { signal })
    caption.addEventListener('blur', () => {
      const st = stateMap.get(wrapper)
      if (!(caption.textContent || '').trim()) { caption.innerHTML = ''; caption.setAttribute('data-empty', 'true'); if (st) st.data.caption = '' }
    }, { signal })
    caption.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !(caption.textContent || '').trim()) { e.preventDefault(); e.stopPropagation() } }, { signal })

    wrapper.appendChild(caption)
  }

  // ── Actions + Settings dropdown ─────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderActions(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.abortController?.signal

    const actions = document.createElement('div')
    actions.className = CSS.actions

    // Main view
    const mainView = document.createElement('div')
    mainView.className = CSS.actionsView
    mainView.style.display = 'contents'

    // Settings dropdown
    const dropdown = document.createElement('div')
    dropdown.className = CSS.dropdown

    const settingsBtn = this._makeBtn(
      `${ICON_SETTINGS} ${this._t('settings', 'Settings')}`,
      () => {
        const isOpen = dropdown.classList.contains(CSS.dropdownOpen)
        dropdown.classList.toggle(CSS.dropdownOpen, !isOpen)
        if (!isOpen) this._positionPanel(settingsBtn, panel)
      }, signal
    )

    const panel = this._buildSettingsPanel(wrapper, signal)
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(/** @type {Node} */ (e.target))) dropdown.classList.remove(CSS.dropdownOpen)
    }, { signal })

    dropdown.append(settingsBtn, panel)
    mainView.appendChild(dropdown)
    mainView.appendChild(this._makeSep())

    // Cover (drill-down)
    const coverBtn = this._makeBtn(
      `${ICON_PHOTO} ${this._t('cover', 'Cover')} ${ICON_CHEVRON_RIGHT}`,
      () => this._showCoverView(wrapper, actions, mainView, signal),
      signal
    )
    coverBtn.querySelector('svg:last-child')?.classList.add(CSS.actionChevron)
    mainView.appendChild(coverBtn)

    mainView.appendChild(this._makeSep())

    // Delete
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = `${CSS.actionBtn} ${CSS.actionBtnDanger}`
    deleteBtn.innerHTML = ICON_TRASH
    deleteBtn.title = this._t('delete', 'Delete')
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      if (st.inputTimer) clearTimeout(st.inputTimer)
      st.data = this._defaultData()
      this._removePlayerElements(wrapper)
      if (st.urlIconEl) st.urlIconEl.innerHTML = ICON_FORMS
      const inp = wrapper.querySelector(`.${CSS.urlInput}`)
      if (inp) { /** @type {HTMLInputElement} */ (inp).value = ''; /** @type {HTMLInputElement} */ (inp).focus() }
      wrapper.classList.remove(CSS.filled)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, { signal })
    mainView.appendChild(deleteBtn)

    actions.appendChild(mainView)
    wrapper.appendChild(actions)
  }

  /**
   * Show the cover drill-down sub-view: Back | Upload | Media Library | URL | Remove
   */
  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} actions
   * @param {HTMLElement} mainView
   * @param {AbortSignal} signal
   */
  _showCoverView(wrapper, actions, mainView, signal) {
    mainView.style.display = 'none'

    const coverView = document.createElement('div')
    coverView.className = CSS.actionsView
    coverView.style.display = 'contents'

    // Back
    const backBtn = this._makeBtn(
      `${ICON_BACK} ${this._t('block.back', 'Back')}`,
      () => { coverView.remove(); mainView.style.display = 'contents' },
      signal
    )
    coverView.appendChild(backBtn)
    coverView.appendChild(this._makeSep())

    // Upload
    coverView.appendChild(this._makeBtn(
      `${ICON_UPLOAD} ${this._t('uploadCover', 'Upload')}`,
      () => { this._triggerCoverUpload(wrapper); coverView.remove(); mainView.style.display = 'contents' },
      signal
    ))

    // Media Library (if config has actions)
    const customActions = this._config.actions || []
    for (const action of customActions) {
      coverView.appendChild(this._makeBtn(
        `${action.icon} ${action.label}`,
        async () => {
          try {
            const result = await action.handler()
            const st = stateMap.get(wrapper)
            if (result?.url && st) { st.data.cover = result.url; this._rebuildPlayer(wrapper); wrapper.dispatchEvent(new InputEvent('input', { bubbles: true })) }
          } catch { /* cancelled */ }
          coverView.remove()
          mainView.style.display = 'contents'
        },
        signal
      ))
    }

    // URL
    coverView.appendChild(this._makeBtn(
      `${ICON_LINK} URL`,
      () => {
        const url = prompt(this._t('coverUrlPrompt', 'Image URL:'))
        const st = stateMap.get(wrapper)
        if (url && /^https?:\/\/.+/i.test(url) && st) {
          st.data.cover = url
          this._rebuildPlayer(wrapper)
          wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
        }
        coverView.remove()
        mainView.style.display = 'contents'
      },
      signal
    ))

    // Remove cover (if has one)
    const s = stateMap.get(wrapper)
    if (s && s.data.cover) {
      coverView.appendChild(this._makeSep())
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = `${CSS.actionBtn} ${CSS.actionBtnDanger}`
      removeBtn.innerHTML = `${ICON_REMOVE} ${this._t('removeCover', 'Remove')}`
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const st = stateMap.get(wrapper)
        if (st) {
          st.data.cover = ''
          this._rebuildPlayer(wrapper)
          wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
        }
        coverView.remove()
        mainView.style.display = 'contents'
      }, { signal })
      coverView.appendChild(removeBtn)
    }

    actions.appendChild(coverView)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {AbortSignal} _signal
   */
  _buildSettingsPanel(wrapper, _signal) {
    const s = stateMap.get(wrapper)
    if (!s) return document.createElement('div')

    const panel = document.createElement('div')
    panel.className = CSS.dropdownPanel
    panel.addEventListener('click', (e) => e.stopPropagation())

    const form = document.createElement('div')
    form.className = CSS.styleForm

    form.appendChild(this._makeInputRow(
      wrapper,
      this._t('videoTitle', 'Title'),
      s.data.title,
      (v) => { const st = stateMap.get(wrapper); if (st) { st.data.title = v; this._updateOverlay(wrapper, CSS.titleOverlay, v) } }
    ))

    form.appendChild(this._makeInputRow(
      wrapper,
      this._t('duration', 'Duration'),
      s.data.duration,
      (v) => { const st = stateMap.get(wrapper); if (st) { st.data.duration = v; this._updateOverlay(wrapper, CSS.durationOverlay, v) } }
    ))

    panel.appendChild(form)
    return panel
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} label
   * @param {string} value
   * @param {(v: string) => void} onChange
   */
  _makeInputRow(wrapper, label, value, onChange) {
    const row = document.createElement('div')
    row.className = CSS.styleRow

    const lbl = document.createElement('label')
    lbl.className = CSS.styleLabel
    const span = document.createElement('span')
    span.textContent = label
    lbl.appendChild(span)

    const input = document.createElement('input')
    input.type = 'text'
    input.className = CSS.styleInput
    input.value = value || ''
    input.addEventListener('input', () => { onChange(input.value); wrapper.dispatchEvent(new InputEvent('input', { bubbles: true })) })
    input.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() })

    lbl.appendChild(input)
    row.appendChild(lbl)
    return row
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} cls
   * @param {string} text
   */
  _updateOverlay(wrapper, cls, text) {
    const player = wrapper.querySelector(`.${CSS.player}`)
    if (!player) return
    let el = player.querySelector(`.${cls}`)
    if (text) {
      if (!el) {
        el = document.createElement('span')
        el.className = cls
        player.appendChild(el)
      }
      el.textContent = text
    } else {
      el?.remove()
    }
  }

  /** @param {HTMLElement} wrapper */
  _rebuildPlayer(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this._removePlayerElements(wrapper)
    if (s.data.service && s.data.videoId) {
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
    }
  }

  // ── Play ────────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _play(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s || !s.playerRef) return
    s.playerRef.play()
    wrapper.classList.add(CSS.playing)
  }

  // ── Cover upload ────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _triggerCoverUpload(wrapper) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      if (this._config.uploadFile) {
        void this._uploadCover(wrapper, file)
      } else {
        const s = stateMap.get(wrapper)
        if (!s) return
        if (s.objectUrl) URL.revokeObjectURL(s.objectUrl)
        s.objectUrl = URL.createObjectURL(file)
        s.data.cover = s.objectUrl
        this._rebuildPlayer(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
      }
    })
    input.click()
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   */
  async _uploadCover(wrapper, file) {
    if (!this._config.uploadFile) return
    wrapper.classList.add(CSS.loading)
    try {
      const result = await this._config.uploadFile(file)
      const s = stateMap.get(wrapper)
      if (result?.url && s) { s.data.cover = result.url; this._rebuildPlayer(wrapper); wrapper.dispatchEvent(new InputEvent('input', { bubbles: true })) }
    } catch { /* failed */ } finally { wrapper.classList.remove(CSS.loading) }
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} _player
   * @param {HTMLElement} _placeholder
   */
  async _fetchVimeoPreview(wrapper, _player, _placeholder) {
    const s = stateMap.get(wrapper)
    if (!s) return
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${s.data.videoId}&width=640`)
      if (!res.ok) return
      const data = await res.json()
      const st = stateMap.get(wrapper)
      if (data['thumbnail_url'] && st && st.playerRef) {
        st.playerRef.setPreview(data['thumbnail_url'], data['title'] || 'Video preview')
      }
    } catch { /* keep placeholder */ }
  }

  /**
   * @param {string} html
   * @param {() => void} handler
   * @param {AbortSignal} [signal]
   */
  _makeBtn(html, handler, signal) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = CSS.actionBtn
    btn.innerHTML = html
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', (e) => { e.stopPropagation(); handler() }, { signal })
    return btn
  }

  _makeSep() {
    const sep = document.createElement('div')
    sep.className = CSS.actionsSep
    return sep
  }

  /**
   * @param {HTMLElement} anchor
   * @param {HTMLElement} panel
   */
  _positionPanel(anchor, panel) {
    panel.style.top = ''
    panel.style.bottom = ''
    const rect = anchor.getBoundingClientRect()
    const h = panel.offsetHeight || 200
    if (window.innerHeight - rect.bottom - 8 < h) {
      panel.style.top = 'auto'
      panel.style.bottom = 'calc(100% + 8px)'
    } else {
      panel.style.top = 'calc(100% + 8px)'
      panel.style.bottom = 'auto'
    }
  }
}
