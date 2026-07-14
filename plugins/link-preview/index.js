import { resolvePath } from '../../shared/resolvePath.js'
import { sanitizeUrl, setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateLinkPreviewData } from '../../shared/blockDataValidators.js'

const editorStyles = resolvePath('./link-preview.css', import.meta.url)

// Tabler: link (toolbox)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6"/><path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13"/><path d="M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0 4.972 4.972 0 0 1 0-7.071L6 11"/></svg>'
// Tabler: forms (empty URL bar icon)
const ICON_FORMS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3"/><path d="M6 3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3"/><path d="M13 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7"/><path d="M5 7h-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1"/><path d="M17 12h.01"/><path d="M13 12h.01"/></svg>'
const ICON_LOADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="oe-lp__spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>'
const ICON_SETTINGS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/></svg>'
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M14 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>'
const ICON_EXTERNAL = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h-6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path d="M11 13l9-9"/><path d="M15 4h5v5"/></svg>'

/**
 * Render a favicon without interpolating untrusted URLs into HTML.
 * @param {HTMLElement} iconEl
 * @param {string} favicon
 */
function renderUrlIcon(iconEl, favicon) {
  iconEl.replaceChildren()
  if (!favicon) {
    iconEl.innerHTML = ICON_FORMS
    return
  }

  const img = document.createElement('img')
  img.width = 16
  img.height = 16
  img.style.borderRadius = '2px'
  const safe = setSafeUrlAttribute(img, 'src', favicon, 'media')
  if (!safe) {
    iconEl.innerHTML = ICON_FORMS
    return
  }
  iconEl.appendChild(img)
}
const TEMPLATES = ['horizontal', 'compact', 'large-top', 'minimal', 'twitter', 'notion', 'split']

// Mini SVG icons for template selector (schematic layouts)
/** @type {Record<string, string>} */
const TEMPLATE_ICONS = {
  horizontal:  '<svg viewBox="0 0 28 20"><rect x="1" y="1" width="16" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="19" y="1" width="8" height="18" rx="1" fill="currentColor" opacity=".3"/></svg>',
  compact:     '<svg viewBox="0 0 28 20"><rect x="1" y="4" width="8" height="12" rx="1" fill="currentColor" opacity=".3"/><rect x="11" y="5" width="16" height="3" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="11" y="10" width="12" height="2" rx=".5" fill="currentColor" opacity=".15"/></svg>',
  'large-top': '<svg viewBox="0 0 28 20"><rect x="1" y="1" width="26" height="10" rx="1" fill="currentColor" opacity=".3"/><rect x="1" y="13" width="18" height="2" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="1" y="17" width="12" height="1.5" rx=".5" fill="currentColor" opacity=".15"/></svg>',
  minimal:     '<svg viewBox="0 0 28 20"><rect x="4" y="1" width="23" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="1" width="2" height="18" rx=".5" fill="currentColor"/></svg>',
  twitter:     '<svg viewBox="0 0 28 20"><rect x="1" y="1" width="26" height="9" rx="1" fill="currentColor" opacity=".3"/><rect x="1" y="12" width="10" height="1.5" rx=".5" fill="currentColor" opacity=".2"/><rect x="1" y="15" width="20" height="2" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  notion:      '<svg viewBox="0 0 28 20"><rect x="1" y="5" width="7" height="10" rx="2" fill="currentColor" opacity=".3"/><rect x="10" y="6" width="16" height="3" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="10" y="11" width="10" height="2" rx=".5" fill="currentColor" opacity=".15"/></svg>',
  split:       '<svg viewBox="0 0 28 20"><rect x="1" y="1" width="12" height="18" rx="1" fill="currentColor" opacity=".3"/><rect x="15" y="3" width="12" height="3" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="15" y="8" width="10" height="2" rx=".5" fill="currentColor" opacity=".15"/><rect x="15" y="12" width="8" height="1.5" rx=".5" fill="currentColor" opacity=".1"/></svg>',
}

const P = 'oe-lp' // CSS prefix

/**
 * @typedef {{
 *   title?: string,
 *   description?: string,
 *   image?: string,
 *   favicon?: string,
 *   domain?: string,
 * }} LinkPreviewMeta
 * @typedef {{
 *   fetchMeta?: (url: string, context: { signal: AbortSignal }) => Promise<LinkPreviewMeta>,
 *   injectStyles?: boolean,
 *   css?: string,
 * }} LinkPreviewConfig
 */

