import { sanitizeHtml } from '../../core/sanitize.js'
import { setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { makeActionBtn as _makeActionBtn, makeSep as _makeSep } from '../shared/actionBar.js'
import { CSS } from './css.js'
import {
  ICON_BACK, ICON_CHEVRON_RIGHT, ICON_REPLACE, ICON_SETTINGS, ICON_TRASH,
  ICON_UPLOAD, ICON_URL,
} from './icons.js'
import { applyInlineStyles } from './styles.js'
import { buildSettingsPanel } from './settings.js'

/**
 * @typedef {Object} FilledViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} onTriggerFileInput
 * @property {() => void} onPromptUrl
 * @property {() => void} onDelete
 * @property {(operation: () => void) => void} mutate
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null> }>} customActions
 * @property {(handler: (context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null>) => Promise<void>} runCustomAction
 */

/**
 * Render the filled-state image view: image + container + editable caption +
 * action bar (settings, replace, delete). Replaces wrapper contents and
 * adds the `filled` CSS class.
 *
 * Listeners use the state's AbortSignal — automatically removed on the next
 * render or on disposal.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {FilledViewDeps} deps
 */
export function renderFilledView(wrapper, state, deps) {
  state.resetTransient()
  wrapper.innerHTML = ''
  wrapper.classList.add(CSS.filled)

  const signal = /** @type {AbortController} */ (state.abortController).signal

  const container = document.createElement('div')
  container.className = CSS.imageContainer

  const img = document.createElement('img')
  img.className = CSS.image
  setSafeUrlAttribute(img, 'src', state.data.file.url, 'media')
  img.alt = state.data.caption || ''
  applyInlineStyles(state, img, container)
  container.appendChild(img)

  // Caption
  const caption = renderCaption(state, signal, deps)
  container.appendChild(caption)
  wrapper.appendChild(container)

  // Action bar
  wrapper.appendChild(renderActions(wrapper, state, deps, signal))
}

/**
 * @param {import('./state.js').ImageState} state
 * @param {AbortSignal} signal
 * @param {FilledViewDeps} deps
 * @returns {HTMLElement}
 */
function renderCaption(state, signal, deps) {
  const caption = document.createElement('div')
  caption.className = CSS.caption
  caption.contentEditable = 'true'
  caption.dataset.placeholder = deps.t('caption', 'Caption')

  if (state.data.caption) {
    caption.innerHTML = sanitizeHtml(state.data.caption)
  }
  if (!caption.textContent?.trim()) {
    state.data.caption = ''
    caption.innerHTML = ''
    caption.setAttribute('data-empty', 'true')
  }

  const syncEmpty = () => {
    const hasText = !!caption.textContent?.trim()
    state.data.caption = hasText ? caption.innerHTML : ''
    if (hasText) {
      caption.removeAttribute('data-empty')
    } else {
      caption.setAttribute('data-empty', 'true')
    }
  }

  caption.addEventListener('input', syncEmpty, { signal })
  caption.addEventListener('focus', () => caption.removeAttribute('data-empty'), { signal })
  caption.addEventListener('blur', () => {
    if (!caption.textContent?.trim()) {
      caption.innerHTML = ''
      caption.setAttribute('data-empty', 'true')
      state.data.caption = ''
    }
  }, { signal })
  caption.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !caption.textContent?.trim()) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, { signal })

  return caption
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 * @returns {HTMLElement}
 */
function renderActions(wrapper, state, deps, signal) {
  const actions = document.createElement('div')
  actions.className = CSS.actions

  const settingsDeps = { t: deps.t, mutate: deps.mutate }

  // Settings dropdown
  const dropdown = document.createElement('div')
  dropdown.className = CSS.dropdown

  const settingsBtn = document.createElement('button')
  settingsBtn.type = 'button'
  settingsBtn.className = CSS.actionBtn
  settingsBtn.innerHTML = `${ICON_SETTINGS} ${deps.t('settings', 'Settings')}`

  const panel = buildSettingsPanel(wrapper, state, settingsDeps)

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = dropdown.classList.contains(CSS.dropdownOpen)
    if (isOpen) {
      dropdown.classList.remove(CSS.dropdownOpen)
    } else {
      panel.style.top = ''
      panel.style.bottom = ''
      dropdown.classList.add(CSS.dropdownOpen)

      const btnRect = settingsBtn.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const spaceBelow = window.innerHeight - btnRect.bottom - 8
      if (spaceBelow < panelRect.height) {
        panel.style.top = ''
        panel.style.bottom = 'calc(100% + 8px)'
      } else {
        panel.style.top = 'calc(100% + 8px)'
        panel.style.bottom = ''
      }
    }
  }, { signal })

  dropdown.append(settingsBtn, panel)

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(/** @type {Node} */ (e.target))) {
      dropdown.classList.remove(CSS.dropdownOpen)
    }
  }, { signal })

  const sep1 = makeSep()

  // Main view container (for drill-down hide/show)
  const mainView = document.createElement('div')
  mainView.className = CSS.actionsView
  mainView.style.display = 'contents'

  mainView.append(dropdown, sep1)

  // Replace (drill-down: Upload + URL)
  const replaceBtn = makeActionBtn(
    `${ICON_REPLACE} ${deps.t('replace', 'Replace')} ${ICON_CHEVRON_RIGHT}`,
    () => showReplaceView(actions, mainView, deps, signal),
    signal,
  )
  replaceBtn.querySelector('svg:last-child')?.classList.add(CSS.actionChevron)
  mainView.appendChild(replaceBtn)

  mainView.appendChild(makeSep())

  // Delete (icon only)
  const deleteBtn = document.createElement('button')
  deleteBtn.type = 'button'
  deleteBtn.className = `${CSS.actionBtn} ${CSS.actionBtnDanger}`
  deleteBtn.innerHTML = ICON_TRASH
  deleteBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    deps.onDelete()
  }, { signal })
  mainView.appendChild(deleteBtn)

  actions.appendChild(mainView)
  return actions
}

/**
 * Show the Replace drill-down: Back | Upload | Custom actions | URL.
 *
 * @param {HTMLElement} actions
 * @param {HTMLElement} mainView
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 */
function showReplaceView(actions, mainView, deps, signal) {
  mainView.style.display = 'none'

  const view = document.createElement('div')
  view.className = CSS.actionsView
  view.style.display = 'contents'

  const restore = () => { view.remove(); mainView.style.display = 'contents' }

  view.appendChild(makeActionBtn(
    `${ICON_BACK} ${deps.t('back', 'Back')}`,
    restore,
    signal,
  ))
  view.appendChild(makeSep())

  view.appendChild(makeActionBtn(
    `${ICON_UPLOAD} ${deps.t('upload', 'Upload')}`,
    () => { deps.onTriggerFileInput(); restore() },
    signal,
  ))

  for (const action of deps.customActions) {
    view.appendChild(makeActionBtn(
      `${action.icon || ''} ${action.label}`.trim(),
      async () => { await deps.runCustomAction(action.handler); restore() },
      signal,
    ))
  }

  view.appendChild(makeActionBtn(
    `${ICON_URL} URL`,
    () => { deps.onPromptUrl(); restore() },
    signal,
  ))

  actions.appendChild(view)
}

/** @param {string} innerHTML @param {() => void} handler @param {AbortSignal} signal */
function makeActionBtn(innerHTML, handler, signal) {
  return _makeActionBtn(CSS.actionBtn, innerHTML, handler, signal)
}

/** @returns {HTMLDivElement} */
function makeSep() {
  return _makeSep(CSS.actionsSep)
}
