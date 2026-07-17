import { sanitizeHtml } from '../../core/sanitize.js'
import { SERVICES, buildPlayer } from './player.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateEmbedData } from '../../shared/blockDataValidators.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../core/constants.js'

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

/**
 * Parse an absolute URL from a supported video provider.
 * Hostname checks prevent provider-looking text on an unrelated origin from
 * being accepted as a video URL.
 * @param {string} url
 * @returns {{ service: 'youtube' | 'vimeo', videoId: string } | null}
 */
function parseVideoUrl(url) {
  const safeUrl = sanitizeUrl(url, {
    policy: 'external', allowRelative: false, fallback: '',
  })
  if (!safeUrl) return null

  let parsed
  try { parsed = new URL(safeUrl) } catch { return null }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const segments = parsed.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') {
    const videoId = segments[0] || ''
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? { service: 'youtube', videoId } : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const videoId = parsed.pathname === '/watch'
      ? parsed.searchParams.get('v') || ''
      : (segments[0] === 'embed' || segments[0] === 'shorts' ? segments[1] || '' : '')
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? { service: 'youtube', videoId } : null
  }

  if (host === 'vimeo.com') {
    const videoId = segments[0] || ''
    return /^\d+$/.test(videoId) ? { service: 'vimeo', videoId } : null
  }

  if (host === 'player.vimeo.com' && segments[0] === 'video') {
    const videoId = segments[1] || ''
    return /^\d+$/.test(videoId) ? { service: 'vimeo', videoId } : null
  }

  return null
}

/** Per-block state keyed by wrapper element */
const stateMap = new WeakMap()

/**
 * @typedef {Object} EmbedPreview
 * @property {string} thumbnailUrl Sanitized preview-image URL returned by the resolver.
 * @property {string} [title] Optional plain-text alternative for the preview image.
 */

/**
 * @typedef {Object} EmbedData
 * @property {'youtube' | 'vimeo' | ''} service Provider selected from the parsed video URL; an empty value represents an unconfigured block.
 * @property {string} videoId Provider-specific video identifier without the surrounding URL.
 * @property {string} caption Sanitized rich-text caption displayed below the player.
 * @property {string} cover Sanitized media URL for a consumer-selected cover image.
 * @property {string} title Plain-text presentation title shown by the editor controls.
 * @property {string} duration Plain-text presentation duration supplied by the author.
 */

/**
 * @typedef {Object} EmbedConfig
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>} [uploadFile] Uploads a custom cover image. Without it the selected cover uses a temporary object URL that is valid until editor disposal.
 * @property {Array<{
 *   icon?: string,
 *   label: string,
 *   handler: (context: { signal: AbortSignal }) => Promise<{ url: string } | null>
 * }>} [actions]
 *   Additional application-owned cover selectors such as a media library. `icon` is trusted application-owned SVG/HTML.
 * @property {false | ((request: {
 *   service: 'vimeo', videoId: string, url: string, signal: AbortSignal
 * }) => Promise<EmbedPreview | null>)} [resolvePreview]
 *   `false` disables remote preview resolution; omitted uses Vimeo oEmbed.
 * @property {number} [previewTimeoutMs]
 *   Maximum Vimeo preview-resolution time in milliseconds. Non-finite values
 *   use the 5000 ms default; finite values are clamped to zero.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in embed stylesheet.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 */

/**
 * Editable video embed block for supported media services and presentation metadata.
 * @extends {BlockPluginAbstract<EmbedConfig>}
 */
