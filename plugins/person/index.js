import { sanitizeHtml } from '../../core/sanitize.js'
import { openCropper } from '../../../cropper/src/index.js'
import { resolveSocialIcon, SOCIAL_ICONS } from './socialResolver.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./person.css', import.meta.url)
const cropperStyles = resolvePath('../../../cropper/styles/cropper.css', import.meta.url)

// Tabler icon: user-circle
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/></svg>'

const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h-7a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3.5"/><path d="M16 19h6"/><path d="M19 16v6"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>'

const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

const ICON_REMOVE = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12"/></svg>'

const ICON_LOADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>'

const ICON_GRIP = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>'

/**
 * @typedef {{ avatar: string, name: string, role: string, bio: string, links: Array<{type: string, url: string}> }} PersonData
 */

/**
 * @typedef {{
 *   data: { persons: PersonData[] },
 *   wrapper: HTMLDivElement | null,
 *   activeIdx: number,
 *   debounceTimers: Map<string, number>,
 *   dragFromIdx: number | null,
 * }} PersonState
 */

/** @type {WeakMap<HTMLElement, PersonState>} */
const stateMap = new WeakMap()


export class Person extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles, cropperStyles]
  type = 'person'
  icon = ICON
  inlineTools = false

  /** @returns {string} */
  get title() {
    return this._t('title', 'Person')
  }

  /** @returns {PersonData} */
  _defaultPerson() {
    return { avatar: '', name: '', role: '', bio: '', links: [] }
  }

  _defaultData() {
    return { persons: [this._defaultPerson()] }
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {HTMLElement}
   */
  render(data) {
    const raw = /** @type {any[]} */ (data?.persons || [])
    const parsedData = {
      persons: raw.length > 0
        ? raw.map(p => ({
            avatar: String(p?.avatar || ''),
            name: String(p?.name || ''),
            role: String(p?.role || ''),
            bio: String(p?.bio || ''),
            links: Array.isArray(p?.links)
              ? p.links.map((/** @type {any} */ l) => ({ type: String(l?.type || 'website'), url: String(l?.url || '') }))
              : [],
          }))
        : [this._defaultPerson()],
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-person')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: parsedData,
      wrapper,
      activeIdx: Math.min(0, parsedData.persons.length - 1),
      debounceTimers: new Map(),
      dragFromIdx: null,
    })

    this._rebuild(wrapper)
    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  save(element) {
    const s = stateMap.get(element)
    if (!s) return { persons: [] }
    this._syncActiveFromDom(element)
    return {
      persons: s.data.persons
        .filter(p => p.name.trim() || p.avatar)
        .map(p => ({
          ...p,
          links: p.links.filter(l => l.url.trim()).map(l => ({ ...l })),
        })),
    }
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    const persons = /** @type {any[]} */ (data?.persons)
    return Array.isArray(persons) && persons.some(p => !!p?.name)
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const s = stateMap.get(element)
    if (!s) return true
    this._syncActiveFromDom(element)
    return s.data.persons.every(p => !p.name.trim() && !p.avatar)
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    if (!s) return { text: '' }
    return { text: s.data.persons.map(p => p.name).filter(Boolean).join(', ') }
  }

  /**
   * @param {HTMLElement} element
   */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      for (const timer of s.debounceTimers.values()) clearTimeout(timer)
      s.debounceTimers.clear()
      stateMap.delete(element)
    }
  }

  // ── Full rebuild (tabs + card) ─────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _rebuild(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return

    wrapper.innerHTML = ''

    // Tab bar (always shown — contains "+" button)
    wrapper.appendChild(this._buildTabs(wrapper))

    // Active person card
    this._buildCard(wrapper, wrapper)
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  /**
   * Build a single tab element for a person.
   * @param {HTMLElement} wrapper
   * @param {PersonState} s
   * @param {number} i
   * @returns {HTMLElement}
   */
  _buildTab(wrapper, s, i) {
    const person = s.data.persons[i]
    if (!person) return document.createElement('div')

    const tab = document.createElement('div')
    tab.className = 'oe-person__tab' + (i === s.activeIdx ? ' oe-person__tab--active' : '')
    tab.draggable = true

    // Drag handle
    const grip = document.createElement('span')
    grip.className = 'oe-person__tab-grip'
    grip.innerHTML = ICON_GRIP
    tab.appendChild(grip)

    // Mini avatar
    if (person.avatar) {
      const mini = document.createElement('img')
      mini.className = 'oe-person__tab-avatar'
      mini.src = person.avatar
      tab.appendChild(mini)
    }

    // Name
    const label = document.createElement('span')
    label.className = 'oe-person__tab-label'
    label.textContent = person.name || `Person ${i + 1}`
    tab.appendChild(label)

    // Remove button
    if (s.data.persons.length > 1) {
      const rm = document.createElement('button')
      rm.type = 'button'
      rm.className = 'oe-person__tab-remove'
      rm.innerHTML = ICON_REMOVE
      rm.title = this._t('removePerson', 'Remove')
      rm.addEventListener('mousedown', e => e.stopPropagation())
      rm.addEventListener('click', (e) => {
        e.stopPropagation()
        const st = stateMap.get(wrapper)
        if (!st) return
        this._syncActiveFromDom(wrapper)
        st.data.persons.splice(i, 1)
        if (st.activeIdx >= st.data.persons.length) st.activeIdx = st.data.persons.length - 1
        if (st.activeIdx < 0) st.activeIdx = 0
        this._rebuild(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
      })
      tab.appendChild(rm)
    }

    // Click to switch (no full rebuild — swap active class + card only)
    tab.addEventListener('click', () => {
      const st = stateMap.get(wrapper)
      if (!st || i === st.activeIdx) return
      this._syncActiveFromDom(wrapper)
      st.activeIdx = i

      // Toggle tab active class
      const tabs = wrapper.querySelector('.oe-person__tabs')
      if (tabs) {
        tabs.querySelectorAll('.oe-person__tab').forEach((t, idx) => {
          t.classList.toggle('oe-person__tab--active', idx === i)
        })
      }

      // Replace card only
      const oldCard = wrapper.querySelector('.oe-person__card')
      if (oldCard) oldCard.remove()
      this._buildCard(wrapper, wrapper)
    })

    // Drag events
    tab.addEventListener('dragstart', (e) => {
      const st = stateMap.get(wrapper)
      if (st) st.dragFromIdx = i
      tab.classList.add('oe-person__tab--dragging')
      e.dataTransfer?.setData('text/plain', String(i))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
    tab.addEventListener('dragend', () => {
      const st = stateMap.get(wrapper)
      if (st) st.dragFromIdx = null
      tab.classList.remove('oe-person__tab--dragging')
      const parent = tab.closest('.oe-person__tabs')
      if (parent) parent.querySelectorAll('.oe-person__tab--dragover').forEach(t => t.classList.remove('oe-person__tab--dragover'))
    })
    tab.addEventListener('dragover', (e) => {
      e.preventDefault()
      const st = stateMap.get(wrapper)
      if (st && st.dragFromIdx !== null && st.dragFromIdx !== i) {
        tab.classList.add('oe-person__tab--dragover')
      }
    })
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('oe-person__tab--dragover')
    })
    tab.addEventListener('drop', (e) => {
      e.preventDefault()
      tab.classList.remove('oe-person__tab--dragover')
      const st = stateMap.get(wrapper)
      if (!st) return
      const from = st.dragFromIdx
      if (from === null || from === i) return
      this._syncActiveFromDom(wrapper)
      const moved = st.data.persons.splice(from, 1)[0]
      if (moved) st.data.persons.splice(i, 0, moved)
      if (st.activeIdx === from) st.activeIdx = i
      else if (from < st.activeIdx && i >= st.activeIdx) st.activeIdx--
      else if (from > st.activeIdx && i <= st.activeIdx) st.activeIdx++
      this._rebuild(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })

    return tab
  }

  /** @param {HTMLElement} wrapper */
  _buildTabs(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return document.createElement('div')

    const tabs = document.createElement('div')
    tabs.className = 'oe-person__tabs'

    for (let i = 0; i < s.data.persons.length; i++) {
      tabs.appendChild(this._buildTab(wrapper, s, i))
    }

    // "+" button (always in tab bar)
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'oe-person__tab-add'
    addBtn.innerHTML = ICON_PLUS
    addBtn.title = this._t('addPerson', 'Add person')
    addBtn.addEventListener('click', () => {
      const st = stateMap.get(wrapper)
      if (!st) return
      this._syncActiveFromDom(wrapper)
      st.data.persons.push(this._defaultPerson())
      st.activeIdx = st.data.persons.length - 1
      this._rebuild(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    tabs.appendChild(addBtn)

    return tabs
  }

  // ── Card (single active person) ────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} parent
   */
  _buildCard(wrapper, parent) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const person = s.data.persons[s.activeIdx]
    if (!person) return

    const card = document.createElement('div')
    card.className = 'oe-person__card'

    // Avatar
    const avatarWrap = document.createElement('div')
    avatarWrap.className = 'oe-person__avatar-wrap'

    if (person.avatar) {
      const img = document.createElement('img')
      img.className = 'oe-person__avatar-img'
      img.src = person.avatar
      img.alt = ''
      avatarWrap.appendChild(img)
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'oe-person__avatar-placeholder'
      placeholder.innerHTML = ICON_CAMERA
      avatarWrap.appendChild(placeholder)
    }

    const avatarOverlay = document.createElement('button')
    avatarOverlay.type = 'button'
    avatarOverlay.className = 'oe-person__avatar-upload'
    avatarOverlay.innerHTML = ICON_CAMERA
    avatarOverlay.title = this._t('uploadAvatar', 'Upload avatar')
    avatarOverlay.addEventListener('mousedown', e => e.preventDefault())
    avatarOverlay.addEventListener('click', () => this._triggerAvatarUpload(wrapper))
    avatarWrap.appendChild(avatarOverlay)
    card.appendChild(avatarWrap)

    // Info
    const info = document.createElement('div')
    info.className = 'oe-person__info'

    const name = document.createElement('div')
    name.className = 'oe-person__name'
    name.contentEditable = 'true'
    name.dataset.placeholder = this._t('namePlaceholder', 'Name')
    if (person.name) name.innerHTML = sanitizeHtml(person.name)
    this._setupEditable(name, 'name', false)
    info.appendChild(name)

    const role = document.createElement('div')
    role.className = 'oe-person__role'
    role.contentEditable = 'true'
    role.dataset.placeholder = this._t('rolePlaceholder', 'Role / Position')
    if (person.role) role.innerHTML = sanitizeHtml(person.role)
    this._setupEditable(role, 'role', false)
    info.appendChild(role)

    const bio = document.createElement('div')
    bio.className = 'oe-person__bio'
    bio.contentEditable = 'true'
    bio.dataset.placeholder = this._t('bioPlaceholder', 'Short bio...')
    if (person.bio) bio.innerHTML = sanitizeHtml(person.bio)
    this._setupEditable(bio, 'bio', true)
    info.appendChild(bio)

    // Links
    const linksSection = document.createElement('div')
    linksSection.className = 'oe-person__links'

    const linksLabel = document.createElement('div')
    linksLabel.className = 'oe-person__links-label'
    linksLabel.textContent = this._t('linksLabel', 'Links')
    linksSection.appendChild(linksLabel)

    const links = [...person.links]
    const hasEmptyLast = links.length > 0 && !links[links.length - 1]?.url.trim()
    if (!hasEmptyLast) links.push({ type: 'website', url: '' })
    links.forEach((link, i) => {
      linksSection.appendChild(this._createLinkRow(wrapper, link, i, links.length))
    })

    info.appendChild(linksSection)
    card.appendChild(info)
    parent.appendChild(card)

  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} el
   * @param {string} _field
   * @param {boolean} allowMultiline
   */
  _setupEditable(el, _field, allowMultiline) {
    el.addEventListener('keydown', (e) => {
      if (!allowMultiline && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); return }
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    })
    el.addEventListener('input', () => {
      if (!el.textContent?.trim()) el.innerHTML = ''
    })
  }

  /** @param {HTMLElement} wrapper */
  _syncActiveFromDom(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const person = s.data.persons[s.activeIdx]
    if (!person) return

    const nameEl = wrapper.querySelector('.oe-person__name')
    const roleEl = wrapper.querySelector('.oe-person__role')
    const bioEl = wrapper.querySelector('.oe-person__bio')
    person.name = sanitizeHtml(nameEl?.innerHTML?.trim() || '')
    person.role = sanitizeHtml(roleEl?.innerHTML?.trim() || '')
    person.bio = sanitizeHtml(bioEl?.innerHTML?.trim() || '')

    const linkRows = wrapper.querySelectorAll('.oe-person__link-row')
    linkRows.forEach((row, i) => {
      const link = person.links[i]
      if (link) {
        const input = /** @type {HTMLInputElement} */ (row.querySelector('.oe-person__link-url'))
        const iconEl = /** @type {HTMLElement | null} */ (row.querySelector('.oe-person__link-icon'))
        if (input) link.url = input.value
        if (iconEl?.dataset.type) link.type = iconEl.dataset.type
      }
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {{ type: string, url: string }} link
   * @param {number} index
   * @param {number} totalCount
   * @returns {HTMLDivElement}
   */
  _createLinkRow(wrapper, link, index, totalCount) {
    const s = stateMap.get(wrapper)
    if (!s) return document.createElement('div')

    const isEmptySlot = !link.url.trim()
    const row = document.createElement('div')
    row.className = 'oe-person__link-row'

    const iconEl = document.createElement('span')
    iconEl.className = 'oe-person__link-icon'
    const resolved = resolveSocialIcon(link.url, this._config.socialResolvers)
    iconEl.innerHTML = link.url ? resolved.icon : (SOCIAL_ICONS.website || '')
    iconEl.dataset.type = link.url ? resolved.type : link.type
    row.appendChild(iconEl)

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'oe-person__link-url'
    input.placeholder = 'https://...'
    input.value = link.url
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this._resolveIcon(wrapper, index, input.value, iconEl); return }
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    })

    const person = /** @type {NonNullable<typeof s.data.persons[0]>} */ (s.data.persons[s.activeIdx])
    let grewAlready = false
    input.addEventListener('input', () => {
      this._debouncedResolve(wrapper, index, input.value, iconEl)
      if (isEmptySlot && !grewAlready && input.value.trim()) {
        grewAlready = true
        this._syncActiveFromDom(wrapper)
        while (person.links.length <= index) person.links.push({ type: 'website', url: '' })
        const personLink = person.links[index]
        if (personLink) personLink.url = input.value
        if (!row.querySelector('.oe-person__link-remove')) {
          const removeBtn = document.createElement('button')
          removeBtn.type = 'button'
          removeBtn.className = 'oe-person__link-remove'
          removeBtn.innerHTML = ICON_REMOVE
          removeBtn.addEventListener('mousedown', e => e.preventDefault())
          removeBtn.addEventListener('click', () => {
            this._syncActiveFromDom(wrapper)
            person.links.splice(index, 1)
            this._rebuild(wrapper)
            wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
          })
          row.appendChild(removeBtn)
        }
        const newRow = this._createLinkRow(wrapper, { type: 'website', url: '' }, index + 1, totalCount + 1)
        row.parentElement?.appendChild(newRow)
      }
    })
    input.addEventListener('paste', () => {
      requestAnimationFrame(() => this._resolveIcon(wrapper, index, input.value, iconEl))
    })
    row.appendChild(input)

    if (!isEmptySlot) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'oe-person__link-remove'
      removeBtn.innerHTML = ICON_REMOVE
      removeBtn.addEventListener('mousedown', e => e.preventDefault())
      removeBtn.addEventListener('click', () => {
        this._syncActiveFromDom(wrapper)
        person.links.splice(index, 1)
        this._rebuild(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
      })
      row.appendChild(removeBtn)
    }

    return row
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {number} index
   * @param {string} url
   * @param {HTMLElement} iconEl
   */
  _debouncedResolve(wrapper, index, url, iconEl) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const key = `${s.activeIdx}:${index}`
    const existing = s.debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    iconEl.innerHTML = ICON_LOADER
    iconEl.querySelector('svg')?.classList.add('oe-person__spin')
    const timer = window.setTimeout(() => {
      s.debounceTimers.delete(key)
      this._resolveIcon(wrapper, index, url, iconEl)
    }, 500)
    s.debounceTimers.set(key, timer)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {number} index
   * @param {string} url
   * @param {HTMLElement} iconEl
   */
  _resolveIcon(wrapper, index, url, iconEl) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const key = `${s.activeIdx}:${index}`
    const existing = s.debounceTimers.get(key)
    if (existing) { clearTimeout(existing); s.debounceTimers.delete(key) }
    const resolved = resolveSocialIcon(url, this._config.socialResolvers)
    iconEl.innerHTML = resolved.icon
    iconEl.dataset.type = resolved.type
    const person = s.data.persons[s.activeIdx]
    const personLink = person?.links[index]
    if (personLink) personLink.type = resolved.type
  }

  // ── Avatar upload ─────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  _triggerAvatarUpload(wrapper) {
    const t = (/** @type {string} */ key, /** @type {string} */ fallback) => this._t(key, fallback)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      const croppedBlob = await openCropper(file, /** @type {*} */ ({
        title: t('cropTitle', 'Crop avatar'),
        confirmText: t('cropConfirm', 'Apply'),
        cancelText: t('cropCancel', 'Cancel'),
      }))
      if (!croppedBlob) return
      this._syncActiveFromDom(wrapper)

      if (this._config.uploadFile) {
        void this._uploadAvatar(wrapper, croppedBlob)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          this._syncActiveFromDom(wrapper)
          const st = stateMap.get(wrapper)
          if (!st) return
          const p = st.data.persons[st.activeIdx]
          if (p) p.avatar = /** @type {string} */ (reader.result)
          this._rebuild(wrapper)
          wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
        }
        reader.readAsDataURL(croppedBlob)
      }
    })
    input.click()
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {Blob} blob
   */
  async _uploadAvatar(wrapper, blob) {
    if (!this._config.uploadFile) return
    wrapper.classList.add('oe-person--loading')
    try {
      const file = new File([blob], 'avatar.webp', { type: 'image/webp' })
      const result = await this._config.uploadFile(file)
      if (result?.url) {
        this._syncActiveFromDom(wrapper)
        const s = stateMap.get(wrapper)
        if (!s) return
        const person = s.data.persons[s.activeIdx]
        if (person) person.avatar = result.url
        this._rebuild(wrapper)
        wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
      }
    } catch {
      // Upload failed
    } finally {
      wrapper.classList.remove('oe-person--loading')
    }
  }
}