/**
 * @typedef {{
 *   data: { url: string, title: string, description: string, image: string, favicon: string, domain: string, template: string },
 *   wrapper: HTMLDivElement,
 *   abortController: AbortController | null,
 *   urlIconEl: HTMLElement | null,
 *   inputTimer: ReturnType<typeof setTimeout> | null,
 *   context: import('../../core/types').BlockMutationContext,
 * }} LinkPreviewState
 */

/** @type {WeakMap<HTMLElement, LinkPreviewState>} */
const stateMap = new WeakMap()


/** @extends {BlockPluginAbstract<LinkPreviewConfig>} */
export class LinkPreview extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'linkPreview'
  icon = ICON
  inlineTools = false

  /** @param {LinkPreviewConfig} [config] */
  constructor(config) {
    super(config)
  }

  pasteConfig = { patterns: [/^https?:\/\/[^\s]+$/i] }

  get title() { return this._t('title', 'Link Preview') }

  _defaultData() {
    return { url: '', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion' }
  }

  /** @param {Record<string, unknown>} data */
  render(data, context) {
    const parsedData = {
      url: sanitizeUrl(String(data?.url || ''), { policy: 'external', fallback: '' }),
      title: String(data?.title || ''),
      description: String(data?.description || ''),
      image: sanitizeUrl(String(data?.image || ''), { policy: 'media', fallback: '' }),
      favicon: sanitizeUrl(String(data?.favicon || ''), { policy: 'media', fallback: '' }),
      domain: String(data?.domain || ''),
      template: TEMPLATES.includes(/** @type {string} */ (data?.template)) ? String(data.template) : 'notion',
    }

    const wrapper = document.createElement('div')
    wrapper.className = P
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: parsedData,
      wrapper,
      abortController: null,
      urlIconEl: null,
      inputTimer: null,
      context,
    })

    this._renderUrlBar(wrapper)
    if (parsedData.url) {
      this._renderCard(wrapper)
      this._renderActions(wrapper)
      wrapper.classList.add(`${P}--filled`)

      // If URL is set but metadata is missing, fetch it now (covers paste-as-block path)
      if (this._config.fetchMeta && !parsedData.title && !parsedData.image && !parsedData.favicon) {
        this._loadMeta(wrapper, parsedData.url).then(() => {
          const st = stateMap.get(wrapper)
          if (!st || st.data.url !== parsedData.url) return
          if (st.urlIconEl) renderUrlIcon(st.urlIconEl, st.data.favicon)
          // Re-render only the card, keep actions/dropdown
          wrapper.querySelector(`.${P}__card`)?.remove()
          this._renderCard(wrapper)
          const actions = wrapper.querySelector(`.${P}__actions`)
          if (actions) wrapper.appendChild(actions)
        })
      }
    }

    return wrapper
  }

  /** @param {HTMLElement} element */
  save(element) {
    const s = stateMap.get(element)
    if (!s) return this._defaultData()
    return { ...s.data }
  }

  /** @param {Record<string, unknown>} d */
  validate(d) { return validateLinkPreviewData(d) }

  /** @param {HTMLElement} element */
  isEmpty(element) {
    const s = stateMap.get(element)
    if (!s) return true
    return !s.data.url
  }

  /** @param {HTMLElement} element */
  exportData(element) {
    const s = stateMap.get(element)
    if (!s) return { text: '' }
    return { text: s.data.title || s.data.url || '' }
  }

  /** @param {import('../../types').PasteEvent} event */
  onPaste(event) {
    if (event.type === 'pattern') {
      const url = String(event.data)
      if (url && /^https?:\/\/.+/i.test(url)) {
        const d = { ...this._defaultData(), url }
        try { d.domain = new URL(url).hostname } catch {}
        // Metadata fetch is triggered in render() when title is empty —
        // it operates on wrapper state directly (this object would be detached).
        return d
      }
    }
    return null
  }

  /** @param {HTMLElement} element */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      s.abortController?.abort()
      if (s.inputTimer) clearTimeout(s.inputTimer)
      stateMap.delete(element)
    }
  }

  /** @param {HTMLElement} wrapper */
  _cleanup(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    s.abortController?.abort()
    s.abortController = new AbortController()
  }

  // ── URL Bar ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderUrlBar(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this._cleanup(wrapper)
    const signal = /** @type {AbortController} */ (s.abortController).signal

    const bar = document.createElement('div')
    bar.className = `${P}__url-bar`

    const iconEl = document.createElement('span')
    iconEl.className = `${P}__url-icon`
    renderUrlIcon(iconEl, s.data.favicon)
    bar.appendChild(iconEl)
    s.urlIconEl = iconEl

    const input = document.createElement('input')
    input.className = `${P}__url-input`
    input.type = 'text'
    input.placeholder = this._t('placeholder', 'Paste a link...')
    if (s.data.url) input.value = s.data.url

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (s.inputTimer) clearTimeout(s.inputTimer)
        this._processUrl(wrapper, input.value.trim())
        return
      }
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

    if (!s.data.url) requestAnimationFrame(() => input.focus())
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} url
   */
  _processUrl(wrapper, url) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const iconEl = s.urlIconEl
    if (!iconEl) return

    if (!url || !/^https?:\/\/.+/i.test(url)) {
      if (s.data.url) {
        s.context.mutate(() => {
          s.data = { ...this._defaultData(), template: s.data.template }
          this._removeCardElements(wrapper)
          iconEl.innerHTML = ICON_FORMS
        })
      }
      return
    }

    if (url === s.data.url) return

    s.context.mutate(() => {
      iconEl.innerHTML = ICON_LOADER
      s.data.url = url
      try { s.data.domain = new URL(url).hostname } catch {}
    })

    this._loadMeta(wrapper, url).then(() => {
      const st = stateMap.get(wrapper)
      if (!st) return
      if (st.urlIconEl) renderUrlIcon(st.urlIconEl, st.data.favicon)
      this._removeCardElements(wrapper)
      this._renderCard(wrapper)
      this._renderActions(wrapper)
      wrapper.classList.add(`${P}--filled`)
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} url
   */
  async _loadMeta(wrapper, url) {
    if (!this._config.fetchMeta) return
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    const signal = s.abortController?.signal ?? new AbortController().signal
    try {
      const meta = await this._config.fetchMeta(url, { signal })
      if (meta && stateMap.get(wrapper) === s && s.data.url === url) {
        s.context.mutate(() => {
          s.data.title = meta.title || ''
          s.data.description = meta.description || ''
          s.data.image = sanitizeUrl(meta.image || '', { policy: 'media', fallback: '' })
          s.data.favicon = sanitizeUrl(meta.favicon || '', { policy: 'media', fallback: '' })
          if (meta.domain) s.data.domain = meta.domain
        })
      }
    } catch (err) {
      if (!signal.aborted) console.warn('[LinkPreview] Failed to fetch meta for', url, err)
    }
  }

  /** @param {HTMLElement} wrapper */
  _removeCardElements(wrapper) {
    wrapper.querySelector(`.${P}__card`)?.remove()
    wrapper.querySelector(`.${P}__actions`)?.remove()
    wrapper.classList.remove(`${P}--filled`)
  }

  // ── Card ────────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderCard(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return

    const tpl = s.data.template

    const card = document.createElement('a')
    card.className = `${P}__card ${P}__card--${tpl}`
    setSafeUrlAttribute(card, 'href', s.data.url, 'external')
    card.target = '_blank'
    card.rel = 'noopener noreferrer'
    card.addEventListener('click', (e) => e.stopPropagation())

    const content = document.createElement('div')
    content.className = `${P}__content`

    const titleText = s.data.title || s.data.url
    const title = document.createElement('div')
    title.className = `${P}__title`
    title.textContent = titleText
    content.appendChild(title)

    if (s.data.description) {
      const desc = document.createElement('div')
      desc.className = `${P}__desc`
      desc.textContent = s.data.description
      content.appendChild(desc)
    }

    const domainLine = document.createElement('div')
    domainLine.className = `${P}__domain`

    if (s.data.favicon && tpl !== 'notion') {
      const fav = document.createElement('img')
      fav.className = `${P}__favicon`
      setSafeUrlAttribute(fav, 'src', s.data.favicon, 'media')
      fav.width = 14
      fav.height = 14
      fav.alt = ''
      domainLine.appendChild(fav)
    }

    const domainText = document.createElement('span')
    domainText.textContent = s.data.domain || s.data.url
    domainLine.appendChild(domainText)

    const ext = document.createElement('span')
    ext.className = `${P}__external`
    ext.innerHTML = ICON_EXTERNAL
    domainLine.appendChild(ext)

    content.appendChild(domainLine)
    card.appendChild(content)

    // Image (not for minimal/notion templates)
    if (s.data.image && tpl !== 'minimal' && tpl !== 'notion') {
      const imgWrap = document.createElement('div')
      imgWrap.className = `${P}__image`
      const img = document.createElement('img')
      setSafeUrlAttribute(img, 'src', s.data.image, 'media')
      img.alt = ''
      img.loading = 'lazy'
      imgWrap.appendChild(img)
      card.appendChild(imgWrap)
    }

    // Notion: large favicon
    if (tpl === 'notion') {
      const bigFav = document.createElement('img')
      bigFav.className = `${P}__favicon-large`
      setSafeUrlAttribute(bigFav, 'src', s.data.favicon || '', 'media')
      bigFav.width = 32
      bigFav.height = 32
      bigFav.alt = ''
      card.insertBefore(bigFav, content)
    }

    wrapper.appendChild(card)
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _renderActions(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const signal = s.abortController?.signal

    const actions = document.createElement('div')
    actions.className = `${P}__actions`

    // Settings dropdown
    const dropdown = document.createElement('div')
    dropdown.className = `${P}__dropdown`

    const settingsBtn = document.createElement('button')
    settingsBtn.type = 'button'
    settingsBtn.className = `${P}__action-btn`
    settingsBtn.innerHTML = `${ICON_SETTINGS} ${this._t('settings', 'Settings')}`

    const panel = this._buildTemplatePanel(wrapper, signal)

    settingsBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = dropdown.classList.toggle(`${P}__dropdown--open`)
      if (open) {
        const r = settingsBtn.getBoundingClientRect()
        const h = panel.offsetHeight || 200
        if (window.innerHeight - r.bottom - 8 < h) { panel.style.top = 'auto'; panel.style.bottom = 'calc(100% + 8px)' }
        else { panel.style.top = 'calc(100% + 8px)'; panel.style.bottom = 'auto' }
      }
    }, { signal })

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(/** @type {Node} */ (e.target))) dropdown.classList.remove(`${P}__dropdown--open`)
    }, { signal })

    dropdown.append(settingsBtn, panel)
    actions.appendChild(dropdown)

    // Sep
    const sep = document.createElement('div')
    sep.className = `${P}__actions-sep`
    actions.appendChild(sep)

    // Delete
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = `${P}__action-btn ${P}__action-btn--danger`
    deleteBtn.innerHTML = ICON_TRASH
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      st.context.mutate(() => {
        if (st.inputTimer) clearTimeout(st.inputTimer)
        st.data = this._defaultData()
        this._removeCardElements(wrapper)
        if (st.urlIconEl) st.urlIconEl.innerHTML = ICON
        const inp = wrapper.querySelector(`.${P}__url-input`)
        if (inp) { /** @type {HTMLInputElement} */ (inp).value = ''; /** @type {HTMLInputElement} */ (inp).focus() }
      })
    }, { signal })
    actions.appendChild(deleteBtn)

    wrapper.appendChild(actions)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {AbortSignal} [signal]
   */
  _buildTemplatePanel(wrapper, signal) {
    const s = stateMap.get(wrapper)
    if (!s) return document.createElement('div')

    const panel = document.createElement('div')
    panel.className = `${P}__dropdown-panel`
    panel.addEventListener('click', (e) => e.stopPropagation())

    const title = document.createElement('div')
    title.className = `${P}__tpl-title`
    title.textContent = this._t('template', 'Template')
    panel.appendChild(title)

    const grid = document.createElement('div')
    grid.className = `${P}__tpl-grid`

    for (const tpl of TEMPLATES) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `${P}__tpl-btn${s.data.template === tpl ? ` ${P}__tpl-btn--active` : ''}`
      btn.innerHTML = TEMPLATE_ICONS[tpl] || ''
      btn.title = this._t(`template.${tpl}`, tpl)
      btn.setAttribute('aria-label', btn.title)
      btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      btn.addEventListener('click', () => {
        const st = stateMap.get(wrapper)
        if (!st) return
        st.context.mutate(() => {
          st.data.template = tpl
          grid.querySelectorAll(`.${P}__tpl-btn`).forEach(b => b.classList.remove(`${P}__tpl-btn--active`))
          btn.classList.add(`${P}__tpl-btn--active`)
          // Re-render only the card, keep actions/dropdown intact
          wrapper.querySelector(`.${P}__card`)?.remove()
          this._renderCard(wrapper)
          // Move actions back to the end after card was re-appended
          const actions = wrapper.querySelector(`.${P}__actions`)
          if (actions) wrapper.appendChild(actions)
          wrapper.classList.add(`${P}--filled`)
        })
      }, { signal })
      grid.appendChild(btn)
    }

    panel.appendChild(grid)
    return panel
  }
}
