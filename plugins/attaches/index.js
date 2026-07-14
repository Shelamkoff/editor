import { resolvePath } from '../../shared/resolvePath.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { getFileIcon, getExtension, formatSize, EXT_COLORS } from '../../shared/fileUtils.js'
import { validateAttachesData } from '../../shared/blockDataValidators.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'

const editorStyles = resolvePath('./attaches.css', import.meta.url)

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
 * @typedef {{
 *   uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string, size?: number }>,
 *   actions?: Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<Array<{ url: string, name: string, size?: number, extension?: string }> | null> }>,
 *   injectStyles?: boolean,
 *   css?: string,
 * }} AttachesConfig
 * @typedef {{
 *   data: { files: FileEntry[], variant: string },
 *   objectUrls: string[],
 *   abortController: AbortController | null,
 *   expanded: boolean,
 *   context: import('../../core/types').BlockMutationContext,
 * }} AttachesState
 */

/** @type {WeakMap<HTMLElement, AttachesState>} */
const stateMap = new WeakMap()


/** @extends {BlockPluginAbstract<AttachesConfig>} */
export class Attaches extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'attaches'
  icon = ICON
  inlineTools = false

  /** @param {AttachesConfig} [config] */
  constructor(config) {
    super(config)
  }

  get title() { return this._t('title', 'File') }

  /**
   * @param {Record<string, unknown>} data
   * @returns {HTMLElement}
   */
  render(data, context) {
    /** @type {FileEntry[]} */
    let files
    if (data?.file && !data?.files) {
      const f = /** @type {any} */ (data.file)
      const url = sanitizeUrl(String(f.url || ''), { policy: 'download', fallback: '' })
      files = url ? [{ url, name: String(f.name || ''), size: Number(f.size) || 0, extension: String(f.extension || getExtension(f.name || '')) }] : []
    } else {
      files = /** @type {any[]} */ (data?.files || []).map(f => ({
        url: sanitizeUrl(String(f?.url || ''), { policy: 'download', fallback: '' }),
        name: String(f?.name || ''), size: Number(f?.size) || 0,
        extension: String(f?.extension || getExtension(f?.name || '')),
      })).filter(f => f.url)
    }

    const variant = String(data?.variant || 'f')

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-attaches')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, { data: { files, variant }, objectUrls: [], abortController: null, expanded: false, context })

    if (files.length > 0) this.#renderFilled(wrapper)
    else this.#renderSelect(wrapper)

    return wrapper
  }

  save(/** @type {HTMLElement} */ el) {
    const s = stateMap.get(el)
    if (!s) return { files: [], variant: 'f' }
    this.#syncNames(el)
    return { files: s.data.files.map(f => ({ ...f })), variant: s.data.variant }
  }

  validate(/** @type {Record<string, unknown>} */ data) {
    return validateAttachesData(data)
  }

  isEmpty(/** @type {HTMLElement} */ el) {
    const s = stateMap.get(el)
    return !s || s.data.files.length === 0
  }

  exportData(/** @type {HTMLElement} */ el) {
    const s = stateMap.get(el)
    return { text: s ? s.data.files.map(f => f.name).join(', ') : '' }
  }

  destroy(/** @type {HTMLElement} */ el) {
    const s = stateMap.get(el)
    if (s) {
      s.abortController?.abort()
      for (const u of s.objectUrls) URL.revokeObjectURL(u)
      stateMap.delete(el)
    }
  }

  // ── sync editable names ────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #syncNames(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    wrapper.querySelectorAll('.oe-attaches__name:not(.oe-attaches__name--static)').forEach((el, i) => {
      if (s.data.files[i]) {
        const t = el.textContent?.trim()
        if (t) s.data.files[i].name = t
      }
    })
  }

  // ── dropzone ───────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #renderSelect(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    wrapper.innerHTML = ''
    wrapper.classList.remove('oe-attaches--filled')
    s.abortController?.abort()
    s.abortController = new AbortController()
    const { signal } = s.abortController

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

    if (this._config.actions?.length) {
      const sources = document.createElement('div')
      sources.className = 'oe-attaches__select-actions'
      for (const action of this._config.actions) {
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
    wrapper.addEventListener('drop', (e) => { e.preventDefault(); select.classList.remove('oe-attaches__select--dragover'); if (e.dataTransfer?.files?.length) this.#handleFiles(wrapper, e.dataTransfer.files) }, { signal })

    wrapper.appendChild(select)
  }

  // ── filled state (dispatches by variant) ──────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #renderFilled(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    this.#syncNames(wrapper)
    wrapper.innerHTML = ''
    wrapper.classList.add('oe-attaches--filled')
    s.abortController?.abort()
    s.abortController = new AbortController()
    const { signal } = s.abortController
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

  /** @param {HTMLElement} w @param {FileEntry} file @param {number} i @param {AbortSignal} sig */
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

  /** @param {HTMLElement} w @param {AbortSignal} sig */
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
    const chevron = document.createElement('div')
    chevron.className = 'oe-attaches__chevron'
    chevron.innerHTML = ICON_CHEVRON
    header.append(iconWrap, headerInfo, chevron)

    const body = document.createElement('div')
    body.className = 'oe-attaches__group-body'
    if (s.expanded) { body.classList.add('oe-attaches__group-body--open'); chevron.classList.add('oe-attaches__chevron--open') }
    for (let i = 0; i < files.length; i++) {
      const row = document.createElement('div')
      row.className = 'oe-attaches__row'
      row.append(this.#buildNameEl(w, i, files[i], sig))
      if (files[i].size) { const sz = document.createElement('span'); sz.className = 'oe-attaches__row-size'; sz.textContent = formatSize(files[i].size); row.appendChild(sz) }
      row.appendChild(this.#buildRemoveBtn(w, i, sig))
      body.appendChild(row)
    }
    header.addEventListener('click', () => { const st = stateMap.get(w); if (!st) return; st.expanded = !st.expanded; body.classList.toggle('oe-attaches__group-body--open', st.expanded); chevron.classList.toggle('oe-attaches__chevron--open', st.expanded) }, { signal: sig })
    group.append(header, body)
    return group
  }

  /** Variant A icon: always default file SVG + extension badge */
  #buildIconA(/** @type {FileEntry} */ file) {
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

  /** @param {HTMLElement} w @param {FileEntry[]} files @param {AbortSignal} sig */
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

  /** @param {HTMLElement} w @param {FileEntry[]} files @param {AbortSignal} sig */
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

  /** @param {HTMLElement} w @param {FileEntry[]} files @param {AbortSignal} sig */
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

  /** Variant G icon: custom type-specific icon, no badge */
  #buildIconG(/** @type {FileEntry} */ file) {
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
      if (s?.data.files[index]) s.data.files[index].name = el.textContent?.trim() || fallbackName
    }, { signal })
    return el
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {number} index
   * @param {AbortSignal} signal
   */
  #buildRemoveBtn(wrapper, index, signal) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'oe-attaches__remove'
    btn.innerHTML = '&times;'
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
        if (st.data.files.length > 0) this.#renderFilled(wrapper)
        else this.#renderSelect(wrapper)
      })
    }, { signal })
    return btn
  }

  // ── actions ────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @param {AbortSignal} signal */
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

    const panel = this.#buildVariantPanel(wrapper, signal)

    settingsBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.classList.toggle('oe-attaches__dropdown--open')
    }, { signal })

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(/** @type {Node} */ (e.target))) dropdown.classList.remove('oe-attaches__dropdown--open')
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

    for (const action of this._config.actions || []) {
      const sourceBtn = document.createElement('button')
      sourceBtn.type = 'button'
      sourceBtn.className = 'oe-attaches__action-btn'
      sourceBtn.innerHTML = `${action.icon || ''} ${action.label}`
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
    delBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const st = stateMap.get(wrapper)
      if (!st) return
      st.context.mutate(() => {
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
   */
  #buildVariantPanel(wrapper, signal) {
    const s = stateMap.get(wrapper)
    const panel = document.createElement('div')
    panel.className = 'oe-attaches__dropdown-panel'
    panel.addEventListener('click', (e) => e.stopPropagation())

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
      btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
      btn.addEventListener('click', () => {
        const st = stateMap.get(wrapper)
        if (!st) return
        st.context.mutate(() => {
          this.#syncNames(wrapper)
          st.data.variant = v
          grid.querySelectorAll('.oe-attaches__tpl-btn').forEach(b => b.classList.remove('oe-attaches__tpl-btn--active'))
          btn.classList.add('oe-attaches__tpl-btn--active')
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
   */
  #rerenderContent(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return

    // Remove only content elements, keep .oe-attaches__actions intact
    const actions = wrapper.querySelector('.oe-attaches__actions')
    for (const child of [...wrapper.children]) {
      if (child !== actions) child.remove()
    }

    const signal = s.abortController?.signal
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

  #sep() {
    const s = document.createElement('div')
    s.className = 'oe-attaches__actions-sep'
    return s
  }

  // ── file handling ──────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #triggerFileInput(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    triggerFileInput({
      multiple: true,
      onFiles: (files) => this.#handleFiles(wrapper, files),
    })
  }

  /** @param {HTMLElement} wrapper @param {FileList | File[]} fileList */
  async #handleFiles(wrapper, fileList) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    const files = Array.from(fileList)
    const signal = s.abortController?.signal ?? new AbortController().signal

    if (this._config.uploadFile) {
      wrapper.classList.add('oe-attaches--loading')
      try {
        const added = []
        for (const file of files) {
          if (signal.aborted) break
          const ext = getExtension(file.name)
          const result = await this._config.uploadFile(file, { signal })
          const url = sanitizeUrl(String(result?.url || ''), { policy: 'download', fallback: '' })
          if (url) added.push({ url, name: file.name, size: result.size ?? file.size, extension: ext })
        }
        if (!signal.aborted && stateMap.get(wrapper) === s && added.length > 0) {
          s.context.mutate(() => {
            s.data.files.push(...added)
            this.#renderFilled(wrapper)
          })
        }
      } catch { /* */ } finally { wrapper.classList.remove('oe-attaches--loading') }
    } else {
      const added = []
      for (const file of files) {
        if (signal.aborted) break
        const ext = getExtension(file.name)
        const url = URL.createObjectURL(file)
        s.objectUrls.push(url)
        added.push({ url, name: file.name, size: file.size, extension: ext })
      }
      if (!signal.aborted && stateMap.get(wrapper) === s && added.length > 0) {
        s.context.mutate(() => {
          s.data.files.push(...added)
          this.#renderFilled(wrapper)
        })
      }
    }
  }

  /**
   * Add files selected by an application source such as a media library.
   * One completed selection becomes one editor history operation.
   * @param {HTMLElement} wrapper
   * @param {(context: { signal: AbortSignal }) => Promise<Array<{ url: string, name: string, size?: number, extension?: string }> | null>} handler
   */
  async #runCustomAction(wrapper, handler) {
    const s = stateMap.get(wrapper)
    if (!s || s.context.readOnly) return
    const signal = s.abortController?.signal ?? new AbortController().signal
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
    }
  }
}