export class Embed extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'embed'
  icon = ICON
  inlineTools = false


  #objectUrls = new Set()
  /**
   * Create an Embed instance with the supplied consumer configuration.
   * @param {EmbedConfig} [config]
   */
  constructor(config) {
    super(config)
  }

  pasteConfig = {
    patterns: [
      /^https?:\/\/(?:(?:www|m)\.)?youtube\.com\/[^\s]+$/i,
      /^https?:\/\/(?:www\.)?youtu\.be\/[^\s]+$/i,
      /^https?:\/\/(?:www\.)?vimeo\.com\/[^\s]+$/i,
      /^https?:\/\/player\.vimeo\.com\/video\/[^\s]+$/i,
    ],
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string} Localized toolbox title.
   */
  get title() { return this._t('title', 'Video') }

  /** Create an empty, serializable embed value. @returns {EmbedData} */
  _defaultData() {
    return { service: '', videoId: '', caption: '', cover: '', title: '', duration: '' }
  }
  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const blockData = {
      service: normalizeTextValue(data?.service),
      videoId: normalizeTextValue(data?.videoId),
      caption: normalizeTextValue(data?.caption),
      cover: sanitizeUrl(normalizeTextValue(data?.cover), { policy: 'media', fallback: '' }),
      title: normalizeTextValue(data?.title),
      duration: normalizeTextValue(data?.duration),
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add(CSS.wrapper)
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: blockData,
      lifecycleController: new AbortController(),
      viewController: null,
      viewCleanups: [],
      urlIconEl: null,
      inputTimer: null,
      playerRef: null,
      context,
    })

    this._renderUrlBar(wrapper)
    if (blockData.service && blockData.videoId) {
      this._beginView(wrapper)
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      if (!context.readOnly) this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
    }

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element @returns {EmbedData}
   */
  save(element) {
    const s = stateMap.get(element)
    if (!s) return this._defaultData()
    return { ...s.data }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data @returns {boolean}
   */
  validate(data) { return validateEmbedData(data) }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element @returns {boolean}
   */
  isEmpty(element) {
    const s = stateMap.get(element)
    return !s || !s.data.videoId
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.data.caption || '' }
  }

  /**
   * Handle supported pasted content for this block.
   * @param {import('../../types').PasteEvent} event
   * @returns {EmbedData | null}
   */
  onPaste(event) {
    if (event.type === 'pattern') {
      const parsed = parseVideoUrl(String(event.data))
      if (parsed) return { ...this._defaultData(), service: parsed.service, videoId: parsed.videoId }
    }
    return null
  }

  /**
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element @returns {void}
   */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      for (const cleanup of s.viewCleanups.splice(0)) cleanup()
      s.lifecycleController.abort()
      s.viewController?.abort()
      if (s.inputTimer) clearTimeout(s.inputTimer)
      stateMap.delete(element)
    }
  }

  /**
   * Release temporary local covers after the editor has discarded its blocks
   * and undo history.
   * @returns {void}
   */
  dispose() {
    for (const url of this.#objectUrls) URL.revokeObjectURL(url)
    this.#objectUrls.clear()
  }

  /**
   * Start a fresh lifetime for the current player, caption, actions, and
   * provider-preview request.
   * @param {HTMLElement} wrapper
   * @returns {void}
   */
  _beginView(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    for (const cleanup of s.viewCleanups.splice(0)) cleanup()
    s.viewController?.abort()
    s.viewController = new AbortController()
  }

  // ── URL Bar ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _renderUrlBar(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.lifecycleController.signal

    const bar = document.createElement('div')
    bar.className = CSS.urlBar

    const iconEl = document.createElement('span')
    iconEl.className = CSS.urlIcon
    iconEl.innerHTML = s.data.service ? (BRAND_ICONS[s.data.service] || ICON_FORMS) : ICON_FORMS
    bar.appendChild(iconEl)
    s.urlIconEl = iconEl

    const input = document.createElement('input')
    input.className = CSS.urlInput
    input.type = 'url'
    input.inputMode = 'url'
    input.placeholder = this._t('urlPrompt', 'Video URL (YouTube or Vimeo)')
    input.setAttribute('aria-label', this._t('urlPrompt', 'Video URL (YouTube or Vimeo)'))

    if (s.data.service && s.data.videoId) {
      input.value = s.data.service === 'youtube'
        ? `https://youtu.be/${s.data.videoId}`
        : `https://vimeo.com/${s.data.videoId}`
    }

    input.readOnly = s.context.readOnly
    if (!s.context.readOnly) {
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
    }

    bar.appendChild(input)
    wrapper.appendChild(bar)

    if (!s.context.readOnly && !s.data.service) requestAnimationFrame(() => input.focus())
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} url
   * @returns {void}
   */
  _processUrl(wrapper, url) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly || !s.urlIconEl) return
    const iconEl = s.urlIconEl
    const parsed = url ? parseVideoUrl(url) : null

    if (!parsed) {
      if (s.data.service) {
        s.context.mutate(() => {
          s.data.service = ''
          s.data.videoId = ''
          this._removePlayerElements(wrapper)
          iconEl.innerHTML = ICON_FORMS
        })
      }
      return
    }
    if (parsed.service === s.data.service && parsed.videoId === s.data.videoId) return

    s.context.mutate(() => {
      // Invalidate preview, upload, and custom-source work for the previous
      // video before its promise can commit into the new resource.
      this._removePlayerElements(wrapper)
      iconEl.innerHTML = ICON_LOADER
      s.data.service = parsed.service
      s.data.videoId = parsed.videoId
    })

    requestAnimationFrame(() => {
      const st = stateMap.get(wrapper)
      if (
        !st
        || st.data.service !== parsed.service
        || st.data.videoId !== parsed.videoId
      ) return
      iconEl.innerHTML = BRAND_ICONS[parsed.service] || ICON_FORMS
      this._beginView(wrapper)
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      if (!st.context.readOnly) this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
    })
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  _removePlayerElements(wrapper) {
    const s = stateMap.get(wrapper)
    if (s) {
      for (const cleanup of s.viewCleanups.splice(0)) cleanup()
    }
    s?.viewController?.abort()
    if (s) {
      s.viewController = null
      s.playerRef = null
    }
    for (const cls of [CSS.player, CSS.caption, CSS.actions]) {
      wrapper.querySelector(`.${cls}`)?.remove()
    }
    wrapper.classList.remove(CSS.filled, CSS.playing)
  }

  // ── Player ──────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _renderPlayer(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.viewController?.signal
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
      playLabel: this._t('play', 'Play video'),
      videoLabel: this._t('videoLabel', 'Video'),
    })

    s.playerRef = result

    // Wire play button with editor-specific event handling
    const playBtn = result.player.querySelector(`.${CSS.playBtn}`)
    if (playBtn) {
      playBtn.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
      playBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      playBtn.addEventListener('click', (e) => { e.stopPropagation(); this._play(wrapper) }, { signal })
    }

    // Vimeo: no static preview → fetch via oEmbed API
    if (s.data.service === 'vimeo' && !hasStaticPreview && !s.data.cover) {
      const placeholder = result.player.querySelector(`.${CSS.placeholder}`)
      if (placeholder) void this._fetchVimeoPreview(wrapper)
    }

    wrapper.appendChild(result.player)
  }

  // ── Caption ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _renderCaption(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.viewController?.signal

    const caption = document.createElement('div')
    caption.className = CSS.caption
    caption.contentEditable = s.context.readOnly ? 'false' : 'true'
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
    if (!s.context.readOnly) {
      caption.addEventListener('input', sync, { signal })
      caption.addEventListener('focus', () => caption.removeAttribute('data-empty'), { signal })
      caption.addEventListener('blur', () => {
        const st = stateMap.get(wrapper)
        if (!(caption.textContent || '').trim()) { caption.innerHTML = ''; caption.setAttribute('data-empty', 'true'); if (st) st.data.caption = '' }
      }, { signal })
      caption.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !(caption.textContent || '').trim()) { e.preventDefault(); e.stopPropagation() } }, { signal })
    }

    wrapper.appendChild(caption)
  }

  // ── Actions + Settings dropdown ─────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _renderActions(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    const signal = s.viewController?.signal

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
        settingsBtn.setAttribute('aria-expanded', String(!isOpen))
        if (!isOpen) this._positionPanel(settingsBtn, panel)
      }, signal
    )
    settingsBtn.setAttribute('aria-haspopup', 'true')
    settingsBtn.setAttribute('aria-expanded', 'false')

    const panel = this._buildSettingsPanel(wrapper)
    const closeOnOutsideClick = (e) => {
      if (!dropdown.contains(/** @type {Node} */ (e.target))) {
        dropdown.classList.remove(CSS.dropdownOpen)
        settingsBtn.setAttribute('aria-expanded', 'false')
      }
    }
    document.addEventListener('click', closeOnOutsideClick, { signal })
    // AbortSignal removes the listener in modern browsers. The explicit
    // removal also makes ownership observable to lifecycle instrumentation
    // and protects consumers that polyfill signal-aware listeners.
    signal?.addEventListener('abort', () => {
      document.removeEventListener('click', closeOnOutsideClick)
    }, { once: true })
    s.viewCleanups.push(() => {
      document.removeEventListener('click', closeOnOutsideClick)
    })
    dropdown.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      dropdown.classList.remove(CSS.dropdownOpen)
      settingsBtn.setAttribute('aria-expanded', 'false')
      settingsBtn.focus()
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
    deleteBtn.setAttribute('aria-label', this._t('delete', 'Delete'))
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      st.context.mutate(() => {
        if (st.inputTimer) clearTimeout(st.inputTimer)
        st.data = this._defaultData()
        this._removePlayerElements(wrapper)
        if (st.urlIconEl) st.urlIconEl.innerHTML = ICON_FORMS
        const inp = wrapper.querySelector(`.${CSS.urlInput}`)
        if (inp) { /** @type {HTMLInputElement} */ (inp).value = ''; /** @type {HTMLInputElement} */ (inp).focus() }
        wrapper.classList.remove(CSS.filled)
      })
    }, { signal })
    mainView.appendChild(deleteBtn)

    actions.appendChild(mainView)
    wrapper.appendChild(actions)
  }

  /**
   * Show the cover drill-down sub-view: Back, Upload, custom sources, URL, Remove.
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} actions
   * @param {HTMLElement} mainView
   * @param {AbortSignal} signal
   * @returns {void}
   */
  _showCoverView(wrapper, actions, mainView, signal) {
    mainView.style.display = 'none'

    const coverView = document.createElement('div')
    coverView.className = CSS.actionsView
    coverView.style.display = 'contents'

    // Back
    const backBtn = this._makeBtn(
      `${ICON_BACK} ${this._t('back', 'Back')}`,
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
        `${action.icon || ''} ${action.label}`.trim(),
        async () => {
          try {
            const initial = stateMap.get(wrapper)
            if (!initial || initial.context.readOnly) return
            const result = await action.handler({ signal })
            const current = stateMap.get(wrapper)
            const url = sanitizeUrl(String(result?.url || ''), { policy: 'media', fallback: '' })
            if (!signal.aborted && url && current === initial) {
              current.context.mutate(() => { current.data.cover = url; this._rebuildPlayer(wrapper) })
            }
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
        const url = sanitizeUrl(prompt(this._t('coverUrlPrompt', 'Image URL:')) || '', { policy: 'media', fallback: '' })
        const st = stateMap.get(wrapper)
        if (url && st) {
          st.context.mutate(() => { st.data.cover = url; this._rebuildPlayer(wrapper) })
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
          st.context.mutate(() => { st.data.cover = ''; this._rebuildPlayer(wrapper) })
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
   * @returns {HTMLElement}
   */
  _buildSettingsPanel(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return document.createElement('div')

    const panel = document.createElement('div')
    panel.className = CSS.dropdownPanel
    panel.setAttribute('role', 'group')
    panel.addEventListener('click', (e) => e.stopPropagation())

    const form = document.createElement('div')
    form.className = CSS.styleForm

    form.appendChild(this._makeInputRow(
      this._t('videoTitle', 'Title'),
      s.data.title,
      (v) => { const st = stateMap.get(wrapper); if (st) { st.data.title = v; this._updateOverlay(wrapper, CSS.titleOverlay, v) } }
    ))

    form.appendChild(this._makeInputRow(
      this._t('duration', 'Duration'),
      s.data.duration,
      (v) => { const st = stateMap.get(wrapper); if (st) { st.data.duration = v; this._updateOverlay(wrapper, CSS.durationOverlay, v) } }
    ))

    panel.appendChild(form)
    return panel
  }

  /**
   * @param {string} label
   * @param {string} value
   * @param {(v: string) => void} onChange
   * @returns {HTMLElement}
   */
  _makeInputRow(label, value, onChange) {
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
    input.addEventListener('input', () => onChange(input.value))
    input.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() })

    lbl.appendChild(input)
    row.appendChild(lbl)
    return row
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} cls
   * @param {string} text
   * @returns {void}
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

  /** @param {HTMLElement} wrapper @returns {void} */
  _rebuildPlayer(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this._removePlayerElements(wrapper)
    if (s.data.service && s.data.videoId) {
      this._beginView(wrapper)
      this._renderPlayer(wrapper)
      this._renderCaption(wrapper)
      if (!s.context.readOnly) this._renderActions(wrapper)
      wrapper.classList.add(CSS.filled)
    }
  }

  // ── Play ────────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _play(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s || !s.playerRef) return
    s.playerRef.play()
    wrapper.classList.add(CSS.playing)
  }

  // ── Cover upload ────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  _triggerCoverUpload(wrapper) {
    const current = stateMap.get(wrapper)
    if (!current || current.context.readOnly) return
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
        s.context.mutate(() => {
          const coverUrl = URL.createObjectURL(file)
          this.#objectUrls.add(coverUrl)
          s.data.cover = coverUrl
          this._rebuildPlayer(wrapper)
        })
      }
    }, { once: true, signal: current.viewController?.signal })
    input.click()
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {File} file
   * @returns {Promise<void>}
   */
  async _uploadCover(wrapper, file) {
    if (!this._config.uploadFile) return
    const initial = stateMap.get(wrapper)
    if (!initial || initial.context.readOnly) return
    const signal = initial.viewController?.signal ?? initial.lifecycleController.signal
    wrapper.classList.add(CSS.loading)
    try {
      const result = await this._config.uploadFile(file, { signal })
      const s = stateMap.get(wrapper)
      const url = sanitizeUrl(String(result?.url || ''), { policy: 'media', fallback: '' })
      if (!signal.aborted && url && s === initial) {
        s.context.mutate(() => { s.data.cover = url; this._rebuildPlayer(wrapper) })
      }
    } catch { /* failed */ } finally { wrapper.classList.remove(CSS.loading) }
  }

  /**
   * @param {HTMLElement} wrapper
   * @returns {Promise<void>}
   */
  async _fetchVimeoPreview(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const videoId = s.data.videoId
    const playerRef = s.playerRef
    const controller = new AbortController()
    const parentSignal = s.viewController?.signal
    const abort = () => controller.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(
      () => controller.abort(new DOMException('Embed preview timed out', 'TimeoutError')),
      Number.isFinite(this._config.previewTimeoutMs)
        ? Math.max(0, Number(this._config.previewTimeoutMs))
        : 5000,
    )
    try {
      const url = `https://vimeo.com/${videoId}`
      let preview
      if (this._config.resolvePreview === false) return
      if (this._config.resolvePreview) {
        preview = await this._config.resolvePreview({
          service: 'vimeo',
          videoId,
          url,
          signal: controller.signal,
        })
      } else {
        const endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=640`
        const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit' })
        if (!response.ok) return
        const data = await response.json()
        preview = data?.thumbnail_url
          ? { thumbnailUrl: data.thumbnail_url, title: normalizeTextValue(data.title) }
          : null
      }

      const st = stateMap.get(wrapper)
      const thumbnailUrl = sanitizeUrl(String(preview?.thumbnailUrl || ''), {
        policy: 'media', fallback: '',
      })
      if (
        thumbnailUrl
        && st === s
        && st.data.videoId === videoId
        && st.playerRef === playerRef
      ) {
        playerRef?.setPreview(thumbnailUrl, normalizeTextValue(preview?.title) || 'Video preview')
      }
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[Embed] Failed to resolve Vimeo preview', error)
    } finally {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abort)
    }
  }

  /**
   * @param {string} html
   * @param {() => void | Promise<void>} handler
   * @param {AbortSignal} [signal]
   * @returns {HTMLButtonElement}
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

  /** @returns {HTMLDivElement} */
  _makeSep() {
    const sep = document.createElement('div')
    sep.className = CSS.actionsSep
    return sep
  }

  /**
   * @param {HTMLElement} anchor
   * @param {HTMLElement} panel
   * @returns {void}
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
