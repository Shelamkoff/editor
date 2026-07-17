import { triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { getFileIcon, getExtension, formatSize, EXT_COLORS } from '../../shared/fileUtils.js'
import { validateAttachesData } from '../../shared/blockDataValidators.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = new URL('./attaches.css', import.meta.url).href

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2"/><path d="M12 11v6"/><path d="M9.5 13.5l2.5-2.5l2.5 2.5"/></svg>'
const ICON_SELECT = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2"/><path d="M12 11v6"/><path d="M9.5 13.5l2.5-2.5l2.5 2.5"/></svg>'
const ICON_UPLOAD = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 9l5-5l5 5"/><path d="M12 4v12"/></svg>'
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M14 11v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>'
const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
const ICON_SETTINGS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
const ICON_FILE_DEFAULT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/></svg>'
const ICON_FILE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/></svg>'

/** @type {string[]} */
const VARIANTS = ['a', 'b', 'f', 'g']

/** @type {Record<string, { icon: string, label: string }>} */
const VARIANT_META = {
  a: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2"/></svg>', label: 'variantA' },
  b: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>', label: 'variantB' },
  f: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>', label: 'variantF' },
  g: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>', label: 'variantG' },
}

/**
 * @typedef {{ url: string, name: string, size: number, extension: string }} FileEntry
 * @typedef {Object} AttachesAction
 * @property {string} label Plain-text label shown on the source button.
 * @property {string} [icon] Trusted application-owned icon markup. Never pass user-authored HTML.
 * @property {(context: { signal: AbortSignal }) => Promise<Array<{ url: string, name: string, size?: number, extension?: string }> | null>} handler Opens an application-owned source and returns selected files, or `null` when selection is cancelled.
 * @typedef {Object} AttachesConfig
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string, size?: number }>} [uploadFile] Uploads a browser file. Without this callback the plugin creates a temporary object URL valid until the editor is destroyed.
 * @property {AttachesAction[]} [actions] Additional file sources such as a media library.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in plugin stylesheet.
 * @property {string} [css] Additional or replacement stylesheet URL, depending on `injectStyles`.
 * @typedef {{
 *   data: { files: FileEntry[], variant: string },
 *   viewController: AbortController | null,
 *   taskControllers: Set<AbortController>,
 *   expanded: boolean,
 *   context: import('../../core/types').BlockMutationContext,
 * }} AttachesState
 */

/** @type {WeakMap<HTMLElement, AttachesState>} */
const stateMap = new WeakMap()
let groupSequence = 0


/**
 * File attachment block supporting direct uploads and consumer-defined file
 * source actions such as a media library.
 * @extends {BlockPluginAbstract<AttachesConfig>}
 */
export class Attaches extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'attaches'
  icon = ICON
  inlineTools = false


  #objectUrls = new Set()
  /**
   * Create an Attaches instance with the supplied consumer configuration.
   * @param {AttachesConfig} [config]
   */
  constructor(config) {
    super(config)
  }

  /** @returns {AttachesConfig} Consumer configuration for this plugin instance. */
  get #config() {
    return /** @type {AttachesConfig} */ (this._config)
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string} Localized toolbox title.
   */
  get title() { return this._t('title', 'File') }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const normalizeSize = (value) => {
      const size = Number(value)
      return Number.isFinite(size) && size >= 0 ? size : 0
    }
    let files
    if (data?.file && !data?.files) {
      const f = /** @type {any} */ (data.file)
      const url = sanitizeUrl(normalizeTextValue(f.url), { policy: 'download', fallback: '' })
      const name = normalizeTextValue(f.name)
      files = url ? [{
        url,
        name,
        size: normalizeSize(f.size),
        extension: normalizeTextValue(f.extension) || getExtension(name),
      }] : []
    } else {
      const inputFiles = Array.isArray(data?.files) ? data.files : []
      files = /** @type {any[]} */ (inputFiles).map(f => ({
        url: sanitizeUrl(normalizeTextValue(f?.url), { policy: 'download', fallback: '' }),
        name: normalizeTextValue(f?.name),
        size: normalizeSize(f?.size),
        extension: normalizeTextValue(f?.extension) || getExtension(normalizeTextValue(f?.name)),
      })).filter(f => f.url)
    }
    const requestedVariant = normalizeTextValue(data?.variant) || 'f'
    const variant = VARIANTS.includes(requestedVariant) ? requestedVariant : 'f'
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-attaches')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1
    stateMap.set(wrapper, {
      data: { files, variant },
      viewController: null,
      taskControllers: new Set(),
      expanded: false,
      context,
    })
    if (files.length > 0) this.#renderFilled(wrapper)
    else this.#renderSelect(wrapper)
    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} el
   * @returns {{ files: FileEntry[], variant: string }}
   */
  save(el) {
    const s = stateMap.get(el)
    if (!s) return { files: [], variant: 'f' }
    this.#syncNames(el)
    return { files: s.data.files.map(f => ({ ...f })), variant: s.data.variant }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validateAttachesData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  isEmpty(el) {
    const s = stateMap.get(el)
    return !s || s.data.files.length === 0
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} el
   * @returns {{ text: string }}
   */
  exportData(el) {
    const s = stateMap.get(el)
    return { text: s ? s.data.files.map(f => f.name).join(', ') : '' }
  }

  /**
   * Abort work and listeners owned by one rendered block.
   * @param {HTMLElement} el
   * @returns {void}
   */
  destroy(el) {
    const s = stateMap.get(el)
    if (s) {
      s.viewController?.abort()
      for (const controller of s.taskControllers) controller.abort()
      s.taskControllers.clear()
      stateMap.delete(el)
    }
  }

  /**
   * Release temporary local URLs after all block snapshots and undo history
   * owned by this editor have become unreachable.
   * @returns {void}
   */
  dispose() {
    for (const url of this.#objectUrls) URL.revokeObjectURL(url)
    this.#objectUrls.clear()
  }

  // ── sync editable names ────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #syncNames(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    wrapper.querySelectorAll('.oe-attaches__name:not(.oe-attaches__name--static)').forEach((el, i) => {
      if (s.data.files[i]) {
        const t = String(el.textContent ?? '').trim()
        if (t) s.data.files[i].name = t
      }
    })
  }

  // ── dropzone ───────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #renderSelect(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    wrapper.innerHTML = ''
    wrapper.classList.remove('oe-attaches--filled')
    s.viewController?.abort()
    s.viewController = new AbortController()
    const { signal } = s.viewController

    const select = document.createElement('div')
    select.className = 'oe-attaches__select'

    if (s.context.readOnly) {
      select.textContent = this._t('emptyReadonly', 'No files')
      wrapper.appendChild(select)
      return
    }

    const icon = document.createElement('div')
    icon.className = 'oe-attaches__select-icon'
    icon.innerHTML = ICON_SELECT

    const text = document.createElement('div')
    text.className = 'oe-attaches__select-text'
    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'oe-attaches__select-link'
    link.textContent = this._t('dropzoneUpload', 'Upload')
    link.addEventListener('click', (e) => { e.stopPropagation(); this.#triggerFileInput(wrapper) }, { signal })
    text.append(link, document.createTextNode(' ' + this._t('dropzoneText', 'files from your device or drag and drop them here')))
    select.append(icon, text)

    const configuredActions = this.#config.actions ?? []
    if (configuredActions.length) {
      const sources = document.createElement('div')
      sources.className = 'oe-attaches__select-actions'
      for (const action of configuredActions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'oe-attaches__select-action'
        if (action.icon) button.insertAdjacentHTML('afterbegin', action.icon)
        button.append(document.createTextNode(action.label))
        button.addEventListener('click', event => {
          event.stopPropagation()
          void this.#runCustomAction(wrapper, action.handler)
        }, { signal })
        sources.appendChild(button)
      }
      select.appendChild(sources)
    }

    wrapper.addEventListener('dragover', (e) => { e.preventDefault(); select.classList.add('oe-attaches__select--dragover') }, { signal })
    wrapper.addEventListener('dragleave', () => select.classList.remove('oe-attaches__select--dragover'), { signal })
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault()
      select.classList.remove('oe-attaches__select--dragover')
      if (e.dataTransfer?.files?.length) void this.#handleFiles(wrapper, e.dataTransfer.files)
    }, { signal })

    wrapper.appendChild(select)
  }

  // ── filled state (dispatches by variant) ──────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #renderFilled(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this.#syncNames(wrapper)
    wrapper.innerHTML = ''
    wrapper.classList.add('oe-attaches--filled')
    s.viewController?.abort()
    s.viewController = new AbortController()
    const { signal } = s.viewController
    const files = s.data.files
    const v = s.data.variant || 'a'

    switch (v) {
      case 'b':
        this.#renderPills(wrapper, files, signal)
        break
      case 'f':
        this.#renderNotion(wrapper, files, signal)
        break
      case 'g':
        this.#renderMaterial(wrapper, files, signal)
        break
      default: // 'a'
        if (files.length === 1) wrapper.appendChild(this.#buildCardA(wrapper, files[0], 0, signal))
        else wrapper.appendChild(this.#buildGroupA(wrapper, signal))
        break
    }

    if (!s.context.readOnly) this.#renderActions(wrapper, signal)
  }

  // ── Variant A: Minimal ────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} w Block wrapper that owns the file state.
   * @param {FileEntry} file File represented by this card.
   * @param {number} i File index in the block data.
   * @param {AbortSignal} sig Current view lifecycle signal.
   * @returns {HTMLDivElement}
   */
  #buildCardA(w, file, i, sig) {
    const card = document.createElement('div')
    card.className = 'oe-attaches__card'
    card.appendChild(this.#buildIconA(file))
    const info = document.createElement('div')
    info.className = 'oe-attaches__info'
    info.appendChild(this.#buildNameEl(w, i, file, sig))
    if (file.size) { const m = document.createElement('div'); m.className = 'oe-attaches__meta'; m.textContent = formatSize(file.size); info.appendChild(m) }
    card.append(info, this.#buildRemoveBtn(w, i, sig))
    return card
  }

  /**
   * @param {HTMLElement} w Block wrapper that owns the group.
   * @param {AbortSignal} sig Current view lifecycle signal.
   * @returns {HTMLDivElement}
   */
  #buildGroupA(w, sig) {
    const s = stateMap.get(w)
    if (!s) return document.createElement('div')
    const files = s.data.files
    const group = document.createElement('div')
    group.className = 'oe-attaches__group'

    const header = document.createElement('div')
    header.className = 'oe-attaches__group-header'
    const iconWrap = document.createElement('div')
    iconWrap.className = 'oe-attaches__icon'
    iconWrap.innerHTML = ICON_FILE_DEFAULT
    const headerInfo = document.createElement('div')
    headerInfo.className = 'oe-attaches__info'
    const countText = document.createElement('div')
    countText.className = 'oe-attaches__name oe-attaches__name--static'
    countText.textContent = `${files.length} ${this._p('filesCount', files.length, 'files')}`
    headerInfo.appendChild(countText)
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0)
    if (totalSize > 0) { const m = document.createElement('span'); m.className = 'oe-attaches__meta'; m.textContent = formatSize(totalSize); headerInfo.appendChild(m) }
    const chevron = document.createElement('button')
    chevron.type = 'button'
    chevron.className = 'oe-attaches__chevron'
    chevron.innerHTML = ICON_CHEVRON
    chevron.setAttribute('aria-label', this._t('toggleGroup', 'Show or hide files'))
    chevron.setAttribute('aria-expanded', String(s.expanded))
    header.append(iconWrap, headerInfo, chevron)

    const body = document.createElement('div')
    body.className = 'oe-attaches__group-body'
    body.id = `rector-editor-attaches-group-${++groupSequence}`
    chevron.setAttribute('aria-controls', body.id)
    if (s.expanded) { body.classList.add('oe-attaches__group-body--open'); chevron.classList.add('oe-attaches__chevron--open') }
    for (let i = 0; i < files.length; i++) {
      const row = document.createElement('div')
      row.className = 'oe-attaches__row'
      row.append(this.#buildNameEl(w, i, files[i], sig))
      if (files[i].size) { const sz = document.createElement('span'); sz.className = 'oe-attaches__row-size'; sz.textContent = formatSize(files[i].size); row.appendChild(sz) }
      row.appendChild(this.#buildRemoveBtn(w, i, sig))
      body.appendChild(row)
    }
    const toggle = () => {
      const st = stateMap.get(w)
      if (!st) return
      st.expanded = !st.expanded
      body.classList.toggle('oe-attaches__group-body--open', st.expanded)
      chevron.classList.toggle('oe-attaches__chevron--open', st.expanded)
      chevron.setAttribute('aria-expanded', String(st.expanded))
    }
    header.addEventListener('click', (event) => {
      const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null)
      if (target?.closest('button, [contenteditable="true"]')) return
      toggle()
    }, { signal: sig })
    chevron.addEventListener('click', (event) => {
      event.stopPropagation()
      toggle()
    }, { signal: sig })
    group.append(header, body)
    return group
  }

  /** Variant A icon: always default file SVG + extension badge. @param {FileEntry} file @returns {HTMLDivElement} */
  #buildIconA(file) {
    const wrap = document.createElement('div')
    wrap.className = 'oe-attaches__icon'
    wrap.innerHTML = ICON_FILE_DEFAULT
    if (file.extension) {
      const badge = document.createElement('span')
      badge.className = 'oe-attaches__ext'
      badge.textContent = file.extension.toUpperCase()
      const color = EXT_COLORS[file.extension.toLowerCase()]
      if (color) badge.style.backgroundColor = color
      wrap.appendChild(badge)
    }
    return wrap
  }

  // ── Variant B: Pill ────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} w Block wrapper that receives the pill list.
   * @param {FileEntry[]} files Files to render.
   * @param {AbortSignal} sig Current view lifecycle signal.
   * @returns {void}
   */
  #renderPills(w, files, sig) {
    const container = document.createElement('div')
    container.className = 'oe-attaches__pills'
    for (let i = 0; i < files.length; i++) {
      const pill = document.createElement('div')
      pill.className = 'oe-attaches__pill'
      const ic = document.createElement('div')
      ic.className = 'oe-attaches__pill-icon'
      ic.innerHTML = ICON_FILE_SM
      pill.appendChild(ic)
      pill.appendChild(this.#buildNameEl(w, i, files[i], sig))
      if (files[i].size) { const sz = document.createElement('span'); sz.className = 'oe-attaches__pill-size'; sz.textContent = formatSize(files[i].size); pill.appendChild(sz) }
      pill.appendChild(this.#buildRemoveBtn(w, i, sig))
      container.appendChild(pill)
    }
    w.appendChild(container)
  }

  // ── Variant F: Notion ──────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} w Block wrapper that receives the table-like list.
   * @param {FileEntry[]} files Files to render.
   * @param {AbortSignal} sig Current view lifecycle signal.
   * @returns {void}
   */
  #renderNotion(w, files, sig) {
    const table = document.createElement('div')
    table.className = 'oe-attaches__notion'
    for (let i = 0; i < files.length; i++) {
      const row = document.createElement('div')
      row.className = 'oe-attaches__notion-row'
      row.appendChild(this.#buildNameEl(w, i, files[i], sig))
      const ext = (files[i].extension || '').toUpperCase()
      if (ext) {
        const tag = document.createElement('span')
        tag.className = 'oe-attaches__notion-tag'
        tag.textContent = ext
        const color = EXT_COLORS[files[i].extension?.toLowerCase()] || null
        if (color) { tag.style.backgroundColor = `${color}20`; tag.style.color = color }
        row.appendChild(tag)
      }
      if (files[i].size) { const sz = document.createElement('span'); sz.className = 'oe-attaches__notion-size'; sz.textContent = formatSize(files[i].size); row.appendChild(sz) }
      row.appendChild(this.#buildRemoveBtn(w, i, sig))
      table.appendChild(row)
    }
    w.appendChild(table)
  }

  // ── Variant G: Material ────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} w Block wrapper that receives the material cards.
   * @param {FileEntry[]} files Files to render.
   * @param {AbortSignal} sig Current view lifecycle signal.
   * @returns {void}
   */
  #renderMaterial(w, files, sig) {
    const stack = document.createElement('div')
    stack.className = 'oe-attaches__material'
    for (let i = 0; i < files.length; i++) {
      const card = document.createElement('div')
      card.className = 'oe-attaches__material-card'
      card.appendChild(this.#buildIconG(files[i]))
      const info = document.createElement('div')
      info.className = 'oe-attaches__info'
      info.appendChild(this.#buildNameEl(w, i, files[i], sig))
      if (files[i].size) { const m = document.createElement('div'); m.className = 'oe-attaches__meta'; m.textContent = formatSize(files[i].size); info.appendChild(m) }
      card.append(info, this.#buildRemoveBtn(w, i, sig))
      stack.appendChild(card)
    }
    w.appendChild(stack)
  }

  /** Variant G icon: custom type-specific icon, no badge. @param {FileEntry} file @returns {HTMLDivElement} */
  #buildIconG(file) {
    const wrap = document.createElement('div')
    wrap.className = 'oe-attaches__material-icon'
    const { svg } = getFileIcon(file.extension)
    wrap.innerHTML = svg
    return wrap
  }

  // ── shared builders ────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @param {number} index
   * @param {FileEntry} file
   * @param {AbortSignal} signal
   * @returns {HTMLDivElement}
   */
  #buildNameEl(wrapper, index, file, signal) {
    const state = stateMap.get(wrapper)
    const editable = !state?.context.readOnly
    const el = document.createElement('div')
    el.className = `oe-attaches__name${editable ? '' : ' oe-attaches__name--static'}`
    el.contentEditable = String(editable)
    const fallbackName = this._t('untitled', 'File')
    el.textContent = file.name || fallbackName
    if (!editable) return el

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur() }
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    }, { signal })
    el.addEventListener('blur', () => {
      const s = stateMap.get(wrapper)
      if (s?.data.files[index]) s.data.files[index].name = String(el.textContent ?? '').trim() || fallbackName
    }, { signal })
    return el
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {number} index
   * @param {AbortSignal} signal
   * @returns {HTMLButtonElement}
   */
  #buildRemoveBtn(wrapper, index, signal) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'oe-attaches__remove'
    btn.innerHTML = '&times;'
    btn.setAttribute('aria-label', this._t('delete', 'Delete'))
    const state = stateMap.get(wrapper)
    if (state?.context.readOnly) {
      btn.hidden = true
      btn.disabled = true
      return btn
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      st.context.mutate(() => {
        st.data.files.splice(index, 1)
        if (st.data.files.length > 0) {
          this.#renderFilled(wrapper)
        } else {
          this.#cancelTasks(wrapper)
          this.#renderSelect(wrapper)
        }
      })
    }, { signal })
    return btn
  }

  // ── actions ────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper Block wrapper that owns the action bar.
   * @param {AbortSignal} signal Current view lifecycle signal.
   * @returns {void}
   */
  #renderActions(wrapper, signal) {
    const actions = document.createElement('div')
    actions.className = 'oe-attaches__actions'

    // Settings dropdown (variant selector)
    const dropdown = document.createElement('div')
    dropdown.className = 'oe-attaches__dropdown'

    const settingsBtn = document.createElement('button')
    settingsBtn.type = 'button'
    settingsBtn.className = 'oe-attaches__action-btn'
    settingsBtn.innerHTML = `${ICON_SETTINGS} ${this._t('settings', 'Settings')}`
    settingsBtn.setAttribute('aria-haspopup', 'true')
    settingsBtn.setAttribute('aria-expanded', 'false')

    const panel = this.#buildVariantPanel(wrapper, signal)
    const setOpen = (open) => {
      dropdown.classList.toggle('oe-attaches__dropdown--open', open)
      settingsBtn.setAttribute('aria-expanded', String(open))
    }

    settingsBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      setOpen(!dropdown.classList.contains('oe-attaches__dropdown--open'))
    }, { signal })

    document.addEventListener('click', (e) => {
      const target = e.target
      if (!(target instanceof globalThis.Node)) return
      if (!dropdown.contains(/** @type {import('../../core/types').DOMNode} */ (target))) setOpen(false)
    }, { signal })
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !dropdown.classList.contains('oe-attaches__dropdown--open')) return
      event.preventDefault()
      setOpen(false)
      settingsBtn.focus()
    }, { signal })

    dropdown.append(settingsBtn, panel)
    actions.appendChild(dropdown)

    actions.appendChild(this.#sep())

    // Add files
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'oe-attaches__action-btn'
    addBtn.innerHTML = `${ICON_UPLOAD} ${this._t('addFiles', 'Add files')}`
    addBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.#triggerFileInput(wrapper) }, { signal })
    actions.appendChild(addBtn)

    for (const action of this.#config.actions ?? []) {
      const sourceBtn = document.createElement('button')
      sourceBtn.type = 'button'
      sourceBtn.className = 'oe-attaches__action-btn'
      if (action.icon) sourceBtn.insertAdjacentHTML('afterbegin', action.icon)
      sourceBtn.append(document.createTextNode(` ${action.label}`))
      sourceBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void this.#runCustomAction(wrapper, action.handler)
      }, { signal })
      actions.appendChild(sourceBtn)
    }

    actions.appendChild(this.#sep())

    // Delete all
    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'oe-attaches__action-btn oe-attaches__action-btn--danger'
    delBtn.innerHTML = ICON_TRASH
    delBtn.setAttribute('aria-label', this._t('deleteAll', 'Delete all'))
    delBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      st.context.mutate(() => {
        this.#cancelTasks(wrapper)
        st.data = { files: [], variant: st.data.variant }
        this.#renderSelect(wrapper)
      })
    }, { signal })
    actions.appendChild(delBtn)

    wrapper.appendChild(actions)
  }

  /**
   * Build the variant selector dropdown panel.
   * @param {HTMLElement} wrapper
   * @param {AbortSignal} signal
   * @returns {HTMLDivElement}
   */
  #buildVariantPanel(wrapper, signal) {
    const s = stateMap.get(wrapper)
    const panel = document.createElement('div')
    panel.className = 'oe-attaches__dropdown-panel'
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', this._t('template', 'Template'))
    panel.addEventListener('click', (e) => e.stopPropagation(), { signal })

    const title = document.createElement('div')
    title.className = 'oe-attaches__tpl-title'
    title.textContent = this._t('template', 'Template')
    panel.appendChild(title)

    const grid = document.createElement('div')
    grid.className = 'oe-attaches__tpl-grid'

    for (const v of VARIANTS) {
      const meta = VARIANT_META[v]
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'oe-attaches__tpl-btn' + (s?.data.variant === v ? ' oe-attaches__tpl-btn--active' : '')
      btn.innerHTML = meta.icon
      btn.title = this._t(meta.label, meta.label)
      btn.setAttribute('aria-label', btn.title)
      btn.setAttribute('aria-pressed', String(s?.data.variant === v))
      btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      btn.addEventListener('click', () => {
        const st = stateMap.get(wrapper)
        if (!st) return
        st.context.mutate(() => {
          this.#syncNames(wrapper)
          st.data.variant = v
          grid.querySelectorAll('.oe-attaches__tpl-btn').forEach(b => {
            b.classList.remove('oe-attaches__tpl-btn--active')
            b.setAttribute('aria-pressed', 'false')
          })
          btn.classList.add('oe-attaches__tpl-btn--active')
          btn.setAttribute('aria-pressed', 'true')
          // Re-render content only, keep actions intact
          this.#rerenderContent(wrapper)
        })
      }, { signal })
      grid.appendChild(btn)
    }

    panel.appendChild(grid)
    return panel
  }

  /**
   * Re-render file content without rebuilding action bar.
   * Preserves the actions element and its event listeners.
   * @param {HTMLElement} wrapper
   * @returns {void}
   */
  #rerenderContent(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return

    // Remove only content elements, keep .oe-attaches__actions intact
    const actions = wrapper.querySelector('.oe-attaches__actions')
    for (const child of [...wrapper.children]) {
      if (child !== actions) child.remove()
    }

    const signal = s.viewController?.signal
    if (!signal || signal.aborted) return
    const files = s.data.files
    const v = s.data.variant || 'a'

    switch (v) {
      case 'b': this.#renderPills(wrapper, files, signal); break
      case 'f': this.#renderNotion(wrapper, files, signal); break
      case 'g': this.#renderMaterial(wrapper, files, signal); break
      default:
        if (files.length === 1) wrapper.appendChild(this.#buildCardA(wrapper, files[0], 0, signal))
        else wrapper.appendChild(this.#buildGroupA(wrapper, signal))
        break
    }

    // Move actions back to the end
    if (actions) wrapper.appendChild(actions)
  }

  /** @returns {HTMLDivElement} */
  #sep() {
    const s = document.createElement('div')
    s.className = 'oe-attaches__actions-sep'
    return s
  }

  // ── file handling ──────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #triggerFileInput(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    triggerFileInput({
      multiple: true,
      signal: s.viewController?.signal,
      onFiles: (files) => { void this.#handleFiles(wrapper, files) },
    })
  }

  /**
   * Start an asynchronous additive operation owned by one block.
   * View re-renders do not cancel it; block destruction or explicit removal does.
   * @param {HTMLElement} wrapper
   * @returns {{ state: AttachesState, controller: AbortController } | null}
   */
  #startTask(wrapper) {
    const state = stateMap.get(wrapper)
    if (!state || state.context.readOnly) return null
    const controller = new AbortController()
    state.taskControllers.add(controller)
    wrapper.classList.add('oe-attaches--loading')
    return { state, controller }
  }

  /**
   * @param {HTMLElement} wrapper Block wrapper whose loading state is updated.
   * @param {AttachesState} state State that owns the asynchronous task.
   * @param {AbortController} controller Completed task controller.
   * @returns {void}
   */
  #finishTask(wrapper, state, controller) {
    state.taskControllers.delete(controller)
    if (state.taskControllers.size === 0) wrapper.classList.remove('oe-attaches--loading')
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #cancelTasks(wrapper) {
    const state = stateMap.get(wrapper)
    if (!state) return
    for (const controller of state.taskControllers) controller.abort()
    state.taskControllers.clear()
    wrapper.classList.remove('oe-attaches--loading')
  }

  /**
   * @param {HTMLElement} wrapper Block wrapper that receives uploaded files.
   * @param {FileList | File[]} fileList Browser files selected or dropped by the user.
   * @returns {Promise<void>}
   */
  async #handleFiles(wrapper, fileList) {
    const files = /** @type {File[]} */ (Array.from(fileList))
    if (files.length === 0) return
    const task = this.#startTask(wrapper)
    if (!task) return
    const { state: s, controller } = task
    const { signal } = controller

    try {
      const uploadFile = this.#config.uploadFile
      if (uploadFile) {
        const added = []
        for (const file of files) {
          if (signal.aborted) break
          try {
            const ext = getExtension(file.name)
            const result = await uploadFile(file, { signal })
            const url = sanitizeUrl(String(result?.url || ''), { policy: 'download', fallback: '' })
            const resultSize = Number(result?.size)
            const size = Number.isFinite(resultSize) && resultSize >= 0 ? resultSize : file.size
            if (url) added.push({ url, name: file.name, size, extension: ext })
          } catch (error) {
            if (signal.aborted) break
            console.warn(`[Attaches] Failed to upload "${file.name}":`, error)
          }
        }
        if (!signal.aborted && stateMap.get(wrapper) === s && added.length > 0) {
          s.context.mutate(() => {
            s.data.files.push(...added)
            this.#renderFilled(wrapper)
          })
        }
      } else {
        const added = []
        for (const file of files) {
          if (signal.aborted) break
          const ext = getExtension(file.name)
          try {
            const url = URL.createObjectURL(file)
            this.#objectUrls.add(url)
            added.push({ url, name: file.name, size: file.size, extension: ext })
          } catch (error) {
            console.warn(`[Attaches] Failed to open "${file.name}":`, error)
          }
        }
        if (!signal.aborted && stateMap.get(wrapper) === s && added.length > 0) {
          s.context.mutate(() => {
            s.data.files.push(...added)
            this.#renderFilled(wrapper)
          })
        }
      }
    } finally {
      this.#finishTask(wrapper, s, controller)
    }
  }

  /**
   * Add files selected by an application source such as a media library.
   * One completed selection becomes one editor history operation.
   * @param {HTMLElement} wrapper
   * @param {(context: { signal: AbortSignal }) => Promise<Array<{ url: string, name: string, size?: number, extension?: string }> | null>} handler
   * @returns {Promise<void>}
   */
  async #runCustomAction(wrapper, handler) {
    const task = this.#startTask(wrapper)
    if (!task) return
    const { state: s, controller } = task
    const { signal } = controller
    try {
      const result = await handler({ signal })
      if (!Array.isArray(result) || signal.aborted || stateMap.get(wrapper) !== s) return
      const added = result.flatMap(item => {
        const url = sanitizeUrl(String(item?.url || ''), { policy: 'download', fallback: '' })
        const name = String(item?.name || '').trim()
        if (!url || !name) return []
        const size = Number(item?.size)
        return [{
          url,
          name,
          size: Number.isFinite(size) && size >= 0 ? size : 0,
          extension: String(item?.extension || getExtension(name)),
        }]
      })
      if (!added.length) return
      s.context.mutate(() => {
        s.data.files.push(...added)
        this.#renderFilled(wrapper)
      })
    } catch (error) {
      if (!signal.aborted) console.warn('[Attaches] Application source failed:', error)
    } finally {
      this.#finishTask(wrapper, s, controller)
    }
  }
}
