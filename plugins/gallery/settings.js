import { CSS } from './css.js'
import { LAYOUT_ICONS } from './icons.js'
import { ALL_LAYOUTS } from './layout.js'
import { applyGalleryStyles } from './styles.js'

/**
 * @typedef {Object} SettingsDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} syncCaptions
 * @property {() => void} reRender   re-render the filled view (after layout change)
 * @property {() => void} notifyChanged
 */

/**
 * Build the settings dropdown panel: layout grid + lightbox options + styles.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
export function buildSettingsPanel(wrapper, state, deps) {
  const signal = /** @type {AbortController} */ (state.abortController).signal

  const panel = document.createElement('div')
  panel.className = CSS.dropdownPanel
  panel.addEventListener('click', (e) => e.stopPropagation())

  const form = document.createElement('div')
  form.className = CSS.styleForm

  form.appendChild(buildLayoutGroup(wrapper, state, deps, signal))
  form.appendChild(buildLightboxGroup(state, deps, signal))
  form.appendChild(buildStylesGroup(wrapper, state, deps, signal))

  panel.appendChild(form)
  return panel
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildLayoutGroup(wrapper, state, deps, signal) {
  const group = createGroup(deps.t('layout', 'Layout'))

  const grid = document.createElement('div')
  grid.className = CSS.layoutGrid

  for (const layout of ALL_LAYOUTS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `${CSS.layoutBtn}${state.data.layout === layout ? ` ${CSS.layoutBtnActive}` : ''}`
    btn.innerHTML = LAYOUT_ICONS[layout] || ''
    btn.title = layout
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', () => {
      deps.syncCaptions()
      state.data.layout = layout
      deps.reRender()
      deps.notifyChanged()
    }, { signal })
    grid.appendChild(btn)
  }
  group.appendChild(grid)
  return group
}

/**
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildLightboxGroup(state, deps, signal) {
  const opts = state.data.options
  const group = createGroup(deps.t('lightbox', 'Lightbox'))

  const makeSwitch = (/** @type {string} */ label, /** @type {string} */ key, /** @type {boolean} */ defaultVal) => {
    const row = document.createElement('div')
    row.className = CSS.switchRow
    const lbl = document.createElement('span')
    lbl.className = CSS.switchLabel
    lbl.textContent = label
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `${CSS.switch}${(opts[key] ?? defaultVal) ? ` ${CSS.switchActive}` : ''}`
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', () => {
      opts[key] = !(opts[key] ?? defaultVal)
      btn.classList.toggle(CSS.switchActive)
    }, { signal })
    row.append(lbl, btn)
    return row
  }

  group.appendChild(makeSwitch(deps.t('optNavigation', 'Navigation'), 'navigation', true))
  group.appendChild(makeSwitch(deps.t('optLoop', 'Loop'), 'loop', true))
  group.appendChild(makeSwitch(deps.t('optZoom', 'Zoom'), 'zoom', true))
  group.appendChild(makeSwitch(deps.t('optCaptions', 'Captions'), 'captions', true))
  group.appendChild(makeSwitch(deps.t('optThumbnails', 'Thumbnails'), 'thumbnails', false))
  group.appendChild(makeSwitch(deps.t('optFullscreen', 'Fullscreen'), 'fullscreen', true))

  // Autoplay interval
  const autoplayRow = document.createElement('div')
  autoplayRow.className = CSS.styleRow
  const autoplayLbl = document.createElement('label')
  autoplayLbl.className = CSS.styleLabel
  const autoplaySpan = document.createElement('span')
  autoplaySpan.textContent = deps.t('optAutoplay', 'Autoplay')
  const autoplayInput = document.createElement('input')
  autoplayInput.type = 'text'
  autoplayInput.className = CSS.styleInput
  autoplayInput.placeholder = 'ms (e.g. 3000)'
  autoplayInput.value = opts.autoplayInterval ? String(opts.autoplayInterval) : ''
  autoplayInput.addEventListener('input', () => {
    const val = parseInt(autoplayInput.value, 10)
    if (val > 0) opts.autoplayInterval = val
    else delete opts.autoplayInterval
  }, { signal })
  autoplayLbl.append(autoplaySpan, autoplayInput)
  autoplayRow.appendChild(autoplayLbl)
  group.appendChild(autoplayRow)

  return group
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildStylesGroup(wrapper, state, deps, signal) {
  const group = createGroup(deps.t('styles', 'Styles'))
  const styles = state.data.styles

  const makeStyleInput = (/** @type {string} */ key, /** @type {string} */ value) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = CSS.styleInput
    input.value = value || ''
    input.addEventListener('input', () => {
      if (input.value) styles[key] = input.value
      else delete styles[key]
      applyGalleryStyles(wrapper, state)
    }, { signal })
    return input
  }

  const makeRow = (/** @type {string} */ label, /** @type {HTMLElement} */ input) => {
    const row = document.createElement('div')
    row.className = CSS.styleRow
    const lbl = document.createElement('label')
    lbl.className = CSS.styleLabel
    const span = document.createElement('span')
    span.textContent = label
    lbl.append(span, input)
    row.appendChild(lbl)
    return row
  }

  group.appendChild(makeRow('Gap', makeStyleInput('gap', styles.gap)))
  group.appendChild(makeRow(deps.t('styleRadius', 'Radius'), makeStyleInput('borderRadius', styles.borderRadius)))
  group.appendChild(makeRow(deps.t('styleHeight', 'Height'), makeStyleInput('height', styles.height)))

  return group
}

/** @param {string} title @returns {HTMLElement} */
function createGroup(title) {
  const group = document.createElement('div')
  group.className = CSS.styleGroup
  const titleEl = document.createElement('div')
  titleEl.className = CSS.styleGroupTitle
  titleEl.textContent = title
  group.appendChild(titleEl)
  return group
}
